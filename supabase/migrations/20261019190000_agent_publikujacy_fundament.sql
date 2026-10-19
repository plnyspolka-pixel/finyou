-- Agent publikujący — Etap 1 (fundament) i Etap 2 (dane) z
-- docs/agent-publikujacy/BRIEF_DLA_CLAUDE_CODE.md.
--
-- ROZBUDOWA istniejącego silnika wzrostu (ai_growth_settings /
-- ai_growth_action_log), nie równoległy system:
--   1. publishing_agent_settings — ustawienia MODUŁU agenta: tryb, wyłącznik
--      awaryjny, limity (bezpieczniki 5.8). Domyślnie manual_review —
--      przełączenie na full_autopilot robi właściciel.
--   2. ai_audience_profiles — dwa tory (pożyczkobiorca, inwestor). Profil
--      „pożyczkobiorca” startuje z obecnych ustawień silnika wzrostu.
--   3. ai_compliance_checks — audyt każdej decyzji bramki compliance (5.7 p. 6).
--   4. origin / audience_track / compliance_* w kolejkach publikacji.
--   5. content_publication_metrics — metryki per publikacja (Etap 2).
--   6. ai_growth_action_log.status += warning, info (autopilot bloga zapisywał
--      'warning', który CHECK odrzucał — ostrzeżenia ginęły po cichu).
--   7. cron publishing-agent-tick (co godzinę: bezpieczniki, metryki, raporty).
--
-- Migracja jest addytywna (nowe tabele i kolumny z wartościami domyślnymi),
-- nie zmienia zachowania istniejących ścieżek poza bramką w publikatorach.

-- ── 1. Ustawienia modułu agenta ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.publishing_agent_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  mode TEXT NOT NULL DEFAULT 'manual_review'
    CHECK (mode IN ('off','manual_review','semi_auto','full_autopilot')),
  kill_switch BOOLEAN NOT NULL DEFAULT false,
  kill_switch_reason TEXT,
  kill_switch_at TIMESTAMPTZ,
  kill_switch_by TEXT,
  daily_ai_budget_pln NUMERIC NOT NULL DEFAULT 50 CHECK (daily_ai_budget_pln >= 0),
  monthly_heygen_credit_limit INTEGER CHECK (monthly_heygen_credit_limit IS NULL OR monthly_heygen_credit_limit >= 0),
  max_posts_per_day_per_platform INTEGER NOT NULL DEFAULT 3 CHECK (max_posts_per_day_per_platform >= 0),
  max_emails_per_recipient_per_week INTEGER NOT NULL DEFAULT 3 CHECK (max_emails_per_recipient_per_week >= 0),
  disabled_platforms TEXT[] NOT NULL DEFAULT ARRAY['x']::TEXT[],
  max_consecutive_publish_failures INTEGER NOT NULL DEFAULT 3 CHECK (max_consecutive_publish_failures > 0),
  cost_spike_factor NUMERIC NOT NULL DEFAULT 3 CHECK (cost_spike_factor >= 1),
  double_opt_in BOOLEAN NOT NULL DEFAULT false,
  owner_phone TEXT,
  owner_email TEXT,
  daily_report_hour SMALLINT NOT NULL DEFAULT 19 CHECK (daily_report_hour BETWEEN 0 AND 23),
  weekly_report_dow SMALLINT NOT NULL DEFAULT 1 CHECK (weekly_report_dow BETWEEN 0 AND 6),
  last_daily_report_at TIMESTAMPTZ,
  last_weekly_report_at TIMESTAMPTZ,
  auto_paused_at TIMESTAMPTZ,
  auto_pause_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);
COMMENT ON TABLE public.publishing_agent_settings IS
  'Agent publikujący (singleton): tryb, wyłącznik awaryjny i limity. Reguły compliance NIE są tu — są w kodzie (src/lib/publishing-agent/compliance-rules.ts).';
INSERT INTO public.publishing_agent_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

GRANT SELECT, UPDATE ON public.publishing_agent_settings TO authenticated;
GRANT ALL ON public.publishing_agent_settings TO service_role;
ALTER TABLE public.publishing_agent_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "admins manage publishing agent settings" ON public.publishing_agent_settings
    FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'administrator'))
    WITH CHECK (public.has_role(auth.uid(), 'administrator'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS trg_publishing_agent_settings_updated ON public.publishing_agent_settings;
CREATE TRIGGER trg_publishing_agent_settings_updated BEFORE UPDATE ON public.publishing_agent_settings
  FOR EACH ROW EXECUTE FUNCTION public.ai_growth_touch_updated_at();

-- ── 2. Profile dwóch torów ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_audience_profiles (
  track TEXT PRIMARY KEY CHECK (track IN ('pozyczkobiorca','inwestor')),
  label TEXT NOT NULL,
  target_audience TEXT NOT NULL,
  tone TEXT NOT NULL,
  primary_cta_url TEXT NOT NULL,
  material_audience TEXT NOT NULL CHECK (material_audience IN ('klient','inwestor')),
  allowed_topics TEXT[] NOT NULL DEFAULT '{}',
  forbidden_phrases TEXT[] NOT NULL DEFAULT '{}',
  -- Sloty publikacji per platforma, czas Europe/Warsaw: {"instagram_reels":["16:15"], ...}
  publish_slots JSONB NOT NULL DEFAULT '{}'::jsonb,
  cadence_share_pct NUMERIC NOT NULL DEFAULT 50 CHECK (cadence_share_pct BETWEEN 0 AND 100),
  cadence_share_updated_at TIMESTAMPTZ,
  weekly_reels_target INTEGER NOT NULL DEFAULT 5 CHECK (weekly_reels_target >= 0),
  weekly_long_target INTEGER NOT NULL DEFAULT 1 CHECK (weekly_long_target >= 0),
  monthly_ads_budget_pln NUMERIC NOT NULL DEFAULT 0 CHECK (monthly_ads_budget_pln >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);
GRANT SELECT, UPDATE ON public.ai_audience_profiles TO authenticated;
GRANT ALL ON public.ai_audience_profiles TO service_role;
ALTER TABLE public.ai_audience_profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "admins manage audience profiles" ON public.ai_audience_profiles
    FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'administrator'))
    WITH CHECK (public.has_role(auth.uid(), 'administrator'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS trg_ai_audience_profiles_updated ON public.ai_audience_profiles;
CREATE TRIGGER trg_ai_audience_profiles_updated BEFORE UPDATE ON public.ai_audience_profiles
  FOR EACH ROW EXECUTE FUNCTION public.ai_growth_touch_updated_at();

-- Profil „pożyczkobiorca” = obecne ustawienia silnika wzrostu.
INSERT INTO public.ai_audience_profiles
  (track, label, target_audience, tone, primary_cta_url, material_audience, allowed_topics, publish_slots, cadence_share_pct)
SELECT
  'pozyczkobiorca',
  'Pożyczkobiorcy (firmy, cel gospodarczy)',
  COALESCE(NULLIF(s.target_audience, ''), 'Przedsiębiorcy potrzebujący szybkiego finansowania pod zastaw nieruchomości.'),
  'Rzeczowo, po partnersku, klient jest bohaterem. Hook w formie pytania, konkret i liczba. Bez presji czasu; pokazujemy, co można zrobić — decyzja po stronie przedsiębiorcy.',
  COALESCE(NULLIF(s.primary_cta_url, ''), 'https://app.financeyou.pl/embed/wniosek'),
  'klient',
  ARRAY['odmowa banku','LTV i kwota pod nieruchomość','dokumenty do wniosku','proces od wniosku do wypłaty','mity o pożyczkach pozabankowych','błędy przy finansowaniu pod zastaw','studium przypadku (zanonimizowane)'],
  '{"instagram_reels":["16:15"],"facebook_reels":["16:20"],"youtube":["16:30"]}'::jsonb,
  50
FROM (SELECT * FROM public.ai_growth_settings ORDER BY updated_at DESC LIMIT 1) s
ON CONFLICT (track) DO NOTHING;
-- Gdyby ai_growth_settings było puste — wartości domyślne.
INSERT INTO public.ai_audience_profiles
  (track, label, target_audience, tone, primary_cta_url, material_audience, allowed_topics, publish_slots, cadence_share_pct)
VALUES
  ('pozyczkobiorca', 'Pożyczkobiorcy (firmy, cel gospodarczy)',
   'Przedsiębiorcy potrzebujący szybkiego finansowania pod zastaw nieruchomości.',
   'Rzeczowo, po partnersku, klient jest bohaterem. Hook w formie pytania, konkret i liczba. Bez presji czasu.',
   'https://app.financeyou.pl/embed/wniosek', 'klient',
   ARRAY['odmowa banku','LTV i kwota pod nieruchomość','dokumenty do wniosku','proces od wniosku do wypłaty'],
   '{"instagram_reels":["16:15"],"facebook_reels":["16:20"],"youtube":["16:30"]}'::jsonb, 50),
  ('inwestor', 'Inwestorzy prywatni',
   'Prywatni inwestorzy (także osoby fizyczne) zainteresowani zarabianiem na nieruchomościach bez kupowania, budowania i remontowania.',
   'Szanse, nie straszenie; „zobacz, jak zarabia bank — po której stronie stołu siedzisz?”. Motyw szansy zawsze z beatem ryzyka („ale…, więc…”). Hook-pytanie, zadziornie, CTA do obserwowania.',
   'https://financeyou.pl/dla-inwestora', 'inwestor',
   ARRAY['czy wiesz, że…','bank vs Ty','3 błędy inwestora','nie mów / powiedz','LTV i bufor bezpieczeństwa','księga wieczysta','co się dzieje, gdy pożyczkobiorca nie płaci','audyt zabezpieczenia'],
   '{"instagram_reels":["17:15"],"facebook_reels":["17:20"],"youtube":["17:30"]}'::jsonb, 50)
ON CONFLICT (track) DO NOTHING;

-- ── 3. Audyt bramki compliance ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_compliance_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rules_version TEXT NOT NULL,
  content_kind TEXT NOT NULL,
  track TEXT CHECK (track IS NULL OR track IN ('pozyczkobiorca','inwestor')),
  subject_type TEXT NOT NULL,
  subject_id TEXT,
  stage TEXT NOT NULL DEFAULT 'pre_publish' CHECK (stage IN ('authoring','pre_publish','post_publish')),
  decision TEXT NOT NULL CHECK (decision IN ('pass','fixed','rewrite','reject')),
  iteration SMALLINT NOT NULL DEFAULT 1,
  violations JSONB NOT NULL DEFAULT '[]'::jsonb,
  added_elements JSONB NOT NULL DEFAULT '[]'::jsonb,
  reviewer JSONB,
  text_sha256 TEXT,
  final_text TEXT,
  actor TEXT NOT NULL DEFAULT 'publishing_agent'
);
CREATE INDEX IF NOT EXISTS idx_ai_compliance_checks_subject ON public.ai_compliance_checks(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_ai_compliance_checks_created ON public.ai_compliance_checks(created_at DESC);
GRANT SELECT ON public.ai_compliance_checks TO authenticated;
GRANT ALL ON public.ai_compliance_checks TO service_role;
ALTER TABLE public.ai_compliance_checks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "admins view compliance checks" ON public.ai_compliance_checks
    FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'administrator'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 4. Pochodzenie, tor i compliance w kolejkach ────────────────────────────
ALTER TABLE public.social_publish_queue
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS audience_track TEXT,
  ADD COLUMN IF NOT EXISTS compliance_check_id UUID,
  ADD COLUMN IF NOT EXISTS compliance_rules_version TEXT;
ALTER TABLE public.youtube_publish_queue
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS audience_track TEXT,
  ADD COLUMN IF NOT EXISTS compliance_check_id UUID,
  ADD COLUMN IF NOT EXISTS compliance_rules_version TEXT;
DO $$ BEGIN
  ALTER TABLE public.social_publish_queue ADD CONSTRAINT social_publish_queue_audience_track_check
    CHECK (audience_track IS NULL OR audience_track IN ('pozyczkobiorca','inwestor'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.youtube_publish_queue ADD CONSTRAINT youtube_publish_queue_audience_track_check
    CHECK (audience_track IS NULL OR audience_track IN ('pozyczkobiorca','inwestor'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 5. Metryki per publikacja (Etap 2) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_publication_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  external_id TEXT NOT NULL,
  queue_table TEXT CHECK (queue_table IS NULL OR queue_table IN ('social_publish_queue','youtube_publish_queue')),
  queue_id UUID,
  studio_job_id UUID,
  audience_track TEXT CHECK (audience_track IS NULL OR audience_track IN ('pozyczkobiorca','inwestor')),
  series TEXT,
  format TEXT,
  hook_text TEXT,
  hook_variant TEXT,
  visual_hook TEXT,
  duration_sec NUMERIC,
  published_at TIMESTAMPTZ,
  slot_local TEXT,
  keyword TEXT,
  lead_magnet_id UUID,
  motion_components TEXT[],
  cost_pln NUMERIC,
  measured_on DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Warsaw')::date,
  views BIGINT,
  reach BIGINT,
  likes BIGINT,
  comments BIGINT,
  shares BIGINT,
  saves BIGINT,
  follows BIGINT,
  avg_watch_pct NUMERIC,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, external_id, measured_on)
);
CREATE INDEX IF NOT EXISTS idx_content_publication_metrics_track ON public.content_publication_metrics(audience_track, platform, measured_on DESC);
GRANT SELECT ON public.content_publication_metrics TO authenticated;
GRANT ALL ON public.content_publication_metrics TO service_role;
ALTER TABLE public.content_publication_metrics ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "admins view publication metrics" ON public.content_publication_metrics
    FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'administrator'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 6. Dziennik: statusy warning / info ─────────────────────────────────────
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.ai_growth_action_log'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.ai_growth_action_log DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.ai_growth_action_log ADD CONSTRAINT ai_growth_action_log_status_check
    CHECK (status IN ('ok','blocked','error','warning','info'));
END $$;
CREATE INDEX IF NOT EXISTS idx_ai_growth_action_log_module_created
  ON public.ai_growth_action_log(module, created_at DESC);

-- ── 7. Cron: tick agenta co godzinę ─────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
DO $$
DECLARE
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  job record;
BEGIN
  FOR job IN SELECT jobname FROM cron.job WHERE jobname = 'publishing-agent-tick' LOOP
    PERFORM cron.unschedule(job.jobname);
  END LOOP;
  -- Co godzinę (minuta 7): bezpieczniki, import metryk, raport dzienny/tygodniowy.
  -- Endpoint no-opuje przy włączonym wyłączniku (poza raportem i alarmami).
  PERFORM cron.schedule('publishing-agent-tick', '7 * * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/publishing-agent-tick', hdrs));
END $$;
