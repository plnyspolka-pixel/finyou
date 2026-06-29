-- 1. PARTNERZY
CREATE TABLE IF NOT EXISTS public.affiliate_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  settlement_type text NOT NULL CHECK (settlement_type IN ('b2b','unregistered_activity')),
  status text NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval','active','suspended','rejected',
                      'missing_billing_data','requires_accounting_review',
                      'requires_business_registration','terminated')),
  sponsor_partner_id uuid REFERENCES public.affiliate_partners(id) ON DELETE SET NULL,
  referral_code text UNIQUE,
  referral_slug text UNIQUE,
  first_name text, last_name text, company_name text, email text, phone text,
  pesel_encrypted text, nip text, regon text, tax_office text,
  address_street text, address_postal_code text, address_city text, address_country text DEFAULT 'PL',
  bank_account_encrypted text, billing_email text, website_url text, source_description text,
  vat_payer boolean DEFAULT false,
  terms_accepted_at timestamptz, terms_version text,
  approved_at timestamptz, approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_affiliate_partners_user ON public.affiliate_partners(user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_partners_sponsor ON public.affiliate_partners(sponsor_partner_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_partners_status ON public.affiliate_partners(status);

CREATE TABLE IF NOT EXISTS public.affiliate_network_closure (
  ancestor_partner_id uuid NOT NULL REFERENCES public.affiliate_partners(id) ON DELETE CASCADE,
  descendant_partner_id uuid NOT NULL REFERENCES public.affiliate_partners(id) ON DELETE CASCADE,
  depth int NOT NULL CHECK (depth >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ancestor_partner_id, descendant_partner_id)
);
CREATE INDEX IF NOT EXISTS idx_affiliate_closure_descendant ON public.affiliate_network_closure(descendant_partner_id, depth);
CREATE INDEX IF NOT EXISTS idx_affiliate_closure_ancestor ON public.affiliate_network_closure(ancestor_partner_id, depth);

CREATE TABLE IF NOT EXISTS public.affiliate_commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, active boolean NOT NULL DEFAULT true,
  event_type text NOT NULL CHECK (event_type IN ('investor_account_paid','broker_account_paid','client_funds_disbursed')),
  network_level int NOT NULL CHECK (network_level IN (1,2,3)),
  settlement_type_filter text CHECK (settlement_type_filter IN ('b2b','unregistered_activity')),
  product_id uuid,
  basis_type text NOT NULL CHECK (basis_type IN ('fixed_amount','percent_of_net_revenue','percent_of_gross_payment','percent_of_loan_amount','percent_of_finance_you_fee','manual')),
  fixed_amount numeric, percent_rate numeric, min_commission numeric, max_commission numeric,
  valid_from timestamptz, valid_to timestamptz,
  requires_admin_approval boolean NOT NULL DEFAULT true,
  refund_window_days int NOT NULL DEFAULT 14,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_affiliate_rules_lookup ON public.affiliate_commission_rules(event_type, network_level, active);

CREATE TABLE IF NOT EXISTS public.affiliate_unregistered_activity_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year int NOT NULL, quarter int NOT NULL CHECK (quarter IN (1,2,3,4)),
  limit_amount numeric NOT NULL, currency text NOT NULL DEFAULT 'PLN',
  source_note text, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (year, quarter)
);

CREATE TABLE IF NOT EXISTS public.affiliate_commission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN ('investor_account_paid','broker_account_paid','client_funds_disbursed')),
  event_status text NOT NULL DEFAULT 'pending'
    CHECK (event_status IN ('pending','confirmed','refund_window','eligible','cancelled','refunded','chargeback','fraud','manually_blocked')),
  source_entity_type text, source_entity_id uuid,
  direct_partner_id uuid NOT NULL REFERENCES public.affiliate_partners(id) ON DELETE RESTRICT,
  customer_id uuid, application_id uuid, paid_account_id uuid, payment_id uuid, product_id uuid,
  gross_payment_amount numeric, net_revenue_amount numeric, finance_you_fee_amount numeric, loan_amount numeric,
  currency text NOT NULL DEFAULT 'PLN',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz, refund_window_until timestamptz, cancelled_at timestamptz, cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_affiliate_events_partner ON public.affiliate_commission_events(direct_partner_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_events_status ON public.affiliate_commission_events(event_status);
CREATE INDEX IF NOT EXISTS idx_affiliate_events_payment ON public.affiliate_commission_events(payment_id);

CREATE TABLE IF NOT EXISTS public.affiliate_payout_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','processing','paid','cancelled')),
  total_amount numeric NOT NULL DEFAULT 0, payout_count int NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'PLN',
  created_by uuid, approved_by uuid, paid_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz, paid_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.affiliate_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.affiliate_partners(id) ON DELETE CASCADE,
  invoice_number text, issue_date date,
  net_amount numeric NOT NULL DEFAULT 0, vat_amount numeric, gross_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'PLN', file_url text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','verified','rejected','paid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz, verified_by uuid
);
CREATE INDEX IF NOT EXISTS idx_affiliate_invoices_partner ON public.affiliate_invoices(partner_id);

CREATE TABLE IF NOT EXISTS public.affiliate_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_event_id uuid NOT NULL REFERENCES public.affiliate_commission_events(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.affiliate_partners(id) ON DELETE RESTRICT,
  direct_partner_id uuid REFERENCES public.affiliate_partners(id) ON DELETE SET NULL,
  network_level int NOT NULL CHECK (network_level IN (1,2,3)),
  rule_id uuid REFERENCES public.affiliate_commission_rules(id) ON DELETE SET NULL,
  settlement_type text NOT NULL CHECK (settlement_type IN ('b2b','unregistered_activity')),
  status text NOT NULL DEFAULT 'calculated' CHECK (status IN ('calculated','pending_admin_approval','approved','blocked','requires_invoice','requires_unregistered_activity_statement','requires_business_registration','payable','paid','cancelled','clawback')),
  basis_type text NOT NULL, basis_amount numeric NOT NULL DEFAULT 0,
  commission_rate numeric, gross_amount numeric NOT NULL DEFAULT 0, currency text NOT NULL DEFAULT 'PLN',
  tax_year int NOT NULL, tax_quarter int NOT NULL CHECK (tax_quarter IN (1,2,3,4)),
  payout_batch_id uuid REFERENCES public.affiliate_payout_batches(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.affiliate_invoices(id) ON DELETE SET NULL,
  requires_invoice boolean NOT NULL DEFAULT false,
  requires_unregistered_activity_statement boolean NOT NULL DEFAULT false,
  requires_business_registration boolean NOT NULL DEFAULT false,
  approved_at timestamptz, approved_by uuid, payable_at timestamptz, paid_at timestamptz,
  cancelled_at timestamptz, cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (commission_event_id, partner_id, network_level)
);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_partner ON public.affiliate_commissions(partner_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_status ON public.affiliate_commissions(status);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_period ON public.affiliate_commissions(partner_id, tax_year, tax_quarter);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_batch ON public.affiliate_commissions(payout_batch_id);

CREATE TABLE IF NOT EXISTS public.affiliate_payout_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_batch_id uuid NOT NULL REFERENCES public.affiliate_payout_batches(id) ON DELETE CASCADE,
  commission_id uuid NOT NULL REFERENCES public.affiliate_commissions(id) ON DELETE RESTRICT,
  partner_id uuid NOT NULL REFERENCES public.affiliate_partners(id) ON DELETE RESTRICT,
  amount numeric NOT NULL DEFAULT 0, transfer_title text, bank_account_snapshot_encrypted text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(), paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_affiliate_payout_items_batch ON public.affiliate_payout_items(payout_batch_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_payout_items_partner ON public.affiliate_payout_items(partner_id);

CREATE TABLE IF NOT EXISTS public.affiliate_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid, actor_role text, entity_type text NOT NULL, entity_id uuid,
  action text NOT NULL, before jsonb, after jsonb, reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_affiliate_audit_entity ON public.affiliate_audit_logs(entity_type, entity_id);

CREATE OR REPLACE FUNCTION public.affiliate_current_partner_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM public.affiliate_partners WHERE user_id = auth.uid() LIMIT 1 $$;

CREATE TRIGGER trg_affiliate_partners_updated BEFORE UPDATE ON public.affiliate_partners FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_affiliate_rules_updated BEFORE UPDATE ON public.affiliate_commission_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_affiliate_limits_updated BEFORE UPDATE ON public.affiliate_unregistered_activity_limits FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_affiliate_events_updated BEFORE UPDATE ON public.affiliate_commission_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_affiliate_commissions_updated BEFORE UPDATE ON public.affiliate_commissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['affiliate_partners','affiliate_network_closure','affiliate_commission_rules','affiliate_unregistered_activity_limits','affiliate_commission_events','affiliate_commissions','affiliate_payout_batches','affiliate_payout_items','affiliate_invoices','affiliate_audit_logs'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.affiliate_current_partner_id() TO authenticated;

CREATE POLICY "partners_self_select" ON public.affiliate_partners FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'ksiegowosc'));
CREATE POLICY "partners_admin_all" ON public.affiliate_partners FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrator')) WITH CHECK (public.has_role(auth.uid(),'administrator'));

CREATE POLICY "closure_staff_select" ON public.affiliate_network_closure FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'ksiegowosc'));
CREATE POLICY "closure_admin_all" ON public.affiliate_network_closure FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrator')) WITH CHECK (public.has_role(auth.uid(),'administrator'));

CREATE POLICY "rules_select_all" ON public.affiliate_commission_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "rules_admin_all" ON public.affiliate_commission_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrator')) WITH CHECK (public.has_role(auth.uid(),'administrator'));

CREATE POLICY "limits_select_all" ON public.affiliate_unregistered_activity_limits FOR SELECT TO authenticated USING (true);
CREATE POLICY "limits_admin_all" ON public.affiliate_unregistered_activity_limits FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrator')) WITH CHECK (public.has_role(auth.uid(),'administrator'));

CREATE POLICY "events_partner_select" ON public.affiliate_commission_events FOR SELECT TO authenticated
  USING (direct_partner_id = public.affiliate_current_partner_id() OR public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'ksiegowosc'));
CREATE POLICY "events_admin_all" ON public.affiliate_commission_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrator')) WITH CHECK (public.has_role(auth.uid(),'administrator'));

CREATE POLICY "commissions_partner_select" ON public.affiliate_commissions FOR SELECT TO authenticated
  USING (partner_id = public.affiliate_current_partner_id() OR public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'ksiegowosc'));
CREATE POLICY "commissions_admin_all" ON public.affiliate_commissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrator')) WITH CHECK (public.has_role(auth.uid(),'administrator'));

CREATE POLICY "batches_staff_select" ON public.affiliate_payout_batches FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'ksiegowosc'));
CREATE POLICY "batches_admin_all" ON public.affiliate_payout_batches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrator')) WITH CHECK (public.has_role(auth.uid(),'administrator'));

CREATE POLICY "payout_items_partner_select" ON public.affiliate_payout_items FOR SELECT TO authenticated
  USING (partner_id = public.affiliate_current_partner_id() OR public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'ksiegowosc'));
CREATE POLICY "payout_items_admin_all" ON public.affiliate_payout_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrator')) WITH CHECK (public.has_role(auth.uid(),'administrator'));

CREATE POLICY "affiliate_invoices_partner_select" ON public.affiliate_invoices FOR SELECT TO authenticated
  USING (partner_id = public.affiliate_current_partner_id() OR public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'ksiegowosc'));
CREATE POLICY "affiliate_invoices_partner_insert" ON public.affiliate_invoices FOR INSERT TO authenticated
  WITH CHECK (partner_id = public.affiliate_current_partner_id() OR public.has_role(auth.uid(),'administrator'));
CREATE POLICY "affiliate_invoices_admin_all" ON public.affiliate_invoices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'ksiegowosc'))
  WITH CHECK (public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'ksiegowosc'));

CREATE POLICY "affiliate_audit_staff_select" ON public.affiliate_audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'ksiegowosc'));

INSERT INTO public.affiliate_unregistered_activity_limits (year, quarter, limit_amount, currency, source_note, active) VALUES
  (2026, 1, 10813.50, 'PLN', 'Limit działalności nierejestrowanej 2026: 225% minimalnego wynagrodzenia 4 806 zł', true),
  (2026, 2, 10813.50, 'PLN', 'Limit działalności nierejestrowanej 2026: 225% minimalnego wynagrodzenia 4 806 zł', true),
  (2026, 3, 10813.50, 'PLN', 'Limit działalności nierejestrowanej 2026: 225% minimalnego wynagrodzenia 4 806 zł', true),
  (2026, 4, 10813.50, 'PLN', 'Limit działalności nierejestrowanej 2026: 225% minimalnego wynagrodzenia 4 806 zł', true)
ON CONFLICT (year, quarter) DO NOTHING;

INSERT INTO public.affiliate_commission_rules (name, active, event_type, network_level, basis_type, fixed_amount, percent_rate, requires_admin_approval, refund_window_days) VALUES
  ('Opłacone konto inwestora — poziom 1 (domyślna, do edycji)', true, 'investor_account_paid', 1, 'fixed_amount', 100, NULL, true, 14),
  ('Opłacone konto inwestora — poziom 2 (domyślna, do edycji)', true, 'investor_account_paid', 2, 'fixed_amount', 30, NULL, true, 14),
  ('Opłacone konto inwestora — poziom 3 (domyślna, do edycji)', true, 'investor_account_paid', 3, 'fixed_amount', 10, NULL, true, 14),
  ('Opłacone konto pośrednika — poziom 1 (domyślna, do edycji)', true, 'broker_account_paid', 1, 'fixed_amount', 100, NULL, true, 14),
  ('Opłacone konto pośrednika — poziom 2 (domyślna, do edycji)', true, 'broker_account_paid', 2, 'fixed_amount', 30, NULL, true, 14),
  ('Opłacone konto pośrednika — poziom 3 (domyślna, do edycji)', true, 'broker_account_paid', 3, 'fixed_amount', 10, NULL, true, 14),
  ('Wypłata środków klientowi — poziom 1 (% wynagrodzenia FY, do edycji)', true, 'client_funds_disbursed', 1, 'percent_of_finance_you_fee', NULL, 20, true, 14),
  ('Wypłata środków klientowi — poziom 2 (% wynagrodzenia FY, do edycji)', true, 'client_funds_disbursed', 2, 'percent_of_finance_you_fee', NULL, 8, true, 14),
  ('Wypłata środków klientowi — poziom 3 (% wynagrodzenia FY, do edycji)', true, 'client_funds_disbursed', 3, 'percent_of_finance_you_fee', NULL, 4, true, 14);