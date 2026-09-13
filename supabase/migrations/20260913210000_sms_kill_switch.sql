-- Twardy wyłącznik SMS-ów.
--
-- Wcześniej „mniej SMS-ów" dało się ustawić tylko limitami (1/24 h, 3/7 dni).
-- To jest stop-klatka: gdy `sms_outbound_paused` jest TRUE, hamulec
-- (`evaluateSmsGuard`) odrzuca każdą wysyłkę automatyczną i konwersacyjną,
-- niezależnie od limitów, okien godzinowych i źródła.
--
-- `sms_pause_includes_critical` rozszerza blokadę na kategorię `critical`:
-- kody jednorazowe (weryfikacja telefonu), ręczna wysyłka operatora z panelu
-- i windykacja. Domyślnie FALSE, bo zablokowanie OTP wywraca rejestrację
-- klienta — to świadoma decyzja, a nie efekt uboczny wyciszenia marketingu.

alter table public.voicebot_settings
  add column if not exists sms_outbound_paused boolean not null default false,
  add column if not exists sms_pause_includes_critical boolean not null default false;

comment on column public.voicebot_settings.sms_outbound_paused is
  'TRUE = żaden SMS automatyczny ani konwersacyjny nie wychodzi (stop-klatka, ponad limitami).';
comment on column public.voicebot_settings.sms_pause_includes_critical is
  'TRUE = stop-klatka obejmuje także OTP, ręczną wysyłkę z panelu i windykację.';
