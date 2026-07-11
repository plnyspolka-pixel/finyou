
-- 1) thumbnail_path na dokumentach i innych tabelach z plikami
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS thumbnail_path text;
ALTER TABLE public.kw_documents ADD COLUMN IF NOT EXISTS thumbnail_path text;
ALTER TABLE public.marketing_materials ADD COLUMN IF NOT EXISTS thumbnail_path text;

-- 2) log migracji plikow
CREATE TABLE IF NOT EXISTS public.storage_migration_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_bucket text NOT NULL,
  source_path text NOT NULL,
  target_bucket text NOT NULL DEFAULT 'property-photos',
  target_path text NOT NULL,
  table_updated text,
  ok boolean NOT NULL DEFAULT false,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_bucket, source_path)
);
GRANT SELECT ON public.storage_migration_log TO authenticated;
GRANT ALL ON public.storage_migration_log TO service_role;
ALTER TABLE public.storage_migration_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read storage migration log"
  ON public.storage_migration_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::public.app_role));

-- 3) rozszerz polityki storage.objects na bucket property-photos aby obsluzyc wiele kontekstow
-- prefiksy: property/<applicationId>/*, documents/<applicationId>/*, attachments/<messageId>/*,
--           avatars/<userId>/*, marketing/<materialId>/*, generated/*, legacy/<bucket>/*
DROP POLICY IF EXISTS property_photos_unified_read ON storage.objects;
CREATE POLICY property_photos_unified_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'property-photos'
    AND (
      -- Staff czyta wszystko
      public.has_role(auth.uid(), 'administrator'::public.app_role)
      OR public.has_role(auth.uid(), 'operator'::public.app_role)
      -- Wlasny avatar
      OR ((storage.foldername(name))[1] = 'avatars' AND (storage.foldername(name))[2] = (auth.uid())::text)
      -- Wlasny katalog user-owned (property/*, documents/*, attachments/*) - property scoped przez client
      OR (
        (storage.foldername(name))[1] IN ('property','documents','property_photos','property-photos')
        AND EXISTS (
          SELECT 1 FROM public.loan_applications la
          JOIN public.clients c ON c.id = la.client_id
          WHERE c.user_id = auth.uid()
            AND (la.id)::text = (storage.foldername(name))[2]
        )
      )
      -- Inwestor moze widziec pliki wnioskow udostepnionych
      OR (
        public.has_role(auth.uid(), 'inwestor'::public.app_role)
        AND (storage.foldername(name))[1] IN ('property','documents','property_photos','property-photos')
        AND EXISTS (
          SELECT 1 FROM public.loan_applications la
          WHERE (la.id)::text = (storage.foldername(name))[2]
            AND la.available_to_investors = true
        )
      )
      -- Marketing czytamy dla zalogowanych
      OR (storage.foldername(name))[1] = 'marketing'
      -- Miniaturki .thumb.png sledzia widocznosc pliku bazowego - reguly wyzej lapia name matcher
    )
  );

DROP POLICY IF EXISTS property_photos_unified_write ON storage.objects;
CREATE POLICY property_photos_unified_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'property-photos'
    AND (
      public.has_role(auth.uid(), 'administrator'::public.app_role)
      OR public.has_role(auth.uid(), 'operator'::public.app_role)
      OR public.has_role(auth.uid(), 'inwestor'::public.app_role)
      -- Wlasny avatar
      OR ((storage.foldername(name))[1] = 'avatars' AND (storage.foldername(name))[2] = (auth.uid())::text)
      -- Klient uploaduje w kontekscie swojego wniosku
      OR (
        (storage.foldername(name))[1] IN ('property','documents')
        AND EXISTS (
          SELECT 1 FROM public.loan_applications la
          JOIN public.clients c ON c.id = la.client_id
          WHERE c.user_id = auth.uid()
            AND (la.id)::text = (storage.foldername(name))[2]
        )
      )
      -- Zalacznik do wlasnej komunikacji
      OR (storage.foldername(name))[1] = 'attachments'
    )
  );

DROP POLICY IF EXISTS property_photos_unified_update ON storage.objects;
CREATE POLICY property_photos_unified_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'property-photos'
    AND (
      public.has_role(auth.uid(), 'administrator'::public.app_role)
      OR public.has_role(auth.uid(), 'operator'::public.app_role)
      OR ((storage.foldername(name))[1] = 'avatars' AND (storage.foldername(name))[2] = (auth.uid())::text)
    )
  );

DROP POLICY IF EXISTS property_photos_unified_delete ON storage.objects;
CREATE POLICY property_photos_unified_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'property-photos'
    AND (
      public.has_role(auth.uid(), 'administrator'::public.app_role)
      OR public.has_role(auth.uid(), 'operator'::public.app_role)
      OR ((storage.foldername(name))[1] = 'avatars' AND (storage.foldername(name))[2] = (auth.uid())::text)
    )
  );
