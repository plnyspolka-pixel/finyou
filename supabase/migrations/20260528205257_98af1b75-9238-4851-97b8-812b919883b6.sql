
-- KW (księgi wieczyste) fetch jobs
CREATE TABLE public.kw_fetch_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL,
  kw_number text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  next_attempt_at timestamptz DEFAULT now(),
  last_attempt_at timestamptz,
  summary_raw_html text,
  summary_raw_text text,
  raw_html text,
  raw_text text,
  parsed_json jsonb,
  missing_sections jsonb,
  partial_success boolean NOT NULL DEFAULT false,
  error_message text,
  failure_reason text,
  fetched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kw_fetch_jobs_app_idx ON public.kw_fetch_jobs(application_id);
CREATE INDEX kw_fetch_jobs_claim_idx ON public.kw_fetch_jobs(status, next_attempt_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kw_fetch_jobs TO authenticated;
GRANT ALL ON public.kw_fetch_jobs TO service_role;
ALTER TABLE public.kw_fetch_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY kw_jobs_staff_all ON public.kw_fetch_jobs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role));

CREATE TRIGGER kw_fetch_jobs_updated BEFORE UPDATE ON public.kw_fetch_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- KW analysis
CREATE TABLE public.kw_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL UNIQUE,
  kw_number text NOT NULL,
  property_json jsonb,
  owners_json jsonb,
  section_i_o_json jsonb,
  section_i_sp_json jsonb,
  section_ii_json jsonb,
  section_iii_json jsonb,
  section_iv_json jsonb,
  risk_flags jsonb,
  investor_summary text,
  legal_risk_score int,
  analysis_warning text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kw_analysis_app_idx ON public.kw_analysis(application_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kw_analysis TO authenticated;
GRANT ALL ON public.kw_analysis TO service_role;
ALTER TABLE public.kw_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY kw_analysis_staff_all ON public.kw_analysis
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role));

CREATE POLICY kw_analysis_investor_select ON public.kw_analysis
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'inwestor'::public.app_role)
    AND EXISTS (SELECT 1 FROM public.loan_applications la WHERE la.id = kw_analysis.application_id AND la.available_to_investors = true)
  );

CREATE POLICY kw_analysis_client_select ON public.kw_analysis
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.loan_applications la
      JOIN public.clients c ON c.id = la.client_id
      WHERE la.id = kw_analysis.application_id AND c.user_id = auth.uid()
    )
  );

CREATE TRIGGER kw_analysis_updated BEFORE UPDATE ON public.kw_analysis
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- KW fetch attempts (log)
CREATE TABLE public.kw_fetch_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  application_id uuid NOT NULL,
  kw_number text NOT NULL,
  attempt_number int NOT NULL,
  status text NOT NULL,
  error_message text,
  failure_reason text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX kw_attempts_job_idx ON public.kw_fetch_attempts(job_id);

GRANT SELECT, INSERT, UPDATE ON public.kw_fetch_attempts TO authenticated;
GRANT ALL ON public.kw_fetch_attempts TO service_role;
ALTER TABLE public.kw_fetch_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY kw_attempts_staff_all ON public.kw_fetch_attempts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role));

-- KW section sources (raw per dział)
CREATE TABLE public.kw_section_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  application_id uuid NOT NULL,
  kw_number text NOT NULL,
  section_key text NOT NULL,
  section_label text NOT NULL,
  raw_html text,
  raw_text text,
  screenshot_path text,
  url text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  success boolean NOT NULL DEFAULT true,
  error_message text
);
CREATE INDEX kw_sections_job_idx ON public.kw_section_sources(job_id);
CREATE INDEX kw_sections_app_idx ON public.kw_section_sources(application_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kw_section_sources TO authenticated;
GRANT ALL ON public.kw_section_sources TO service_role;
ALTER TABLE public.kw_section_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY kw_sections_staff_all ON public.kw_section_sources
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role));
