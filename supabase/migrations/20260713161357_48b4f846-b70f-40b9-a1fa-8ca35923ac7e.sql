DROP POLICY IF EXISTS property_photos_unified_write ON storage.objects;
CREATE POLICY property_photos_unified_write ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'property-photos' AND (
    has_role(auth.uid(), 'administrator'::app_role)
    OR has_role(auth.uid(), 'operator'::app_role)
    OR (((storage.foldername(name))[1] = 'avatars') AND ((storage.foldername(name))[2] = (auth.uid())::text))
    OR (((storage.foldername(name))[1] = ANY (ARRAY['property','documents']))
        AND EXISTS (
          SELECT 1 FROM loan_applications la
          JOIN clients c ON c.id = la.client_id
          WHERE c.user_id = auth.uid()
            AND la.id::text = (storage.foldername(objects.name))[2]
        ))
    OR ((storage.foldername(name))[1] = 'attachments')
  )
);