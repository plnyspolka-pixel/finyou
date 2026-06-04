
-- 1) kw_documents: replace USING(true) with scoped access
DROP POLICY IF EXISTS "Authenticated can read KW documents" ON public.kw_documents;

CREATE POLICY "kw_documents_staff_read"
ON public.kw_documents FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrator'::app_role)
  OR public.has_role(auth.uid(), 'operator'::app_role)
);

CREATE POLICY "kw_documents_client_read"
ON public.kw_documents FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.properties p
    JOIN public.loan_applications la ON la.id = p.loan_application_id
    JOIN public.clients c ON c.id = la.client_id
    WHERE p.land_register_number = kw_documents.kw_number
      AND c.user_id = auth.uid()
  )
);

CREATE POLICY "kw_documents_investor_read"
ON public.kw_documents FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'inwestor'::app_role)
  AND EXISTS (
    SELECT 1
    FROM public.properties p
    JOIN public.loan_applications la ON la.id = p.loan_application_id
    WHERE p.land_register_number = kw_documents.kw_number
      AND la.available_to_investors = true
  )
);

-- 2) Storage: tighten property_photos investor branch
DROP POLICY IF EXISTS "property_photos_scoped_read" ON storage.objects;

CREATE POLICY "property_photos_scoped_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'property-photos'
  AND (
    public.has_role(auth.uid(), 'administrator'::app_role)
    OR public.has_role(auth.uid(), 'operator'::app_role)
    OR (
      public.has_role(auth.uid(), 'inwestor'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.loan_applications la
        WHERE (la.id)::text = (storage.foldername(objects.name))[1]
          AND la.available_to_investors = true
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.loan_applications la
      JOIN public.clients c ON c.id = la.client_id
      WHERE c.user_id = auth.uid()
        AND (la.id)::text = (storage.foldername(objects.name))[1]
    )
  )
);
