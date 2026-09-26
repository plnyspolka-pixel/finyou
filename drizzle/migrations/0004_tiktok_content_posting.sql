-- Integracja TikTok Content Posting API (Direct Post) w Studiu publikacji.
--
-- Architektura 1:1 z modułem YouTube Shorts (migracja 20260801120000):
--   * OAuth 2.0 konta robi się RAZ w panelu (/admin/studio-publikacji →
--     karta „TikTok" → „Połącz TikTok"): przycisk woła admin-only server fn,
--     ta wydaje jednorazowy `state` i URL /api/tiktok/auth?state=…, skąd
--     następuje redirect na zgodę TikToka, a /api/tiktok/callback zapisuje
--     tokeny w tabeli tiktok_integration. Client key/secret siedzą w env
--     (TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET), tokeny w bazie.
--   * Kolejka: ta sama social_publish_queue co Meta — platform='tiktok'.
--     Publikacja jest trójetapowa (init → upload chunków → polling statusu),
--     więc wpis dostaje własne kolumny tiktok_*.
--   * Logika w TS: src/lib/tiktok.server.ts (+ tiktok.functions.ts),
--     callback: /api/tiktok/callback, tick: /api/public/hooks/social-publish-tick
--     (istniejący pg_cron co 10 min — nowego joba NIE zakładamy).
--
-- Nazwy kolumn: spec dopuszczał albo prefiksowane pola w tabeli ustawień,
-- albo osobną tabelę. Wybrana jest osobna tabela (jak youtube_integration),
-- więc prefiks `tiktok_` w jej kolumnach byłby redundantny — mapowanie:
--   tiktok_access_token      → tiktok_integration.access_token
--   tiktok_refresh_token     → tiktok_integration.refresh_token
--   tiktok_open_id           → tiktok_integration.open_id
--   tiktok_token_expires_at  → tiktok_integration.token_expires_at
--   tiktok_connected         → tiktok_integration.connected
-- W social_publish_queue kolumny zostają prefiksowane (tabela wielo-platformowa).

-- ── Stan integracji (singleton, tokeny OAuth) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tiktok_integration (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- access_token żyje 24 h, refresh_token 365 dni (odświeżanie w ticku).
  access_token text,
  refresh_token text,
  open_id text,
  token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  -- Redundantne wobec refresh_token, ale spec wymaga flagi wprost.
  connected boolean NOT NULL DEFAULT false,
  -- Anty-CSRF przy OAuth: `state` wydaje admin-only server fn przy „Połącz",
  -- /api/tiktok/auth wpuszcza tylko z ważnym state (inaczej obcy mógłby
  -- podstawić SWOJE konto TikTok jako firmowe), callback go weryfikuje i czyści.
  oauth_state text,
  oauth_state_expires_at timestamptz,
  connected_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.tiktok_integration (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  CREATE TRIGGER trg_tti_touch_updated_at
    BEFORE UPDATE ON public.tiktok_integration
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tokeny OAuth: ZERO polityk dla authenticated — dostęp wyłącznie service_role
-- (server functions czytają przez supabaseAdmin i zwracają tylko metadane).
ALTER TABLE public.tiktok_integration ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.tiktok_integration TO service_role;

COMMENT ON TABLE public.tiktok_integration IS
  'TikTok Content Posting: tokeny OAuth konta (singleton). Dostęp tylko service_role.';

-- ── Kolejka publikacji: TikTok jako kolejna platforma ────────────────────────
ALTER TABLE public.social_publish_queue
  ADD COLUMN IF NOT EXISTS tiktok_publish_id text,
  ADD COLUMN IF NOT EXISTS tiktok_status text,
  ADD COLUMN IF NOT EXISTS tiktok_fail_reason text,
  -- Moment zakończenia uploadu chunków — punkt odniesienia dla limitu czasu
  -- przetwarzania (odpowiednik ig_container_at). NIE używamy updated_at, bo
  -- każdy tick go dotyka i licznik nigdy by nie doszedł do limitu.
  ADD COLUMN IF NOT EXISTS tiktok_upload_at timestamptz;

-- platform: dopuszczamy 'tiktok'. Constraint powstał inline (nazwa
-- auto-generowana), więc zdejmujemy go po definicji, nie po nazwie.
DO $$
DECLARE
  v_conname text;
BEGIN
  FOR v_conname IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.social_publish_queue'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%platform%'
  LOOP
    EXECUTE format('ALTER TABLE public.social_publish_queue DROP CONSTRAINT %I', v_conname);
  END LOOP;
END $$;

ALTER TABLE public.social_publish_queue
  ADD CONSTRAINT social_publish_queue_platform_check
  CHECK (platform IN ('facebook_post', 'facebook_reels', 'instagram_reels', 'tiktok'));

-- tiktok_status odwzorowuje etapy Content Posting API:
--   pending → uploading (chunki poszły) → processing (TikTok transkoduje)
--   → publish_complete | failed.
ALTER TABLE public.social_publish_queue
  DROP CONSTRAINT IF EXISTS social_publish_queue_tiktok_status_check;
ALTER TABLE public.social_publish_queue
  ADD CONSTRAINT social_publish_queue_tiktok_status_check
  CHECK (tiktok_status IS NULL OR tiktok_status IN
    ('pending', 'uploading', 'processing', 'publish_complete', 'failed'));

-- Wpisy TikToka czekające na domknięcie pollingiem (analogicznie do idx_spq_due).
CREATE INDEX IF NOT EXISTS idx_spq_tiktok_polling
  ON public.social_publish_queue (scheduled_at)
  WHERE platform = 'tiktok' AND tiktok_status IN ('uploading', 'processing');

COMMENT ON COLUMN public.social_publish_queue.tiktok_publish_id IS
  'TikTok Content Posting: publish_id z /post/publish/video/init/ (klucz do /status/fetch/).';
COMMENT ON COLUMN public.social_publish_queue.tiktok_status IS
  'TikTok Content Posting: pending | uploading | processing | publish_complete | failed.';
COMMENT ON COLUMN public.social_publish_queue.tiktok_fail_reason IS
  'TikTok Content Posting: fail_reason z /status/fetch/ (pokazywane w panelu).';
COMMENT ON COLUMN public.social_publish_queue.tiktok_upload_at IS
  'TikTok Content Posting: kiedy upload chunków się zakończył (start licznika przetwarzania).';
