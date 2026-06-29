ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referred_by_partner_id uuid REFERENCES public.affiliate_partners(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_captured_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON public.profiles(referred_by_partner_id);

ALTER TABLE public.loan_applications ADD COLUMN IF NOT EXISTS referred_by_partner_id uuid REFERENCES public.affiliate_partners(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_loans_referred_by ON public.loan_applications(referred_by_partner_id);

ALTER TABLE public.affiliate_commission_events ADD COLUMN IF NOT EXISTS processed_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_affiliate_events_unprocessed ON public.affiliate_commission_events(processed_at) WHERE processed_at IS NULL;

ALTER TABLE public.affiliate_commission_events ADD COLUMN IF NOT EXISTS external_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_affiliate_events_external ON public.affiliate_commission_events(event_type, external_ref) WHERE external_ref IS NOT NULL;

CREATE OR REPLACE FUNCTION public.affiliate_on_loan_disbursed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_partner uuid; v_amount numeric; v_fee numeric; v_t numeric;
BEGIN
  IF NEW.status <> 'wyplacony' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  v_partner := NEW.referred_by_partner_id;
  IF v_partner IS NULL AND NEW.client_id IS NOT NULL THEN
    SELECT p.referred_by_partner_id INTO v_partner
    FROM public.clients c JOIN public.profiles p ON p.user_id = c.user_id
    WHERE c.id = NEW.client_id;
  END IF;
  IF v_partner IS NULL AND NEW.assigned_operator IS NOT NULL THEN
    SELECT ap.id INTO v_partner FROM public.affiliate_partners ap WHERE ap.user_id = NEW.assigned_operator LIMIT 1;
  END IF;
  IF v_partner IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.affiliate_commission_events
    WHERE application_id = NEW.id AND event_type = 'client_funds_disbursed'
      AND event_status NOT IN ('cancelled','refunded','chargeback','fraud')) THEN RETURN NEW; END IF;
  v_amount := COALESCE(NEW.accepted_loan_amount, NEW.loan_amount, 0);
  v_t := greatest(0, least(1, (v_amount - 20000) / NULLIF(1000000 - 20000, 0)));
  v_fee := round(v_amount * (10 - 6 * COALESCE(v_t, 0)) / 100);
  IF NEW.referred_by_partner_id IS NULL THEN
    UPDATE public.loan_applications SET referred_by_partner_id = v_partner WHERE id = NEW.id;
  END IF;
  INSERT INTO public.affiliate_commission_events
    (event_type, event_status, source_entity_type, source_entity_id, direct_partner_id,
     customer_id, application_id, loan_amount, finance_you_fee_amount, currency, occurred_at, confirmed_at)
  VALUES
    ('client_funds_disbursed', 'confirmed', 'loan_application', NEW.id, v_partner,
     NEW.client_id, NEW.id, v_amount, v_fee, 'PLN', now(), now());
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_affiliate_loan_disbursed ON public.loan_applications;
CREATE TRIGGER trg_affiliate_loan_disbursed
  AFTER UPDATE OF status ON public.loan_applications
  FOR EACH ROW EXECUTE FUNCTION public.affiliate_on_loan_disbursed();