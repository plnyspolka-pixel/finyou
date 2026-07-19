-- =====================================================================
-- PAYWALL INWESTORA W RLS I STORAGE.
--  - pełne dane inwestycyjne wyłącznie dla płacącego inwestora
--    (investor_has_full_access) albo personelu wewnętrznego,
--  - partner zewnętrzny z historyczną rolą 'operator' NIE dostaje
--    bypassu personelu na danych inwestycyjnych (is_internal_staff),
--  - bezpieczne zajawki: funkcja investor_offer_teasers() zwraca tylko
--    dozwolone pola; pełny rekord nie trafia do przeglądarki,
--  - publiczny (anon) dostęp do pełnych wierszy loan_applications/properties
--    zastąpiony bezpiecznym widokiem kolumnowym public_loan_teasers,
--  - Akademia (training_videos + bucket) tylko dla uprawnionych.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LOAN_APPLICATIONS
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS loans_staff_all ON public.loan_applications;
CREATE POLICY loans_staff_all ON public.loan_applications FOR ALL TO authenticated
  USING (public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS loans_investor_select ON public.loan_applications;
CREATE POLICY loans_investor_select ON public.loan_applications
  FOR SELECT TO authenticated
  USING (
    available_to_investors = true
    AND visibility_level = 'zanonimizowane'
    AND deleted_at IS NULL
    AND public.has_role(auth.uid(), 'inwestor'::app_role)
    AND public.investor_has_full_access(auth.uid())
  );

-- ---------------------------------------------------------------------
-- 2. CLIENTS / PROPERTIES / DOCUMENTS
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS clients_staff_all ON public.clients;
CREATE POLICY clients_staff_all ON public.clients FOR ALL TO authenticated
  USING (public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS properties_staff_all ON public.properties;
CREATE POLICY properties_staff_all ON public.properties FOR ALL TO authenticated
  USING (public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS properties_investor_select ON public.properties;
CREATE POLICY properties_investor_select ON public.properties
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'inwestor'::app_role)
    AND public.investor_has_full_access(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.loan_applications la
      WHERE la.id = properties.loan_application_id
        AND la.available_to_investors = true
        AND la.visibility_level = 'zanonimizowane'
        AND la.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS documents_staff_all ON public.documents;
CREATE POLICY documents_staff_all ON public.documents FOR ALL TO authenticated
  USING (public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS documents_investor_select ON public.documents;
CREATE POLICY documents_investor_select ON public.documents
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'inwestor'::app_role)
    AND public.investor_has_full_access(auth.uid())
    AND visibility_level = 'zanonimizowane'
    AND EXISTS (
      SELECT 1 FROM public.loan_applications la
      WHERE la.id = documents.loan_application_id
        AND la.available_to_investors = true
        AND la.visibility_level = 'zanonimizowane'
        AND la.deleted_at IS NULL
    )
  );

-- ---------------------------------------------------------------------
-- 3. ANALIZY / KW / RYZYKO
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS kw_analysis_investor_select ON public.kw_analysis;
CREATE POLICY kw_analysis_investor_select ON public.kw_analysis
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'inwestor'::app_role)
    AND public.investor_has_full_access(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.loan_applications la
      WHERE la.id = kw_analysis.application_id
        AND la.available_to_investors = true
        AND la.visibility_level = 'zanonimizowane'
        AND la.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS pa_investor_select ON public.property_analyses;
CREATE POLICY pa_investor_select ON public.property_analyses
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'inwestor'::app_role)
    AND public.investor_has_full_access(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.loan_applications la
      WHERE la.id = property_analyses.application_id
        AND la.available_to_investors = true
        AND la.visibility_level = 'zanonimizowane'
        AND la.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS kw_documents_investor_read ON public.kw_documents;
CREATE POLICY kw_documents_investor_read ON public.kw_documents
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'inwestor'::app_role)
    AND public.investor_has_full_access(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.properties p
      JOIN public.loan_applications la ON la.id = p.loan_application_id
      WHERE p.land_register_number = kw_documents.kw_number
        AND la.available_to_investors = true
        AND la.visibility_level = 'zanonimizowane'
        AND la.deleted_at IS NULL
    )
  );

-- Oceny ryzyka inwestycji: personel + płacący inwestor (odczyt).
DROP POLICY IF EXISTS ira_staff_all ON public.investment_risk_assessments;
CREATE POLICY ira_staff_all ON public.investment_risk_assessments FOR ALL TO authenticated
  USING (public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS ira_investor_select ON public.investment_risk_assessments;
CREATE POLICY ira_investor_select ON public.investment_risk_assessments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'inwestor'::app_role)
    AND public.investor_has_full_access(auth.uid())
  );

-- ---------------------------------------------------------------------
-- 4. OFERTY INWESTORA I DYSTRYBUCJE
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS offers_staff_all ON public.investor_offers;
CREATE POLICY offers_staff_all ON public.investor_offers FOR ALL TO authenticated
  USING (public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS offers_investor_own ON public.investor_offers;
CREATE POLICY offers_investor_own ON public.investor_offers FOR ALL TO authenticated
  USING (
    public.investor_has_full_access(auth.uid())
    AND EXISTS (SELECT 1 FROM public.investors i WHERE i.id = investor_id AND i.user_id = auth.uid())
  )
  WITH CHECK (
    public.investor_has_full_access(auth.uid())
    AND EXISTS (SELECT 1 FROM public.investors i WHERE i.id = investor_id AND i.user_id = auth.uid())
  );

DROP POLICY IF EXISTS distributions_staff_all ON public.offer_distributions;
CREATE POLICY distributions_staff_all ON public.offer_distributions FOR ALL TO authenticated
  USING (public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS distributions_investor_select ON public.offer_distributions;
CREATE POLICY distributions_investor_select ON public.offer_distributions
  FOR SELECT TO authenticated
  USING (
    public.investor_has_full_access(auth.uid())
    AND EXISTS (SELECT 1 FROM public.investors i WHERE i.id = investor_id AND i.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- 5. CZAT (strona inwestora bramkowana; klient bez zmian)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS chat_threads_staff_all ON public.chat_threads;
CREATE POLICY chat_threads_staff_all ON public.chat_threads FOR ALL TO authenticated
  USING (public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS chat_threads_investor ON public.chat_threads;
CREATE POLICY chat_threads_investor ON public.chat_threads FOR SELECT TO authenticated
  USING (
    public.investor_has_full_access(auth.uid())
    AND EXISTS (SELECT 1 FROM public.investors i WHERE i.id = investor_id AND i.user_id = auth.uid())
  );

-- Płacący inwestor może rozpocząć wątek dla oferty udostępnionej inwestorom.
DROP POLICY IF EXISTS chat_threads_investor_insert ON public.chat_threads;
CREATE POLICY chat_threads_investor_insert ON public.chat_threads FOR INSERT TO authenticated
  WITH CHECK (
    public.investor_has_full_access(auth.uid())
    AND EXISTS (SELECT 1 FROM public.investors i WHERE i.id = investor_id AND i.user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.loan_applications la
      WHERE la.id = loan_application_id
        AND la.available_to_investors = true
        AND la.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS chat_msg_staff_all ON public.chat_messages;
CREATE POLICY chat_msg_staff_all ON public.chat_messages FOR ALL TO authenticated
  USING (public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS chat_msg_thread_participant_select ON public.chat_messages;
CREATE POLICY chat_msg_thread_participant_select ON public.chat_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.chat_threads t
    LEFT JOIN public.investors i ON i.id = t.investor_id
    LEFT JOIN public.clients c ON c.id = t.client_id
    WHERE t.id = thread_id
      AND ((i.user_id = auth.uid() AND public.investor_has_full_access(auth.uid()))
           OR c.user_id = auth.uid())
  ));

DROP POLICY IF EXISTS chat_msg_thread_participant_insert ON public.chat_messages;
CREATE POLICY chat_msg_thread_participant_insert ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.chat_threads t
    LEFT JOIN public.investors i ON i.id = t.investor_id
    LEFT JOIN public.clients c ON c.id = t.client_id
    WHERE t.id = thread_id
      AND ((i.user_id = auth.uid() AND public.investor_has_full_access(auth.uid()))
           OR c.user_id = auth.uid())
  ));

-- ---------------------------------------------------------------------
-- 6. WINDYKACJA (wind_*)
-- Po wygaśnięciu dostępu inwestor traci również dostęp do własnych spraw.
-- Dane pozostają w bazie i wracają po ponownym opłaceniu.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS wind_borrowers_owner ON public.wind_borrowers;
CREATE POLICY wind_borrowers_owner ON public.wind_borrowers FOR ALL TO authenticated
  USING ((investor_user_id = auth.uid() AND public.investor_has_full_access(auth.uid())) OR public.is_internal_staff(auth.uid()))
  WITH CHECK ((investor_user_id = auth.uid() AND public.investor_has_full_access(auth.uid())) OR public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS wind_loans_owner ON public.wind_loans;
CREATE POLICY wind_loans_owner ON public.wind_loans FOR ALL TO authenticated
  USING ((investor_user_id = auth.uid() AND public.investor_has_full_access(auth.uid())) OR public.is_internal_staff(auth.uid()))
  WITH CHECK ((investor_user_id = auth.uid() AND public.investor_has_full_access(auth.uid())) OR public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS wind_cases_owner ON public.wind_collection_cases;
CREATE POLICY wind_cases_owner ON public.wind_collection_cases FOR ALL TO authenticated
  USING ((investor_user_id = auth.uid() AND public.investor_has_full_access(auth.uid())) OR public.is_internal_staff(auth.uid()))
  WITH CHECK ((investor_user_id = auth.uid() AND public.investor_has_full_access(auth.uid())) OR public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS wind_documents_owner ON public.wind_documents;
CREATE POLICY wind_documents_owner ON public.wind_documents FOR ALL TO authenticated
  USING ((investor_user_id = auth.uid() AND public.investor_has_full_access(auth.uid())) OR public.is_internal_staff(auth.uid()))
  WITH CHECK ((investor_user_id = auth.uid() AND public.investor_has_full_access(auth.uid())) OR public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS wind_events_select ON public.wind_events;
CREATE POLICY wind_events_select ON public.wind_events FOR SELECT TO authenticated
  USING ((investor_user_id = auth.uid() AND public.investor_has_full_access(auth.uid())) OR public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS wind_events_insert ON public.wind_events;
CREATE POLICY wind_events_insert ON public.wind_events FOR INSERT TO authenticated
  WITH CHECK ((investor_user_id = auth.uid() AND public.investor_has_full_access(auth.uid())) OR public.is_internal_staff(auth.uid()));

-- ---------------------------------------------------------------------
-- 7. DOKUMENTY WYGENEROWANE (kreator dokumentów)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS gen_docs_investor_own ON public.generated_documents;
CREATE POLICY gen_docs_investor_own ON public.generated_documents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'inwestor') AND created_by = auth.uid() AND public.investor_has_full_access(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'inwestor') AND created_by = auth.uid() AND public.investor_has_full_access(auth.uid()));

-- ---------------------------------------------------------------------
-- 8. AKADEMIA (training_videos + bucket training-videos)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS training_viewers_select ON public.training_videos;
CREATE POLICY training_viewers_select ON public.training_videos
  FOR SELECT TO authenticated
  USING (
    is_published = true
    AND (
      public.is_internal_staff(auth.uid())
      OR (public.has_role(auth.uid(),'inwestor') AND public.investor_has_full_access(auth.uid()))
      OR public.broker_has_paid_access(auth.uid())
    )
  );

-- Bucket przestaje być publiczny; odczyt przez podpisane URL-e z bramką.
UPDATE storage.buckets SET public = false WHERE id = 'training-videos';

DROP POLICY IF EXISTS training_videos_public_read ON storage.objects;
DROP POLICY IF EXISTS training_videos_authenticated_read ON storage.objects;
DROP POLICY IF EXISTS training_videos_gated_read ON storage.objects;
CREATE POLICY training_videos_gated_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'training-videos'
    AND (
      public.is_internal_staff(auth.uid())
      OR (public.has_role(auth.uid(),'inwestor') AND public.investor_has_full_access(auth.uid()))
      OR public.broker_has_paid_access(auth.uid())
    )
  );

-- ---------------------------------------------------------------------
-- 9. STORAGE pliki-klienta: personel = personel wewnętrzny; branch
--    inwestorski bramkowany płatnym dostępem.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS pliki_klienta_read ON storage.objects;
CREATE POLICY pliki_klienta_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'pliki-klienta'
    AND (
      public.is_internal_staff(auth.uid())
      OR ((storage.foldername(name))[1] = 'avatars' AND (storage.foldername(name))[2] = (auth.uid())::text)
      OR (storage.foldername(name))[1] = (auth.uid())::text
      OR (
        (storage.foldername(name))[1] IN ('property','documents','property_photos','property-photos')
        AND EXISTS (
          SELECT 1 FROM public.loan_applications la
          JOIN public.clients c ON c.id = la.client_id
          WHERE c.user_id = auth.uid()
            AND (la.id)::text = (storage.foldername(name))[2]
        )
      )
      -- Inwestor: pliki wniosków udostępnionych inwestorom — tylko z pełnym dostępem
      OR (
        public.has_role(auth.uid(), 'inwestor'::public.app_role)
        AND public.investor_has_full_access(auth.uid())
        AND EXISTS (
          SELECT 1 FROM public.loan_applications la
          WHERE (la.id)::text = (storage.foldername(name))[2]
            AND la.available_to_investors = true
            AND la.deleted_at IS NULL
        )
      )
      -- Szablony dokumentów: inwestor z pełnym dostępem
      OR (
        (storage.foldername(name))[1] = 'templates'
        AND public.has_role(auth.uid(), 'inwestor'::public.app_role)
        AND public.investor_has_full_access(auth.uid())
      )
      OR (storage.foldername(name))[1] = 'marketing'
    )
  );

DROP POLICY IF EXISTS pliki_klienta_write ON storage.objects;
CREATE POLICY pliki_klienta_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pliki-klienta'
    AND (
      public.is_internal_staff(auth.uid())
      OR ((storage.foldername(name))[1] = 'avatars' AND (storage.foldername(name))[2] = (auth.uid())::text)
      OR (
        (storage.foldername(name))[1] IN ('property','documents')
        AND EXISTS (
          SELECT 1 FROM public.loan_applications la
          JOIN public.clients c ON c.id = la.client_id
          WHERE c.user_id = auth.uid()
            AND (la.id)::text = (storage.foldername(name))[2]
        )
      )
      OR (storage.foldername(name))[1] = 'attachments'
    )
  );

DROP POLICY IF EXISTS pliki_klienta_update ON storage.objects;
CREATE POLICY pliki_klienta_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'pliki-klienta'
    AND (
      public.is_internal_staff(auth.uid())
      OR ((storage.foldername(name))[1] = 'avatars' AND (storage.foldername(name))[2] = (auth.uid())::text)
    )
  );

DROP POLICY IF EXISTS pliki_klienta_delete ON storage.objects;
CREATE POLICY pliki_klienta_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'pliki-klienta'
    AND (
      public.is_internal_staff(auth.uid())
      OR ((storage.foldername(name))[1] = 'avatars' AND (storage.foldername(name))[2] = (auth.uid())::text)
    )
  );

DROP POLICY IF EXISTS pliki_klienta_generated_investor_own ON storage.objects;
CREATE POLICY pliki_klienta_generated_investor_own ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'pliki-klienta'
    AND (storage.foldername(name))[1] = 'generated'
    AND public.has_role(auth.uid(), 'inwestor'::public.app_role)
    AND public.investor_has_full_access(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.generated_documents gd
      LEFT JOIN public.investor_offers io ON io.id = gd.investor_offer_id
      LEFT JOIN public.investors i ON i.id = io.investor_id
      WHERE (gd.docx_path = storage.objects.name OR gd.pdf_path = storage.objects.name)
        AND (gd.created_by = auth.uid() OR i.user_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------
-- 10. INVESTORS: personel wewnętrzny + pośrednik (baza inwestorów również
--     na koncie darmowym; bez hurtowego eksportu — dystrybucja przez
--     istniejący mechanizm Finance You).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS investors_operator_select ON public.investors;
CREATE POLICY investors_operator_select ON public.investors FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS investors_partner_select ON public.investors;
CREATE POLICY investors_partner_select ON public.investors FOR SELECT TO authenticated
  USING (
    is_active = true
    AND (public.has_role(auth.uid(),'posrednik') OR public.is_external_partner(auth.uid()))
  );

-- ---------------------------------------------------------------------
-- 11. BEZPIECZNA ZAJAWKA DLA INWESTORA BEZ PŁATNEGO DOSTĘPU.
-- Zwraca wyłącznie dozwolone pola. Pełne rekordy nie są dostępne.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.investor_offer_teasers()
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  loan_amount numeric,
  preferred_period_months int,
  annual_investor_rate numeric,
  estimated_ltv numeric,
  property_type text,
  city text,
  voivodeship text,
  estimated_value numeric,
  area_sqm numeric,
  description text,
  photos text[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    la.id,
    la.created_at,
    la.loan_amount,
    la.preferred_period_months,
    la.annual_investor_rate,
    la.estimated_ltv,
    (p.property_type)::text,
    p.city,
    p.voivodeship,
    p.estimated_value,
    p.area_sqm,
    p.description,
    p.photos
  FROM public.loan_applications la
  LEFT JOIN LATERAL (
    SELECT * FROM public.properties pp
    WHERE pp.loan_application_id = la.id
    ORDER BY pp.created_at ASC
    LIMIT 1
  ) p ON true
  WHERE la.available_to_investors = true
    AND la.visibility_level = 'zanonimizowane'
    AND la.deleted_at IS NULL
    AND (
      public.has_role(auth.uid(),'inwestor')
      OR public.is_internal_staff(auth.uid())
      OR auth.uid() IS NULL -- wywołanie service_role z serwera
    )
  ORDER BY la.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.investor_offer_teasers() TO authenticated;

-- ---------------------------------------------------------------------
-- 12. PUBLICZNY WIDOK ZAJAWKOWY zastępuje szeroki dostęp anon do tabel.
-- (Poprzednia polityka anon eksponowała pełne wiersze loan_applications
-- i properties — łamała paywall. Widok ogranicza kolumny.)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.public_loan_teasers AS
SELECT
  la.id,
  (la.status)::text AS status,
  la.created_at,
  la.loan_amount,
  la.preferred_period_months,
  la.annual_investor_rate,
  (p.property_type)::text AS property_type,
  p.city,
  p.voivodeship,
  p.estimated_value,
  p.area_sqm
FROM public.loan_applications la
LEFT JOIN LATERAL (
  SELECT * FROM public.properties pp
  WHERE pp.loan_application_id = la.id
  ORDER BY pp.created_at ASC
  LIMIT 1
) p ON true
WHERE la.status IN ('szukamy_inwestora','warunki_zaakceptowane','dokumenty_przygotowanie_umowy','notariusz','zamkniete')
  AND la.deleted_at IS NULL;

GRANT SELECT ON public.public_loan_teasers TO anon, authenticated;

DROP POLICY IF EXISTS "public_embed_loans_select" ON public.loan_applications;
DROP POLICY IF EXISTS "public_embed_properties_select" ON public.properties;
REVOKE SELECT ON public.loan_applications FROM anon;
REVOKE SELECT ON public.properties FROM anon;
