CREATE TABLE IF NOT EXISTS public.accounting_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, legal_name text NOT NULL,
  nip text, regon text,
  address_street text, address_postal_code text, address_city text, address_country text DEFAULT 'PL',
  bank_account text, email text, phone text,
  is_default boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true,
  invoice_prefix text NOT NULL DEFAULT 'FV', invoice_next_number int NOT NULL DEFAULT 1,
  vat_payer boolean NOT NULL DEFAULT true, default_vat_rate text NOT NULL DEFAULT '23',
  provider text NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual','fakturowo','ksef')),
  fakturowo_api_id_encrypted text,
  ksef_environment text NOT NULL DEFAULT 'disabled' CHECK (ksef_environment IN ('disabled','test','demo','prod')),
  ksef_nip text, ksef_token_encrypted text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_entities_default ON public.accounting_entities(is_default) WHERE is_default;

CREATE TABLE IF NOT EXISTS public.sales_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid REFERENCES public.accounting_entities(id) ON DELETE RESTRICT,
  invoice_number text,
  buyer_name text, buyer_nip text, buyer_email text,
  buyer_street text, buyer_city text, buyer_postal_code text, buyer_country text DEFAULT 'PL',
  issue_date date, sale_date date, due_date date,
  currency text NOT NULL DEFAULT 'PLN',
  net_amount numeric NOT NULL DEFAULT 0, vat_amount numeric NOT NULL DEFAULT 0, gross_amount numeric NOT NULL DEFAULT 0,
  vat_rate text NOT NULL DEFAULT '23',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  payment_id text,
  source_type text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual','stripe_payment','affiliate_commission','other')),
  source_id uuid,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','sent','paid','cancelled')),
  ksef_status text NOT NULL DEFAULT 'not_sent' CHECK (ksef_status IN ('not_sent','disabled','pending','accepted','rejected','error')),
  ksef_reference_number text, ksef_element_reference text, ksef_upo_xml text,
  provider text, fakturowo_document_id text, pdf_url text, error_message text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_entity ON public.sales_invoices(entity_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_payment ON public.sales_invoices(payment_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_status ON public.sales_invoices(status, ksef_status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_invoices_payment ON public.sales_invoices(payment_id) WHERE payment_id IS NOT NULL;

CREATE TRIGGER trg_accounting_entities_updated BEFORE UPDATE ON public.accounting_entities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_sales_invoices_updated BEFORE UPDATE ON public.sales_invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounting_entities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_invoices TO authenticated;
GRANT ALL ON public.accounting_entities TO service_role;
GRANT ALL ON public.sales_invoices TO service_role;
ALTER TABLE public.accounting_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounting_entities_staff_select" ON public.accounting_entities FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'ksiegowosc'));
CREATE POLICY "accounting_entities_admin_all" ON public.accounting_entities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrator')) WITH CHECK (public.has_role(auth.uid(),'administrator'));

CREATE POLICY "sales_invoices_staff_select" ON public.sales_invoices FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'ksiegowosc'));
CREATE POLICY "sales_invoices_accounting_all" ON public.sales_invoices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'ksiegowosc'))
  WITH CHECK (public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'ksiegowosc'));

INSERT INTO public.accounting_entities (name, legal_name, nip, address_country, is_default, active, invoice_prefix, provider, default_vat_rate) VALUES
  ('Podmiot 1 (domyślny)', 'Finance You Sp. z o.o.', NULL, 'PL', true, true, 'FY', 'manual', '23'),
  ('Podmiot 2', 'Drugi podmiot — uzupełnij dane', NULL, 'PL', false, true, 'FV', 'manual', '23')
ON CONFLICT DO NOTHING;