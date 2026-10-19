-- Agent publikujący — fundament autopilota (brief docs/agent-publikujacy, Etap 0–2).
--
-- ROZBUDOWA istniejącego silnika wzrostu, nie nowy system:
--  * ai_growth_settings: tryb modułu wideo/kanału, wyłącznik awaryjny, limity,
--    wyłączone kanały (X domyślnie wyłączony), numer alarmowy właściciela.
--  * ai_audience_profiles: dwa tory (pożyczkobiorca, inwestor). Obecne
--    ustawienia (grupa docelowa, CTA) stają się profilem „pozyczkobiorca”.
--  * ai_compliance_checks: audyt każdej decyzji bramki compliance.
--  * social_post_metrics: dzienne snapshoty metryk każdej publikacji.
--  * kolejki publikacji i studio_video_jobs: tor, seria, stan bramki.
--  * ai_growth_action_log: statusy 'warning' i 'skipped' (wcześniej INSERT
--    ze statusem 'warning' z bloga łamał CHECK i ostrzeżenie ginęło).
--
-- BEZPIECZEŃSTWO: migracja NIE włącza autopilota. video_module_mode = 'off',
-- automation_mode bez zmian, budżet reklam 0 zł. Przełączenie robi właściciel.
-- Idempotentna (IF NOT EXISTS / ON CONFLICT DO NOTHING).

-- 1. Dziennik: dodatkowe statusy ───────────────────────────────────────────
ALTER TABLE public.ai_growth_action_log
  DROP CONSTRAINT IF EXISTS ai_growth_action_log_status_check;
ALTER TABLE public.ai_growth_action_log
  ADD CONSTRAINT ai_growth_action_log_status_check
  CHECK (status IN ('ok', 'blocked', 'error', 'warning', 'skipped'));
CREATE INDEX IF NOT EXISTS idx_ai_growth_action_log_module_created
  ON public.ai_growth_action_log (module, created_at DESC);

-- 2. Ustawienia autopilota ─────────────────────────────────────────────────
ALTER TABLE public.ai_growth_settings
  ADD COLUMN IF NOT EXISTS video_module_mode TEXT NOT NULL DEFAULT 'off'
    CHECK (video_module_mode IN ('off', 'manual_review', 'semi_auto', 'full_autopilot')),
  ADD COLUMN IF NOT EXISTS kill_switch BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kill_switch_reason TEXT,
  ADD COLUMN IF NOT EXISTS kill_switch_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disabled_platforms TEXT[] NOT NULL DEFAULT ARRAY['x']::text[],
  ADD COLUMN IF NOT EXISTS max_posts_per_day_per_account INTEGER NOT NULL DEFAULT 4
    CHECK (max_posts_per_day_per_account BETWEEN 0 AND 50),
  ADD COLUMN IF NOT EXISTS max_emails_per_recipient_per_week INTEGER NOT NULL DEFAULT 3
    CHECK (max_emails_per_recipient_per_week BETWEEN 0 AND 14),
  ADD COLUMN IF NOT EXISTS heygen_daily_videos_limit INTEGER NOT NULL DEFAULT 4
    CHECK (heygen_daily_videos_limit BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS anomaly_failures_threshold INTEGER NOT NULL DEFAULT 3
    CHECK (anomaly_failures_threshold BETWEEN 1 AND 50),
  ADD COLUMN IF NOT EXISTS owner_alert_phone TEXT,
  ADD COLUMN IF NOT EXISTS owner_report_email TEXT,
  ADD COLUMN IF NOT EXISTS last_daily_report_on DATE,
  ADD COLUMN IF NOT EXISTS last_weekly_report_on DATE;

-- 3. Profile torów ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_audience_profiles (
  track TEXT PRIMARY KEY CHECK (track IN ('pozyczkobiorca', 'inwestor')),
  label TEXT NOT NULL,
  target_audience TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT '',
  cta_url TEXT NOT NULL,
  cta_label TEXT NOT NULL DEFAULT '',
  -- Mapowanie na istniejące słowniki: lead_magnets.audience, marketing_materials.audience
  -- (enum marketing_audience), ai_seo_articles.audience, shorts-question-bank.category.
  lead_magnet_audience TEXT NOT NULL CHECK (lead_magnet_audience IN ('klient', 'inwestor')),
  blog_audience TEXT NOT NULL CHECK (blog_audience IN ('borrower', 'investor')),
  allowed_topics TEXT[] NOT NULL DEFAULT '{}',
  -- Dodatkowe (miękkie) frazy zakazane toru. Reguły twarde są w kodzie
  -- (src/lib/autopilot/compliance-rules.ts) i tej kolumny nie potrzebują.
  extra_banned_phrases TEXT[] NOT NULL DEFAULT '{}',
  series TEXT[] NOT NULL DEFAULT '{}',
  -- Sloty publikacji (czas Europe/Warsaw): [{"platform":"instagram_reels","time":"16:00","weekdays":[1,2,3,4,5,6,7]}]
  slots JSONB NOT NULL DEFAULT '[]'::jsonb,
  cadence_share NUMERIC NOT NULL DEFAULT 0.5 CHECK (cadence_share BETWEEN 0 AND 1),
  weekly_reels_target INTEGER NOT NULL DEFAULT 6 CHECK (weekly_reels_target BETWEEN 0 AND 50),
  daily_ai_budget_pln NUMERIC NOT NULL DEFAULT 25 CHECK (daily_ai_budget_pln >= 0),
  ads_monthly_budget_pln NUMERIC NOT NULL DEFAULT 0 CHECK (ads_monthly_budget_pln >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_audience_profiles TO authenticated;
GRANT ALL ON public.ai_audience_profiles TO service_role;
ALTER TABLE public.ai_audience_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage audience profiles" ON public.ai_audience_profiles;
CREATE POLICY "admins manage audience profiles" ON public.ai_audience_profiles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'));
DROP TRIGGER IF EXISTS trg_ai_audience_profiles_updated ON public.ai_audience_profiles;
CREATE TRIGGER trg_ai_audience_profiles_updated BEFORE UPDATE ON public.ai_audience_profiles
  FOR EACH ROW EXECUTE FUNCTION public.ai_growth_touch_updated_at();

INSERT INTO public.ai_audience_profiles (
  track, label, target_audience, tone, cta_url, cta_label, lead_magnet_audience, blog_audience,
  allowed_topics, series, slots, cadence_share, weekly_reels_target, daily_ai_budget_pln
)
SELECT
  'pozyczkobiorca',
  'Pożyczkobiorcy (firmy)',
  COALESCE(s.target_audience,
    'Przedsiębiorcy potrzebujący szybkiego finansowania pod zastaw nieruchomości.')
    || ' Wyłącznie cel gospodarczy (B2B), bez konsumentów.',
  'Rzeczowo i zadziornie; hook jako pytanie-teza; klient jest bohaterem; system pokazuje możliwości, decyzja należy do klienta.',
  COALESCE(s.primary_cta_url, 'https://app.financeyou.pl/embed/wniosek'),
  'Złóż bezpłatny wniosek',
  'klient',
  'borrower',
  ARRAY['odmowa banku', 'LTV i kwota pod nieruchomość', 'dokumenty do wniosku', 'proces od wniosku do wypłaty',
        'błędy przy finansowaniu pod zastaw', 'mity o pożyczkach pozabankowych', 'studium przypadku (zanonimizowane)'],
  ARRAY['Bank odmówił – co dalej?', 'Ile naprawdę możesz dostać pod nieruchomość (LTV)',
        '3 błędy przy finansowaniu pod zastaw', 'Mit vs fakt o pożyczkach pozabankowych',
        'Krok po kroku: od wniosku do wypłaty', 'Studium przypadku'],
  '[{"platform":"instagram_reels","time":"16:05","weekdays":[1,2,3,4,5,6]},
    {"platform":"facebook_reels","time":"16:05","weekdays":[1,2,3,4,5,6]},
    {"platform":"youtube","time":"12:15","weekdays":[1,2,3,4,5,6]}]'::jsonb,
  0.5, 6, 25
FROM (SELECT * FROM public.ai_growth_settings LIMIT 1) s
ON CONFLICT (track) DO NOTHING;

INSERT INTO public.ai_audience_profiles (
  track, label, target_audience, tone, cta_url, cta_label, lead_magnet_audience, blog_audience,
  allowed_topics, series, slots, cadence_share, weekly_reels_target, daily_ai_budget_pln
) VALUES (
  'inwestor',
  'Inwestorzy prywatni',
  'Prywatni inwestorzy (także osoby fizyczne) szukający zarabiania na nieruchomościach bez kupowania, budowy i remontów.',
  'Szanse, nie straszenie; wolność finansowa; „zarabiaj tak, jak banki od stuleci” — zawsze z mechanizmem i ryzykiem. Bez obietnic zwrotu, bez kwot kapitału.',
  'https://financeyou.pl/dla-inwestora',
  'Poznaj zasady dla inwestora',
  'inwestor',
  'investor',
  ARRAY['jak działa zabezpieczenie hipoteczne', 'LTV i bufor bezpieczeństwa', 'księga wieczysta', 'umowa pożyczki',
        'błędy inwestora', 'bank vs prywatny inwestor', 'ryzyko i dywersyfikacja'],
  ARRAY['Czy wiesz, że…', 'Bank vs Ty', '3 błędy inwestora', 'Nie mów / Powiedz', 'Dzień X ze 100',
        'Audyt zabezpieczenia'],
  '[{"platform":"instagram_reels","time":"17:05","weekdays":[1,2,3,4,5,6]},
    {"platform":"facebook_reels","time":"17:05","weekdays":[1,2,3,4,5,6]},
    {"platform":"youtube","time":"19:15","weekdays":[1,2,3,4,5,6]}]'::jsonb,
  0.5, 6, 25
) ON CONFLICT (track) DO NOTHING;

-- 4. Audyt bramki compliance ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_compliance_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_kind TEXT NOT NULL,
  track TEXT NOT NULL CHECK (track IN ('pozyczkobiorca', 'inwestor', 'oba')),
  ref_table TEXT,
  ref_id TEXT,
  rules_version TEXT NOT NULL,
  -- passed: przeszło (ew. po poprawkach), rejected: odrzucone po 3 iteracjach,
  -- blocked: zatrzymane na reguły twarde bez możliwości przepisania (np. gotowe wideo).
  result TEXT NOT NULL CHECK (result IN ('passed', 'rejected', 'blocked')),
  iterations INTEGER NOT NULL DEFAULT 0,
  hard_violations JSONB NOT NULL DEFAULT '[]'::jsonb,
  reviewer JSONB NOT NULL DEFAULT '[]'::jsonb,
  mandatory_added TEXT[] NOT NULL DEFAULT '{}',
  original_text TEXT,
  final_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_compliance_checks_ref
  ON public.ai_compliance_checks (ref_table, ref_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_compliance_checks_created
  ON public.ai_compliance_checks (created_at DESC);
GRANT SELECT ON public.ai_compliance_checks TO authenticated;
GRANT ALL ON public.ai_compliance_checks TO service_role;
ALTER TABLE public.ai_compliance_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins view compliance checks" ON public.ai_compliance_checks;
CREATE POLICY "admins view compliance checks" ON public.ai_compliance_checks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'administrator'));

-- 5. Tor / seria / stan bramki na kolejkach i zadaniach Studia ─────────────
ALTER TABLE public.social_publish_queue
  ADD COLUMN IF NOT EXISTS track TEXT CHECK (track IN ('pozyczkobiorca', 'inwestor', 'oba')),
  ADD COLUMN IF NOT EXISTS series TEXT,
  ADD COLUMN IF NOT EXISTS autopilot BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS compliance_status TEXT
    CHECK (compliance_status IN ('passed', 'blocked')),
  ADD COLUMN IF NOT EXISTS compliance_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS content_meta JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.youtube_publish_queue
  ADD COLUMN IF NOT EXISTS track TEXT CHECK (track IN ('pozyczkobiorca', 'inwestor', 'oba')),
  ADD COLUMN IF NOT EXISTS series TEXT,
  ADD COLUMN IF NOT EXISTS autopilot BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS compliance_status TEXT
    CHECK (compliance_status IN ('passed', 'blocked')),
  ADD COLUMN IF NOT EXISTS compliance_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS content_meta JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.studio_video_jobs
  ADD COLUMN IF NOT EXISTS track TEXT CHECK (track IN ('pozyczkobiorca', 'inwestor', 'oba')),
  ADD COLUMN IF NOT EXISTS compliance_status TEXT
    CHECK (compliance_status IN ('passed', 'rejected', 'blocked')),
  ADD COLUMN IF NOT EXISTS compliance_checked_at TIMESTAMPTZ;

-- 6. Metryki publikacji (Etap 2) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_post_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  external_id TEXT NOT NULL,
  queue_table TEXT CHECK (queue_table IN ('social_publish_queue', 'youtube_publish_queue')),
  queue_item_id UUID,
  track TEXT,
  series TEXT,
  published_at TIMESTAMPTZ,
  captured_on DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Warsaw')::date,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  views BIGINT,
  reach BIGINT,
  likes BIGINT,
  comments BIGINT,
  shares BIGINT,
  saves BIGINT,
  follows BIGINT,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (platform, external_id, captured_on)
);
CREATE INDEX IF NOT EXISTS idx_social_post_metrics_platform_captured
  ON public.social_post_metrics (platform, captured_on DESC);
GRANT SELECT ON public.social_post_metrics TO authenticated;
GRANT ALL ON public.social_post_metrics TO service_role;
ALTER TABLE public.social_post_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins view post metrics" ON public.social_post_metrics;
CREATE POLICY "admins view post metrics" ON public.social_post_metrics
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'administrator'));

-- 7. Harmonogram ticka autopilota ──────────────────────────────────────────
-- Co godzinę (:20). Tick zawsze robi rzeczy bezpieczne (odbijanie zawieszonych
-- wpisów, wykrywanie anomalii, import metryk, raporty), a produkcję i
-- publikację tylko przy video_module_mode = 'full_autopilot' i bez kill switcha.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
DO $$
DECLARE
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  job record;
BEGIN
  FOR job IN SELECT jobname FROM cron.job WHERE jobname = 'autopilot-tick' LOOP
    PERFORM cron.unschedule(job.jobname);
  END LOOP;
  PERFORM cron.schedule('autopilot-tick', '20 * * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/autopilot-tick', hdrs));
END $$;
