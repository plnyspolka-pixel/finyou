-- Model indywidualnego dopasowania 1:1 dla ofert inwestorów (investor_offers).
--
-- Inwestor składa NIEWIĄŻĄCĄ propozycję warunków finansowania. Dopiero
-- akceptacja uprawnionej strony (administrator/operator, pożyczkobiorca,
-- pośrednik wniosku) odblokowuje weryfikację, kompletowanie danych
-- i przygotowanie dokumentów umowy.
--
-- 1. Kto i jako kto zdecydował o propozycji.
-- 2. Strażnik statusów: inwestor (RLS offers_investor_own = FOR ALL) nie może
--    sam ustawić statusu akceptacji ani zmieniać propozycji po decyzji.
--    Decyzje pożyczkobiorcy/pośrednika idą przez serwer (klucz serwisowy).
-- 3. Auto-akceptacja: propozycja złożona z konta inwestora, które ma też rolę
--    administratora, od razu otrzymuje status zatwierdzonej.

ALTER TABLE public.investor_offers
  ADD COLUMN IF NOT EXISTS decided_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS decided_by_role text;

COMMENT ON COLUMN public.investor_offers.decided_by_role IS
  'Strona, która zaakceptowała/odrzuciła propozycję: administrator | operator | pozyczkobiorca | posrednik | administrator_inwestor_auto';

CREATE OR REPLACE FUNCTION public.investor_offers_guard_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_owner boolean;
  _new text := NEW.offer_status::text;
  _old text := CASE WHEN TG_OP = 'UPDATE' THEN OLD.offer_status::text ELSE NULL END;
BEGIN
  -- Klucz serwisowy / backend (brak auth.uid()) — decyzje przez server functions.
  IF _uid IS NULL THEN
    RETURN NEW;
  END IF;

  _is_owner := EXISTS (
    SELECT 1 FROM public.investors i WHERE i.id = NEW.investor_id AND i.user_id = _uid
  );

  -- Auto-akceptacja: inwestor z rolą administratora składa propozycję.
  IF _is_owner
     AND _new = 'zlozona'
     AND (_old IS NULL OR _old = 'szkic')
     AND public.has_role(_uid, 'administrator'::public.app_role) THEN
    NEW.offer_status := 'zatwierdzona_przez_administratora';
    NEW.admin_verified_at := now();
    NEW.decided_by_user_id := _uid;
    NEW.decided_by_role := 'administrator_inwestor_auto';
    RETURN NEW;
  END IF;

  -- Zespół (administrator/operator) — pełna obsługa w panelu.
  IF public.is_internal_staff(_uid) THEN
    RETURN NEW;
  END IF;

  -- Pozostali (inwestor przez RLS): wyłącznie szkic, złożenie albo wycofanie.
  IF TG_OP = 'INSERT' THEN
    IF _new NOT IN ('szkic', 'zlozona') THEN
      RAISE EXCEPTION 'Propozycję można zapisać tylko jako szkic albo złożyć do akceptacji.'
        USING ERRCODE = '42501';
    END IF;
    NEW.decided_by_user_id := NULL;
    NEW.decided_by_role := NULL;
    NEW.admin_verified_at := NULL;
    NEW.client_decision_at := NULL;
    RETURN NEW;
  END IF;

  IF _old NOT IN ('szkic', 'zlozona', 'w_trakcie_weryfikacji') THEN
    RAISE EXCEPTION 'Propozycja po decyzji uprawnionej strony nie może być zmieniana przez inwestora.'
      USING ERRCODE = '42501';
  END IF;
  IF _new IS DISTINCT FROM _old AND _new NOT IN ('szkic', 'zlozona', 'wycofana_przez_inwestora') THEN
    RAISE EXCEPTION 'Akceptacja propozycji należy do administratora, operatora, pożyczkobiorcy albo pośrednika.'
      USING ERRCODE = '42501';
  END IF;
  NEW.decided_by_user_id := OLD.decided_by_user_id;
  NEW.decided_by_role := OLD.decided_by_role;
  NEW.admin_verified_at := OLD.admin_verified_at;
  NEW.client_decision_at := OLD.client_decision_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_investor_offers_guard_status ON public.investor_offers;
CREATE TRIGGER trg_investor_offers_guard_status
  BEFORE INSERT OR UPDATE ON public.investor_offers
  FOR EACH ROW EXECUTE FUNCTION public.investor_offers_guard_status();
