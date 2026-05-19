
ALTER TABLE public.loan_applications
  ADD COLUMN IF NOT EXISTS annual_investor_rate numeric,
  ADD COLUMN IF NOT EXISTS max_monthly_payment numeric,
  ADD COLUMN IF NOT EXISTS business_status text,
  ADD COLUMN IF NOT EXISTS nip text,
  ADD COLUMN IF NOT EXISTS kw_status text,
  ADD COLUMN IF NOT EXISTS interest_score integer;

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS mpzp_info text,
  ADD COLUMN IF NOT EXISTS land_registry_extract text;
