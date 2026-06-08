ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS do_not_call boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS do_not_call_at timestamptz,
  ADD COLUMN IF NOT EXISTS do_not_call_reason text,
  ADD COLUMN IF NOT EXISTS do_not_call_source text;

CREATE INDEX IF NOT EXISTS idx_clients_do_not_call ON public.clients (do_not_call);