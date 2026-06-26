DROP POLICY IF EXISTS "Public proposals are visible to everyone" ON public.loan_proposals;

REVOKE SELECT ON public.loan_proposals FROM anon;
GRANT INSERT ON public.loan_proposals TO anon;

CREATE POLICY "Authenticated owners and staff can view full proposals"
  ON public.loan_proposals
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = created_by
    OR public.has_role(auth.uid(), 'administrator'::public.app_role)
    OR public.has_role(auth.uid(), 'operator'::public.app_role)
  );

CREATE OR REPLACE VIEW public.loan_proposals_public
WITH (security_barrier = true)
AS
SELECT
  id,
  note,
  amount,
  months,
  annual_rate,
  commission_pct,
  commission_pln,
  max_payment,
  nominal_rata,
  capped_rata,
  balloon,
  total_interest,
  total_cost,
  total_to_repay,
  schedule,
  status,
  is_public,
  created_at,
  updated_at,
  source_application_id
FROM public.loan_proposals
WHERE is_public = true;

GRANT SELECT ON public.loan_proposals_public TO anon;
GRANT SELECT ON public.loan_proposals_public TO authenticated;
GRANT ALL ON public.loan_proposals_public TO service_role;