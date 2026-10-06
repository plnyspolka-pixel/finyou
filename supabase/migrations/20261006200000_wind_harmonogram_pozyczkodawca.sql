-- Windykacja: harmonogram rat i nazwa pożyczkodawcy z umowy.
--
-- Pożyczki spłacane są w ratach (Zał. 1 do umowy — Harmonogram spłat).
-- „Kwota zaległa" sprawy to suma rat, których termin już minął, a które nie
-- zostały zapłacone — nie całe saldo pożyczki. Opóźnienie liczymy od
-- najstarszej niezapłaconej raty, a odsetki za opóźnienie — od każdej raty
-- osobno (lib/windykacja-harmonogram.ts). Harmonogram pochodzi z odczytu
-- umowy (OCR Zał. 1), z generatora (pierwsza rata, liczba rat, kwota raty)
-- albo z ręcznej edycji na karcie sprawy. Pożyczka bez harmonogramu liczy
-- zaległość po staremu — od jednego terminu spłaty (termin_splaty).
--
-- Kształt JSON: [ { "nr": 1, "termin": "2026-07-10", "kwota": 7868.48,
--                   "odsetki": 1200.00, "prowizja": 300.00 }, ... ]
--   odsetki / prowizja — opcjonalne rozbicie raty (gdy umowa je podaje).
--
-- pozyczkodawca — strona udzielająca pożyczki wg umowy (np. „Finance You
-- sp. z o.o." albo inwestor — osoba fizyczna). Telefon windykacyjny AI
-- mówi „w imieniu" tej nazwy; brak = dotychczasowe zachowanie.
ALTER TABLE public.wind_loans
  ADD COLUMN IF NOT EXISTS harmonogram jsonb,
  ADD COLUMN IF NOT EXISTS pozyczkodawca text;

COMMENT ON COLUMN public.wind_loans.harmonogram IS
  'Harmonogram rat z umowy (Zał. 1): tablica {nr, termin RRRR-MM-DD, kwota, odsetki?, prowizja?} w zł. Brak = zaległość liczona od jednego terminu spłaty (termin_splaty).';

COMMENT ON COLUMN public.wind_loans.pozyczkodawca IS
  'Nazwa pożyczkodawcy z umowy (strona udzielająca pożyczki); agent windykacyjny AI dzwoni w jego imieniu.';
