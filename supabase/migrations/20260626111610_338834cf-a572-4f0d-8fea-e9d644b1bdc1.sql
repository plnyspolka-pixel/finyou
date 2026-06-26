
-- 1. AI description for marketing materials
ALTER TABLE public.marketing_materials
  ADD COLUMN IF NOT EXISTS ai_description text;

-- 2. Referral code on profiles (used by brokers)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;

-- 3. Broker settlements
CREATE TABLE IF NOT EXISTS public.broker_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_user_id uuid NOT NULL,
  loan_application_id uuid REFERENCES public.loan_applications(id) ON DELETE SET NULL,
  client_name text,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'PLN',
  status text NOT NULL DEFAULT 'pending', -- pending | approved | paid | cancelled
  period_label text,
  notes text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broker_settlements TO authenticated;
GRANT ALL ON public.broker_settlements TO service_role;

ALTER TABLE public.broker_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Broker can view own settlements"
  ON public.broker_settlements FOR SELECT
  TO authenticated
  USING (broker_user_id = auth.uid() OR public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "Admin manage settlements"
  ON public.broker_settlements FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'));

CREATE TRIGGER trg_broker_settlements_updated
  BEFORE UPDATE ON public.broker_settlements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
