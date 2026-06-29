
CREATE TABLE public.individual_sales_register (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id TEXT NOT NULL UNIQUE,
  user_id UUID,
  buyer_name TEXT,
  buyer_email TEXT,
  buyer_address TEXT,
  buyer_city TEXT,
  buyer_postal_code TEXT,
  description TEXT NOT NULL,
  gross_amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'PLN',
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  invoice_requested_at TIMESTAMPTZ,
  invoice_id UUID REFERENCES public.sales_invoices(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.individual_sales_register TO authenticated;
GRANT ALL ON public.individual_sales_register TO service_role;

ALTER TABLE public.individual_sales_register ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/operators manage individual sales register"
ON public.individual_sales_register
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'))
WITH CHECK (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'));

CREATE TRIGGER tg_individual_sales_register_updated_at
BEFORE UPDATE ON public.individual_sales_register
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_indiv_sales_paid_at ON public.individual_sales_register(paid_at DESC);
CREATE INDEX idx_indiv_sales_user_id ON public.individual_sales_register(user_id);
