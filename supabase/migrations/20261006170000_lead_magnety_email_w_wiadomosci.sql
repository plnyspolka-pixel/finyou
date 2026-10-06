-- Lead magnety: tryb „e-mail w wiadomości” (bez linku).
--
-- Powód: Instagram zablokował kontu wysyłanie linków (ograniczenie konta
-- z 29.09.2026). Na platformach z listy `email_in_dm_platforms` automat nie
-- wysyła linku do /pobierz/<slug>, tylko w wiadomości prywatnej prosi o adres
-- e-mail. Gdy osoba odpisze adresem, zapisujemy ją na listę (ta sama ścieżka
-- co formularz na stronie) i wysyłamy materiał mailem; w wiadomości zwrotnej
-- też nie ma linku. Facebook zostaje domyślnie przy linku (linki przechodzą),
-- YouTube nie ma wiadomości prywatnych, więc zawsze dostaje link.

ALTER TABLE public.lead_magnets
  ADD COLUMN IF NOT EXISTS email_in_dm_platforms text[] NOT NULL DEFAULT '{instagram}',
  ADD COLUMN IF NOT EXISTS reply_ask_email_template text NOT NULL
    DEFAULT E'Cześć {imie}! Chętnie wyślemy Ci „{tytul}”. Odpisz tutaj swoim adresem e-mail, a materiał przyjdzie na skrzynkę w ciągu minuty.\nPodając e-mail, zapisujesz się na newsletter Finance You — wypiszesz się jednym kliknięciem w stopce maila.',
  ADD COLUMN IF NOT EXISTS reply_email_received_template text NOT NULL
    DEFAULT E'Dziękujemy {imie}! „{tytul}” wysłaliśmy na {email}. Jeśli go nie widzisz, zajrzyj do folderu Oferty albo Spam.';

-- Publiczne potwierdzenie pod komentarzem bez słowa „link” — pasuje do obu trybów.
ALTER TABLE public.lead_magnets
  ALTER COLUMN reply_public_template
  SET DEFAULT 'Cześć {imie}! Napisaliśmy do Ciebie w wiadomości prywatnej 👋';

ALTER TABLE public.lead_magnets
  DROP CONSTRAINT IF EXISTS lead_magnets_email_in_dm_platforms_check;
ALTER TABLE public.lead_magnets
  ADD CONSTRAINT lead_magnets_email_in_dm_platforms_check
  CHECK (email_in_dm_platforms <@ ARRAY['facebook', 'instagram']::text[]);

-- Komentarz, po którym czekamy na adres e-mail w wiadomości prywatnej.
ALTER TABLE public.lead_magnet_triggers
  ADD COLUMN IF NOT EXISTS awaiting_email boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_reminded_at timestamptz,
  ADD COLUMN IF NOT EXISTS signup_id uuid
    REFERENCES public.lead_magnet_signups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lead_magnet_triggers_awaiting
  ON public.lead_magnet_triggers (platform, author_id, created_at DESC)
  WHERE awaiting_email;

COMMENT ON COLUMN public.lead_magnets.email_in_dm_platforms IS
  'Platformy (facebook / instagram), na których automat prosi o e-mail w wiadomości prywatnej zamiast wysyłać link.';
COMMENT ON COLUMN public.lead_magnet_triggers.awaiting_email IS
  'Po komentarzu wysłaliśmy prośbę o e-mail w wiadomości prywatnej i czekamy na odpowiedź.';
