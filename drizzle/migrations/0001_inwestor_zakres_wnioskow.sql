-- Inwestor widzi wyłącznie wnioski WYBRANE DLA NIEGO — nigdy całej puli.
--
-- Dotąd pełny dostęp (abonament) otwierał przez RLS każdy wniosek dopuszczony
-- do inwestorów (available_to_investors + zanonimizowane): wniosek,
-- nieruchomość, dokumenty, pliki, treść KW, analizy KW i zabezpieczenia.
-- Ocena ryzyka (investment_risk_assessments) nie miała nawet filtra wniosku.
-- Przeglądarki puli w panelu inwestora już nie ma (dostęp idzie przez cykl
-- Zlecenia i przekazania), więc zawężamy bazę do tego samego zakresu co
-- moduł Analityka (lib/investor-analytics/analytics.functions.ts):
--   (a) okazja ujawniona w cyklu Zlecenia (status rezerwacja/transakcja),
--   (b) wniosek, do którego inwestor złożył ofertę,
--   (c) wniosek przekazany mu przez zespół (wysłana dystrybucja oferty).
--
-- Wyłącznie zawężenie: każdy dotychczasowy warunek zostaje, dochodzi
-- investor_can_view_application(). Dodatkowo oferta może powstać tylko do
-- wniosku już będącego w zakresie — inaczej wstawienie oferty przez API
-- otwierałoby dostęp do dowolnego wniosku (gałąź b).
--
-- Stan bazowy polityk: 20260719123238 (wnioski, nieruchomości, dokumenty,
-- analizy, oferty) i 20260912091000 (pliki-klienta, odczyt).

-- ── Zakres ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.investor_can_view_application(
  _user_id uuid,
  _application_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.investor_order_matches m
      JOIN public.investor_orders o ON o.id = m.order_id
      WHERE m.application_id = _application_id
        AND o.user_id = _user_id
        AND m.status IN ('rezerwacja', 'transakcja')
    )
    OR EXISTS (
      SELECT 1
      FROM public.investor_offers io
      JOIN public.investors i ON i.id = io.investor_id
      WHERE io.loan_application_id = _application_id
        AND i.user_id = _user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.offer_distributions d
      JOIN public.investors i ON i.id = d.investor_id
      WHERE d.loan_application_id = _application_id
        AND i.user_id = _user_id
        AND d.distribution_status NOT IN ('szkic', 'gotowe_do_wysylki')
    );
$$;

REVOKE ALL ON FUNCTION public.investor_can_view_application(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.investor_can_view_application(uuid, uuid)
  TO authenticated, service_role;

-- ── Wnioski / nieruchomości / dokumenty ──────────────────────────────────────
DROP POLICY IF EXISTS loans_investor_select ON public.loan_applications;
CREATE POLICY loans_investor_select ON public.loan_applications
  FOR SELECT TO authenticated
  USING (
    available_to_investors = true
    AND visibility_level = 'zanonimizowane'
    AND deleted_at IS NULL
    AND public.has_role(auth.uid(), 'inwestor'::app_role)
    AND public.investor_has_full_access(auth.uid())
    AND public.investor_can_view_application(auth.uid(), id)
  );

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
        AND public.investor_can_view_application(auth.uid(), la.id)
    )
  );

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
        AND public.investor_can_view_application(auth.uid(), la.id)
    )
  );

-- ── Analizy ──────────────────────────────────────────────────────────────────
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
        AND public.investor_can_view_application(auth.uid(), la.id)
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
        AND public.investor_can_view_application(auth.uid(), la.id)
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
        AND public.investor_can_view_application(auth.uid(), la.id)
    )
  );

-- Dotąd: każda ocena ryzyka dla każdego inwestora z pełnym dostępem.
DROP POLICY IF EXISTS ira_investor_select ON public.investment_risk_assessments;
CREATE POLICY ira_investor_select ON public.investment_risk_assessments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'inwestor'::app_role)
    AND public.investor_has_full_access(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.loan_applications la
      WHERE la.id = investment_risk_assessments.application_id
        AND la.available_to_investors = true
        AND la.visibility_level = 'zanonimizowane'
        AND la.deleted_at IS NULL
        AND public.investor_can_view_application(auth.uid(), la.id)
    )
  );

-- ── Oferty: tylko do wniosku w zakresie ──────────────────────────────────────
-- WITH CHECK widzi wyłącznie wcześniej zapisane oferty (nie wstawiany wiersz),
-- więc gałąź „mam ofertę" nie otwiera sama sobie drogi do nowego wniosku.
DROP POLICY IF EXISTS offers_investor_own ON public.investor_offers;
CREATE POLICY offers_investor_own ON public.investor_offers FOR ALL TO authenticated
  USING (
    public.investor_has_full_access(auth.uid())
    AND EXISTS (SELECT 1 FROM public.investors i WHERE i.id = investor_id AND i.user_id = auth.uid())
  )
  WITH CHECK (
    public.investor_has_full_access(auth.uid())
    AND EXISTS (SELECT 1 FROM public.investors i WHERE i.id = investor_id AND i.user_id = auth.uid())
    AND public.investor_can_view_application(auth.uid(), loan_application_id)
  );

-- ── Pliki (pliki-klienta, odczyt) ────────────────────────────────────────────
-- Przepisana w całości (CREATE POLICY nie umie „dodać warunku"); zmiana tylko
-- w gałęzi inwestora.
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
        (storage.foldername(name))[1] IN ('property','documents')
        AND (storage.foldername(name))[2] = (auth.uid())::text
      )
      OR (
        (storage.foldername(name))[1] IN ('property','documents','property_photos','property-photos')
        AND EXISTS (
          SELECT 1 FROM public.loan_applications la
          JOIN public.clients c ON c.id = la.client_id
          WHERE c.user_id = auth.uid()
            AND (la.id)::text = (storage.foldername(name))[2]
        )
      )
      OR (
        public.has_role(auth.uid(), 'inwestor'::public.app_role)
        AND public.investor_has_full_access(auth.uid())
        AND EXISTS (
          SELECT 1 FROM public.loan_applications la
          WHERE (la.id)::text = (storage.foldername(name))[2]
            AND la.available_to_investors = true
            AND la.deleted_at IS NULL
            AND public.investor_can_view_application(auth.uid(), la.id)
        )
      )
      OR (
        (storage.foldername(name))[1] = 'templates'
        AND public.has_role(auth.uid(), 'inwestor'::public.app_role)
        AND public.investor_has_full_access(auth.uid())
      )
      OR (storage.foldername(name))[1] = 'marketing'
    )
  );
