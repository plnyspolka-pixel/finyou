-- =====================================================================
-- FUNKCJE DOSTĘPU:
--  - is_external_partner / is_internal_staff: rozróżnienie personelu
--    wewnętrznego od zewnętrznych partnerów (historycznie z rolą 'operator'),
--  - has_active_paid_access / get_access_state: źródło prawdy o dostępie,
--  - investor_has_full_access / broker_has_paid_access: bramki do RLS,
--  - process_access_payment_paid: atomowe, idempotentne przetworzenie
--    opłaconej płatności (webhook Tpay),
--  - admin_adjust_access: ręczna korekta dostępu z audytem.
-- Wszystkie obliczenia czasu w UTC (timestamptz).
-- =====================================================================

-- Użytkownik powiązany z rekordem partnera programu (poza odrzuconymi /
-- zakończonymi) jest traktowany jako pośrednik zewnętrzny, nawet jeżeli
-- historycznie nadal ma rolę 'operator'.
CREATE OR REPLACE FUNCTION public.is_external_partner(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.affiliate_partners ap
    WHERE ap.user_id = _user_id
      AND ap.status NOT IN ('rejected','terminated')
  ) OR public.has_role(_user_id, 'posrednik');
$$;

-- Personel wewnętrzny: administrator albo operator, który NIE jest partnerem
-- zewnętrznym. Partner z historyczną rolą 'operator' nie dostaje bypassu.
CREATE OR REPLACE FUNCTION public.is_internal_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'administrator')
      OR public.has_role(_user_id, 'operator_wewnetrzny')
      OR (public.has_role(_user_id, 'operator') AND NOT EXISTS (
            SELECT 1 FROM public.affiliate_partners ap
            WHERE ap.user_id = _user_id
              AND ap.status NOT IN ('rejected','terminated')
          ));
$$;

-- Płatny dostęp istnieje wyłącznie, gdy active_until > now().
CREATE OR REPLACE FUNCTION public.has_active_paid_access(_user_id uuid, _audience text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.access_entitlements e
    WHERE e.user_id = _user_id
      AND e.audience = _audience
      AND e.active_until IS NOT NULL
      AND e.active_until > now()
  );
$$;

-- Stan dostępu dla UI/serwera (bez danych wrażliwych).
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
    'lastProductId', v_ent.last_product_id
  );
END;
$$;

-- Bramka RLS: pełne dane inwestycyjne tylko dla płacącego inwestora albo
-- personelu wewnętrznego.
CREATE OR REPLACE FUNCTION public.investor_has_full_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_internal_staff(_user_id)
      OR (public.has_role(_user_id, 'inwestor')
          AND public.has_active_paid_access(_user_id, 'investor'));
$$;

-- Bramka RLS/serwera: płatne funkcje pośrednika.
CREATE OR REPLACE FUNCTION public.broker_has_paid_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_internal_staff(_user_id)
      OR public.has_active_paid_access(_user_id, 'broker');
$$;

-- EXECUTE: tylko zalogowani i service_role (anon nie może odpytywać stanu
-- dostępu innych użytkowników).
REVOKE EXECUTE ON FUNCTION public.is_external_partner(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_internal_staff(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_active_paid_access(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_access_state(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.investor_has_full_access(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.broker_has_paid_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_external_partner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_internal_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_active_paid_access(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_access_state(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.investor_has_full_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.broker_has_paid_access(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- ATOMOWE PRZETWORZENIE OPŁACONEJ PŁATNOŚCI (wywoływane z webhooka Tpay
-- przez service_role po zweryfikowaniu transakcji w API Tpay).
-- Idempotentne: ponowne wywołanie dla przetworzonej płatności nie przedłuża
-- dostępu ponownie. Blokuje rekord płatności i uprawnienia (FOR UPDATE).
-- Przedłużenie: od bieżącego active_until, jeżeli dostęp aktywny; inaczej od teraz.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_access_payment_paid(
  _payment_id uuid,
  _paid_amount_grosz bigint,
  _provider_transaction_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pay public.access_payments%ROWTYPE;
  v_prod public.access_products%ROWTYPE;
  v_ent public.access_entitlements%ROWTYPE;
  v_from timestamptz;
  v_until timestamptz;
  v_first_purchase boolean := false;
BEGIN
  SELECT * INTO v_pay FROM public.access_payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'payment_not_found');
  END IF;

  -- Idempotencja: już przetworzona i opłacona → zwróć istniejący wynik.
  IF v_pay.processed_at IS NOT NULL AND v_pay.status = 'paid' THEN
    RETURN jsonb_build_object(
      'ok', true, 'alreadyProcessed', true,
      'grantedFrom', v_pay.granted_from, 'grantedUntil', v_pay.granted_until,
      'userId', v_pay.user_id, 'audience', v_pay.audience
    );
  END IF;

  SELECT * INTO v_prod FROM public.access_products WHERE id = v_pay.product_id;
  IF NOT FOUND THEN
    UPDATE public.access_payments
      SET failure_reason = 'product_not_found', needs_review = true
      WHERE id = _payment_id;
    RETURN jsonb_build_object('ok', false, 'reason', 'product_not_found');
  END IF;

  -- Weryfikacja kwoty: opłacona kwota musi odpowiadać oczekiwanej.
  IF _paid_amount_grosz IS DISTINCT FROM v_pay.expected_amount_grosz THEN
    UPDATE public.access_payments
      SET failure_reason = format('amount_mismatch: expected %s, paid %s',
                                  v_pay.expected_amount_grosz, _paid_amount_grosz),
          paid_amount_grosz = _paid_amount_grosz,
          needs_review = true
      WHERE id = _payment_id;
    RETURN jsonb_build_object('ok', false, 'reason', 'amount_mismatch');
  END IF;

  -- Weryfikacja identyfikatora transakcji dostawcy.
  IF _provider_transaction_id IS NOT NULL
     AND v_pay.provider_transaction_id IS NOT NULL
     AND v_pay.provider_transaction_id <> _provider_transaction_id THEN
    UPDATE public.access_payments
      SET failure_reason = 'transaction_id_mismatch', needs_review = true
      WHERE id = _payment_id;
    RETURN jsonb_build_object('ok', false, 'reason', 'transaction_id_mismatch');
  END IF;

  -- Blokada uprawnienia (serializacja równoległych przedłużeń).
  SELECT * INTO v_ent FROM public.access_entitlements
  WHERE user_id = v_pay.user_id AND audience = v_pay.audience
  FOR UPDATE;

  IF FOUND AND v_ent.active_until IS NOT NULL AND v_ent.active_until > now() THEN
    v_from := v_ent.active_until; -- przedłużenie liczone od końca bieżącego dostępu
  ELSE
    v_from := now();
    v_first_purchase := NOT FOUND;
  END IF;
  v_until := v_from + make_interval(days => v_prod.duration_days);

  IF FOUND THEN
    UPDATE public.access_entitlements
      SET active_from = CASE
            WHEN active_until IS NULL OR active_until <= now() THEN now()
            ELSE active_from
          END,
          active_until = v_until,
          last_product_id = v_prod.id,
          last_payment_id = v_pay.id
      WHERE id = v_ent.id;
  ELSE
    INSERT INTO public.access_entitlements
      (user_id, audience, active_from, active_until, last_product_id, last_payment_id)
    VALUES (v_pay.user_id, v_pay.audience, now(), v_until, v_prod.id, v_pay.id);
  END IF;

  UPDATE public.access_payments
    SET status = 'paid',
        paid_amount_grosz = _paid_amount_grosz,
        provider_transaction_id = COALESCE(provider_transaction_id, _provider_transaction_id),
        granted_from = v_from,
        granted_until = v_until,
        processed_at = now(),
        failure_reason = NULL
    WHERE id = _payment_id;

  -- Warstwa kompatybilności: stare pola investors.subscription_* są nadal
  -- aktualizowane, ale źródłem prawdy jest access_entitlements.
  IF v_pay.audience = 'investor' THEN
    UPDATE public.investors
      SET subscription_status = 'aktywny',
          subscription_active_until = v_until,
          subscription_source = 'tpay',
          updated_at = now()
      WHERE user_id = v_pay.user_id;
    IF NOT FOUND THEN
      INSERT INTO public.investors (user_id, investor_type, subscription_status, subscription_active_until, subscription_source)
      VALUES (v_pay.user_id, 'indywidualny', 'aktywny', v_until, 'tpay');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'alreadyProcessed', false,
    'grantedFrom', v_from, 'grantedUntil', v_until,
    'userId', v_pay.user_id, 'audience', v_pay.audience,
    'firstPurchase', v_first_purchase
  );
END;
$$;

-- Wywoływana wyłącznie przez service_role (webhook) — bez EXECUTE dla klientów.
REVOKE EXECUTE ON FUNCTION public.process_access_payment_paid(uuid, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_access_payment_paid(uuid, bigint, text) TO service_role;

-- ---------------------------------------------------------------------
-- RĘCZNA KOREKTA DOSTĘPU PRZEZ ADMINISTRATORA (z audytem).
-- _new_until = NULL → cofnięcie dostępu (natychmiastowe wygaszenie).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_adjust_access(
  _target_user_id uuid,
  _audience text,
  _new_until timestamptz,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_ent public.access_entitlements%ROWTYPE;
  v_before jsonb;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'administrator') THEN
    RAISE EXCEPTION 'Tylko administrator może ręcznie zmieniać dostęp';
  END IF;
  IF _audience NOT IN ('investor','broker') THEN
    RAISE EXCEPTION 'Nieprawidłowa grupa odbiorców: %', _audience;
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'Ręczna zmiana dostępu wymaga podania powodu';
  END IF;

  SELECT * INTO v_ent FROM public.access_entitlements
  WHERE user_id = _target_user_id AND audience = _audience
  FOR UPDATE;

  v_before := CASE WHEN FOUND
    THEN jsonb_build_object('active_from', v_ent.active_from, 'active_until', v_ent.active_until)
    ELSE NULL END;

  IF FOUND THEN
    UPDATE public.access_entitlements
      SET active_until = COALESCE(_new_until, now()),
          active_from = COALESCE(active_from, now())
      WHERE id = v_ent.id;
  ELSE
    IF _new_until IS NULL THEN
      RETURN jsonb_build_object('ok', true, 'noop', true);
    END IF;
    INSERT INTO public.access_entitlements (user_id, audience, active_from, active_until)
    VALUES (_target_user_id, _audience, now(), _new_until);
  END IF;

  -- Warstwa kompatybilności dla inwestora.
  IF _audience = 'investor' THEN
    UPDATE public.investors
      SET subscription_active_until = COALESCE(_new_until, now()),
          subscription_status = CASE WHEN _new_until IS NOT NULL AND _new_until > now() THEN 'aktywny'::public.subscription_status ELSE 'nieaktywny'::public.subscription_status END,
          updated_at = now()
      WHERE user_id = _target_user_id;
  END IF;

  INSERT INTO public.access_audit_logs (actor_user_id, actor_role, target_user_id, audience, action, before, after, reason)
  VALUES (v_actor, 'administrator', _target_user_id, _audience,
          CASE WHEN _new_until IS NULL THEN 'access_revoked' ELSE 'access_adjusted' END,
          v_before,
          jsonb_build_object('active_until', COALESCE(_new_until, now())),
          _reason);

  RETURN jsonb_build_object('ok', true, 'activeUntil', COALESCE(_new_until, now()));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_adjust_access(uuid, text, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_access(uuid, text, timestamptz, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- MIGRACJA DANYCH: istniejące terminy inwestorów → access_entitlements.
-- Nie skracamy dostępu: przy istniejącym wpisie zachowujemy najpóźniejszą datę.
-- ---------------------------------------------------------------------
INSERT INTO public.access_entitlements (user_id, audience, active_from, active_until)
SELECT s.user_id, 'investor', LEAST(now(), s.max_until), s.max_until
FROM (
  SELECT i.user_id, MAX(i.subscription_active_until) AS max_until
  FROM public.investors i
  WHERE i.user_id IS NOT NULL
    AND i.subscription_active_until IS NOT NULL
  GROUP BY i.user_id
) s
ON CONFLICT (user_id, audience) DO UPDATE
  SET active_until = GREATEST(COALESCE(public.access_entitlements.active_until, EXCLUDED.active_until), EXCLUDED.active_until);
