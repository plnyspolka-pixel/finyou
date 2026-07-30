-- Ochrona przed pętlami bot-bot (e-mail + Messenger/Instagram).
--
-- 1) Naprawa: email-guard zapisuje suppression z reason='loop_detected',
--    ale CHECK dopuszczał tylko ('unsubscribe','bounce','complaint') —
--    zapis po cichu padał i pętla nie była trwale wyciszana.
-- 2) Nowa tabela comms_suppressions: wyciszanie rozmówców na kanałach
--    bez adresu e-mail (Messenger PSID, Instagram IGSID), z opcjonalnym
--    wygaśnięciem (podejrzenie bota wygasa, twarda blokada — nie).

ALTER TABLE public.suppressed_emails
  DROP CONSTRAINT IF EXISTS suppressed_emails_reason_check;
ALTER TABLE public.suppressed_emails
  ADD CONSTRAINT suppressed_emails_reason_check CHECK (
    reason IN (
      'unsubscribe',
      'bounce',
      'complaint',
      'loop_detected',
      'bot_detected',
      'repeated_content',
      'manual'
    )
  );

CREATE TABLE IF NOT EXISTS public.comms_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL,
  identifier TEXT NOT NULL,
  reason TEXT NOT NULL,
  metadata JSONB,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel, identifier)
);

ALTER TABLE public.comms_suppressions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role can read comms suppressions"
    ON public.comms_suppressions FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert comms suppressions"
    ON public.comms_suppressions FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can update comms suppressions"
    ON public.comms_suppressions FOR UPDATE
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can delete comms suppressions"
    ON public.comms_suppressions FOR DELETE
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_comms_suppressions_lookup
  ON public.comms_suppressions (channel, identifier);
