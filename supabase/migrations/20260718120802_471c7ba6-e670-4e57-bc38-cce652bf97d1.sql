
DROP POLICY IF EXISTS loans_investor_select ON public.loan_applications;
CREATE POLICY loans_investor_select ON public.loan_applications
FOR SELECT
USING (
  available_to_investors = true
  AND visibility_level = 'zanonimizowane'
  AND has_role(auth.uid(), 'inwestor'::app_role)
);

DROP POLICY IF EXISTS documents_investor_select ON public.documents;
CREATE POLICY documents_investor_select ON public.documents
FOR SELECT
USING (
  has_role(auth.uid(), 'inwestor'::app_role)
  AND visibility_level = 'zanonimizowane'
  AND EXISTS (
    SELECT 1 FROM loan_applications la
    WHERE la.id = documents.loan_application_id
      AND la.available_to_investors = true
      AND la.visibility_level = 'zanonimizowane'
  )
);
