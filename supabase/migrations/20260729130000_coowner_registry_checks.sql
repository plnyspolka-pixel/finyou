-- Moduł „Współwłaściciele (dział II KW) — CEIDG i KRS" (osobna karta wniosku).
-- Dla każdej osoby fizycznej z działu II KW (PESEL z księgi) sprawdzamy:
-- działalność gospodarczą w CEIDG oraz obecność w KRS (weryfikacja odpisem).
-- W result_json PESEL wyłącznie zamaskowany (RODO).

CREATE TABLE public.coowner_registry_checks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL,
  kw_number TEXT,
  result_json JSONB,
  warnings JSONB DEFAULT '[]'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Jedno aktualne sprawdzenie na wniosek (upsert onConflict: application_id).
CREATE UNIQUE INDEX idx_corc_application ON public.coowner_registry_checks(application_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coowner_registry_checks TO authenticated;
GRANT ALL ON public.coowner_registry_checks TO service_role;
ALTER TABLE public.coowner_registry_checks ENABLE ROW LEVEL SECURITY;

-- Dane osobowe współwłaścicieli — dostęp tylko dla kadry.
CREATE POLICY corc_staff_all ON public.coowner_registry_checks FOR ALL TO authenticated
  USING (has_role(auth.uid(),'administrator'::app_role) OR has_role(auth.uid(),'operator'::app_role))
  WITH CHECK (has_role(auth.uid(),'administrator'::app_role) OR has_role(auth.uid(),'operator'::app_role));

CREATE TRIGGER tr_corc_updated BEFORE UPDATE ON public.coowner_registry_checks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
