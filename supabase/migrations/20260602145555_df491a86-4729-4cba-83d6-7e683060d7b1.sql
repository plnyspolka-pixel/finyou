CREATE TABLE public.ai_funnel_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  landing_id UUID,
  step TEXT NOT NULL,
  step_order INTEGER NOT NULL DEFAULT 0,
  event_type TEXT NOT NULL DEFAULT 'pageview',
  value NUMERIC,
  source TEXT,
  medium TEXT,
  campaign TEXT,
  referrer TEXT,
  user_agent TEXT,
  country TEXT,
  device TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_funnel_events_session ON public.ai_funnel_events(session_id, created_at);
CREATE INDEX idx_funnel_events_landing ON public.ai_funnel_events(landing_id, created_at DESC);
CREATE INDEX idx_funnel_events_step ON public.ai_funnel_events(step, created_at DESC);

CREATE TABLE public.ai_funnel_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  landing_id UUID,
  period_from TIMESTAMPTZ NOT NULL,
  period_to TIMESTAMPTZ NOT NULL,
  summary TEXT NOT NULL,
  bottlenecks JSONB DEFAULT '[]'::jsonb,
  recommendations JSONB DEFAULT '[]'::jsonb,
  metrics JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_funnel_insights_landing ON public.ai_funnel_insights(landing_id, created_at DESC);

GRANT SELECT, INSERT ON public.ai_funnel_events TO anon, authenticated;
GRANT ALL ON public.ai_funnel_events TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_funnel_insights TO authenticated;
GRANT ALL ON public.ai_funnel_insights TO service_role;

ALTER TABLE public.ai_funnel_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_funnel_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can record funnel events" ON public.ai_funnel_events
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Admins view funnel events" ON public.ai_funnel_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::public.app_role));

CREATE POLICY "Admins manage funnel insights" ON public.ai_funnel_insights
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::public.app_role));
