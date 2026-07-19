CREATE TABLE IF NOT EXISTS public.access_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  audience text NOT NULL CHECK (audience IN ('investor','broker')),
  label text NOT NULL,
  duration_days int NOT NULL CHECK (duration_days > 0),
  amount_grosz bigint NOT NULL CHECK (amount_grosz > 0),
  currency text NOT NULL DEFAULT 'PLN',
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_access_products_updated ON public.access_products;
CREATE TRIGGER trg_access_products_updated BEFORE UPDATE ON public.access_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT ON public.access_products TO authenticated;
GRANT SELECT ON public.access_products TO anon;
GRANT ALL ON public.access_products TO service_role;

ALTER TABLE public.access_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS access_products_public_select ON public.access_products;
CREATE POLICY access_products_public_select ON public.access_products
  FOR SELECT USING (active = true);

DROP POLICY IF EXISTS access_products_admin_all ON public.access_products;
CREATE POLICY access_products_admin_all ON public.access_products
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrator'))
  WITH CHECK (public.has_role(auth.uid(),'administrator'));

INSERT INTO public.access_products (code, audience, label, duration_days, amount_grosz, currency, active, sort_order)
VALUES
  ('investor_access_30d',  'investor', 'Pełny dostęp inwestora — 30 dni',  30,  99900,  'PLN', true, 10),
  ('investor_access_365d', 'investor', 'Pełny dostęp inwestora — 365 dni', 365, 599900, 'PLN', true, 20),
  ('broker_access_30d',    'broker',   'Pełny dostęp pośrednika — 30 dni',  30,  49900, 'PLN', true, 10),
  ('broker_access_365d',   'broker',   'Pełny dostęp pośrednika — 365 dni', 365, 299900,'PLN', true, 20)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.access_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  audience text NOT NULL CHECK (audience IN ('investor','broker')),
  active_from timestamptz,
  active_until timestamptz,
  last_product_id uuid REFERENCES public.access_products(id) ON DELETE SET NULL,
  last_payment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, audience)
);

DROP TRIGGER IF EXISTS trg_access_entitlements_updated ON public.access_entitlements;
CREATE TRIGGER trg_access_entitlements_updated BEFORE UPDATE ON public.access_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_access_entitlements_user ON public.access_entitlements(user_id, audience);
CREATE INDEX IF NOT EXISTS idx_access_entitlements_until ON public.access_entitlements(active_until);

CREATE TABLE IF NOT EXISTS public.access_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'tpay' CHECK (provider IN ('tpay')),
  provider_transaction_id text,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.access_products(id) ON DELETE RESTRICT,
  audience text NOT NULL CHECK (audience IN ('investor','broker')),
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','pending','paid','failed','cancelled','refunded','chargeback')),
  expected_amount_grosz bigint NOT NULL CHECK (expected_amount_grosz > 0),
  paid_amount_grosz bigint,
  currency text NOT NULL DEFAULT 'PLN',
  buyer_type text NOT NULL CHECK (buyer_type IN ('person','company')),
  buyer_name text,
  buyer_email text,
  buyer_nip text,
  buyer_street text,
  buyer_postal_code text,
  buyer_city text,
  buyer_country text NOT NULL DEFAULT 'PL',
  invoice_id uuid REFERENCES public.sales_invoices(id) ON DELETE SET NULL,
  invoice_error text,
  granted_from timestamptz,
  granted_until timestamptz,
  processed_at timestamptz,
  failure_reason text,
  affiliate_event_id uuid,
  consents jsonb NOT NULL DEFAULT '{}'::jsonb,
  needs_review boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_access_payments_updated ON public.access_payments;
CREATE TRIGGER trg_access_payments_updated BEFORE UPDATE ON public.access_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS uq_access_payments_provider_tx
  ON public.access_payments(provider, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_access_payments_user ON public.access_payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_payments_status ON public.access_payments(status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'access_entitlements_last_payment_fk'
  ) THEN
    ALTER TABLE public.access_entitlements
      ADD CONSTRAINT access_entitlements_last_payment_fk
      FOREIGN KEY (last_payment_id) REFERENCES public.access_payments(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.access_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'tpay',
  provider_transaction_id text,
  payment_id uuid,
  payload jsonb,
  result text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_access_webhook_logs_tx ON public.access_webhook_logs(provider_transaction_id);
CREATE INDEX IF NOT EXISTS idx_access_webhook_logs_created ON public.access_webhook_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS public.access_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  actor_role text,
  target_user_id uuid,
  audience text,
  action text NOT NULL,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_access_audit_target ON public.access_audit_logs(target_user_id, created_at DESC);

GRANT SELECT ON public.access_entitlements TO authenticated;
GRANT SELECT ON public.access_payments TO authenticated;
GRANT SELECT ON public.access_webhook_logs TO authenticated;
GRANT SELECT ON public.access_audit_logs TO authenticated;
GRANT ALL ON public.access_entitlements TO service_role;
GRANT ALL ON public.access_payments TO service_role;
GRANT ALL ON public.access_webhook_logs TO service_role;
GRANT ALL ON public.access_audit_logs TO service_role;

ALTER TABLE public.access_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS access_entitlements_self_select ON public.access_entitlements;
CREATE POLICY access_entitlements_self_select ON public.access_entitlements
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR public.has_role(auth.uid(),'administrator')
         OR public.has_role(auth.uid(),'ksiegowosc'));

DROP POLICY IF EXISTS access_payments_self_select ON public.access_payments;
CREATE POLICY access_payments_self_select ON public.access_payments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR public.has_role(auth.uid(),'administrator')
         OR public.has_role(auth.uid(),'ksiegowosc'));

DROP POLICY IF EXISTS access_webhook_logs_admin_select ON public.access_webhook_logs;
CREATE POLICY access_webhook_logs_admin_select ON public.access_webhook_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrator'));

DROP POLICY IF EXISTS access_audit_logs_admin_select ON public.access_audit_logs;
CREATE POLICY access_audit_logs_admin_select ON public.access_audit_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'ksiegowosc'));

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

CREATE OR REPLACE FUNCTION public.get_access_state(_user_id uuid, _audience text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ent public.access_entitlements%ROWTYPE;
  v_active boolean := false;
  v_days_left int := 0;
BEGIN
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

CREATE OR REPLACE FUNCTION public.investor_has_full_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_internal_staff(_user_id)
      OR (public.has_role(_user_id, 'inwestor')
          AND public.has_active_paid_access(_user_id, 'investor'));
$$;

CREATE OR REPLACE FUNCTION public.broker_has_paid_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_internal_staff(_user_id)
      OR public.has_active_paid_access(_user_id, 'broker');
$$;

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

  IF v_pay.processed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', v_pay.status = 'paid', 'alreadyProcessed', true,
      'status', v_pay.status,
      'reason', CASE WHEN v_pay.status = 'paid' THEN NULL ELSE 'payment_' || v_pay.status END,
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

  IF _paid_amount_grosz IS DISTINCT FROM v_pay.expected_amount_grosz THEN
    UPDATE public.access_payments
      SET failure_reason = format('amount_mismatch: expected %s, paid %s',
                                  v_pay.expected_amount_grosz, _paid_amount_grosz),
          paid_amount_grosz = _paid_amount_grosz,
          needs_review = true
      WHERE id = _payment_id;
    RETURN jsonb_build_object('ok', false, 'reason', 'amount_mismatch');
  END IF;

  IF _provider_transaction_id IS NOT NULL
     AND v_pay.provider_transaction_id IS NOT NULL
     AND v_pay.provider_transaction_id <> _provider_transaction_id THEN
    UPDATE public.access_payments
      SET failure_reason = 'transaction_id_mismatch', needs_review = true
      WHERE id = _payment_id;
    RETURN jsonb_build_object('ok', false, 'reason', 'transaction_id_mismatch');
  END IF;

  SELECT * INTO v_ent FROM public.access_entitlements
  WHERE user_id = v_pay.user_id AND audience = v_pay.audience
  FOR UPDATE;

  IF FOUND AND v_ent.active_until IS NOT NULL AND v_ent.active_until > now() THEN
    v_from := v_ent.active_until;
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

REVOKE EXECUTE ON FUNCTION public.process_access_payment_paid(uuid, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_access_payment_paid(uuid, bigint, text) TO service_role;

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

ALTER TABLE public.loan_applications
  ADD COLUMN IF NOT EXISTS created_by_partner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE INDEX IF NOT EXISTS idx_loans_partner_author
  ON public.loan_applications(created_by_partner_user_id)
  WHERE created_by_partner_user_id IS NOT NULL AND deleted_at IS NULL;

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

REVOKE EXECUTE ON FUNCTION public.broker_soft_delete_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.broker_soft_delete_application(uuid) TO authenticated, service_role;

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

REVOKE EXECUTE ON FUNCTION public.broker_offer_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.broker_offer_usage(uuid) TO authenticated, service_role;

UPDATE public.loan_applications la
SET created_by_partner_user_id = la.assigned_operator
WHERE la.created_by_partner_user_id IS NULL
  AND la.source = 'posrednik_panel'
  AND la.assigned_operator IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.affiliate_partners ap
    WHERE ap.user_id = la.assigned_operator
  );

CREATE OR REPLACE FUNCTION public.partner_owns_client(_client_id uuid, _uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.loan_applications la
    WHERE la.client_id = _client_id
      AND la.created_by_partner_user_id = _uid
      AND la.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.partner_owns_application(_application_id uuid, _uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.loan_applications la
    WHERE la.id = _application_id
      AND la.created_by_partner_user_id = _uid
      AND la.deleted_at IS NULL
  );
$$;

REVOKE EXECUTE ON FUNCTION public.partner_owns_client(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.partner_owns_application(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_owns_client(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.partner_owns_application(uuid, uuid) TO authenticated, service_role;

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
  USING (public.partner_owns_client(clients.id, auth.uid()));

DROP POLICY IF EXISTS clients_partner_own_update ON public.clients;
CREATE POLICY clients_partner_own_update ON public.clients
  FOR UPDATE TO authenticated
  USING (public.partner_owns_client(clients.id, auth.uid()));

DROP POLICY IF EXISTS properties_partner_own ON public.properties;
CREATE POLICY properties_partner_own ON public.properties
  FOR ALL TO authenticated
  USING (public.partner_owns_application(properties.loan_application_id, auth.uid()))
  WITH CHECK (public.partner_owns_application(properties.loan_application_id, auth.uid()));

DROP POLICY IF EXISTS documents_partner_own ON public.documents;
CREATE POLICY documents_partner_own ON public.documents
  FOR ALL TO authenticated
  USING (public.partner_owns_application(documents.loan_application_id, auth.uid()))
  WITH CHECK (public.partner_owns_application(documents.loan_application_id, auth.uid()));

DROP POLICY IF EXISTS pliki_klienta_partner_own_read ON storage.objects;
CREATE POLICY pliki_klienta_partner_own_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'pliki-klienta'
    AND (storage.foldername(name))[1] IN ('property','documents','property_photos','property-photos')
    AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
    AND public.partner_owns_application(((storage.foldername(name))[2])::uuid, auth.uid())
  );

DROP POLICY IF EXISTS pliki_klienta_partner_own_write ON storage.objects;
CREATE POLICY pliki_klienta_partner_own_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pliki-klienta'
    AND (storage.foldername(name))[1] IN ('property','documents')
    AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
    AND public.partner_owns_application(((storage.foldername(name))[2])::uuid, auth.uid())
  );

INSERT INTO public.user_roles (user_id, role)
SELECT ap.user_id, 'posrednik'::public.app_role
FROM public.affiliate_partners ap
WHERE ap.user_id IS NOT NULL
  AND ap.status = 'active'
ON CONFLICT (user_id, role) DO NOTHING;

CREATE OR REPLACE VIEW public.partner_operator_role_audit
WITH (security_invoker = true)
AS
SELECT
  ap.id            AS partner_id,
  ap.user_id,
  ap.status        AS partner_status,
  ap.first_name,
  ap.last_name,
  ap.company_name,
  ap.email,
  ur.created_at    AS operator_role_granted_at,
  EXISTS (
    SELECT 1 FROM public.user_roles ur2
    WHERE ur2.user_id = ap.user_id AND ur2.role = 'posrednik'::public.app_role
  ) AS has_posrednik_role
FROM public.affiliate_partners ap
JOIN public.user_roles ur ON ur.user_id = ap.user_id AND ur.role = 'operator'::public.app_role
WHERE ap.user_id IS NOT NULL;

GRANT SELECT ON public.partner_operator_role_audit TO authenticated;

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

DROP POLICY IF EXISTS gen_docs_investor_own ON public.generated_documents;
CREATE POLICY gen_docs_investor_own ON public.generated_documents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'inwestor') AND created_by = auth.uid() AND public.investor_has_full_access(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'inwestor') AND created_by = auth.uid() AND public.investor_has_full_access(auth.uid()));

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

DROP POLICY IF EXISTS investors_operator_select ON public.investors;
CREATE POLICY investors_operator_select ON public.investors FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS investors_partner_select ON public.investors;
CREATE POLICY investors_partner_select ON public.investors FOR SELECT TO authenticated
  USING (
    is_active = true
    AND (public.has_role(auth.uid(),'posrednik') OR public.is_external_partner(auth.uid()))
  );

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
      OR auth.uid() IS NULL
    )
  ORDER BY la.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.investor_offer_teasers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.investor_offer_teasers() TO authenticated, service_role;

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

ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS buyer_user_id uuid;

CREATE INDEX IF NOT EXISTS idx_sales_invoices_buyer_user
  ON public.sales_invoices(buyer_user_id)
  WHERE buyer_user_id IS NOT NULL;

ALTER TABLE public.sales_invoices DROP CONSTRAINT IF EXISTS sales_invoices_source_type_check;
ALTER TABLE public.sales_invoices
  ADD CONSTRAINT sales_invoices_source_type_check
  CHECK (source_type IN ('manual','stripe_payment','tpay_payment','affiliate_commission','other'));

DROP POLICY IF EXISTS sales_invoices_buyer_select ON public.sales_invoices;
CREATE POLICY sales_invoices_buyer_select ON public.sales_invoices
  FOR SELECT TO authenticated
  USING (buyer_user_id = auth.uid() AND status <> 'draft');

UPDATE public.sales_invoices si
SET buyer_user_id = si.source_id
WHERE si.buyer_user_id IS NULL
  AND si.source_type = 'stripe_payment'
  AND si.source_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = si.source_id);

DROP POLICY IF EXISTS individual_sales_self_select ON public.individual_sales_register;
CREATE POLICY individual_sales_self_select ON public.individual_sales_register
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.access_expiry_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  audience text NOT NULL CHECK (audience IN ('investor','broker')),
  kind text NOT NULL CHECK (kind IN ('d7','d3','d1','expired')),
  active_until timestamptz NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, audience, kind, active_until)
);

GRANT SELECT ON public.access_expiry_notifications TO authenticated;
GRANT ALL ON public.access_expiry_notifications TO service_role;
ALTER TABLE public.access_expiry_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS access_expiry_notifications_admin_select ON public.access_expiry_notifications;
CREATE POLICY access_expiry_notifications_admin_select ON public.access_expiry_notifications
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrator') OR user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _sel text := lower(coalesce(NEW.raw_user_meta_data->>'signup_role',''));
  _role public.app_role;
BEGIN
  INSERT INTO public.profiles (user_id, email, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  );

  _role := CASE
    WHEN _sel = 'inwestor' THEN 'inwestor'::public.app_role
    WHEN _sel IN ('posrednik','pośrednik','operator') THEN 'posrednik'::public.app_role
    ELSE 'klient'::public.app_role
  END;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role);

  IF _role = 'inwestor'::public.app_role THEN
    BEGIN
      INSERT INTO public.investors (
        user_id, investor_type, first_name, last_name, email, subscription_status
      ) VALUES (
        NEW.id,
        'indywidualny',
        NEW.raw_user_meta_data->>'first_name',
        NEW.raw_user_meta_data->>'last_name',
        NEW.email,
        'nieaktywny'
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

DO $$
DECLARE
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'access-expiry-tick') THEN
    PERFORM cron.unschedule('access-expiry-tick');
  END IF;
  PERFORM cron.schedule('access-expiry-tick', '0 * * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/access-expiry-tick', hdrs));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
