-- === Propozycje finansowania + pytania o informacje + log dostępu do ===
-- === dokumentów projektu                                             ===
--
-- Propozycja jest zapisywana w NIEZMIENNEJ, wersjonowanej postaci: po złożeniu
-- (submitted_at) parametry kalkulatora, wyniki i oświadczenia nie mogą być
-- edytowane (trigger). Inwestor może wycofać propozycję, utworzyć nową wersję
-- albo odpowiedzieć na kontrpropozycję. Propozycja wiąże się z konkretną
-- wersją projektu. Złożenie propozycji NIE jest zawarciem umowy pożyczki.

CREATE TABLE IF NOT EXISTS public.project_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.investment_projects (id),
  project_version int NOT NULL,
  assignment_id uuid NOT NULL REFERENCES public.project_assignments (id),
  investor_id uuid NOT NULL,
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  parent_proposal_id uuid REFERENCES public.project_proposals (id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'submitted',
    'under_review',
    'additional_information_required',
    'presented_to_borrower',
    'accepted_for_negotiation',
    'counteroffer',
    'rejected',
    'withdrawn',
    'expired',
    'accepted',
    'converted_to_transaction'
  )),
  -- Wejścia kalkulatora (kwota, okres, oprocentowanie, prowizja, sposób
  -- spłaty, raty, zabezpieczenia, warunki, termin ważności…)
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Wyniki wyliczone i ZWERYFIKOWANE serwerowo (harmonogram, suma odsetek,
  -- suma prowizji, raty, LTV, stopa zwrotu, różnica vs kwota oczekiwana).
  computed jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Zaakceptowane oświadczenia przy składaniu: [{kind, accepted_at}]
  statements jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Snapshot analizy ryzyka pokazanej inwestorowi w momencie składania.
  risk_snapshot jsonb,
  valid_until timestamptz,
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid,
  decision_reason text,
  counteroffer jsonb,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_proposals_investor_idx
  ON public.project_proposals (investor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS project_proposals_project_idx
  ON public.project_proposals (project_id, version DESC);
CREATE INDEX IF NOT EXISTS project_proposals_assignment_idx
  ON public.project_proposals (assignment_id);
CREATE INDEX IF NOT EXISTS project_proposals_status_idx
  ON public.project_proposals (status);

-- Niezmienność po złożeniu: parametry/wyniki/oświadczenia/wiązanie z wersją
-- projektu są zamrożone; zmieniać wolno tylko status i pola decyzyjne.
CREATE OR REPLACE FUNCTION public.project_proposals_freeze_submitted()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF OLD.submitted_at IS NOT NULL THEN
    IF NEW.params IS DISTINCT FROM OLD.params
       OR NEW.computed IS DISTINCT FROM OLD.computed
       OR NEW.statements IS DISTINCT FROM OLD.statements
       OR NEW.risk_snapshot IS DISTINCT FROM OLD.risk_snapshot
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.project_version IS DISTINCT FROM OLD.project_version
       OR NEW.assignment_id IS DISTINCT FROM OLD.assignment_id
       OR NEW.investor_id IS DISTINCT FROM OLD.investor_id
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
      RAISE EXCEPTION 'Złożona propozycja jest niezmienna — utwórz nową wersję.';
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS project_proposals_freeze ON public.project_proposals;
CREATE TRIGGER project_proposals_freeze
  BEFORE UPDATE ON public.project_proposals
  FOR EACH ROW EXECUTE FUNCTION public.project_proposals_freeze_submitted();

DROP TRIGGER IF EXISTS project_proposals_touch ON public.project_proposals;
CREATE TRIGGER project_proposals_touch
  BEFORE UPDATE ON public.project_proposals
  FOR EACH ROW EXECUTE FUNCTION public.project_module_touch_updated_at();

-- RLS: inwestor czyta własne propozycje; zapisy wyłącznie server-side.
ALTER TABLE public.project_proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_proposals_owner_select ON public.project_proposals;
CREATE POLICY project_proposals_owner_select ON public.project_proposals
  FOR SELECT TO authenticated
  USING (investor_id = auth.uid() OR public.is_internal_staff(auth.uid()));
DROP POLICY IF EXISTS project_proposals_staff_write ON public.project_proposals;
CREATE POLICY project_proposals_staff_write ON public.project_proposals
  FOR ALL TO authenticated
  USING (public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_internal_staff(auth.uid()));
GRANT SELECT, INSERT, UPDATE ON public.project_proposals TO authenticated;
GRANT ALL ON public.project_proposals TO service_role;

-- ---------------------------------------------------------------------------
-- „Poproś o dodatkowe informacje" — pytanie trafia do obsługi Finance You;
-- bez ujawniania danych kontaktowych pożyczkobiorcy.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_info_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.investment_projects (id),
  assignment_id uuid REFERENCES public.project_assignments (id),
  investor_id uuid NOT NULL,
  question text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'closed')),
  answer text,
  answered_by uuid,
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_info_requests_project_idx
  ON public.project_info_requests (project_id, created_at DESC);

ALTER TABLE public.project_info_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_info_requests_owner_select ON public.project_info_requests;
CREATE POLICY project_info_requests_owner_select ON public.project_info_requests
  FOR SELECT TO authenticated
  USING (investor_id = auth.uid() OR public.is_internal_staff(auth.uid()));
DROP POLICY IF EXISTS project_info_requests_staff_write ON public.project_info_requests;
CREATE POLICY project_info_requests_staff_write ON public.project_info_requests
  FOR ALL TO authenticated
  USING (public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_internal_staff(auth.uid()));
GRANT SELECT, INSERT, UPDATE ON public.project_info_requests TO authenticated;
GRANT ALL ON public.project_info_requests TO service_role;

-- ---------------------------------------------------------------------------
-- Log otwarć i pobrań dokumentów projektu (poufność + znaki wodne po stronie
-- podglądu). Append-only w praktyce: insert przez service_role, odczyt staff.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_document_access_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id uuid NOT NULL,
  assignment_id uuid,
  investor_id uuid NOT NULL,
  document_path text NOT NULL,
  action text NOT NULL DEFAULT 'view' CHECK (action IN ('view', 'download')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_document_access_project_idx
  ON public.project_document_access_log (project_id, created_at DESC);

ALTER TABLE public.project_document_access_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_document_access_staff_select ON public.project_document_access_log;
CREATE POLICY project_document_access_staff_select ON public.project_document_access_log
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));
GRANT SELECT ON public.project_document_access_log TO authenticated;
GRANT INSERT, SELECT ON public.project_document_access_log TO service_role;
