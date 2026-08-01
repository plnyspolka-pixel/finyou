-- Moduł „YouTube Shorts" — automatyczna publikacja pionowych shortów na kanał
-- YouTube przez YouTube Data API v3 (videos.insert, upload resumable).
--
-- Architektura:
--   * OAuth 2.0 kanału robi się RAZ w panelu admina (/admin/youtube-shorts):
--     przycisk „Połącz z YouTube" → zgoda Google → callback zapisuje
--     refresh_token w youtube_integration. Client ID/Secret siedzą w env
--     (YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET), tokeny w bazie.
--   * Kolejka youtube_publish_queue: admin dodaje short (tytuł, opis, URL
--     pliku MP4, termin), cron tick publikuje wpisy wymagalne.
--   * Logika w TS: src/lib/youtube-shorts.server.ts (+ .functions.ts),
--     callback: /api/public/youtube-oauth-callback,
--     tick:     /api/public/hooks/youtube-shorts-tick.
--
-- Uwaga na limity API: videos.insert kosztuje 1600 jednostek z dziennych
-- 10 000 → ok. 6 uploadów/dobę. Tick publikuje maks. 2 wpisy na przebieg.

-- ── Stan integracji (singleton, tokeny OAuth) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.youtube_integration (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  refresh_token text,
  access_token text,
  access_token_expires_at timestamptz,
  channel_id text,
  channel_title text,
  -- Anty-CSRF przy OAuth: stan generowany przy „Połącz", weryfikowany w callbacku.
  oauth_state text,
  oauth_state_expires_at timestamptz,
  connected_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.youtube_integration (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── Kolejka publikacji ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.youtube_publish_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  -- Publiczny URL pliku MP4 (HeyGen video_url, Supabase Storage itp.).
  source_video_url text NOT NULL,
  privacy_status text NOT NULL DEFAULT 'public'
    CHECK (privacy_status IN ('public', 'unlisted', 'private')),
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  -- pending → uploading → published; failed po wyczerpaniu prób; cancelled ręcznie.
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'uploading', 'published', 'failed', 'cancelled')),
  attempt_count integer NOT NULL DEFAULT 0,
  youtube_video_id text,
  last_error text,
  created_by uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ytq_due
  ON public.youtube_publish_queue (scheduled_at)
  WHERE status = 'pending';

-- ── updated_at ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  CREATE TRIGGER trg_yti_touch_updated_at
    BEFORE UPDATE ON public.youtube_integration
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TRIGGER trg_ytq_touch_updated_at
    BEFORE UPDATE ON public.youtube_publish_queue
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Tokeny OAuth: ZERO polityk dla authenticated — dostęp wyłącznie service_role
-- (server functions czytają przez supabaseAdmin i zwracają tylko metadane).
ALTER TABLE public.youtube_integration ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.youtube_integration TO service_role;

-- Kolejka: odczyt dla kadry, zapisy wyłącznie przez service_role (server fns).
ALTER TABLE public.youtube_publish_queue ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.youtube_publish_queue TO authenticated;
GRANT ALL ON public.youtube_publish_queue TO service_role;

CREATE POLICY ytq_staff_select ON public.youtube_publish_queue FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role));

COMMENT ON TABLE public.youtube_integration IS
  'YouTube Shorts: tokeny OAuth kanału (singleton). Dostęp tylko service_role.';
COMMENT ON TABLE public.youtube_publish_queue IS
  'YouTube Shorts: kolejka automatycznej publikacji (cron tick co 10 min).';

-- ── Cron tick (pg_cron → endpoint; maks. 2 uploady na przebieg) ──────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  job record;
BEGIN
  FOR job IN SELECT jobname FROM cron.job WHERE jobname = 'youtube-shorts-tick' LOOP
    PERFORM cron.unschedule(job.jobname);
  END LOOP;

  -- Co 10 minut; endpoint no-opuje, gdy brak połączenia lub nic nie jest wymagalne.
  PERFORM cron.schedule('youtube-shorts-tick', '*/10 * * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/youtube-shorts-tick', hdrs));
END $$;
