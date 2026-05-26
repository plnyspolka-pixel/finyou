CREATE TABLE public.client_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_application_id uuid REFERENCES public.loan_applications(id) ON DELETE SET NULL,
  borrower_type text,
  nip text,
  completion_percent integer NOT NULL DEFAULT 0,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_profiles_source_app ON public.client_profiles(source_application_id);
CREATE INDEX idx_client_profiles_nip ON public.client_profiles(nip);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_profiles TO authenticated;
GRANT ALL ON public.client_profiles TO service_role;

ALTER TABLE public.client_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_profiles_staff_all" ON public.client_profiles
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
WITH CHECK (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role));

CREATE TRIGGER trg_client_profiles_updated_at
BEFORE UPDATE ON public.client_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();