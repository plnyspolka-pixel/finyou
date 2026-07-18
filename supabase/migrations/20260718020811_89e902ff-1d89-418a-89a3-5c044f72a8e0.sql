
-- 1) Dodaj nową wartość enuma (jeśli jeszcze nie istnieje)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'loan_status' AND e.enumlabel = 'brak_kwoty'
  ) THEN
    ALTER TYPE public.loan_status ADD VALUE 'brak_kwoty' AFTER 'brak_kontaktu';
  END IF;
END $$;
