CREATE TABLE public.flood_risk_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID,
  latitude NUMERIC,
  longitude NUMERIC,
  geometry_hash TEXT,
  query_bbox TEXT,
  risk_level TEXT,
  scenario_10_percent BOOLEAN,
  scenario_1_percent BOOLEAN,
  scenario_02_percent BOOLEAN,
  special_flood_hazard_area BOOLEAN,
  water_depth NUMERIC,
  flow_velocity NUMERIC,
  score INTEGER,
  response_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days')
);

CREATE INDEX idx_flood_risk_cache_coords ON public.flood_risk_cache (latitude, longitude);
CREATE INDEX idx_flood_risk_cache_expires ON public.flood_risk_cache (expires_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.flood_risk_cache TO authenticated;
GRANT ALL ON public.flood_risk_cache TO service_role;

ALTER TABLE public.flood_risk_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY flood_cache_staff_all ON public.flood_risk_cache FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::app_role) OR public.has_role(auth.uid(), 'operator'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::app_role) OR public.has_role(auth.uid(), 'operator'::app_role));