-- === Wewnętrzna pula projektów inwestycyjnych + wersjonowanie ===
--
-- Pula jest NIEWIDOCZNA dla inwestorów: tabela nie ma ŻADNEJ polityki SELECT
-- dla roli inwestora. Dane projektu (teaser karty albo pełna karta) zwracają
-- wyłącznie server functions po serwerowej weryfikacji aktywnego przypisania.
-- Tylko projekty `available_internal_pool` z zaakceptowanym zdjęciem głównym
-- podlegają dopasowaniu.

CREATE TABLE IF NOT EXISTS public.investment_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'under_review',
    'available_internal_pool',
    'temporarily_assigned',
    'initial_interest',
    'full_offer_review',
    'offer_submitted',
    'paused',
    'withdrawn',
    'financed',
    'closed'
  )),
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  -- luźny link do źródłowego wniosku pożyczkowego (bez twardego FK — jak
  -- didit_verifications ↔ aml_customers)
  loan_application_id uuid,

  -- === Teaser karty (jedyne dane widoczne przed wyrażeniem zainteresowania) ===
  main_photo_path text,                       -- klucz w prywatnym buckecie pliki-klienta
  photo_approved boolean NOT NULL DEFAULT false,
  amount numeric NOT NULL CHECK (amount > 0), -- kwota potrzebnego finansowania
  property_type text NOT NULL,                -- wartości jak enum property_type
  city text NOT NULL,                         -- miejscowość
  voivodeship text,

  -- === Szczegóły (dostępne dopiero po wyrażeniu zainteresowania) ===
  financing_purpose text,
  period_months int,
  interest_rate_percent numeric,
  property_value numeric CHECK (property_value IS NULL OR property_value > 0),
  valuation_source text,
  valuation_date date,
  ltv_percent numeric,
  security_type text,
  mortgage_position text,
  other_encumbrances text,
  legal_status_note text,
  borrower_business_form text,
  borrower_business_since date,
  repayment_source text,
  repayment_type text,                        -- ratalna / balonowa
  borrower_history text,                      -- historia współpracy z Finance You
  additional_conditions text,

  -- kompletność dokumentów + dokumenty dostępne w pełnej karcie
  docs_complete boolean NOT NULL DEFAULT false,
  docs_completeness_note text,
  available_documents jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{label, path}]
  missing_information jsonb NOT NULL DEFAULT '[]'::jsonb, -- ["brak aktualnego operatu", ...]

  -- parametry algorytmu dopasowania (nadpisania/wagi)
  matching_params jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- licznik odrzuceń + wygaśnięć od ostatniego przeglądu (próg w ustawieniach)
  rejection_count int NOT NULL DEFAULT 0,
  last_assigned_at timestamptz,

  paused_reason text,
  withdrawn_reason text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS investment_projects_status_idx
  ON public.investment_projects (status);
CREATE INDEX IF NOT EXISTS investment_projects_loan_app_idx
  ON public.investment_projects (loan_application_id);

-- RLS: WYŁĄCZNIE personel wewnętrzny. Brak polityk dla inwestorów = pula
-- niewidoczna nawet przy bezpośrednim zapytaniu przez PostgREST.
ALTER TABLE public.investment_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS investment_projects_staff ON public.investment_projects;
CREATE POLICY investment_projects_staff ON public.investment_projects
  FOR ALL TO authenticated
  USING (public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_internal_staff(auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.investment_projects TO authenticated;
GRANT ALL ON public.investment_projects TO service_role;

DROP TRIGGER IF EXISTS investment_projects_touch ON public.investment_projects;
CREATE TRIGGER investment_projects_touch
  BEFORE UPDATE ON public.investment_projects
  FOR EACH ROW EXECUTE FUNCTION public.project_module_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Snapshoty wersji projektu. Każda istotna zmiana parametrów (kwota, LTV,
-- zabezpieczenie, okres, nieruchomość) tworzy nową wersję; propozycje wiążą
-- się z konkretną wersją. Nie zmieniamy po cichu warunków przedstawionych
-- inwestorowi.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.investment_project_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.investment_projects (id) ON DELETE CASCADE,
  version int NOT NULL CHECK (version >= 1),
  snapshot jsonb NOT NULL,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);

ALTER TABLE public.investment_project_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS investment_project_versions_staff ON public.investment_project_versions;
CREATE POLICY investment_project_versions_staff ON public.investment_project_versions
  FOR ALL TO authenticated
  USING (public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_internal_staff(auth.uid()));
GRANT SELECT, INSERT ON public.investment_project_versions TO authenticated;
GRANT ALL ON public.investment_project_versions TO service_role;
