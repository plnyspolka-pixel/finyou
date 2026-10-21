-- Didit KYC/KYB — weryfikacja tożsamości klientów AML (dokument + liveness +
-- face match + AML) i firm (KYB). Uzupełnia screening Dilisense o realną
-- weryfikację tożsamości. Sesje tworzy backend (klucz DIDIT_API_KEY w
-- sekretach), a wyniki dostarcza webhook Didit (podpis HMAC).
--
-- Tabela jest luźno powiązana z aml_customers (aml_customer_id bez twardego
-- FK), żeby migracja była niezależna i nie wymagała kolejności względem
-- modułu AML.

CREATE TABLE IF NOT EXISTS public.didit_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  aml_customer_id uuid,
  vendor_data text,
  session_id text NOT NULL,
  session_number bigint,
  workflow_id text,
  workflow_type text,
  status text NOT NULL DEFAULT 'Not Started',
  verification_url text,
  features text,
  decision jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS didit_verifications_session_idx
  ON public.didit_verifications (session_id);
CREATE INDEX IF NOT EXISTS didit_verifications_user_idx
  ON public.didit_verifications (user_id);
CREATE INDEX IF NOT EXISTS didit_verifications_customer_idx
  ON public.didit_verifications (aml_customer_id);

-- updated_at (dedykowany trigger — bez zależności od modułu AML)
CREATE OR REPLACE FUNCTION public.didit_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN NEW.updated_at := now(); RETURN NEW; END $fn$;

DROP TRIGGER IF EXISTS didit_verifications_touch ON public.didit_verifications;
CREATE TRIGGER didit_verifications_touch
  BEFORE UPDATE ON public.didit_verifications
  FOR EACH ROW EXECUTE FUNCTION public.didit_touch_updated_at();

-- RLS: właściciel (inwestor / instytucja obowiązana) + personel wewnętrzny.
-- Klient, pośrednik ani inny inwestor nie widzą cudzych weryfikacji.
ALTER TABLE public.didit_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS didit_verifications_owner_all ON public.didit_verifications;
CREATE POLICY didit_verifications_owner_all ON public.didit_verifications
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_internal_staff(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_internal_staff(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.didit_verifications TO authenticated;
GRANT ALL ON public.didit_verifications TO service_role;
