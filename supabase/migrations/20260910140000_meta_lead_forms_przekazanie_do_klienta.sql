-- === Formularze błyskawiczne prowadzone dla klientów zewnętrznych ===
-- Kampanie, które prowadzimy z naszego konta reklamowego dla klienta (np. wynajem
-- szalunków), zbierają leady formularzem błyskawicznym Meta. Takie leady NIE są
-- leadami Finance You: nie zakładamy im wniosku pożyczkowego ani konta, nie dzwoni
-- do nich voicebot i nie dostają SMS-a z ofertą pożyczki. Mają trafić prosto do
-- panelu klienta.
--
-- Ustawienie adresu w `client_forward_url` przełącza formularz w ten tryb:
-- synchronizacja zapisuje leada u nas (dla podglądu i odporności na duplikaty)
-- i wysyła go POST-em na ten adres, po czym kończy przetwarzanie tego leada.

ALTER TABLE public.meta_lead_forms
  ADD COLUMN IF NOT EXISTS client_forward_url text,
  ADD COLUMN IF NOT EXISTS client_forward_secret text;

COMMENT ON COLUMN public.meta_lead_forms.client_forward_url IS
  'Adres panelu klienta zewnętrznego. Ustawiony = leady z tego formularza omijają ścieżkę Finance You (wniosek, konto, SMS, voicebot) i lecą do klienta.';
COMMENT ON COLUMN public.meta_lead_forms.client_forward_secret IS
  'Wspólny sekret wysyłany w nagłówku x-lead-secret, żeby panel klienta wiedział, że lead jest od nas.';
