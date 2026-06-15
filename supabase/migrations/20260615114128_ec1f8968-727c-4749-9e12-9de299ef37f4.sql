UPDATE public.loan_reminder_email_variants SET active = false;
ALTER TABLE public.loan_reminder_email_variants ADD COLUMN IF NOT EXISTS sequence_index INTEGER;
ALTER TABLE public.loan_reminder_email_variants ADD COLUMN IF NOT EXISTS day_index INTEGER;
ALTER TABLE public.loan_reminder_email_variants ADD COLUMN IF NOT EXISTS slot TEXT;
ALTER TABLE public.loan_reminder_email_variants ADD COLUMN IF NOT EXISTS phase TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS lrev_sequence_unique ON public.loan_reminder_email_variants(sequence_index) WHERE sequence_index IS NOT NULL;