-- Dystrybucja ofert e-mailem + Karta oferty (publiczny link dla inwestorów).
--
-- 1. loan_applications.offer_card_token — token publicznej Karty oferty
--    (strona /karta/<token> pokazywana inwestorom instytucjonalnym).
-- 2. offer_distributions — kolumny śledzenia wysyłki e-mail (Resend).
-- 3. offer_distribution_messages — wątek korespondencji per dystrybucja:
--    mail wychodzący do inwestora + odpowiedzi inwestora (inbound webhook
--    dopasowuje po aliasie oferta+<distribution_id>@... lub po In-Reply-To).

-- 1) Token publicznej Karty oferty
ALTER TABLE public.loan_applications
  ADD COLUMN IF NOT EXISTS offer_card_token TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_loan_applications_offer_card_token
  ON public.loan_applications(offer_card_token) WHERE offer_card_token IS NOT NULL;

-- 2) Śledzenie wysyłki e-mail na dystrybucji
ALTER TABLE public.offer_distributions
  ADD COLUMN IF NOT EXISTS email_message_id TEXT,
  ADD COLUMN IF NOT EXISTS email_status TEXT,
  ADD COLUMN IF NOT EXISTS email_error TEXT;
CREATE INDEX IF NOT EXISTS idx_distributions_email_message
  ON public.offer_distributions(email_message_id) WHERE email_message_id IS NOT NULL;

-- 3) Wątek wiadomości dystrybucji (outbound + odpowiedzi inwestorów)
CREATE TABLE IF NOT EXISTS public.offer_distribution_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_id UUID REFERENCES public.offer_distributions(id) ON DELETE CASCADE,
  loan_application_id UUID NOT NULL REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  investor_id UUID REFERENCES public.investors(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  subject TEXT,
  content TEXT,
  html TEXT,
  from_email TEXT,
  to_email TEXT,
  message_id TEXT,
  in_reply_to TEXT,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_odm_application ON public.offer_distribution_messages(loan_application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_odm_distribution ON public.offer_distribution_messages(distribution_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_odm_message_id ON public.offer_distribution_messages(message_id) WHERE message_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.offer_distribution_messages TO authenticated;
GRANT ALL ON public.offer_distribution_messages TO service_role;
ALTER TABLE public.offer_distribution_messages ENABLE ROW LEVEL SECURITY;

-- Korespondencja z instytucjami finansującymi — dostęp tylko dla kadry.
CREATE POLICY odm_staff_all ON public.offer_distribution_messages FOR ALL TO authenticated
  USING (has_role(auth.uid(),'administrator'::app_role) OR has_role(auth.uid(),'operator'::app_role))
  WITH CHECK (has_role(auth.uid(),'administrator'::app_role) OR has_role(auth.uid(),'operator'::app_role));
