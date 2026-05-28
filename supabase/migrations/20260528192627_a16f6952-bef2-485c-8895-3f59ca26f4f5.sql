
CREATE TABLE public.property_location_analysis_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_address TEXT,
  city TEXT,
  postal_code TEXT,
  normalized_address TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  property_type TEXT,
  analysis_json JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX idx_plac_normalized ON public.property_location_analysis_cache (normalized_address, property_type);
CREATE INDEX idx_plac_expires ON public.property_location_analysis_cache (expires_at);

GRANT ALL ON public.property_location_analysis_cache TO service_role;

ALTER TABLE public.property_location_analysis_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role only"
ON public.property_location_analysis_cache
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
