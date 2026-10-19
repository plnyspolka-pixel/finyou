-- Autopilot agenta publikującego – fundament (Etapy 0–2, brief
-- docs/agent-publikujacy/BRIEF_DLA_CLAUDE_CODE.md).
--
-- Migracja jest ADDYTYWNA i idempotentna: tylko nowe kolumny z wartościami
-- domyślnymi, poszerzenie CHECK-a i jedna nowa tabela. Nic nie zmienia
-- zachowania istniejących ścieżek, dopóki kod autopilota nie zacznie z nich
-- korzystać. Tryb autopilota startuje jako 'manual_review' – przełączenie na
-- 'full_autopilot' robi właściciel.

-- ── 1. Dziennik: status 'warning' ─────────────────────────────────────────────
-- blog-autopilot.server.ts od dawna wstawia status 'warning'
-- (compliance_warning), który CHECK odrzucał – ostrzeżenia ginęły po cichu.
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.ai_growth_action_log'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.ai_growth_action_log DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.ai_growth_action_log
  ADD CONSTRAINT ai_growth_action_log_status_check
  CHECK (status IN ('ok', 'warning', 'blocked', 'error'));
CREATE INDEX IF NOT EXISTS idx_ai_growth_action_log_module_created
  ON public.ai_growth_action_log (module, created_at DESC);

-- ── 2. Ustawienia autopilota w istniejącym singletonie ai_growth_settings ─────
-- Profile torów (pożyczkobiorca / inwestor), tryb modułu, wyłącznik awaryjny
-- i limity. NULL w audience_profiles = domyślne profile z kodu
-- (src/lib/autopilot/profiles.ts), gdzie profil „pożyczkobiorca” bierze
-- target_audience i primary_cta_url z obecnych ustawień.
ALTER TABLE public.ai_growth_settings
  ADD COLUMN IF NOT EXISTS autopilot_mode text NOT NULL DEFAULT 'manual_review',
  ADD COLUMN IF NOT EXISTS autopilot_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS autopilot_paused_reason text,
  ADD COLUMN IF NOT EXISTS autopilot_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS autopilot_paused_by text,
  ADD COLUMN IF NOT EXISTS audience_profiles jsonb,
  ADD COLUMN IF NOT EXISTS cadence_split jsonb NOT NULL
    DEFAULT '{"pozyczkobiorca": 50, "inwestor": 50}'::jsonb,
  ADD COLUMN IF NOT EXISTS cadence_split_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS autopilot_limits jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_growth_settings_autopilot_mode_check'
  ) THEN
    ALTER TABLE public.ai_growth_settings
      ADD CONSTRAINT ai_growth_settings_autopilot_mode_check
      CHECK (autopilot_mode IN ('off', 'manual_review', 'semi_auto', 'full_autopilot'));
  END IF;
END $$;

-- ── 3. Kolejki publikacji: pochodzenie, tor, idempotencja, oznaczenie AI ──────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['social_publish_queue', 'youtube_publish_queue'] LOOP
    EXECUTE format($f$
      ALTER TABLE public.%1$I
        ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'manual',
        ADD COLUMN IF NOT EXISTS track text,
        ADD COLUMN IF NOT EXISTS series text,
        ADD COLUMN IF NOT EXISTS keyword text,
        ADD COLUMN IF NOT EXISTS lead_magnet_id uuid
          REFERENCES public.lead_magnets(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS studio_job_id uuid
          REFERENCES public.studio_video_jobs(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS idempotency_key text,
        ADD COLUMN IF NOT EXISTS contains_synthetic_media boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS compliance_rules_version text
    $f$, t);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_origin_check') THEN
      EXECUTE format(
        'ALTER TABLE public.%1$I ADD CONSTRAINT %2$I CHECK (origin IN (''manual'', ''autopilot''))',
        t, t || '_origin_check');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_track_check') THEN
      EXECUTE format(
        'ALTER TABLE public.%1$I ADD CONSTRAINT %2$I CHECK (track IS NULL OR track IN (''pozyczkobiorca'', ''inwestor''))',
        t, t || '_track_check');
    END IF;
    -- Idempotencja: ten sam klucz (np. autopilot:<job>:<platforma>) nie
    -- wejdzie do kolejki drugi raz. NULL (wpisy ręczne) bez ograniczeń.
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %1$I ON public.%2$I (idempotency_key) WHERE idempotency_key IS NOT NULL',
      'uq_' || t || '_idempotency', t);
  END LOOP;
END $$;

-- ── 4. Studio: tor, seria, koszt produkcji ───────────────────────────────────
ALTER TABLE public.studio_video_jobs
  ADD COLUMN IF NOT EXISTS track text,
  ADD COLUMN IF NOT EXISTS series text,
  ADD COLUMN IF NOT EXISTS hook_variant text,
  ADD COLUMN IF NOT EXISTS cost_pln numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS compliance_status text,
  ADD COLUMN IF NOT EXISTS compliance_rules_version text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'studio_video_jobs_track_check') THEN
    ALTER TABLE public.studio_video_jobs ADD CONSTRAINT studio_video_jobs_track_check
      CHECK (track IS NULL OR track IN ('pozyczkobiorca', 'inwestor'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'studio_video_jobs_compliance_status_check') THEN
    ALTER TABLE public.studio_video_jobs ADD CONSTRAINT studio_video_jobs_compliance_status_check
      CHECK (compliance_status IS NULL OR compliance_status IN ('passed', 'rewritten', 'rejected'));
  END IF;
END $$;

-- ── 5. Metryki publikacji (pętla uczenia, Etap 2) ────────────────────────────
-- Jeden wiersz = migawka metryk jednej publikacji z jednego dnia. Atrybuty
-- publikacji (tor, seria, hook…) są skopiowane, żeby mediany i outliery
-- liczyć bez złączeń z kilkoma kolejkami.
CREATE TABLE IF NOT EXISTS public.ai_publication_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL CHECK (platform IN (
    'instagram_reels', 'facebook_reels', 'facebook_post', 'youtube', 'tiktok', 'x')),
  external_post_id text NOT NULL,
  social_queue_id uuid REFERENCES public.social_publish_queue(id) ON DELETE SET NULL,
  youtube_queue_id uuid REFERENCES public.youtube_publish_queue(id) ON DELETE SET NULL,
  studio_job_id uuid REFERENCES public.studio_video_jobs(id) ON DELETE SET NULL,
  lead_magnet_id uuid REFERENCES public.lead_magnets(id) ON DELETE SET NULL,
  track text CHECK (track IS NULL OR track IN ('pozyczkobiorca', 'inwestor')),
  series text,
  format text,
  hook_text text,
  hook_variant text,
  visual_hook text,
  duration_s numeric(6, 1),
  keyword text,
  published_at timestamptz,
  captured_on date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Warsaw')::date,
  views integer,
  reach integer,
  likes integer,
  comments integer,
  shares integer,
  saves integer,
  follows integer,
  avg_view_s numeric(8, 2),
  completion_rate numeric(5, 4),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, external_post_id, captured_on)
);
CREATE INDEX IF NOT EXISTS idx_ai_publication_metrics_track_day
  ON public.ai_publication_metrics (track, captured_on DESC);

GRANT SELECT ON public.ai_publication_metrics TO authenticated;
GRANT ALL ON public.ai_publication_metrics TO service_role;
ALTER TABLE public.ai_publication_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff view publication metrics" ON public.ai_publication_metrics;
CREATE POLICY "Staff view publication metrics" ON public.ai_publication_metrics
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'));
