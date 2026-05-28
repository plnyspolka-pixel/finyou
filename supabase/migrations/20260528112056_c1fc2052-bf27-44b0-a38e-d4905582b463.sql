
ALTER TABLE public.investors
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS country text;

ALTER TABLE public.loan_applications
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_loan_view(_loan_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.loan_applications SET view_count = COALESCE(view_count, 0) + 1 WHERE id = _loan_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_loan_view(uuid) TO authenticated;
