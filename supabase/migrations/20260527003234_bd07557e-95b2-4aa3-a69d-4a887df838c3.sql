
CREATE TABLE public.fakturowo_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  related_type TEXT,
  related_id UUID,
  client_id UUID,
  investor_id UUID,
  payment_id UUID,
  document_type TEXT,
  document_kind_code TEXT,
  fakturowo_api_number TEXT,
  document_number TEXT,
  buyer_name TEXT,
  buyer_nip TEXT,
  buyer_email TEXT,
  buyer_city TEXT,
  buyer_postal_code TEXT,
  buyer_street TEXT,
  buyer_building TEXT,
  seller_name TEXT,
  seller_nip TEXT,
  gross_amount NUMERIC,
  net_amount NUMERIC,
  vat_amount NUMERIC,
  vat_rate TEXT,
  currency TEXT NOT NULL DEFAULT 'PLN',
  product_name TEXT,
  product_quantity NUMERIC NOT NULL DEFAULT 1,
  product_unit TEXT NOT NULL DEFAULT 'szt.',
  pdf_url TEXT,
  html_url TEXT,
  pdf_filename TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  error_message TEXT,
  raw_response TEXT,
  is_test BOOLEAN NOT NULL DEFAULT false,
  created_by UUID
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fakturowo_documents TO authenticated;
GRANT ALL ON public.fakturowo_documents TO service_role;

ALTER TABLE public.fakturowo_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY fakturowo_staff_all ON public.fakturowo_documents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::app_role) OR public.has_role(auth.uid(), 'operator'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::app_role) OR public.has_role(auth.uid(), 'operator'::app_role));

CREATE INDEX idx_fakturowo_related ON public.fakturowo_documents(related_type, related_id);
CREATE INDEX idx_fakturowo_client ON public.fakturowo_documents(client_id);
CREATE INDEX idx_fakturowo_investor ON public.fakturowo_documents(investor_id);
CREATE INDEX idx_fakturowo_payment ON public.fakturowo_documents(payment_id);
CREATE INDEX idx_fakturowo_created ON public.fakturowo_documents(created_at DESC);
CREATE INDEX idx_fakturowo_status ON public.fakturowo_documents(status);

CREATE TRIGGER trg_fakturowo_updated_at
  BEFORE UPDATE ON public.fakturowo_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
