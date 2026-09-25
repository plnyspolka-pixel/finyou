-- Szybka analiza wniosku spoza Finance You: pełna ocena ryzyka (krok 4).
--
-- Sprawdzenie inwestora (investor_kw_checks) przechodzi teraz wszystkie
-- cztery kroki pipeline'u — także ocenę ryzyka z wyceną rynkową, sprzedażą
-- wymuszoną i zbywalnością (lib/risk-assessment, assessInvestmentRisk).
-- Wycena potrzebuje rodzaju nieruchomości; okres pożyczki zasila horyzont
-- analizy właściciela. Wynik oceny zapisujemy w wierszu sprawdzenia — nie
-- w investment_risk_assessments (ta tabela jest kluczowana wnioskiem z CRM).

ALTER TABLE public.investor_kw_checks
  ADD COLUMN IF NOT EXISTS property_type text,
  ADD COLUMN IF NOT EXISTS period_months integer
    CHECK (period_months IS NULL OR (period_months BETWEEN 1 AND 600)),
  ADD COLUMN IF NOT EXISTS risk_json jsonb;
