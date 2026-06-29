
CREATE TABLE public.tpay_transaction_buyers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id text NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  buyer_type text NOT NULL CHECK (buyer_type IN ('person','company')),
  buyer_name text,
  buyer_email text,
  buyer_nip text,
  buyer_address text,
  buyer_city text,
  buyer_postal_code text,
  buyer_country text DEFAULT 'PL',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.tpay_transaction_buyers TO authenticated;
GRANT ALL ON public.tpay_transaction_buyers TO service_role;

ALTER TABLE public.tpay_transaction_buyers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own buyer rows"
  ON public.tpay_transaction_buyers
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert their own buyer rows"
  ON public.tpay_transaction_buyers
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
