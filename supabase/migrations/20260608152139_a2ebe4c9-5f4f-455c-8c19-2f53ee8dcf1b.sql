
ALTER TABLE public.loan_applications
  ADD COLUMN IF NOT EXISTS investor_description text,
  ADD COLUMN IF NOT EXISTS investor_purpose text;
