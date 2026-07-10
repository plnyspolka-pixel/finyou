-- Jednorazowe czyszczenie istniejących leadów/klientów, u których numer telefonu
-- wkleił się w pole imienia/nazwiska (np. „Gadek691586905" → „Gadek").
--
-- Kod ingestu (meta-leads-webhook.ts / meta-leads-sync.server.ts) od 2026-07-10
-- czyści to już przez funkcję cleanName() przy wejściu leada — ta migracja naprawia
-- WYŁĄCZNIE rekordy zapisane wcześniej. Odpowiednik cleanName() w SQL:
--   JS:  /(?:\+?48[\s-]?)?\d[\d\s-]{7,}\d/g  →  " ", collapse spaces, trim
--   SQL: [0-9][0-9[:space:]-]{7,}[0-9]  (opcjonalny prefiks +48)
--
-- Guard: aktualizujemy tylko wiersze, w których pole faktycznie zawiera 8+ cyfr
-- w ciągu — imiona/nazwiska nigdy nie mają takich sekwencji, więc zero ryzyka
-- dla poprawnych danych. Idempotentne (po uruchomieniu WHERE już nie łapie).

DO $$
DECLARE
  -- wzorzec „wklejony numer": opcjonalny +48, potem 9+ cyfr z separatorami
  phone_pat CONSTANT text := '(\+?48[[:space:]-]?)?[0-9][0-9[:space:]-]{7,}[0-9]';
BEGIN
  -- clients.last_name
  UPDATE public.clients
  SET last_name = NULLIF(btrim(regexp_replace(regexp_replace(last_name, phone_pat, ' ', 'g'), '[[:space:]]{2,}', ' ', 'g')), '')
  WHERE last_name ~ phone_pat;

  -- clients.first_name
  UPDATE public.clients
  SET first_name = btrim(regexp_replace(regexp_replace(first_name, phone_pat, ' ', 'g'), '[[:space:]]{2,}', ' ', 'g'))
  WHERE first_name ~ phone_pat
    AND btrim(regexp_replace(regexp_replace(first_name, phone_pat, ' ', 'g'), '[[:space:]]{2,}', ' ', 'g')) <> '';

  -- leads.last_name
  UPDATE public.leads
  SET last_name = NULLIF(btrim(regexp_replace(regexp_replace(last_name, phone_pat, ' ', 'g'), '[[:space:]]{2,}', ' ', 'g')), '')
  WHERE last_name ~ phone_pat;

  -- leads.first_name
  UPDATE public.leads
  SET first_name = btrim(regexp_replace(regexp_replace(first_name, phone_pat, ' ', 'g'), '[[:space:]]{2,}', ' ', 'g'))
  WHERE first_name ~ phone_pat
    AND btrim(regexp_replace(regexp_replace(first_name, phone_pat, ' ', 'g'), '[[:space:]]{2,}', ' ', 'g')) <> '';

  -- meta_leads.full_name (źródłowa etykieta w panelu Meta)
  UPDATE public.meta_leads
  SET full_name = NULLIF(btrim(regexp_replace(regexp_replace(full_name, phone_pat, ' ', 'g'), '[[:space:]]{2,}', ' ', 'g')), '')
  WHERE full_name ~ phone_pat;
END $$;
