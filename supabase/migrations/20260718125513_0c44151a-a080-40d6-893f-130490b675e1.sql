
DROP POLICY IF EXISTS properties_investor_select ON public.properties;
CREATE POLICY properties_investor_select ON public.properties
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'inwestor'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.loan_applications la
    WHERE la.id = properties.loan_application_id
      AND la.available_to_investors = true
      AND la.visibility_level = 'zanonimizowane'
  )
);

DROP POLICY IF EXISTS kw_analysis_investor_select ON public.kw_analysis;
CREATE POLICY kw_analysis_investor_select ON public.kw_analysis
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'inwestor'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.loan_applications la
    WHERE la.id = kw_analysis.application_id
      AND la.available_to_investors = true
      AND la.visibility_level = 'zanonimizowane'
  )
);

DROP POLICY IF EXISTS pa_investor_select ON public.property_analyses;
CREATE POLICY pa_investor_select ON public.property_analyses
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'inwestor'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.loan_applications la
    WHERE la.id = property_analyses.application_id
      AND la.available_to_investors = true
      AND la.visibility_level = 'zanonimizowane'
  )
);

DROP POLICY IF EXISTS kw_documents_investor_read ON public.kw_documents;
CREATE POLICY kw_documents_investor_read ON public.kw_documents
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'inwestor'::app_role)
  AND EXISTS (
    SELECT 1
    FROM public.properties p
    JOIN public.loan_applications la ON la.id = p.loan_application_id
    WHERE p.land_register_number = kw_documents.kw_number
      AND la.available_to_investors = true
      AND la.visibility_level = 'zanonimizowane'
  )
);
