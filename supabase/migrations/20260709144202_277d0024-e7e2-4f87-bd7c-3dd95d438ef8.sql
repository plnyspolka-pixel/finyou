-- 1) Dodaj nowe wartości do enuma loan_status (starych nie można usunąć w bezpieczny sposób — zostają jako aliasy do zmapowania)
ALTER TYPE public.loan_status ADD VALUE IF NOT EXISTS 'brak_kontaktu';
ALTER TYPE public.loan_status ADD VALUE IF NOT EXISTS 'kontakt';
ALTER TYPE public.loan_status ADD VALUE IF NOT EXISTS 'kompletowanie_danych';
ALTER TYPE public.loan_status ADD VALUE IF NOT EXISTS 'szukamy_inwestora';
ALTER TYPE public.loan_status ADD VALUE IF NOT EXISTS 'warunki_zaakceptowane';
ALTER TYPE public.loan_status ADD VALUE IF NOT EXISTS 'dokumenty_przygotowanie_umowy';
ALTER TYPE public.loan_status ADD VALUE IF NOT EXISTS 'notariusz';
ALTER TYPE public.loan_status ADD VALUE IF NOT EXISTS 'zamkniete';

-- 2) Notatki pośrednika/admina na wniosku i leadzie
ALTER TABLE public.loan_applications ADD COLUMN IF NOT EXISTS broker_notes text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS broker_notes text;
