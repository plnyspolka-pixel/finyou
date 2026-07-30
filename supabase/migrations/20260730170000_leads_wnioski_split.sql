-- =====================================================================
-- ROZDZIELENIE LEADÓW OD WNIOSKÓW
--
-- Lead jest towarem w puli na sprzedaż dla pośredników tylko dopóki
-- klient nie rozpoczął wniosku (np. przez rozmowę z botem na Messengerze,
-- formularz albo panel klienta). Od momentu rozpoczęcia wniosku sprawę
-- widzi wyłącznie personel wewnętrzny i sam klient — znika z paneli
-- pośredników i operatorów-partnerów.
--
--  - leads.application_started_at / application_started_source: jawny
--    znacznik momentu i źródła rozpoczęcia wniosku,
--  - RLS: dotychczasowa polityka "Admins manage leads" wpuszczała każdego
--    z rolą 'operator' — także partnerów zewnętrznych z historyczną rolą.
--    Zastępujemy ją parą: personel wewnętrzny (pełny dostęp) + partnerzy
--    (SELECT wyłącznie leadów z otwartej puli),
--  - analogicznie lead_communications (partner loguje telefon/notatkę/
--    odsłonięcie kontaktu tylko przy leadzie z puli, jako on sam).
-- =====================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS application_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS application_started_source text;

-- Pula sprzedażowa jest przeglądana od najnowszych — indeks częściowy
-- pokrywa dokładnie zapytanie partnerów.
CREATE INDEX IF NOT EXISTS idx_leads_open_pool_created
  ON public.leads (created_at DESC)
  WHERE application_started_at IS NULL;

-- ---------------------------------------------------------------------
-- Znacznik ustawiany automatycznie, gdy lead awansuje na wniosek
-- (maybePromoteLeadToApplication ustawia status = 'wniosek').
-- BEFORE — bez dodatkowego UPDATE i bez rekurencji.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_leads_application_started()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.application_started_at IS NULL AND NEW.status = 'wniosek' THEN
    NEW.application_started_at := now();
    NEW.application_started_source := COALESCE(NEW.application_started_source, 'status_wniosek');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_application_started ON public.leads;
CREATE TRIGGER leads_application_started
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.trg_leads_application_started();

-- ---------------------------------------------------------------------
-- BACKFILL — historyczne leady, przy których klient ewidentnie rozpoczął
-- wniosek. Zachowawczo: sam stub loan_application (tworzony automatycznie
-- przy otwarciu leada przez personel) NIE oznacza rozpoczęcia wniosku.
-- ---------------------------------------------------------------------
UPDATE public.leads
   SET application_started_at = COALESCE(application_started_at, updated_at, now()),
       application_started_source = 'backfill:status_wniosek'
 WHERE application_started_at IS NULL
   AND status = 'wniosek';

UPDATE public.leads
   SET application_started_at = COALESCE(application_started_at, updated_at, now()),
       application_started_source = 'backfill:konto_klienta'
 WHERE application_started_at IS NULL
   AND user_id IS NOT NULL;

UPDATE public.leads
   SET application_started_at = COALESCE(application_started_at, updated_at, now()),
       application_started_source = 'backfill:formularz'
 WHERE application_started_at IS NULL
   AND COALESCE(current_form_step, 1) > 1;

-- Wniosek z realną substancją: nieruchomość z numerem KW albo dokumenty.
UPDATE public.leads l
   SET application_started_at = COALESCE(l.application_started_at, l.updated_at, now()),
       application_started_source = 'backfill:dane_wniosku'
 WHERE l.application_started_at IS NULL
   AND l.loan_application_id IS NOT NULL
   AND (
     EXISTS (
       SELECT 1 FROM public.properties p
        WHERE p.loan_application_id = l.loan_application_id
          AND NULLIF(btrim(p.land_register_number), '') IS NOT NULL
     )
     OR EXISTS (
       SELECT 1 FROM public.documents d
        WHERE d.loan_application_id = l.loan_application_id
     )
   );

-- ---------------------------------------------------------------------
-- Test przynależności do otwartej puli — SECURITY DEFINER, żeby polityki
-- lead_communications nie podlegały RLS leads (i pozostały tanie).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lead_in_open_pool(_lead_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = _lead_id
      AND l.application_started_at IS NULL
  );
$$;

REVOKE EXECUTE ON FUNCTION public.lead_in_open_pool(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_in_open_pool(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- RLS: leads
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins manage leads" ON public.leads;

DROP POLICY IF EXISTS leads_internal_staff_all ON public.leads;
CREATE POLICY leads_internal_staff_all ON public.leads
  FOR ALL TO authenticated
  USING (public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_internal_staff(auth.uid()));

-- Partner (rola 'posrednik' lub partner z historyczną rolą 'operator')
-- widzi wyłącznie otwartą pulę — bez leadów z rozpoczętym wnioskiem.
DROP POLICY IF EXISTS leads_partner_pool_select ON public.leads;
CREATE POLICY leads_partner_pool_select ON public.leads
  FOR SELECT TO authenticated
  USING (
    application_started_at IS NULL
    AND public.is_external_partner(auth.uid())
  );

-- ---------------------------------------------------------------------
-- RLS: lead_communications
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins manage comms" ON public.lead_communications;

DROP POLICY IF EXISTS leadcomm_internal_staff_all ON public.lead_communications;
CREATE POLICY leadcomm_internal_staff_all ON public.lead_communications
  FOR ALL TO authenticated
  USING (public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS leadcomm_partner_pool_select ON public.lead_communications;
CREATE POLICY leadcomm_partner_pool_select ON public.lead_communications
  FOR SELECT TO authenticated
  USING (
    public.is_external_partner(auth.uid())
    AND lead_id IS NOT NULL
    AND public.lead_in_open_pool(lead_id)
  );

-- Partner dopisuje wyłącznie własne zdarzenia robocze (telefon, notatka,
-- odsłonięcie kontaktu) i tylko przy leadzie z otwartej puli.
DROP POLICY IF EXISTS leadcomm_partner_pool_insert ON public.lead_communications;
CREATE POLICY leadcomm_partner_pool_insert ON public.lead_communications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_external_partner(auth.uid())
    AND created_by = auth.uid()
    AND channel IN ('call', 'manual_note', 'reveal')
    AND lead_id IS NOT NULL
    AND public.lead_in_open_pool(lead_id)
  );
