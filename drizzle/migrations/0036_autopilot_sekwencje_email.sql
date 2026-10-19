-- Sekwencje powitalne e-mail autopilota (brief 5.4): jeden wiersz = jeden
-- wysłany krok sekwencji do jednego subskrybenta. UNIQUE pilnuje, żeby krok
-- nie poszedł dwa razy (idempotencja ticka). Zapisy wyłącznie rolą serwisową.
CREATE TABLE IF NOT EXISTS public.email_sequence_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id uuid NOT NULL REFERENCES public.email_subscribers(id) ON DELETE CASCADE,
  sequence text NOT NULL,
  step integer NOT NULL CHECK (step > 0),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'blocked', 'error')),
  error text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscriber_id, sequence, step)
);
CREATE INDEX IF NOT EXISTS idx_email_sequence_sends_sent_at
  ON public.email_sequence_sends (sent_at DESC);

REVOKE ALL ON public.email_sequence_sends FROM PUBLIC, anon;
GRANT SELECT ON public.email_sequence_sends TO authenticated;
GRANT ALL ON public.email_sequence_sends TO service_role;
ALTER TABLE public.email_sequence_sends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff view sequence sends" ON public.email_sequence_sends;
CREATE POLICY "Staff view sequence sends" ON public.email_sequence_sends
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'));
