
CREATE TABLE public.representation_web_enrichment_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text,
  nip text,
  krs text,
  masked_person text NOT NULL,
  function text,
  original_value text NOT NULL,
  final_display_value text NOT NULL,
  full_name text,
  was_auto_enriched boolean NOT NULL DEFAULT false,
  raw_internal_results jsonb,
  cache_key text NOT NULL UNIQUE,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

CREATE INDEX idx_rwec_cache_key ON public.representation_web_enrichment_cache(cache_key);
CREATE INDEX idx_rwec_expires ON public.representation_web_enrichment_cache(expires_at);

GRANT SELECT ON public.representation_web_enrichment_cache TO authenticated;
GRANT ALL ON public.representation_web_enrichment_cache TO service_role;

ALTER TABLE public.representation_web_enrichment_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY rwec_staff_select ON public.representation_web_enrichment_cache
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role));
