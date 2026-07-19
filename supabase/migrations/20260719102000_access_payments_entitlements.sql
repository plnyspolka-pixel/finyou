-- =====================================================================
-- REJESTR PŁATNOŚCI ZA DOSTĘP + UPRAWNIENIA CZASOWE.
--  - access_payments: pełny rejestr płatności Tpay (snapshot danych nabywcy),
--  - access_entitlements: nowe źródło prawdy o płatnym dostępie,
--  - access_webhook_logs: log powiadomień webhooka dla administratora,
--  - access_audit_logs: audyt ręcznych zmian dostępu.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. UPRAWNIENIA (jedno na użytkownika i grupę odbiorców)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 2. PŁATNOŚCI (rejestr; tworzenie i zmiany statusu wyłącznie server-side)
-- ---------------------------------------------------------------------
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
  consents jsonb NOT NULL DEFAULT '{}'::jsonb, -- {termsVersion, privacyVersion, acceptedAt, digitalServiceConsent, ip, userAgent}
  needs_review boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_access_payments_updated ON public.access_payments;
CREATE TRIGGER trg_access_payments_updated BEFORE UPDATE ON public.access_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Jedna płatność na jedną transakcję u dostawcy.
CREATE UNIQUE INDEX IF NOT EXISTS uq_access_payments_provider_tx
  ON public.access_payments(provider, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_access_payments_user ON public.access_payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_payments_status ON public.access_payments(status);

-- FK z uprawnień do płatności (dodawane po utworzeniu access_payments).
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

-- ---------------------------------------------------------------------
-- 3. LOG WEBHOOKÓW (diagnostyka administratora)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 4. AUDYT RĘCZNYCH ZMIAN DOSTĘPU
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- GRANTS + RLS
-- ---------------------------------------------------------------------
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

-- Użytkownik czyta wyłącznie własne uprawnienie/płatności; personel wg roli.
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

-- Brak polityk INSERT/UPDATE dla authenticated — zapisy wyłącznie przez
-- service_role (funkcje serwerowe) lub SECURITY DEFINER RPC.

DROP POLICY IF EXISTS access_webhook_logs_admin_select ON public.access_webhook_logs;
CREATE POLICY access_webhook_logs_admin_select ON public.access_webhook_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrator'));

DROP POLICY IF EXISTS access_audit_logs_admin_select ON public.access_audit_logs;
CREATE POLICY access_audit_logs_admin_select ON public.access_audit_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'ksiegowosc'));
