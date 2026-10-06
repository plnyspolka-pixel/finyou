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

-- Zdarzenia i dokumenty sprawy należą do właściciela SPRAWY, nie do osoby,
-- która je dodała. Dotąd investor_user_id brał DEFAULT auth.uid(), więc
-- wpłata albo telefon dodane przez zespół (panel, MCP) były niewidoczne dla
-- inwestora (RLS) — a zaległość z harmonogramu liczona u inwestora pomijała
-- taką wpłatę. Wyzwalacz ustawia właściciela z wind_collection_cases; RLS
-- (WITH CHECK) sprawdza wiersz po wyzwalaczu, więc inwestor nadal nie doda
-- zdarzenia do cudzej sprawy, a zespół (is_internal_staff) — tak.
CREATE OR REPLACE FUNCTION public.wind_owner_from_case()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT c.investor_user_id INTO NEW.investor_user_id
  FROM public.wind_collection_cases c
  WHERE c.id = NEW.case_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.wind_owner_from_case() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_wind_events_owner ON public.wind_events;
CREATE TRIGGER trg_wind_events_owner
  BEFORE INSERT ON public.wind_events
  FOR EACH ROW EXECUTE FUNCTION public.wind_owner_from_case();

DROP TRIGGER IF EXISTS trg_wind_documents_owner ON public.wind_documents;
CREATE TRIGGER trg_wind_documents_owner
  BEFORE INSERT ON public.wind_documents
  FOR EACH ROW EXECUTE FUNCTION public.wind_owner_from_case();

-- Wpisy dodane wcześniej przez zespół do cudzych spraw — przypisz właścicielowi sprawy.
UPDATE public.wind_events e
SET investor_user_id = c.investor_user_id
FROM public.wind_collection_cases c
WHERE e.case_id = c.id AND e.investor_user_id IS DISTINCT FROM c.investor_user_id;

UPDATE public.wind_documents d
SET investor_user_id = c.investor_user_id
FROM public.wind_collection_cases c
WHERE d.case_id = c.id AND d.investor_user_id IS DISTINCT FROM c.investor_user_id;
