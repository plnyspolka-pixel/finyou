DROP VIEW IF EXISTS public.loan_proposals_public;

CREATE OR REPLACE FUNCTION public.list_public_loan_proposals()
RETURNS TABLE (
  id uuid,
  note text,
  amount numeric,
  months integer,
  annual_rate numeric,
  commission_pct numeric,
  commission_pln numeric,
  max_payment numeric,
  nominal_rata numeric,
  capped_rata numeric,
  balloon numeric,
  total_interest numeric,
  total_cost numeric,
  total_to_repay numeric,
  schedule jsonb,
  status text,
  is_public boolean,
  created_at timestamptz,
  updated_at timestamptz,
  source_application_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.note,
    p.amount,
    p.months,
    p.annual_rate,
    p.commission_pct,
    p.commission_pln,
    p.max_payment,
    p.nominal_rata,
    p.capped_rata,
    p.balloon,
    p.total_interest,
    p.total_cost,
    p.total_to_repay,
    p.schedule,
    p.status,
    p.is_public,
    p.created_at,
    p.updated_at,
    p.source_application_id
  FROM public.loan_proposals p
  WHERE p.is_public = true
  ORDER BY p.created_at DESC
  LIMIT 200;
$$;

CREATE OR REPLACE FUNCTION public.get_public_loan_proposal(_id uuid)
RETURNS TABLE (
  id uuid,
  note text,
  amount numeric,
  months integer,
  annual_rate numeric,
  commission_pct numeric,
  commission_pln numeric,
  max_payment numeric,
  nominal_rata numeric,
  capped_rata numeric,
  balloon numeric,
  total_interest numeric,
  total_cost numeric,
  total_to_repay numeric,
  schedule jsonb,
  status text,
  is_public boolean,
  created_at timestamptz,
  updated_at timestamptz,
  source_application_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.note,
    p.amount,
    p.months,
    p.annual_rate,
    p.commission_pct,
    p.commission_pln,
    p.max_payment,
    p.nominal_rata,
    p.capped_rata,
    p.balloon,
    p.total_interest,
    p.total_cost,
    p.total_to_repay,
    p.schedule,
    p.status,
    p.is_public,
    p.created_at,
    p.updated_at,
    p.source_application_id
  FROM public.loan_proposals p
  WHERE p.id = _id AND p.is_public = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.list_public_loan_proposals() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_loan_proposal(uuid) TO anon, authenticated, service_role;