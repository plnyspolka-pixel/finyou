
-- Property analysis module tables

CREATE TABLE public.property_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL,
  property_id UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  result_json JSONB,
  collateral_score INTEGER,
  collateral_category TEXT,
  ltv_percent NUMERIC,
  estimated_value_pln NUMERIC,
  main_source TEXT,
  sources_used JSONB DEFAULT '[]'::jsonb,
  warnings JSONB DEFAULT '[]'::jsonb,
  error_message TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_property_analyses_application ON public.property_analyses(application_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_analyses TO authenticated;
GRANT ALL ON public.property_analyses TO service_role;
ALTER TABLE public.property_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY pa_staff_all ON public.property_analyses FOR ALL TO authenticated
  USING (has_role(auth.uid(),'administrator'::app_role) OR has_role(auth.uid(),'operator'::app_role))
  WITH CHECK (has_role(auth.uid(),'administrator'::app_role) OR has_role(auth.uid(),'operator'::app_role));

CREATE POLICY pa_client_select ON public.property_analyses FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM loan_applications la JOIN clients c ON c.id = la.client_id
                 WHERE la.id = property_analyses.application_id AND c.user_id = auth.uid()));

CREATE POLICY pa_investor_select ON public.property_analyses FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'inwestor'::app_role) AND EXISTS (
    SELECT 1 FROM loan_applications la
    WHERE la.id = property_analyses.application_id AND la.available_to_investors = true));

CREATE TRIGGER tr_property_analyses_updated BEFORE UPDATE ON public.property_analyses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Logs
CREATE TABLE public.property_analysis_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID,
  property_id UUID,
  analysis_id UUID,
  sources_used JSONB DEFAULT '[]'::jsonb,
  rcn_status TEXT,
  gus_bdl_status TEXT,
  nbp_status TEXT,
  google_maps_status TEXT,
  document_extraction_status TEXT,
  collateral_score INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pa_logs_app ON public.property_analysis_logs(application_id);
GRANT SELECT, INSERT ON public.property_analysis_logs TO authenticated;
GRANT ALL ON public.property_analysis_logs TO service_role;
ALTER TABLE public.property_analysis_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY pal_staff_all ON public.property_analysis_logs FOR ALL TO authenticated
  USING (has_role(auth.uid(),'administrator'::app_role) OR has_role(auth.uid(),'operator'::app_role))
  WITH CHECK (has_role(auth.uid(),'administrator'::app_role) OR has_role(auth.uid(),'operator'::app_role));

-- RCN cache
CREATE TABLE public.rcn_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rcn_cache TO authenticated;
GRANT ALL ON public.rcn_cache TO service_role;
ALTER TABLE public.rcn_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY rcn_staff_all ON public.rcn_cache FOR ALL TO authenticated
  USING (has_role(auth.uid(),'administrator'::app_role) OR has_role(auth.uid(),'operator'::app_role))
  WITH CHECK (has_role(auth.uid(),'administrator'::app_role) OR has_role(auth.uid(),'operator'::app_role));

-- GUS BDL cache
CREATE TABLE public.gus_bdl_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gus_bdl_cache TO authenticated;
GRANT ALL ON public.gus_bdl_cache TO service_role;
ALTER TABLE public.gus_bdl_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY gus_staff_all ON public.gus_bdl_cache FOR ALL TO authenticated
  USING (has_role(auth.uid(),'administrator'::app_role) OR has_role(auth.uid(),'operator'::app_role))
  WITH CHECK (has_role(auth.uid(),'administrator'::app_role) OR has_role(auth.uid(),'operator'::app_role));

-- NBP cache
CREATE TABLE public.nbp_real_estate_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nbp_real_estate_cache TO authenticated;
GRANT ALL ON public.nbp_real_estate_cache TO service_role;
ALTER TABLE public.nbp_real_estate_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY nbp_staff_all ON public.nbp_real_estate_cache FOR ALL TO authenticated
  USING (has_role(auth.uid(),'administrator'::app_role) OR has_role(auth.uid(),'operator'::app_role))
  WITH CHECK (has_role(auth.uid(),'administrator'::app_role) OR has_role(auth.uid(),'operator'::app_role));

-- Document extractions
CREATE TABLE public.property_document_extractions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL UNIQUE,
  application_id UUID,
  doc_kind TEXT,
  extracted_json JSONB,
  raw_text TEXT,
  model TEXT,
  file_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pde_app ON public.property_document_extractions(application_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_document_extractions TO authenticated;
GRANT ALL ON public.property_document_extractions TO service_role;
ALTER TABLE public.property_document_extractions ENABLE ROW LEVEL SECURITY;
CREATE POLICY pde_staff_all ON public.property_document_extractions FOR ALL TO authenticated
  USING (has_role(auth.uid(),'administrator'::app_role) OR has_role(auth.uid(),'operator'::app_role))
  WITH CHECK (has_role(auth.uid(),'administrator'::app_role) OR has_role(auth.uid(),'operator'::app_role));
CREATE TRIGGER tr_pde_updated BEFORE UPDATE ON public.property_document_extractions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
