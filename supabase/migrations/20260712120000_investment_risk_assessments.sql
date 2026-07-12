-- Moduł „Wycena i ocena ryzyka inwestycji" — tabela zbiorcza dossier.
-- Łączy OCR, KW (stan prawny), analizę właściciela (PESEL/trwanie życia),
-- korespondencję, dane rządowe i nadrzędną wycenę Perplexity.

CREATE TABLE public.investment_risk_assessments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL,
  property_id UUID,
  client_id UUID,
  investment_score INTEGER,
  risk_grade TEXT,
  recommendation TEXT,
  result_json JSONB,
  data_sources JSONB DEFAULT '[]'::jsonb,
  warnings JSONB DEFAULT '[]'::jsonb,
  master_valuation_status TEXT,
  error_message TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Jedna aktualna ocena na wniosek (upsert onConflict: application_id).
CREATE UNIQUE INDEX idx_ira_application ON public.investment_risk_assessments(application_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.investment_risk_assessments TO authenticated;
GRANT ALL ON public.investment_risk_assessments TO service_role;
ALTER TABLE public.investment_risk_assessments ENABLE ROW LEVEL SECURITY;

-- Dane wrażliwe (PESEL-derived, korespondencja) — dostęp tylko dla kadry.
CREATE POLICY ira_staff_all ON public.investment_risk_assessments FOR ALL TO authenticated
  USING (has_role(auth.uid(),'administrator'::app_role) OR has_role(auth.uid(),'operator'::app_role))
  WITH CHECK (has_role(auth.uid(),'administrator'::app_role) OR has_role(auth.uid(),'operator'::app_role));

CREATE TRIGGER tr_ira_updated BEFORE UPDATE ON public.investment_risk_assessments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
