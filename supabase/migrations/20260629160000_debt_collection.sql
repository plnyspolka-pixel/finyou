-- ════════════════════════════════════════════════════════════════════
-- MODUŁ WINDYKACJI (panel inwestora)
-- Inwestor zakłada sprawę windykacyjną: wgrywa umowę pożyczki (może zapisać
-- na później jako szkic), wgrywa wpłaty klienta, a na tej podstawie liczone
-- jest zadłużenie na dzień dzisiejszy z uwzględnieniem max. odsetek za
-- opóźnienie. Inwestor może zlecać działania (SMS / e-mail / telefon / pisma
-- do dłużnika, sądu, komornika) i naliczać za nie opłaty zgodnie z umową.
-- ════════════════════════════════════════════════════════════════════

-- ── Sprawy windykacyjne ──────────────────────────────────────────────
CREATE TABLE public.debt_collection_cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  investor_user_id UUID NOT NULL DEFAULT auth.uid(),
  -- draft = szkic (zapisany na później), active = w toku, closed = zamknięta
  status TEXT NOT NULL DEFAULT 'draft',

  -- Dłużnik
  debtor_name TEXT,
  debtor_pesel TEXT,
  debtor_address TEXT,
  debtor_email TEXT,
  debtor_phone TEXT,

  -- Umowa pożyczki
  contract_number TEXT,
  contract_file_path TEXT,
  contract_file_name TEXT,
  principal_amount NUMERIC NOT NULL DEFAULT 0,         -- kapitał (kwota pożyczki)
  payout_date DATE,                                    -- data wypłaty / uruchomienia
  due_date DATE,                                       -- termin spłaty (wymagalność)
  contractual_annual_rate NUMERIC NOT NULL DEFAULT 0,  -- odsetki kapitałowe (roczne %)
  penalty_annual_rate NUMERIC NOT NULL DEFAULT 0,      -- odsetki za opóźnienie wg umowy (roczne %)
  max_statutory_rate NUMERIC NOT NULL DEFAULT 0,       -- max. odsetki za opóźnienie (cap, roczne %)

  -- Cennik działań windykacyjnych (zgodnie z warunkami umowy)
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

-- ── Wpłaty klienta ───────────────────────────────────────────────────
CREATE TABLE public.debt_collection_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.debt_collection_cases(id) ON DELETE CASCADE,
  paid_on DATE NOT NULL,
  amount NUMERIC NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Działania windykacyjne (z naliczonymi opłatami) ──────────────────
CREATE TABLE public.debt_collection_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.debt_collection_cases(id) ON DELETE CASCADE,
  -- sms | email | phone | letter_debtor | letter_court | letter_bailiff
  action_type TEXT NOT NULL,
  action_date DATE NOT NULL DEFAULT CURRENT_DATE,
  channel_target TEXT,   -- nr telefonu / adres e-mail / adresat pisma
  subject TEXT,
  content TEXT,
  fee NUMERIC NOT NULL DEFAULT 0,           -- opłata naliczona za działanie
  status TEXT NOT NULL DEFAULT 'recorded',  -- recorded | sent | failed
  external_id TEXT,                         -- np. SID z Twilio / id maila
  error_message TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Uprawnienia ──────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.debt_collection_cases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.debt_collection_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.debt_collection_actions TO authenticated;
GRANT ALL ON public.debt_collection_cases TO service_role;
GRANT ALL ON public.debt_collection_payments TO service_role;
GRANT ALL ON public.debt_collection_actions TO service_role;

-- ── RLS ──────────────────────────────────────────────────────────────
ALTER TABLE public.debt_collection_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_collection_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_collection_actions ENABLE ROW LEVEL SECURITY;

-- Sprawy: właściciel (inwestor) zarządza swoimi; admin/operator wszystkimi.
CREATE POLICY "dc_cases_owner" ON public.debt_collection_cases
FOR ALL TO authenticated
USING (
  investor_user_id = auth.uid()
  OR public.has_role(auth.uid(), 'administrator')
  OR public.has_role(auth.uid(), 'operator')
)
WITH CHECK (
  investor_user_id = auth.uid()
  OR public.has_role(auth.uid(), 'administrator')
  OR public.has_role(auth.uid(), 'operator')
);

-- Helper: czy bieżący użytkownik jest właścicielem sprawy.
CREATE OR REPLACE FUNCTION public.owns_debt_collection_case(_case_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.debt_collection_cases c
    WHERE c.id = _case_id
      AND (
        c.investor_user_id = auth.uid()
        OR public.has_role(auth.uid(), 'administrator')
        OR public.has_role(auth.uid(), 'operator')
      )
  );
$$;

CREATE POLICY "dc_payments_via_case" ON public.debt_collection_payments
FOR ALL TO authenticated
USING (public.owns_debt_collection_case(case_id))
WITH CHECK (public.owns_debt_collection_case(case_id));

CREATE POLICY "dc_actions_via_case" ON public.debt_collection_actions
FOR ALL TO authenticated
USING (public.owns_debt_collection_case(case_id))
WITH CHECK (public.owns_debt_collection_case(case_id));

-- ── Triggery / indeksy ───────────────────────────────────────────────
CREATE TRIGGER tg_debt_collection_cases_updated_at
BEFORE UPDATE ON public.debt_collection_cases
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_dc_cases_investor ON public.debt_collection_cases(investor_user_id, created_at DESC);
CREATE INDEX idx_dc_payments_case ON public.debt_collection_payments(case_id, paid_on);
CREATE INDEX idx_dc_actions_case ON public.debt_collection_actions(case_id, action_date);
