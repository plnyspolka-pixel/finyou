ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS do_not_sms boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS do_not_email boolean NOT NULL DEFAULT false;