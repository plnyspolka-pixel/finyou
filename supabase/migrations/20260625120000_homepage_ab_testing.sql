-- Homepage A/B testing events table (standalone, no FK to ai_landings)
CREATE TABLE IF NOT EXISTS public.homepage_ab_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'view',
    'step_contact',
    'step_path',
    'step_property',
    'step_kw',
    'step_photos',
    'step_calculator',
    'submit',
    'cta_click'
  )),
  session_id TEXT NOT NULL,
  device TEXT CHECK (device IN ('mobile','tablet','desktop')),
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_homepage_ab_events_variant ON public.homepage_ab_events(variant, created_at DESC);
CREATE INDEX idx_homepage_ab_events_session ON public.homepage_ab_events(session_id);
CREATE INDEX idx_homepage_ab_events_type ON public.homepage_ab_events(event_type, variant);

GRANT INSERT ON public.homepage_ab_events TO anon, authenticated;
GRANT SELECT ON public.homepage_ab_events TO authenticated;
GRANT ALL ON public.homepage_ab_events TO service_role;

ALTER TABLE public.homepage_ab_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can record homepage ab events"
  ON public.homepage_ab_events FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admins view homepage ab events"
  ON public.homepage_ab_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'));
