CREATE TABLE public.debt_collection_cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  investor_user_id UUID NOT NULL DEFAULT auth.uid(),
  status TEXT NOT NULL DEFAULT 'draft',
  debtor_name TEXT, debtor_pesel TEXT, debtor_address TEXT, debtor_email TEXT, debtor_phone TEXT,
  contract_number TEXT, contract_file_path TEXT, contract_file_name TEXT,
  principal_amount NUMERIC NOT NULL DEFAULT 0,
  payout_date DATE, due_date DATE,
  contractual_annual_rate NUMERIC NOT NULL DEFAULT 0,
  penalty_annual_rate NUMERIC NOT NULL DEFAULT 0,
  max_statutory_rate NUMERIC NOT NULL DEFAULT 0,
  fee_sms NUMERIC NOT NULL DEFAULT 0,
  fee_email NUMERIC NOT NULL DEFAULT 0,
  fee_phone NUMERIC NOT NULL DEFAULT 0,
  fee_letter_debtor NUMERIC NOT NULL DEFAULT 0,
  fee_letter_court NUMERIC NOT NULL DEFAULT 0,
  fee_letter_bailiff NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.debt_collection_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.debt_collection_cases(id) ON DELETE CASCADE,
  paid_on DATE NOT NULL,
  amount NUMERIC NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.debt_collection_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.debt_collection_cases(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  action_date DATE NOT NULL DEFAULT CURRENT_DATE,
  channel_target TEXT, subject TEXT, content TEXT,
  fee NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'recorded',
  external_id TEXT, error_message TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.debt_collection_cases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.debt_collection_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.debt_collection_actions TO authenticated;
GRANT ALL ON public.debt_collection_cases TO service_role;
GRANT ALL ON public.debt_collection_payments TO service_role;
GRANT ALL ON public.debt_collection_actions TO service_role;

ALTER TABLE public.debt_collection_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_collection_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_collection_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dc_cases_owner" ON public.debt_collection_cases
FOR ALL TO authenticated
USING (investor_user_id = auth.uid() OR public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'))
WITH CHECK (investor_user_id = auth.uid() OR public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'));

CREATE OR REPLACE FUNCTION public.owns_debt_collection_case(_case_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.debt_collection_cases c
    WHERE c.id = _case_id AND (c.investor_user_id = auth.uid()
      OR public.has_role(auth.uid(), 'administrator')
      OR public.has_role(auth.uid(), 'operator')));
$$;

CREATE POLICY "dc_payments_via_case" ON public.debt_collection_payments
FOR ALL TO authenticated
USING (public.owns_debt_collection_case(case_id))
WITH CHECK (public.owns_debt_collection_case(case_id));

CREATE POLICY "dc_actions_via_case" ON public.debt_collection_actions
FOR ALL TO authenticated
USING (public.owns_debt_collection_case(case_id))
WITH CHECK (public.owns_debt_collection_case(case_id));

CREATE TRIGGER tg_debt_collection_cases_updated_at
BEFORE UPDATE ON public.debt_collection_cases
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_dc_cases_investor ON public.debt_collection_cases(investor_user_id, created_at DESC);
CREATE INDEX idx_dc_payments_case ON public.debt_collection_payments(case_id, paid_on);
CREATE INDEX idx_dc_actions_case ON public.debt_collection_actions(case_id, action_date);