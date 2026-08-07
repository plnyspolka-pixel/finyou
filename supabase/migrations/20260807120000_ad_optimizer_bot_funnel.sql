-- === Pętla automatycznej optymalizacji: atrybucja reklam Messenger → jakość leada
-- === → decyzje budżetowe + lejek bota z wariantami promptów i oceną LLM. ===
--
-- Kontekst (EOG/Polska): CAPI Business Messaging i optymalizacja messaging pod
-- konwersje są w EOG ZABLOKOWANE przez Metę (ePrivacy). Dlatego sygnał jakości
-- NIE idzie do algorytmu Mety — pętla decyzyjna działa PO NASZEJ STRONIE:
--   webhook referral → atrybucja psid→ad_id → scoring leada (lead-quality) →
--   koszt kwalifikowanego leada per reklama → pauza/skalowanie przez Graph API.

-- ---------- 1) Atrybucja: która reklama przyprowadziła PSID ----------
CREATE TABLE IF NOT EXISTS public.messenger_ad_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL DEFAULT 'messenger',        -- messenger | instagram
  psid text NOT NULL,                                -- PSID/IGSID
  ad_id text,                                        -- referral.ad_id
  adset_id text,                                     -- dociągane z Graph przy syncu
  campaign_id text,
  ref text,                                          -- parametr ref z linku m.me / reklamy
  source text,                                       -- ADS | SHORTLINK | CUSTOMER_CHAT_PLUGIN
  ads_context jsonb,                                 -- referral.ads_context_data (tytuł/zdjęcie posta)
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  history jsonb NOT NULL DEFAULT '[]'::jsonb,        -- poprzednie referrale (re-klik z innej reklamy)
  UNIQUE (platform, psid)
);
CREATE INDEX IF NOT EXISTS idx_mess_attr_ad ON public.messenger_ad_attributions(ad_id);
ALTER TABLE public.messenger_ad_attributions ENABLE ROW LEVEL SECURITY;
-- Odczyt tylko dla admin/operator (zapis wyłącznie service_role przez webhook).
DROP POLICY IF EXISTS mess_attr_staff_read ON public.messenger_ad_attributions;
CREATE POLICY mess_attr_staff_read ON public.messenger_ad_attributions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrator'::public.app_role)
    OR public.has_role(auth.uid(), 'operator'::public.app_role)
  );

-- ---------- 2) Insights dzienne na poziomie reklamy ----------
CREATE TABLE IF NOT EXISTS public.meta_ad_insights_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id text NOT NULL,
  adset_id text,
  campaign_id text,
  ad_name text,
  day date NOT NULL,
  spend numeric NOT NULL DEFAULT 0,                  -- PLN
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  ctr numeric,
  frequency numeric,
  actions jsonb,                                     -- surowe actions (m.in. link_click)
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_id, day)
);
CREATE INDEX IF NOT EXISTS idx_ad_insights_day ON public.meta_ad_insights_daily(day);
ALTER TABLE public.meta_ad_insights_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ad_insights_staff_read ON public.meta_ad_insights_daily;
CREATE POLICY ad_insights_staff_read ON public.meta_ad_insights_daily
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrator'::public.app_role)
    OR public.has_role(auth.uid(), 'operator'::public.app_role)
  );

-- ---------- 3) Konfiguracja i log akcji optymalizatora ----------
CREATE TABLE IF NOT EXISTS public.ad_optimizer_config (
  id int PRIMARY KEY CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT true,
  dry_run boolean NOT NULL DEFAULT true,             -- START W TRYBIE SUCHYM. Wyłącz świadomie.
  window_days int NOT NULL DEFAULT 7,                -- okno analizy
  min_spend_pln numeric NOT NULL DEFAULT 150,        -- min wydatek zanim wolno pauzować
  max_cpql_pln numeric NOT NULL DEFAULT 300,         -- próg pauzy: koszt kwalifikowanego leada (tier A/B)
  target_cpql_pln numeric NOT NULL DEFAULT 150,      -- poniżej → kandydat do skalowania
  max_frequency numeric NOT NULL DEFAULT 3.5,        -- zmęczenie kreacji
  scale_step_pct numeric NOT NULL DEFAULT 15,        -- krok podbicia budżetu adsetu (%)
  max_budget_pln numeric NOT NULL DEFAULT 500,       -- sufit daily_budget adsetu
  qualified_tiers text[] NOT NULL DEFAULT ARRAY['A','B'],
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.ad_optimizer_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ad_optimizer_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  ad_id text,
  adset_id text,
  action text NOT NULL,                              -- pause_ad | scale_adset | flag_fatigue | error
  reason text NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,        -- spend, qualified, cpql, frequency…
  dry_run boolean NOT NULL,
  ok boolean,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_opt_actions_run ON public.ad_optimizer_actions(run_id);
ALTER TABLE public.ad_optimizer_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_optimizer_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ad_opt_cfg_admin ON public.ad_optimizer_config;
CREATE POLICY ad_opt_cfg_admin ON public.ad_optimizer_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::public.app_role));
DROP POLICY IF EXISTS ad_opt_actions_staff_read ON public.ad_optimizer_actions;
CREATE POLICY ad_opt_actions_staff_read ON public.ad_optimizer_actions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrator'::public.app_role)
    OR public.has_role(auth.uid(), 'operator'::public.app_role)
  );

-- ---------- 4) Lejek bota: kroki rozmowy + warianty promptu + oceny LLM ----------
CREATE TABLE IF NOT EXISTS public.bot_funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  step text NOT NULL,   -- greeting|intent|property_declared|amount_declared|contact_collected|application_link_sent|qualified
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, step)                             -- każdy krok liczymy raz per lead
);
CREATE INDEX IF NOT EXISTS idx_bot_funnel_step ON public.bot_funnel_events(step, created_at);

CREATE TABLE IF NOT EXISTS public.bot_prompt_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_variant text NOT NULL DEFAULT 'klient',      -- spójne z AgentVariant
  variant_key text NOT NULL,                         -- np. 'baseline', 'krotsze-pytania'
  prompt_suffix text NOT NULL DEFAULT '',            -- doklejane do promptu z text_agent_settings
  weight int NOT NULL DEFAULT 1,                     -- losowanie ważone
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_variant, variant_key)
);
-- baseline = pusty sufiks, żeby test A/B miał kontrolę
INSERT INTO public.bot_prompt_variants (agent_variant, variant_key, prompt_suffix, weight)
VALUES ('klient', 'baseline', '', 1)
ON CONFLICT (agent_variant, variant_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.bot_prompt_assignments (
  lead_id uuid PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.bot_prompt_variants(id),
  assigned_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bot_conversation_evals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  judge_score numeric,                               -- 0..1
  step_reached text,
  failure_tags text[] DEFAULT '{}',
  summary text,
  suggestion text,                                   -- propozycja poprawki promptu od sędziego
  model text,
  messages_evaluated int,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id)                                   -- ocena nadpisywana (ostatni stan rozmowy)
);
ALTER TABLE public.bot_funnel_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_prompt_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_prompt_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_conversation_evals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bot_funnel_staff_read ON public.bot_funnel_events;
CREATE POLICY bot_funnel_staff_read ON public.bot_funnel_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrator'::public.app_role)
    OR public.has_role(auth.uid(), 'operator'::public.app_role)
  );
DROP POLICY IF EXISTS bot_variants_admin ON public.bot_prompt_variants;
CREATE POLICY bot_variants_admin ON public.bot_prompt_variants
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::public.app_role));
DROP POLICY IF EXISTS bot_assign_staff_read ON public.bot_prompt_assignments;
CREATE POLICY bot_assign_staff_read ON public.bot_prompt_assignments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrator'::public.app_role)
    OR public.has_role(auth.uid(), 'operator'::public.app_role)
  );
DROP POLICY IF EXISTS bot_evals_staff_read ON public.bot_conversation_evals;
CREATE POLICY bot_evals_staff_read ON public.bot_conversation_evals
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrator'::public.app_role)
    OR public.has_role(auth.uid(), 'operator'::public.app_role)
  );

-- ---------- 5) Widok: koszt kwalifikowanego leada per reklama (okno kroczące) ----------
-- security_invoker=true — widok łączy `leads`, więc dostęp MUSI wynikać z RLS
-- tabel bazowych (inaczej domyślne granty Supabase odsłoniłyby dane leadów).
CREATE OR REPLACE VIEW public.v_ad_cpql
WITH (security_invoker = true) AS
WITH spend AS (
  SELECT ad_id, MAX(adset_id) AS adset_id, MAX(campaign_id) AS campaign_id,
         MAX(ad_name) AS ad_name,
         SUM(spend) AS spend, MAX(frequency) AS frequency,
         SUM(impressions) AS impressions, SUM(clicks) AS clicks
  FROM public.meta_ad_insights_daily
  WHERE day >= CURRENT_DATE - INTERVAL '7 days'
  GROUP BY ad_id
),
q AS (
  SELECT a.ad_id, COUNT(*) FILTER (WHERE l.quality_tier IN ('A','B')) AS qualified,
         COUNT(*) AS leads_total
  FROM public.messenger_ad_attributions a
  -- PSID trzymamy per platforma: Messenger → leads.messenger_psid,
  -- Instagram → leads.instagram_igsid (inaczej ruch z IG gubi atrybucję).
  JOIN public.leads l
    ON (a.platform = 'instagram' AND l.instagram_igsid = a.psid)
    OR (a.platform <> 'instagram' AND l.messenger_psid = a.psid)
  WHERE l.created_at >= CURRENT_DATE - INTERVAL '7 days'
  GROUP BY a.ad_id
)
SELECT s.*, COALESCE(q.qualified,0) AS qualified, COALESCE(q.leads_total,0) AS leads_total,
       CASE WHEN COALESCE(q.qualified,0) > 0 THEN ROUND(s.spend / q.qualified, 2) END AS cpql_pln
FROM spend s LEFT JOIN q ON q.ad_id = s.ad_id;

-- ---------- 6) Crony (ten sam wzorzec co 20260707120000) ----------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
DO $$
DECLARE
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  job record;
BEGIN
  FOR job IN SELECT jobname FROM cron.job WHERE jobname IN (
    'meta-insights-sync-tick','ad-optimizer-tick','bot-judge-tick'
  ) LOOP
    PERFORM cron.unschedule(job.jobname);
  END LOOP;

  -- Insights ad-level: co godzinę (Meta i tak agreguje dziennie)
  PERFORM cron.schedule('meta-insights-sync-tick', '7 * * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/meta-insights-sync-tick', hdrs));

  -- Optymalizator: co 6 h (decyzje na oknie 7-dniowym nie potrzebują częściej)
  PERFORM cron.schedule('ad-optimizer-tick', '20 */6 * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/ad-optimizer-tick', hdrs));

  -- Sędzia LLM: raz dziennie w nocy
  PERFORM cron.schedule('bot-judge-tick', '15 3 * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/bot-judge-tick', hdrs));
END $$;
