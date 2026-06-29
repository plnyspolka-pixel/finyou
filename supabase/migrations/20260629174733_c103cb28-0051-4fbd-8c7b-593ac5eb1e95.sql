ALTER TABLE public.debt_collection_cases
  ADD COLUMN IF NOT EXISTS no_payments_declared boolean NOT NULL DEFAULT false;