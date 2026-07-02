
DROP POLICY IF EXISTS documents_generated_rw ON storage.objects;

-- Administrator/operator: pełny dostęp do folderu 'generated'
CREATE POLICY documents_generated_admin_rw ON storage.objects
FOR ALL TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = 'generated'
  AND (public.has_role(auth.uid(), 'administrator'::public.app_role)
       OR public.has_role(auth.uid(), 'operator'::public.app_role))
)
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = 'generated'
  AND (public.has_role(auth.uid(), 'administrator'::public.app_role)
       OR public.has_role(auth.uid(), 'operator'::public.app_role))
);

-- Inwestor: tylko własne dokumenty (te które sam wygenerował lub które
-- powstały dla oferty jego konta)
CREATE POLICY documents_generated_investor_own ON storage.objects
FOR ALL TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = 'generated'
  AND public.has_role(auth.uid(), 'inwestor'::public.app_role)
  AND EXISTS (
    SELECT 1 FROM public.generated_documents gd
    LEFT JOIN public.investor_offers io ON io.id = gd.investor_offer_id
    LEFT JOIN public.investors i ON i.id = io.investor_id
    WHERE (gd.docx_path = storage.objects.name OR gd.pdf_path = storage.objects.name)
      AND (gd.created_by = auth.uid() OR i.user_id = auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = 'generated'
  AND public.has_role(auth.uid(), 'inwestor'::public.app_role)
);
