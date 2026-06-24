ALTER TABLE public.loan_applications
  ADD COLUMN IF NOT EXISTS is_startup boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS startup_funding_dependency boolean,
  ADD COLUMN IF NOT EXISTS business_legal_form text,
  ADD COLUMN IF NOT EXISTS business_nip_verified_at timestamptz;