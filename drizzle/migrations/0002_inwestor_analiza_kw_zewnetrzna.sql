-- Szybka analiza KW dla wniosku spoza Finance You (moduł Analityka inwestora).
--
-- Inwestor przynosi własny temat z zewnątrz: podaje numer KW (opcjonalnie
-- kwotę i wartość), a automat wykonuje trzy kroki tego samego silnika co
-- pipeline analityczny: pobranie KW → właściciele (CEIDG/KRS) → analiza KW
-- silnikiem reguł. Bez analizy ryzyka (ta wymaga pełnego wniosku).
--
-- Sprawdzenie NIE tworzy wniosku w CRM — żyje wyłącznie tutaj, prywatnie
-- dla inwestora. Treść KW trafia do wspólnego cache kw_documents (jak każde
-- pobranie), wyniki kroków 2–3 zapisujemy w wierszu sprawdzenia.
-- Zapis wyłącznie przez service_role (server functions + cron tick).

CREATE TABLE IF NOT EXISTS public.investor_kw_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kw_number text NOT NULL,
  label text,
  loan_amount numeric CHECK (loan_amount IS NULL OR loan_amount >= 0),
  property_value numeric CHECK (property_value IS NULL OR property_value >= 0),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'error')),
  steps jsonb NOT NULL DEFAULT '{}'::jsonb,
  coowners_json jsonb,
  kw_analysis_json jsonb,
  error text,
  last_advanced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS investor_kw_checks_user_idx
  ON public.investor_kw_checks (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS investor_kw_checks_running_idx
  ON public.investor_kw_checks (created_at)
  WHERE status = 'running';

ALTER TABLE public.investor_kw_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS investor_kw_checks_own_select ON public.investor_kw_checks;
CREATE POLICY investor_kw_checks_own_select ON public.investor_kw_checks
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_internal_staff(auth.uid()));

GRANT SELECT ON public.investor_kw_checks TO authenticated;
GRANT ALL ON public.investor_kw_checks TO service_role;
