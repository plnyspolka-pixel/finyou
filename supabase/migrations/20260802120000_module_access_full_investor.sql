-- =====================================================================
-- DOSTĘP DO MODUŁU PROJEKTÓW = PEŁNY DOSTĘP INWESTORA („Dostępne wnioski").
--  - aktywny status `approved_investor` w project_module_access (po KYC,
--    screeningu sankcyjnym/PEP, akceptacji dokumentów i decyzji Finance You)
--    otwiera te same dane co płatny abonament inwestora,
--  - investor_has_full_access pozostaje jedyną bramką RLS — wszystkie
--    istniejące polityki (loan_applications, properties, documents, storage…)
--    dostają nową ścieżkę bez zmian w politykach,
--  - get_access_state raportuje hasModuleAccess dla UI.
-- =====================================================================

-- Aktywny, niewygasły dostęp do zamkniętego modułu projektów.
CREATE OR REPLACE FUNCTION public.investor_module_access_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_module_access a
    WHERE a.user_id = _user_id
      AND a.status = 'approved_investor'
      AND (a.access_expires_at IS NULL OR a.access_expires_at > now())
  );
$$;

REVOKE EXECUTE ON FUNCTION public.investor_module_access_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.investor_module_access_active(uuid) TO authenticated, service_role;

-- Pełny dostęp inwestora: personel, płatny abonament ALBO aktywny dostęp
-- do zamkniętego modułu projektów.
CREATE OR REPLACE FUNCTION public.investor_has_full_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_internal_staff(_user_id)
      OR (public.has_role(_user_id, 'inwestor')
          AND (public.has_active_paid_access(_user_id, 'investor')
               OR public.investor_module_access_active(_user_id)));
$$;

-- Stan dostępu dla UI — dodatkowo hasModuleAccess (tylko audience=investor).
CREATE OR REPLACE FUNCTION public.get_access_state(_user_id uuid, _audience text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ent public.access_entitlements%ROWTYPE;
  v_active boolean := false;
  v_days_left int := 0;
BEGIN
  -- Użytkownik może pytać wyłącznie o siebie; personel o dowolnego użytkownika.
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id
     AND NOT (public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'ksiegowosc') OR public.is_internal_staff(auth.uid())) THEN
    RAISE EXCEPTION 'Brak uprawnień do odczytu stanu dostępu innego użytkownika';
  END IF;

  SELECT * INTO v_ent FROM public.access_entitlements
  WHERE user_id = _user_id AND audience = _audience;

  IF FOUND AND v_ent.active_until IS NOT NULL AND v_ent.active_until > now() THEN
    v_active := true;
    v_days_left := CEIL(EXTRACT(EPOCH FROM (v_ent.active_until - now())) / 86400.0)::int;
  END IF;

  RETURN jsonb_build_object(
    'audience', _audience,
    'hasPaidAccess', v_active,
    'activeFrom', v_ent.active_from,
    'activeUntil', v_ent.active_until,
    'daysLeft', v_days_left,
    'isBypass', public.is_internal_staff(_user_id),
    'hasModuleAccess', CASE WHEN _audience = 'investor'
      THEN public.investor_module_access_active(_user_id) ELSE false END,
    'lastProductId', v_ent.last_product_id
  );
END;
$$;
