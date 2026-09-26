-- Integracja X (dawniej Twitter) w Studiu publikacji — OAuth 2.0 + publikacja.
--
-- Architektura 1:1 z modułem TikToka (migracja 20260926120000):
--   * OAuth 2.0 konta robi się RAZ w panelu (/admin/ustawienia albo
--     /admin/studio-publikacji → karta „X" → „Połącz X"): przycisk woła
--     admin-only server fn, ta wydaje jednorazowy `state` + `code_verifier`
--     (PKCE) i URL /api/x/auth?state=…, skąd następuje redirect na zgodę X-a,
--     a /api/x/callback zapisuje tokeny w tabeli x_integration.
--     Client id/secret siedzą w env (X_CLIENT_ID / X_CLIENT_SECRET).
--   * Kolejka: ta sama social_publish_queue co Meta i TikTok — platform='x'.
--   * Logika w TS: src/lib/x.server.ts (+ x.functions.ts, x-post.ts),
--     callback: /api/x/callback, tick: /api/public/hooks/social-publish-tick
--     (istniejący pg_cron co 10 min — nowego joba NIE zakładamy).
--
-- Różnica wobec TikToka: X wymaga PKCE nawet dla klienta poufnego, więc obok
-- `oauth_state` trzymamy `code_verifier` (jednorazowy, kasowany w callbacku).

-- ── Stan integracji (singleton, tokeny OAuth) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.x_integration (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- access_token żyje 2 h, refresh_token jest rotowany przy każdym odświeżeniu
  -- (X unieważnia poprzedni), więc tick musi zapisywać nowy albo integracja
  -- umiera po pierwszym odświeżeniu.
  access_token text,
  refresh_token text,
  -- Kto jest połączony — do pokazania w panelu (@handle i numeryczne id).
  x_user_id text,
  username text,
  token_expires_at timestamptz,
  scope text,
  -- Redundantne wobec refresh_token, ale trzymamy flagę wprost (jak TikTok).
  connected boolean NOT NULL DEFAULT false,
  -- Anty-CSRF + PKCE: oba wydaje admin-only server fn przy „Połącz",
  -- /api/x/auth wpuszcza tylko z ważnym state (inaczej obcy mógłby podstawić
  -- SWOJE konto X jako firmowe), a callback weryfikuje state i zużywa verifier.
  oauth_state text,
  oauth_state_expires_at timestamptz,
  code_verifier text,
  connected_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.x_integration (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  CREATE TRIGGER trg_xi_touch_updated_at
    BEFORE UPDATE ON public.x_integration
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tokeny OAuth: ZERO polityk dla authenticated — dostęp wyłącznie service_role
-- (server functions czytają przez supabaseAdmin i zwracają tylko metadane).
ALTER TABLE public.x_integration ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.x_integration TO service_role;

COMMENT ON TABLE public.x_integration IS
  'X (Twitter): tokeny OAuth 2.0 konta firmowego (singleton). Dostęp tylko service_role.';
COMMENT ON COLUMN public.x_integration.code_verifier IS
  'PKCE: jednorazowy verifier wydany przy „Połącz", zużywany w /api/x/callback.';

-- ── Kolejka publikacji: X jako kolejna platforma ─────────────────────────────
ALTER TABLE public.social_publish_queue
  ADD COLUMN IF NOT EXISTS x_media_id text,
  ADD COLUMN IF NOT EXISTS x_media_status text,
  -- Moment zakończenia uploadu — punkt odniesienia dla limitu czasu
  -- przetwarzania wideo (odpowiednik tiktok_upload_at / ig_container_at).
  ADD COLUMN IF NOT EXISTS x_media_at timestamptz;

-- platform: dopuszczamy 'x'. Constraint powstał inline (nazwa auto-generowana
-- w pierwszej migracji, nazwana w migracji TikToka), więc zdejmujemy go po
-- definicji, nie po nazwie — tak samo jak przy TikToku.
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
  CHECK (platform IN ('facebook_post', 'facebook_reels', 'instagram_reels', 'tiktok', 'x'));

-- x_media_status odwzorowuje etapy uploadu mediów:
--   pending → uploading (chunki/plik poszły) → processing (X transkoduje wideo)
--   → ready (media_id gotowe do doklejenia) → failed.
-- Post bez mediów NIE ustawia tej kolumny poza chwilowym 'pending' przy claimie.
ALTER TABLE public.social_publish_queue
  DROP CONSTRAINT IF EXISTS social_publish_queue_x_media_status_check;
ALTER TABLE public.social_publish_queue
  ADD CONSTRAINT social_publish_queue_x_media_status_check
  CHECK (x_media_status IS NULL OR x_media_status IN
    ('pending', 'uploading', 'processing', 'ready', 'failed'));

-- Wpisy X czekające na domknięcie pollingiem (analogicznie do idx_spq_tiktok_polling).
CREATE INDEX IF NOT EXISTS idx_spq_x_polling
  ON public.social_publish_queue (scheduled_at)
  WHERE platform = 'x' AND x_media_status IN ('uploading', 'processing');

COMMENT ON COLUMN public.social_publish_queue.x_media_id IS
  'X: media_id z /2/media/upload (zapisane przed publikacją, żeby restart workera nie wgrał pliku drugi raz).';
COMMENT ON COLUMN public.social_publish_queue.x_media_status IS
  'X: pending | uploading | processing | ready | failed.';
COMMENT ON COLUMN public.social_publish_queue.x_media_at IS
  'X: kiedy upload mediów się zakończył (start licznika przetwarzania wideo).';
