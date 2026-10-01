-- Płatności podzielone (raty) TubaPay jako druga bramka płatności za dostęp
-- obok Tpay. Rekord płatności, przyznanie dostępu (process_access_payment_paid),
-- faktura i afiliacja są wspólne — zmienia się wyłącznie dostawca.
--
-- access_payments.provider: dotąd CHECK (provider IN ('tpay')) — ograniczenie
-- utworzone inline, więc zdejmujemy każde CHECK na tej kolumnie po nazwie
-- znalezionej w katalogu i zakładamy nowe, nazwane.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.conrelid = 'public.access_payments'::regclass
      AND con.contype = 'c'
      AND att.attname = 'provider'
  LOOP
    EXECUTE format('ALTER TABLE public.access_payments DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.access_payments
  ADD CONSTRAINT access_payments_provider_check CHECK (provider IN ('tpay', 'tubapay'));

COMMENT ON COLUMN public.access_payments.provider IS
  'Bramka płatności: tpay (jednorazowa) albo tubapay (płatność podzielona; provider_transaction_id = tubapay-<id płatności>).';
