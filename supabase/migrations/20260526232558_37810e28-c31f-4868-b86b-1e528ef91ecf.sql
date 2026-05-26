
CREATE POLICY documents_investor_select ON public.documents
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'inwestor'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.loan_applications la
    WHERE la.id = documents.loan_application_id
      AND la.available_to_investors = true
  )
);

CREATE POLICY "Investors read documents bucket" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND has_role(auth.uid(), 'inwestor'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.loan_applications la
    WHERE la.id::text = (storage.foldername(name))[2]
      AND la.available_to_investors = true
  )
);
