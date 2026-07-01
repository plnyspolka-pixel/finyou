
-- 1) Tabela
CREATE TABLE IF NOT EXISTS public.accounting_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.accounting_entities(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('sales','purchase')),
  source text NOT NULL CHECK (source IN ('fakturowo','ksef','manual')),
  external_id text,
  invoice_number text,
  issue_date date,
  sale_date date,
  due_date date,
  counterparty_name text,
  counterparty_nip text,
  counterparty_address text,
  currency text NOT NULL DEFAULT 'PLN',
  net_amount numeric(14,2) NOT NULL DEFAULT 0,
  vat_amount numeric(14,2) NOT NULL DEFAULT 0,
  gross_amount numeric(14,2) NOT NULL DEFAULT 0,
  vat_rate text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  pdf_url text,
  xml_content text,
  ksef_reference_number text,
  ksef_status text,
  raw_payload jsonb,
  imported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounting_documents_unique_external UNIQUE (entity_id, source, direction, external_id)
);

CREATE INDEX IF NOT EXISTS accounting_documents_entity_dir_idx ON public.accounting_documents (entity_id, direction, issue_date DESC);
CREATE INDEX IF NOT EXISTS accounting_documents_issue_date_idx ON public.accounting_documents (issue_date DESC);
CREATE INDEX IF NOT EXISTS accounting_documents_source_idx ON public.accounting_documents (source);

-- 2) GRANT
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounting_documents TO authenticated;
GRANT ALL ON public.accounting_documents TO service_role;

-- 3) RLS
ALTER TABLE public.accounting_documents ENABLE ROW LEVEL SECURITY;

-- 4) Policies (admin i księgowość)
CREATE POLICY "accounting_documents_admin_all"
  ON public.accounting_documents
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::public.app_role) OR public.has_role(auth.uid(), 'ksiegowosc'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::public.app_role) OR public.has_role(auth.uid(), 'ksiegowosc'::public.app_role));

-- 5) Trigger updated_at
CREATE TRIGGER trg_accounting_documents_touch
  BEFORE UPDATE ON public.accounting_documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6) Tabela statusu synchronizacji
CREATE TABLE IF NOT EXISTS public.accounting_sync_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.accounting_entities(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('fakturowo','ksef')),
  direction text NOT NULL CHECK (direction IN ('sales','purchase')),
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  documents_synced integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounting_sync_status_unique UNIQUE (entity_id, source, direction)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounting_sync_status TO authenticated;
GRANT ALL ON public.accounting_sync_status TO service_role;

ALTER TABLE public.accounting_sync_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounting_sync_status_admin_all"
  ON public.accounting_sync_status
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::public.app_role) OR public.has_role(auth.uid(), 'ksiegowosc'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::public.app_role) OR public.has_role(auth.uid(), 'ksiegowosc'::public.app_role));

CREATE TRIGGER trg_accounting_sync_status_touch
  BEFORE UPDATE ON public.accounting_sync_status
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 7) Migracja istniejących sales_invoices → accounting_documents
INSERT INTO public.accounting_documents (
  entity_id, direction, source, external_id, invoice_number,
  issue_date, sale_date, due_date,
  counterparty_name, counterparty_nip, counterparty_address,
  currency, net_amount, vat_amount, gross_amount, vat_rate,
  items, pdf_url, ksef_reference_number, ksef_status,
  raw_payload, created_at, updated_at
)
SELECT
  si.entity_id,
  'sales'::text,
  COALESCE(si.provider, 'manual')::text,
  COALESCE(si.fakturowo_document_id, si.ksef_element_reference, si.id::text),
  si.invoice_number,
  si.issue_date, si.sale_date, si.due_date,
  si.buyer_name, si.buyer_nip,
  NULLIF(concat_ws(', ', si.buyer_street, si.buyer_postal_code, si.buyer_city), ''),
  COALESCE(si.currency, 'PLN'),
  COALESCE(si.net_amount, 0),
  COALESCE(si.vat_amount, 0),
  COALESCE(si.gross_amount, 0),
  si.vat_rate,
  COALESCE(si.items, '[]'::jsonb),
  si.pdf_url,
  si.ksef_reference_number,
  si.ksef_status,
  to_jsonb(si.*),
  si.created_at, si.updated_at
FROM public.sales_invoices si
ON CONFLICT (entity_id, source, direction, external_id) DO NOTHING;
