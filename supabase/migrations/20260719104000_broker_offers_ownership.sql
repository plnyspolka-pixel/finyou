-- =====================================================================
-- OFERTY POŚREDNIKA:
--  - trwałe, niezmienne przypisanie autora (created_by_partner_user_id),
--  - bezpieczne soft-delete (deleted_at / deleted_by),
--  - limit 5 aktywnych ofert darmowego pośrednika egzekwowany w bazie
--    (trigger + advisory lock — odporny na równoległe żądania),
--  - polityki RLS dla roli 'posrednik' ograniczone do własnych ofert.
-- =====================================================================

ALTER TABLE public.loan_applications
  ADD COLUMN IF NOT EXISTS created_by_partner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE INDEX IF NOT EXISTS idx_loans_partner_author
  ON public.loan_applications(created_by_partner_user_id)
  WHERE created_by_partner_user_id IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- Autor oferty jest niezmienny po nadaniu (limit nie może być obchodzony
-- przez późniejszą zmianę operatora/autora).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_partner_author()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.created_by_partner_user_id IS NOT NULL
     AND NEW.created_by_partner_user_id IS DISTINCT FROM OLD.created_by_partner_user_id THEN
    RAISE EXCEPTION 'created_by_partner_user_id jest niezmienne po nadaniu';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_partner_author ON public.loan_applications;
CREATE TRIGGER trg_protect_partner_author
  BEFORE UPDATE ON public.loan_applications
  FOR EACH ROW EXECUTE FUNCTION public.protect_partner_author();

-- ---------------------------------------------------------------------
-- Limit ofert darmowego pośrednika: maks. 5 nieusuniętych ofert naraz.
-- Advisory lock per autor serializuje równoległe INSERT-y (i przywrócenia),
-- więc limitu nie da się ominąć wyścigiem.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_broker_offer_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count int;
  v_limit constant int := 5;
BEGIN
  IF NEW.created_by_partner_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Przy UPDATE limit sprawdzamy wyłącznie przy przywróceniu usuniętej oferty.
  IF TG_OP = 'UPDATE' AND NOT (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL) THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('broker_offer_limit'), hashtext(NEW.created_by_partner_user_id::text));

  IF public.broker_has_paid_access(NEW.created_by_partner_user_id) THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.loan_applications
  WHERE created_by_partner_user_id = NEW.created_by_partner_user_id
    AND deleted_at IS NULL
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'BROKER_OFFER_LIMIT'
      USING HINT = 'W darmowym koncie możesz posiadać maksymalnie 5 ofert jednocześnie.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_broker_offer_limit_insert ON public.loan_applications;
CREATE TRIGGER trg_broker_offer_limit_insert
  BEFORE INSERT ON public.loan_applications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_broker_offer_limit();

DROP TRIGGER IF EXISTS trg_broker_offer_limit_undelete ON public.loan_applications;
CREATE TRIGGER trg_broker_offer_limit_undelete
  BEFORE UPDATE OF deleted_at ON public.loan_applications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_broker_offer_limit();

-- ---------------------------------------------------------------------
-- Soft-delete własnej oferty przez pośrednika (albo administratora).
-- Oferta nie jest fizycznie kasowana; pozostaje w bazie do audytu.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.broker_soft_delete_application(_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_app public.loan_applications%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Wymagane zalogowanie';
  END IF;

  SELECT * INTO v_app FROM public.loan_applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nie znaleziono oferty';
  END IF;
  IF v_app.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'alreadyDeleted', true);
  END IF;
  IF v_app.created_by_partner_user_id IS DISTINCT FROM v_actor
     AND NOT public.has_role(v_actor, 'administrator') THEN
    RAISE EXCEPTION 'Możesz usunąć wyłącznie własną ofertę';
  END IF;

  UPDATE public.loan_applications
    SET deleted_at = now(), deleted_by = v_actor
    WHERE id = _application_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.broker_soft_delete_application(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- Wykorzystanie limitu (dla UI: np. „3/5"). Użytkownik pyta o siebie,
-- personel o dowolnego pośrednika.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.broker_offer_usage(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id
     AND NOT (public.has_role(auth.uid(),'administrator') OR public.is_internal_staff(auth.uid())) THEN
    RAISE EXCEPTION 'Brak uprawnień';
  END IF;
  SELECT count(*) INTO v_count
  FROM public.loan_applications
  WHERE created_by_partner_user_id = _user_id AND deleted_at IS NULL;
  RETURN jsonb_build_object(
    'activeCount', v_count,
    'freeLimit', 5,
    'hasPaidAccess', public.has_active_paid_access(_user_id, 'broker'),
    'isBypass', public.is_internal_staff(_user_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.broker_offer_usage(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- Backfill autorstwa: wnioski utworzone z panelu pośrednika, których
-- przypisany operator jest partnerem programu. (Tylko sygnał historyczny;
-- nowe wnioski dostają autora wprost z serwera.)
-- ---------------------------------------------------------------------
UPDATE public.loan_applications la
SET created_by_partner_user_id = la.assigned_operator
WHERE la.created_by_partner_user_id IS NULL
  AND la.source = 'posrednik_panel'
  AND la.assigned_operator IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.affiliate_partners ap
    WHERE ap.user_id = la.assigned_operator
  );

-- ---------------------------------------------------------------------
-- RLS dla roli 'posrednik' — wyłącznie własne oferty (i ich dane).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS loans_partner_own_select ON public.loan_applications;
CREATE POLICY loans_partner_own_select ON public.loan_applications
  FOR SELECT TO authenticated
  USING (created_by_partner_user_id = auth.uid() AND deleted_at IS NULL);

DROP POLICY IF EXISTS loans_partner_own_update ON public.loan_applications;
CREATE POLICY loans_partner_own_update ON public.loan_applications
  FOR UPDATE TO authenticated
  USING (created_by_partner_user_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (created_by_partner_user_id = auth.uid());

DROP POLICY IF EXISTS clients_partner_own_select ON public.clients;
CREATE POLICY clients_partner_own_select ON public.clients
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.loan_applications la
    WHERE la.client_id = clients.id
      AND la.created_by_partner_user_id = auth.uid()
      AND la.deleted_at IS NULL
  ));

DROP POLICY IF EXISTS clients_partner_own_update ON public.clients;
CREATE POLICY clients_partner_own_update ON public.clients
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.loan_applications la
    WHERE la.client_id = clients.id
      AND la.created_by_partner_user_id = auth.uid()
      AND la.deleted_at IS NULL
  ));

DROP POLICY IF EXISTS properties_partner_own ON public.properties;
CREATE POLICY properties_partner_own ON public.properties
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.loan_applications la
    WHERE la.id = properties.loan_application_id
      AND la.created_by_partner_user_id = auth.uid()
      AND la.deleted_at IS NULL
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.loan_applications la
    WHERE la.id = properties.loan_application_id
      AND la.created_by_partner_user_id = auth.uid()
      AND la.deleted_at IS NULL
  ));

DROP POLICY IF EXISTS documents_partner_own ON public.documents;
CREATE POLICY documents_partner_own ON public.documents
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.loan_applications la
    WHERE la.id = documents.loan_application_id
      AND la.created_by_partner_user_id = auth.uid()
      AND la.deleted_at IS NULL
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.loan_applications la
    WHERE la.id = documents.loan_application_id
      AND la.created_by_partner_user_id = auth.uid()
      AND la.deleted_at IS NULL
  ));

-- Storage: pośrednik czyta i dodaje pliki wyłącznie w kontekście własnych ofert.
DROP POLICY IF EXISTS pliki_klienta_partner_own_read ON storage.objects;
CREATE POLICY pliki_klienta_partner_own_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'pliki-klienta'
    AND (storage.foldername(name))[1] IN ('property','documents','property_photos','property-photos')
    AND EXISTS (
      SELECT 1 FROM public.loan_applications la
      WHERE (la.id)::text = (storage.foldername(name))[2]
        AND la.created_by_partner_user_id = auth.uid()
        AND la.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS pliki_klienta_partner_own_write ON storage.objects;
CREATE POLICY pliki_klienta_partner_own_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pliki-klienta'
    AND (storage.foldername(name))[1] IN ('property','documents')
    AND EXISTS (
      SELECT 1 FROM public.loan_applications la
      WHERE (la.id)::text = (storage.foldername(name))[2]
        AND la.created_by_partner_user_id = auth.uid()
        AND la.deleted_at IS NULL
    )
  );
