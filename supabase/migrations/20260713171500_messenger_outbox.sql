-- Kolejka wiadomości wychodzących Messenger/IG. Wiersze wstawia system
-- (service role); wysyłką zajmuje się follow-up-tick (pg_cron co 15 min),
-- który ma dostęp do META_PAGE_ACCESS_TOKEN. RLS bez polityk = dostęp
-- wyłącznie dla service_role.
CREATE TABLE IF NOT EXISTS public.messenger_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | sent | error | skipped
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
ALTER TABLE public.messenger_outbox ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.messenger_outbox TO service_role;
CREATE INDEX IF NOT EXISTS idx_messenger_outbox_pending ON public.messenger_outbox(status) WHERE status = 'pending';
