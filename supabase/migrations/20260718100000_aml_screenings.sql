-- Screening AML: wyniki CRBR (beneficjenci rzeczywiści) + PEP/sankcje (OpenSanctions).
-- Każde uruchomienie zapisuje osobny wiersz — historia screeningu jest częścią
-- dokumentacji środków bezpieczeństwa finansowego (ustawa AML).

CREATE TABLE IF NOT EXISTS public.aml_screenings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_profile_id uuid NOT NULL REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  nip text,
  borrower_type text,
  -- found / not_found / not_applicable / not_configured / error
  crbr_status text NOT NULL,
  crbr_data jsonb,
  crbr_discrepancies jsonb NOT NULL DEFAULT '[]'::jsonb,
  screening_provider text,
  screening_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- hits / review / clear / incomplete
  overall_status text NOT NULL,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aml_screenings_profile_created
  ON public.aml_screenings(client_profile_id, created_at DESC);

GRANT SELECT, INSERT ON public.aml_screenings TO authenticated;
GRANT ALL ON public.aml_screenings TO service_role;

ALTER TABLE public.aml_screenings ENABLE ROW LEVEL SECURITY;

CREATE POLICY aml_screenings_staff_select ON public.aml_screenings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role));

CREATE POLICY aml_screenings_staff_insert ON public.aml_screenings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::public.app_role) OR public.has_role(auth.uid(), 'operator'::public.app_role));
