ALTER TABLE public.loan_applications
  ADD COLUMN IF NOT EXISTS accepted_terms jsonb,
  ADD COLUMN IF NOT EXISTS accepted_terms_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_loan_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS accepted_period_months integer,
  ADD COLUMN IF NOT EXISTS accepted_annual_rate numeric,
  ADD COLUMN IF NOT EXISTS accepted_max_monthly_payment numeric;