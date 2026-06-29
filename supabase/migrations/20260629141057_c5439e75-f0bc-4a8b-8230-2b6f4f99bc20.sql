REVOKE INSERT, UPDATE, DELETE ON public.loan_proposals FROM anon;

DROP POLICY IF EXISTS "Anyone can create a proposal" ON public.loan_proposals;
DROP POLICY IF EXISTS "Authenticated owners and staff can view full proposals" ON public.loan_proposals;
DROP POLICY IF EXISTS "Owner or admin can update" ON public.loan_proposals;
DROP POLICY IF EXISTS "Owner or admin can delete" ON public.loan_proposals;

CREATE POLICY "Staff can view full loan proposals"
  ON public.loan_proposals
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrator'::app_role)
    OR public.has_role(auth.uid(), 'operator'::app_role)
  );

CREATE POLICY "Authenticated users can create own loan proposals"
  ON public.loan_proposals
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Owners or admins can update loan proposals"
  ON public.loan_proposals
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = created_by
    OR public.has_role(auth.uid(), 'administrator'::app_role)
  )
  WITH CHECK (
    auth.uid() = created_by
    OR public.has_role(auth.uid(), 'administrator'::app_role)
  );

CREATE POLICY "Owners or admins can delete loan proposals"
  ON public.loan_proposals
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = created_by
    OR public.has_role(auth.uid(), 'administrator'::app_role)
  );