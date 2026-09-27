-- Windykacja: opłaty za czynności windykacyjne ZGODNIE Z UMOWĄ.
--
-- Przy zakładaniu sprawy inwestor wgrywa umowę pożyczki, a system odczytuje
-- z niej tabelę opłat za czynności windykacyjne (SMS, e-mail, telefon,
-- wezwanie listem poleconym). Każda czynność z panelu („Telefon windykacyjny
-- AI", „Wyślij SMS") trafia do rejestru czynności (wind_events) z opłatą
-- naliczoną wg tej tabeli; gdy umowa nie określa opłaty — domyślna
-- podpowiedź z lib/windykacja-fees.ts; `brak_oplat: true` = umowa nie
-- przewiduje opłat (0 zł).
--
-- Kształt JSON: { "sms": 20, "email": 20, "telefon": 50, "pismo": 100,
--                 "brak_oplat": false, "zrodlo": "umowa" | "recznie" }
ALTER TABLE public.wind_loans
  ADD COLUMN IF NOT EXISTS oplaty_windykacyjne jsonb;

COMMENT ON COLUMN public.wind_loans.oplaty_windykacyjne IS
  'Tabela opłat za czynności windykacyjne z umowy pożyczki (zł): sms, email, telefon, pismo; brak_oplat=true gdy umowa nie przewiduje opłat; zrodlo: umowa|recznie.';
