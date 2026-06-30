-- Drop poprzedniego uproszczonego modułu i utworzenie pełnego systemu windykacji wind_*
DROP TABLE IF EXISTS public.debt_collection_actions CASCADE;
DROP TABLE IF EXISTS public.debt_collection_payments CASCADE;
DROP TABLE IF EXISTS public.debt_collection_cases CASCADE;
DROP FUNCTION IF EXISTS public.owns_debt_collection_case(uuid);

CREATE TYPE public.wind_borrower_type AS ENUM ('osoba_fizyczna', 'firma');
CREATE TYPE public.wind_loan_status AS ENUM (
  'aktywna', 'w_zwloce', 'wypowiedziana', 'windykacja_komornicza', 'splacona', 'windykacja_karna'
);
CREATE TYPE public.wind_path AS ENUM ('miekka', 'standardowa', 'twarda', 'karna');
CREATE TYPE public.wind_case_result AS ENUM (
  'splacona', 'ugoda', 'egzekucja_w_toku', 'umorzona', 'przekazana_karna'
);
CREATE TYPE public.wind_priority AS ENUM ('niski', 'sredni', 'wysoki', 'krytyczny');
CREATE TYPE public.wind_event_type AS ENUM (
  'sms', 'email', 'telefon', 'pismo_nadane', 'pismo_doreczone', 'pismo_awizo',
  'pismo_zwrot', 'wplata', 'dokument_wygenerowany', 'zmiana_etapu', 'notatka', 'czynnosc_sadowa'
);
CREATE TYPE public.wind_event_category AS ENUM ('automatyczne', 'manualne', 'systemowe');
CREATE TYPE public.wind_delivery_status AS ENUM (
  'oczekuje', 'doreczone', 'awizowane', 'termin_uplynal', 'zwrot'
);
CREATE TYPE public.wind_document_type AS ENUM (
  'wezwanie', 'wypowiedzenie', 'wniosek_klauzula', 'wniosek_komornik', 'aneks',
  'porozumienie', 'ugoda', 'zawiadomienie_286', 'zawiadomienie_297', 'notatka'
);
CREATE TYPE public.wind_document_status AS ENUM ('szkic', 'gotowy', 'wyslany');

CREATE TABLE public.wind_borrowers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  investor_user_id UUID NOT NULL DEFAULT auth.uid(),
  imie_nazwisko TEXT NOT NULL DEFAULT '',
  typ public.wind_borrower_type NOT NULL DEFAULT 'osoba_fizyczna',
  pesel TEXT, nip TEXT, dowod_osobisty TEXT,
  adres_zamieszkania TEXT, adres_do_doreczen TEXT,
  email TEXT, telefon TEXT,
  email_zgoda_doreczenia BOOLEAN NOT NULL DEFAULT false,
  notatki TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.wind_loans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  investor_user_id UUID NOT NULL DEFAULT auth.uid(),
  borrower_id UUID NOT NULL REFERENCES public.wind_borrowers(id) ON DELETE CASCADE,
  numer_umowy TEXT, data_umowy DATE,
  kwota_pozyczki NUMERIC NOT NULL DEFAULT 0,
  kwota_calkowita NUMERIC NOT NULL DEFAULT 0,
  prowizja NUMERIC NOT NULL DEFAULT 0,
  termin_splaty DATE,
  numer_kw TEXT, kwota_hipoteki NUMERIC,
  akt_notarialny_777 TEXT, kwota_777 NUMERIC,
  rachunek_splaty TEXT,
  oprocentowanie_roczne NUMERIC NOT NULL DEFAULT 0,
  stopa_odsetek_max NUMERIC NOT NULL DEFAULT 0,
  status public.wind_loan_status NOT NULL DEFAULT 'aktywna',
  saldo_pozostale NUMERIC NOT NULL DEFAULT 0,
  data_ostatniej_wplaty DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.wind_collection_cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  investor_user_id UUID NOT NULL DEFAULT auth.uid(),
  loan_id UUID NOT NULL REFERENCES public.wind_loans(id) ON DELETE CASCADE,
  sciezka public.wind_path NOT NULL DEFAULT 'miekka',
  etap TEXT NOT NULL DEFAULT 'kontakt_wstepny',
  opoznienie_dni INTEGER NOT NULL DEFAULT 0,
  kwota_zalegla NUMERIC NOT NULL DEFAULT 0,
  data_otwarcia DATE NOT NULL DEFAULT CURRENT_DATE,
  data_zamkniecia DATE,
  wynik public.wind_case_result,
  priorytet public.wind_priority NOT NULL DEFAULT 'sredni',
  osoba_prowadzaca TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.wind_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  investor_user_id UUID NOT NULL DEFAULT auth.uid(),
  case_id UUID NOT NULL REFERENCES public.wind_collection_cases(id) ON DELETE CASCADE,
  typ public.wind_event_type NOT NULL,
  kategoria public.wind_event_category NOT NULL DEFAULT 'manualne',
  tytul TEXT NOT NULL,
  tresc TEXT,
  data_zdarzenia TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_doreczenia TIMESTAMPTZ,
  status_doreczenia public.wind_delivery_status,
  zalacznik_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  autor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.wind_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  investor_user_id UUID NOT NULL DEFAULT auth.uid(),
  case_id UUID NOT NULL REFERENCES public.wind_collection_cases(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.wind_events(id) ON DELETE SET NULL,
  typ public.wind_document_type NOT NULL,
  tytul TEXT NOT NULL,
  tresc TEXT,
  plik_url TEXT,
  status public.wind_document_status NOT NULL DEFAULT 'gotowy',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wind_borrowers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wind_loans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wind_collection_cases TO authenticated;
GRANT SELECT, INSERT ON public.wind_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wind_documents TO authenticated;
GRANT ALL ON public.wind_borrowers, public.wind_loans, public.wind_collection_cases,
  public.wind_events, public.wind_documents TO service_role;

ALTER TABLE public.wind_borrowers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wind_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wind_collection_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wind_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wind_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wind_borrowers_owner" ON public.wind_borrowers FOR ALL TO authenticated
USING (investor_user_id = auth.uid() OR public.has_role(auth.uid(), 'administrator'))
WITH CHECK (investor_user_id = auth.uid() OR public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "wind_loans_owner" ON public.wind_loans FOR ALL TO authenticated
USING (investor_user_id = auth.uid() OR public.has_role(auth.uid(), 'administrator'))
WITH CHECK (investor_user_id = auth.uid() OR public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "wind_cases_owner" ON public.wind_collection_cases FOR ALL TO authenticated
USING (investor_user_id = auth.uid() OR public.has_role(auth.uid(), 'administrator'))
WITH CHECK (investor_user_id = auth.uid() OR public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "wind_documents_owner" ON public.wind_documents FOR ALL TO authenticated
USING (investor_user_id = auth.uid() OR public.has_role(auth.uid(), 'administrator'))
WITH CHECK (investor_user_id = auth.uid() OR public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "wind_events_select" ON public.wind_events FOR SELECT TO authenticated
USING (investor_user_id = auth.uid() OR public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "wind_events_insert" ON public.wind_events FOR INSERT TO authenticated
WITH CHECK (investor_user_id = auth.uid() OR public.has_role(auth.uid(), 'administrator'));

CREATE TRIGGER trg_wind_borrowers_updated_at BEFORE UPDATE ON public.wind_borrowers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_wind_loans_updated_at BEFORE UPDATE ON public.wind_loans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_wind_cases_updated_at BEFORE UPDATE ON public.wind_collection_cases
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();