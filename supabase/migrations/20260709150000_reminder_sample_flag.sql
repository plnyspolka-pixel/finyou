-- Flaga jednorazowej wysyłki próbki 10 szablonów po deployu (patrz loan-reminder-emails-tick).
ALTER TABLE public.reminder_email_schedule ADD COLUMN IF NOT EXISTS sample_sent_at timestamptz;
