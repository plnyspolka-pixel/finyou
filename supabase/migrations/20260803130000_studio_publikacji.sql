-- Moduł „Studio publikacji" (/admin/studio-publikacji) — jedno miejsce do:
--   * publikacji wideo na YouTube (istniejąca kolejka youtube_publish_queue),
--     Facebook Reels, Instagram Reels i postów na Facebooku (nowa kolejka
--     social_publish_queue, publikacja przez Meta Graph API),
--   * generowania wideo HeyGen z promptu (scenariusz AI -> ElevenLabs TTS ->
--     HeyGen avatar) — tabela studio_video_jobs,
--   * generowania grafik z promptu (Lovable AI gateway, zapis do Storage) —
--     tabela studio_images.
--
-- Logika w TS: src/lib/studio-publishing.server.ts (+ studio.functions.ts),
-- tick: /api/public/hooks/social-publish-tick (pg_cron co 10 minut).
--
-- Meta Graph API wymaga sekretów środowiska: META_PAGE_ID,
-- META_PAGE_ACCESS_TOKEN (token strony z uprawnieniami pages_manage_posts,
-- pages_read_engagement), META_IG_USER_ID (konto IG Business powiązane
-- ze stroną) — patrz docs/studio-publikacji.md.

-- ── Kolejka publikacji Meta (FB post / FB Reels / IG Reels) ──────────────────
CREATE TABLE IF NOT EXISTS public.social_publish_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL
    CHECK (platform IN ('facebook_post', 'facebook_reels', 'instagram_reels')),
  -- Tytuł używany przy wideo na FB; treść/opis publikowana na platformie.
  title text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  -- Publiczny URL MP4 (Reels / wideo) lub grafiki (post FB z obrazem).
  video_url text,
  image_url text,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  -- pending → publishing → (processing: kontener IG czeka na transkodowanie
  -- po stronie Meta) → published; failed po wyczerpaniu prób; cancelled ręcznie.
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'publishing', 'processing', 'published', 'failed', 'cancelled')),
  attempt_count integer NOT NULL DEFAULT 0,
  -- IG: id kontenera mediów (krok 1 z 2 — publish następuje po FINISHED).
  ig_creation_id text,
  -- Id opublikowanego obiektu (post id / video id / media id).
  external_post_id text,
  last_error text,
  created_by uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spq_due
  ON public.social_publish_queue (scheduled_at)
  WHERE status IN ('pending', 'processing');

-- ── Wideo HeyGen generowane z promptu ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.studio_video_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt text NOT NULL,
  -- Scenariusz (tekst mówiony) — wygenerowany przez AI, edytowalny przed startem.
  script text NOT NULL,
  avatar_id text NOT NULL,
  voice_id text NOT NULL DEFAULT '9STbwZjpEbcYG88ZekIQ',
  heygen_video_id text,
  -- pending → generating_audio → uploading → rendering → ready; failed.
  status text NOT NULL DEFAULT 'pending',
  video_url text,
  thumbnail_url text,
  last_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Grafiki generowane z promptu ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.studio_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt text NOT NULL,
  storage_path text NOT NULL,
  image_url text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── updated_at ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  CREATE TRIGGER trg_spq_touch_updated_at
    BEFORE UPDATE ON public.social_publish_queue
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TRIGGER trg_svj_touch_updated_at
    BEFORE UPDATE ON public.studio_video_jobs
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Odczyt dla kadry, zapisy wyłącznie przez service_role (server functions).
ALTER TABLE public.social_publish_queue ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.social_publish_queue TO authenticated;
GRANT ALL ON public.social_publish_queue TO service_role;
CREATE POLICY spq_staff_select ON public.social_publish_queue FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role));

ALTER TABLE public.studio_video_jobs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.studio_video_jobs TO authenticated;
GRANT ALL ON public.studio_video_jobs TO service_role;
CREATE POLICY svj_staff_select ON public.studio_video_jobs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role));

ALTER TABLE public.studio_images ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.studio_images TO authenticated;
GRANT ALL ON public.studio_images TO service_role;
CREATE POLICY sim_staff_select ON public.studio_images FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role));

COMMENT ON TABLE public.social_publish_queue IS
  'Studio publikacji: kolejka publikacji Meta (FB post / FB Reels / IG Reels), cron tick co 10 min.';
COMMENT ON TABLE public.studio_video_jobs IS
  'Studio publikacji: wideo HeyGen generowane z promptu (scenariusz AI + TTS + avatar).';
COMMENT ON TABLE public.studio_images IS
  'Studio publikacji: grafiki generowane z promptu (Lovable AI gateway), pliki w buckecie studio-media.';

-- ── Storage: bucket na wygenerowane media ────────────────────────────────────
-- Publiczny, bo URL-e grafik/wideo muszą być pobieralne przez Meta i YouTube.
INSERT INTO storage.buckets (id, name, public) VALUES ('studio-media', 'studio-media', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  CREATE POLICY "studio_media_public_read" ON storage.objects FOR SELECT TO public
    USING (bucket_id = 'studio-media');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "studio_media_staff_write" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'studio-media' AND (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role)));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "studio_media_staff_delete" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'studio-media' AND (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role)));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Cron tick (pg_cron → endpoint) ───────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  job record;
BEGIN
  FOR job IN SELECT jobname FROM cron.job WHERE jobname = 'social-publish-tick' LOOP
    PERFORM cron.unschedule(job.jobname);
  END LOOP;

  -- Co 10 minut; endpoint no-opuje, gdy nic nie jest wymagalne.
  PERFORM cron.schedule('social-publish-tick', '*/10 * * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/social-publish-tick', hdrs));
END $$;
