
ALTER TABLE public.loan_applications
  ADD COLUMN IF NOT EXISTS reminder_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS missing_documents_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Ustaw next_reminder_at = created_at + 2h dla aktywnych leadów które jeszcze nie mają wpisu
UPDATE public.loan_applications
SET next_reminder_at = created_at + interval '2 hours'
WHERE next_reminder_at IS NULL
  AND reminder_attempts = 0
  AND status IN ('nowy_lead','w_trakcie_uzupelniania','braki_w_dokumentach','do_kontaktu','w_follow_upie');

CREATE INDEX IF NOT EXISTS idx_loan_applications_next_reminder
  ON public.loan_applications (next_reminder_at)
  WHERE next_reminder_at IS NOT NULL AND reminder_paused = false;
