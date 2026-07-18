-- Jeden wspólny bucket na wszystkie pliki klienta: "pliki-klienta".
-- Zastępuje dotychczasowe DWA buckety ("documents" i "property-photos"),
-- przez które te same pliki pokazywały się w dwóch różnych miejscach
-- i część nie miała podglądu. Wszystko wpada teraz do jednego worka,
-- a UI traktuje każdy plik jak zdjęcie (miniatura + podgląd).

-- 1) Nowy bucket (prywatny — dostęp przez signed URL + RLS)
INSERT INTO storage.buckets (id, name, public)
VALUES ('pliki-klienta', 'pliki-klienta', false)
ON CONFLICT (id) DO NOTHING;

-- 2) Przeniesienie WSZYSTKICH obiektów ze starych bucketów.
--    UPDATE bucket_id wystarcza — ścieżki (name) zostają bez zmian, więc
--    file_path/photos w tabelach dalej działają; zmienia się tylko bucket,
--    z którego generujemy signed URL. Guard NOT EXISTS chroni przed
--    kolizją nazw (unikalność bucket_id+name).
UPDATE storage.objects o
SET bucket_id = 'pliki-klienta'
WHERE o.bucket_id = 'property-photos'
  AND NOT EXISTS (
    SELECT 1 FROM storage.objects t
    WHERE t.bucket_id = 'pliki-klienta' AND t.name = o.name
  );

UPDATE storage.objects o
SET bucket_id = 'pliki-klienta'
WHERE o.bucket_id = 'documents'
  AND NOT EXISTS (
    SELECT 1 FROM storage.objects t
    WHERE t.bucket_id = 'pliki-klienta' AND t.name = o.name
  );

-- 3) Stare polityki obu bucketów — do kasacji
DROP POLICY IF EXISTS "docs_staff_all" ON storage.objects;
DROP POLICY IF EXISTS "docs_user_own" ON storage.objects;
DROP POLICY IF EXISTS "Investors read documents bucket" ON storage.objects;
DROP POLICY IF EXISTS "documents_templates_read" ON storage.objects;
DROP POLICY IF EXISTS "documents_generated_rw" ON storage.objects;
DROP POLICY IF EXISTS documents_generated_admin_rw ON storage.objects;
DROP POLICY IF EXISTS documents_generated_investor_own ON storage.objects;
DROP POLICY IF EXISTS property_photos_public_read ON storage.objects;
DROP POLICY IF EXISTS property_photos_authenticated_write ON storage.objects;
DROP POLICY IF EXISTS property_photos_scoped_read ON storage.objects;
DROP POLICY IF EXISTS property_photos_scoped_insert ON storage.objects;
DROP POLICY IF EXISTS property_photos_scoped_update ON storage.objects;
DROP POLICY IF EXISTS property_photos_scoped_delete ON storage.objects;
DROP POLICY IF EXISTS property_photos_unified_read ON storage.objects;
DROP POLICY IF EXISTS property_photos_unified_write ON storage.objects;
DROP POLICY IF EXISTS property_photos_unified_update ON storage.objects;
DROP POLICY IF EXISTS property_photos_unified_delete ON storage.objects;

-- 4) Scalone polityki dla bucketu pliki-klienta.
--    Prefiksy: property/<appId>/*, documents/<appId>/<typ>/*, attachments/*,
--    avatars/<userId>/*, marketing/*, generated/*, templates/*,
--    leads/<leadId>/* (załączniki inbound), system/*, <userId>/* (legacy).
DROP POLICY IF EXISTS pliki_klienta_read ON storage.objects;
CREATE POLICY pliki_klienta_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'pliki-klienta'
    AND (
      -- Staff czyta wszystko
      public.has_role(auth.uid(), 'administrator'::public.app_role)
      OR public.has_role(auth.uid(), 'operator'::public.app_role)
      -- Własny avatar
      OR ((storage.foldername(name))[1] = 'avatars' AND (storage.foldername(name))[2] = (auth.uid())::text)
      -- Legacy: folder nazwany user_id (stare uploady z dashboardu klienta)
      OR (storage.foldername(name))[1] = (auth.uid())::text
      -- Klient czyta pliki swojego wniosku
      OR (
        (storage.foldername(name))[1] IN ('property','documents','property_photos','property-photos')
        AND EXISTS (
          SELECT 1 FROM public.loan_applications la
          JOIN public.clients c ON c.id = la.client_id
          WHERE c.user_id = auth.uid()
            AND (la.id)::text = (storage.foldername(name))[2]
        )
      )
      -- Inwestor widzi pliki wniosków udostępnionych inwestorom
      OR (
        public.has_role(auth.uid(), 'inwestor'::public.app_role)
        AND EXISTS (
          SELECT 1 FROM public.loan_applications la
          WHERE (la.id)::text = (storage.foldername(name))[2]
            AND la.available_to_investors = true
        )
      )
      -- Szablony dokumentów: admin/operator/inwestor
      OR (
        (storage.foldername(name))[1] = 'templates'
        AND public.has_role(auth.uid(), 'inwestor'::public.app_role)
      )
      -- Materiały marketingowe: wszyscy zalogowani
      OR (storage.foldername(name))[1] = 'marketing'
    )
  );

DROP POLICY IF EXISTS pliki_klienta_write ON storage.objects;
CREATE POLICY pliki_klienta_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pliki-klienta'
    AND (
      public.has_role(auth.uid(), 'administrator'::public.app_role)
      OR public.has_role(auth.uid(), 'operator'::public.app_role)
      -- Własny avatar
      OR ((storage.foldername(name))[1] = 'avatars' AND (storage.foldername(name))[2] = (auth.uid())::text)
      -- Klient uploaduje w kontekście swojego wniosku
      OR (
        (storage.foldername(name))[1] IN ('property','documents')
        AND EXISTS (
          SELECT 1 FROM public.loan_applications la
          JOIN public.clients c ON c.id = la.client_id
          WHERE c.user_id = auth.uid()
            AND (la.id)::text = (storage.foldername(name))[2]
        )
      )
      -- Załącznik do własnej komunikacji
      OR (storage.foldername(name))[1] = 'attachments'
    )
  );

DROP POLICY IF EXISTS pliki_klienta_update ON storage.objects;
CREATE POLICY pliki_klienta_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'pliki-klienta'
    AND (
      public.has_role(auth.uid(), 'administrator'::public.app_role)
      OR public.has_role(auth.uid(), 'operator'::public.app_role)
      OR ((storage.foldername(name))[1] = 'avatars' AND (storage.foldername(name))[2] = (auth.uid())::text)
    )
  );

DROP POLICY IF EXISTS pliki_klienta_delete ON storage.objects;
CREATE POLICY pliki_klienta_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'pliki-klienta'
    AND (
      public.has_role(auth.uid(), 'administrator'::public.app_role)
      OR public.has_role(auth.uid(), 'operator'::public.app_role)
      OR ((storage.foldername(name))[1] = 'avatars' AND (storage.foldername(name))[2] = (auth.uid())::text)
    )
  );

-- Inwestor: pełny dostęp do własnych dokumentów wygenerowanych (generated/*)
DROP POLICY IF EXISTS pliki_klienta_generated_investor_own ON storage.objects;
CREATE POLICY pliki_klienta_generated_investor_own ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'pliki-klienta'
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
    bucket_id = 'pliki-klienta'
    AND (storage.foldername(name))[1] = 'generated'
    AND public.has_role(auth.uid(), 'inwestor'::public.app_role)
  );

-- 5) Usunięcie starych bucketów (dopiero gdy puste)
DELETE FROM storage.buckets b
WHERE b.id IN ('documents', 'property-photos')
  AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = b.id);

-- 6) Log migracji plików celuje teraz w nowy bucket
ALTER TABLE public.storage_migration_log
  ALTER COLUMN target_bucket SET DEFAULT 'pliki-klienta';
