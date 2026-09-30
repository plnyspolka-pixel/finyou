-- Zakup abonamentu inwestora BEZ wcześniejszego konta (przycisk „Załóż konto
-- inwestora" na stronie publicznej → formularz nabywcy → Tpay).
--
-- Płatność powstaje bez user_id; konto inwestora zakłada webhook Tpay
-- z danych nabywcy (e-mail, imię i nazwisko / nazwa) dopiero po potwierdzeniu
-- wpłaty i przypina je do płatności PRZED przyznaniem dostępu.
ALTER TABLE public.access_payments ALTER COLUMN user_id DROP NOT NULL;

-- Opłacona (i każda dalsza) płatność zawsze ma właściciela — dostęp nie może
-- zostać przyznany „nikomu". Bez konta tylko inwestor i tylko przed wpłatą.
ALTER TABLE public.access_payments DROP CONSTRAINT IF EXISTS access_payments_guest_chk;
ALTER TABLE public.access_payments ADD CONSTRAINT access_payments_guest_chk CHECK (
  user_id IS NOT NULL
  OR (audience = 'investor' AND status IN ('created', 'pending', 'failed', 'cancelled'))
);
