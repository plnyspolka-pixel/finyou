-- KRS cache
CREATE TABLE public.krs_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  krs text NOT NULL,
  normalized_krs text NOT NULL UNIQUE,
  source text NOT NULL DEFAULT 'KRS API Ministerstwo Sprawiedliwości',
  response_json jsonb NOT NULL,
  mapped_json jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);
CREATE INDEX idx_krs_cache_normalized ON public.krs_cache(normalized_krs);
CREATE INDEX idx_krs_cache_expires ON public.krs_cache(expires_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.krs_cache TO authenticated;
GRANT ALL ON public.krs_cache TO service_role;

ALTER TABLE public.krs_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY krs_cache_staff_all ON public.krs_cache
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role));

-- External API logs
CREATE TABLE public.external_api_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  query_type text NOT NULL,
  query_value text NOT NULL,
  success boolean NOT NULL,
  error_code text,
  response_time_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_external_api_logs_provider_created ON public.external_api_logs(provider, created_at DESC);

GRANT SELECT, INSERT ON public.external_api_logs TO authenticated;
GRANT ALL ON public.external_api_logs TO service_role;

ALTER TABLE public.external_api_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY external_api_logs_staff_select ON public.external_api_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role));

CREATE POLICY external_api_logs_staff_insert ON public.external_api_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role));
