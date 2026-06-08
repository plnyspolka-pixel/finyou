
ALTER TABLE public.loan_applications
  ADD COLUMN IF NOT EXISTS reminder_sms_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reminder_sms_last_sent_at timestamptz;
