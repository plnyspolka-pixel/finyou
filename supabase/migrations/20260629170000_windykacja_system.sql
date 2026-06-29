-- ════════════════════════════════════════════════════════════════════
-- SYSTEM WINDYKACJI Finance You — model danych
--
-- Zastępuje wcześniejszy uproszczony moduł (debt_collection_*). Pełny proces
-- windykacyjny: pożyczkobiorcy, pożyczki, sprawy windykacyjne, append-only
-- rejestr zdarzeń (rdzeń dowodowy) oraz wygenerowane dokumenty.
--
-- Zasada dowodowa: tabela wind_events jest APPEND-ONLY — authenticated dostaje
-- tylko SELECT + INSERT (brak UPDATE/DELETE), co gwarantuje wiarygodność.
-- ════════════════════════════════════════════════════════════════════

-- ── Usunięcie poprzedniego modułu ────────────────────────────────────
DROP TABLE IF EXISTS public.debt_collection_actions CASCADE;
DROP TABLE IF EXISTS public.debt_collection_payments CASCADE;
DROP TABLE IF EXISTS public.debt_collection_cases CASCADE;
DROP FUNCTION IF EXISTS public.owns_debt_collection_case(uuid);

-- ── Typy wyliczeniowe (namespace wind_ aby uniknąć kolizji) ──────────
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

-- ── Pożyczkobiorcy ───────────────────────────────────────────────────
CREATE TABLE public.wind_borrowers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  investor_user_id UUID NOT NULL DEFAULT auth.uid(),
  imie_nazwisko TEXT NOT NULL DEFAULT '',
  typ public.wind_borrower_type NOT NULL DEFAULT 'osoba_fizyczna',
  pesel TEXT,
  nip TEXT,
  dowod_osobisty TEXT,
  adres_zamieszkania TEXT,
  adres_do_doreczen TEXT,
  email TEXT,
  telefon TEXT,
  email_zgoda_doreczenia BOOLEAN NOT NULL DEFAULT false,
  notatki TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Pożyczki ─────────────────────────────────────────────────────────
CREATE TABLE public.wind_loans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  investor_user_id UUID NOT NULL DEFAULT auth.uid(),
  borrower_id UUID NOT NULL REFERENCES public.wind_borrowers(id) ON DELETE CASCADE,
  numer_umowy TEXT,
  data_umowy DATE,
  kwota_pozyczki NUMERIC NOT NULL DEFAULT 0,   -- kapitał wypłacony
  kwota_calkowita NUMERIC NOT NULL DEFAULT 0,  -- do zwrotu (kapitał + prowizja + odsetki)
  prowizja NUMERIC NOT NULL DEFAULT 0,
  termin_splaty DATE,
  numer_kw TEXT,
  kwota_hipoteki NUMERIC,
  akt_notarialny_777 TEXT,
  kwota_777 NUMERIC,
  rachunek_splaty TEXT,
  -- Parametry odsetkowe (silnik liczenia zadłużenia / odsetki maksymalne)
  oprocentowanie_roczne NUMERIC NOT NULL DEFAULT 0,   -- odsetki kapitałowe (% rocznie)
  stopa_odsetek_max NUMERIC NOT NULL DEFAULT 0,       -- odsetki maksymalne za opóźnienie (cap %)
  status public.wind_loan_status NOT NULL DEFAULT 'aktywna',
  saldo_pozostale NUMERIC NOT NULL DEFAULT 0,
  data_ostatniej_wplaty DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Sprawy windykacyjne ──────────────────────────────────────────────
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

-- ── Rejestr zdarzeń (APPEND-ONLY, rdzeń dowodowy) ────────────────────
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

-- ── Wygenerowane dokumenty ───────────────────────────────────────────
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

-- ── Uprawnienia ──────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wind_borrowers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wind_loans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wind_collection_cases TO authenticated;
-- Rejestr zdarzeń: APPEND-ONLY → tylko odczyt i dopisywanie.
GRANT SELECT, INSERT ON public.wind_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wind_documents TO authenticated;
GRANT ALL ON public.wind_borrowers, public.wind_loans, public.wind_collection_cases,
  public.wind_events, public.wind_documents TO service_role;

-- ── RLS ──────────────────────────────────────────────────────────────
ALTER TABLE public.wind_borrowers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wind_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wind_collection_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wind_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wind_documents ENABLE ROW LEVEL SECURITY;

-- Właściciel (inwestor) zarządza swoimi rekordami; administrator wszystkimi.
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

-- Zdarzenia: SELECT i INSERT dla właściciela (UPDATE/DELETE niedostępne — append-only).
CREATE POLICY "wind_events_select" ON public.wind_events FOR SELECT TO authenticated
USING (investor_user_id = auth.uid() OR public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "wind_events_insert" ON public.wind_events FOR INSERT TO authenticated
WITH CHECK (investor_user_id = auth.uid() OR public.has_role(auth.uid(), 'administrator'));

-- ── Triggery updated_at ──────────────────────────────────────────────
CREATE TRIGGER tg_wind_borrowers_updated_at BEFORE UPDATE ON public.wind_borrowers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tg_wind_loans_updated_at BEFORE UPDATE ON public.wind_loans
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tg_wind_cases_updated_at BEFORE UPDATE ON public.wind_collection_cases
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Indeksy ──────────────────────────────────────────────────────────
CREATE INDEX idx_wind_borrowers_investor ON public.wind_borrowers(investor_user_id);
CREATE INDEX idx_wind_loans_investor ON public.wind_loans(investor_user_id);
CREATE INDEX idx_wind_loans_borrower ON public.wind_loans(borrower_id);
CREATE INDEX idx_wind_cases_investor ON public.wind_collection_cases(investor_user_id, created_at DESC);
CREATE INDEX idx_wind_cases_loan ON public.wind_collection_cases(loan_id);
CREATE INDEX idx_wind_events_case ON public.wind_events(case_id, data_zdarzenia DESC);
CREATE INDEX idx_wind_documents_case ON public.wind_documents(case_id, created_at DESC);
