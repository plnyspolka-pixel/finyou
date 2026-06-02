-- helper trigger function (idempotent)
CREATE OR REPLACE FUNCTION public.ai_growth_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- 1. Settings (singleton)
CREATE TABLE public.ai_growth_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_mode TEXT NOT NULL DEFAULT 'manual_review' CHECK (automation_mode IN ('off','manual_review','semi_auto','full_autopilot')),
  daily_ai_budget_pln NUMERIC NOT NULL DEFAULT 50,
  default_model TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
  brand_name TEXT NOT NULL DEFAULT 'Finance You',
  brand_description TEXT DEFAULT 'Pożyczki pod zastaw nieruchomości od inwestorów prywatnych.',
  target_audience TEXT DEFAULT 'Przedsiębiorcy potrzebujący szybkiego finansowania pod zastaw nieruchomości.',
  primary_cta_url TEXT DEFAULT 'https://app.financeyou.pl/embed/wniosek',
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_growth_settings TO authenticated;
GRANT ALL ON public.ai_growth_settings TO service_role;
ALTER TABLE public.ai_growth_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage growth settings" ON public.ai_growth_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'));
CREATE TRIGGER trg_ai_growth_settings_updated BEFORE UPDATE ON public.ai_growth_settings
  FOR EACH ROW EXECUTE FUNCTION public.ai_growth_touch_updated_at();
INSERT INTO public.ai_growth_settings (automation_mode) VALUES ('manual_review');

-- 2. Landings
CREATE TABLE public.ai_landings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  goal TEXT,
  audience TEXT,
  keywords TEXT[] DEFAULT '{}',
  brief TEXT,
  meta_title TEXT,
  meta_description TEXT,
  hero_headline TEXT,
  hero_subheadline TEXT,
  cta_label TEXT DEFAULT 'Złóż wniosek',
  cta_url TEXT,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_ai_output JSONB,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai_autopilot')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);
CREATE INDEX idx_ai_landings_status ON public.ai_landings(status);
GRANT SELECT ON public.ai_landings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_landings TO authenticated;
GRANT ALL ON public.ai_landings TO service_role;
ALTER TABLE public.ai_landings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public can view published landings" ON public.ai_landings
  FOR SELECT TO anon, authenticated USING (status = 'published');
CREATE POLICY "admins manage landings" ON public.ai_landings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'));
CREATE TRIGGER trg_ai_landings_updated BEFORE UPDATE ON public.ai_landings
  FOR EACH ROW EXECUTE FUNCTION public.ai_growth_touch_updated_at();

-- 3. A/B variants
CREATE TABLE public.ai_landing_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_id UUID NOT NULL REFERENCES public.ai_landings(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 50 CHECK (weight >= 0 AND weight <= 100),
  overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_landing_variants_landing ON public.ai_landing_variants(landing_id);
GRANT SELECT ON public.ai_landing_variants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_landing_variants TO authenticated;
GRANT ALL ON public.ai_landing_variants TO service_role;
ALTER TABLE public.ai_landing_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public can view variants of published landings" ON public.ai_landing_variants
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.ai_landings l WHERE l.id = landing_id AND l.status = 'published'));
CREATE POLICY "admins manage variants" ON public.ai_landing_variants
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'));

-- 4. Events
CREATE TABLE public.ai_landing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_id UUID NOT NULL REFERENCES public.ai_landings(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES public.ai_landing_variants(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('view','cta_click','lead','scroll_50','scroll_100')),
  source TEXT,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_landing_events_landing ON public.ai_landing_events(landing_id, created_at DESC);
GRANT INSERT ON public.ai_landing_events TO anon, authenticated;
GRANT SELECT ON public.ai_landing_events TO authenticated;
GRANT ALL ON public.ai_landing_events TO service_role;
ALTER TABLE public.ai_landing_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can record landing events" ON public.ai_landing_events
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admins view landing events" ON public.ai_landing_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'administrator'));

-- 5. Action log
CREATE TABLE public.ai_growth_action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','blocked','error')),
  summary TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  cost_pln NUMERIC DEFAULT 0,
  actor UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_growth_action_log_created ON public.ai_growth_action_log(created_at DESC);
GRANT SELECT, INSERT ON public.ai_growth_action_log TO authenticated;
GRANT ALL ON public.ai_growth_action_log TO service_role;
ALTER TABLE public.ai_growth_action_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins view growth action log" ON public.ai_growth_action_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'administrator'));
CREATE POLICY "admins insert growth action log" ON public.ai_growth_action_log
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'administrator'));