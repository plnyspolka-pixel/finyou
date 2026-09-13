-- Zawężenie stop-klatki SMS: odpowiedzi zostają, follow-upy nie.
--
-- Pierwsza wersja stop-klatki wyciszała także kanał konwersacyjny, czyli
-- odpowiedzi na SMS-y, które klient sam do nas wysłał. Klient pisał „ile wyniesie
-- rata" i dostawał ciszę — a to nie jest follow-up, tylko obsługa rozmowy,
-- której sam chciał.
--
-- Teraz pauza domyślnie zatrzymuje WYŁĄCZNIE wysyłki automatyczne (kadencja,
-- przypomnienia, zapowiedzi telefonu, SMS powitalny). Odpowiedzi agenta chodzą
-- dalej — pod własnym bezpiecznikiem pętli (8 odpowiedzi / 24 h, blokada
-- powtórki tej samej treści). Wyciszenie ich wymaga teraz jawnej flagi, tak samo
-- jak wyciszenie OTP.

alter table public.voicebot_settings
  add column if not exists sms_pause_includes_conversational boolean not null default false;

comment on column public.voicebot_settings.sms_outbound_paused is
  'TRUE = nie wychodzi żaden SMS automatyczny (kadencja, przypomnienia, powitalny, zapowiedzi). Odpowiedzi na SMS klienta i wysyłki krytyczne mają osobne flagi.';
comment on column public.voicebot_settings.sms_pause_includes_conversational is
  'TRUE = stop-klatka wycisza także odpowiedzi agenta na SMS-y przychodzące od klienta.';
