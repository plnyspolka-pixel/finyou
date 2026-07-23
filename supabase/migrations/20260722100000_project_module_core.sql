-- === Zamknięty moduł projektów inwestycyjnych — rdzeń (dostęp, aplikacje, ===
-- === screening, akceptacje, ustawienia, audyt)                            ===
--
-- Moduł jest dostępny wyłącznie dla imiennie zweryfikowanych i zatwierdzonych
-- użytkowników (status `approved_investor`). Zakup szkolenia ani płatny
-- abonament inwestora NIE dają dostępu. Wszystkie decyzje przechodzą przez
-- server functions (service_role) i zostawiają wpis w nieusuwalnym logu.
--
-- Migracja jest w 100% addytywna: nie zmienia żadnej istniejącej tabeli,
-- polityki ani funkcji.

-- ---------------------------------------------------------------------------
-- Konfiguracja modułu (jeden wiersz). Progi i limity edytuje administrator.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_module_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- limity kart
  max_active_assignments int NOT NULL DEFAULT 5 CHECK (max_active_assignments > 0),
  max_extended_assignments int NOT NULL DEFAULT 2 CHECK (max_extended_assignments > 0),
  -- czasy (godziny)
  assignment_hours int NOT NULL DEFAULT 24 CHECK (assignment_hours > 0),
  extension_hours int NOT NULL DEFAULT 12 CHECK (extension_hours >= 0),
  proposal_hours int NOT NULL DEFAULT 48 CHECK (proposal_hours > 0),
  -- po ilu odrzuceniach/wygaśnięciach projekt trafia do przeglądu
  rejection_review_threshold int NOT NULL DEFAULT 5 CHECK (rejection_review_threshold > 0),
  -- progi LTV analizy ryzyka (%): do `conservative` — bardzo konserwatywne,
  -- do `acceptable` — akceptowalne, do `elevated` — podwyższone, wyżej — wysokie
  ltv_bands jsonb NOT NULL DEFAULT '{"conservative":35,"acceptable":50,"elevated":60}'::jsonb,
  -- limity walidacji propozycji
  min_period_months int NOT NULL DEFAULT 3,
  max_period_months int NOT NULL DEFAULT 120,
  max_ltv_percent numeric NOT NULL DEFAULT 80,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

INSERT INTO public.project_module_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.project_module_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_module_settings_staff ON public.project_module_settings;
CREATE POLICY project_module_settings_staff ON public.project_module_settings
  FOR ALL TO authenticated
  USING (public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_internal_staff(auth.uid()));
GRANT SELECT, UPDATE ON public.project_module_settings TO authenticated;
GRANT ALL ON public.project_module_settings TO service_role;

-- ---------------------------------------------------------------------------
-- Status użytkownika w module + metadane KYC / screeningu / aktywacji.
-- Brak wiersza = zwykły kursant (course_user) bez dostępu.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_module_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'course_user' CHECK (status IN (
    'course_user',
    'module_application_pending',
    'module_application_rejected',
    'kyc_pending',
    'compliance_review',
    'approved_investor',
    'access_suspended',
    'access_revoked'
  )),
  application_id uuid,
  -- KYC (Didit) — minimalizacja danych: identyfikatory + daty + wynik,
  -- bez kopii dokumentów. Pełna sesja żyje w didit_verifications.
  kyc_session_id text,
  kyc_status text NOT NULL DEFAULT 'not_started' CHECK (kyc_status IN (
    'not_started', 'pending', 'approved', 'manual_review', 'rejected', 'expired'
  )),
  kyc_started_at timestamptz,
  kyc_completed_at timestamptz,
  kyc_result jsonb,
  kyc_scope text NOT NULL DEFAULT 'document+liveness+face_match',
  kyc_updated_at timestamptz,
  -- Screening Dilisense (klasyfikacja; surowe trafienia w project_module_screenings)
  screening_id uuid,
  screening_result text CHECK (screening_result IS NULL OR screening_result IN (
    'clear', 'possible_match', 'manual_review', 'confirmed_sanctions_match', 'pep_review_required'
  )),
  screening_updated_at timestamptz,
  -- Aktywacja (ostateczne uprawnienie nadaje Finance You)
  approved_by uuid,
  approved_at timestamptz,
  approval_reason text,
  access_starts_at timestamptz,
  access_expires_at timestamptz,
  -- Zawieszenie / cofnięcie
  suspended_at timestamptz,
  suspended_reason text,
  revoked_at timestamptz,
  revoked_reason text,
  -- Wersje zaakceptowanych dokumentów w momencie aktywacji: [{kind, version, accepted_at}]
  accepted_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Aktualny profil preferencji inwestora (uzupełniany po pierwszym wejściu do
  -- modułu, edytowalny). Zmiana wpływa na PRZYSZŁE dopasowania — nie zmienia
  -- automatycznie aktywnych przypisań.
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  profile_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_module_access_status_idx
  ON public.project_module_access (status);

ALTER TABLE public.project_module_access ENABLE ROW LEVEL SECURITY;
-- Właściciel: tylko odczyt własnego stanu. Zmiany wyłącznie server-side
-- (service_role) albo personel.
DROP POLICY IF EXISTS project_module_access_owner_select ON public.project_module_access;
CREATE POLICY project_module_access_owner_select ON public.project_module_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_internal_staff(auth.uid()));
DROP POLICY IF EXISTS project_module_access_staff_write ON public.project_module_access;
CREATE POLICY project_module_access_staff_write ON public.project_module_access
  FOR ALL TO authenticated
  USING (public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_internal_staff(auth.uid()));
GRANT SELECT, INSERT, UPDATE ON public.project_module_access TO authenticated;
GRANT ALL ON public.project_module_access TO service_role;

-- ---------------------------------------------------------------------------
-- Aplikacja o dostęp do modułu (formularz preferencji + decyzja admina).
-- Złożenie formularza nie gwarantuje dostępu.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_module_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',                 -- złożona, czeka na przegląd
    'conditionally_qualified', -- warunkowo zakwalifikowana → start KYC
    'needs_more_info',         -- prośba o uzupełnienie
    'additional_review',       -- skierowana do dodatkowej analizy
    'rejected'                 -- odrzucona
  )),
  declared_capital numeric CHECK (declared_capital IS NULL OR declared_capital >= 0),
  min_investment numeric,
  max_investment numeric,
  preferred_period_months_min int,
  preferred_period_months_max int,
  max_ltv_percent numeric,
  property_types text[] NOT NULL DEFAULT '{}',
  locations text[] NOT NULL DEFAULT '{}',         -- miejscowości / województwa / regiony
  expected_return_percent numeric,
  accepted_securities text[] NOT NULL DEFAULT '{}',
  experience text,
  risk_appetite text,
  independent_decision_confirmed boolean NOT NULL DEFAULT false,
  applicant_note text,
  admin_note text,
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_module_applications_user_idx
  ON public.project_module_applications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS project_module_applications_status_idx
  ON public.project_module_applications (status);

ALTER TABLE public.project_module_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_module_applications_owner_select ON public.project_module_applications;
CREATE POLICY project_module_applications_owner_select ON public.project_module_applications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_internal_staff(auth.uid()));
DROP POLICY IF EXISTS project_module_applications_staff_write ON public.project_module_applications;
CREATE POLICY project_module_applications_staff_write ON public.project_module_applications
  FOR ALL TO authenticated
  USING (public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_internal_staff(auth.uid()));
GRANT SELECT, INSERT, UPDATE ON public.project_module_applications TO authenticated;
GRANT ALL ON public.project_module_applications TO service_role;

-- ---------------------------------------------------------------------------
-- Screening Dilisense (sankcje / PEP / rodzina PEP / współpracownicy PEP).
-- Surowe trafienia widzi WYŁĄCZNIE personel — inwestor zna tylko klasyfikację
-- swojego stanu w module.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_module_screenings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  application_id uuid,
  subject_name text NOT NULL,
  dob text,
  query jsonb,
  raw_result jsonb,
  total_hits int NOT NULL DEFAULT 0,
  result text NOT NULL DEFAULT 'manual_review' CHECK (result IN (
    'clear', 'possible_match', 'manual_review', 'confirmed_sanctions_match', 'pep_review_required'
  )),
  sources_checked text[] NOT NULL DEFAULT '{sanctions,pep,pep_family,pep_associates,criminal,other}',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_module_screenings_user_idx
  ON public.project_module_screenings (user_id, created_at DESC);

ALTER TABLE public.project_module_screenings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_module_screenings_staff ON public.project_module_screenings;
CREATE POLICY project_module_screenings_staff ON public.project_module_screenings
  FOR ALL TO authenticated
  USING (public.is_internal_staff(auth.uid()))
  WITH CHECK (public.is_internal_staff(auth.uid()));
GRANT SELECT, INSERT, UPDATE ON public.project_module_screenings TO authenticated;
GRANT ALL ON public.project_module_screenings TO service_role;

-- ---------------------------------------------------------------------------
-- Wersjonowane akceptacje dokumentów (umowa dostępu, NDA, poufność, RODO,
-- ostrzeżenie o ryzyku, samodzielność decyzji, zakaz udostępniania konta).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_module_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN (
    'access_agreement', 'nda', 'confidentiality', 'data_processing',
    'risk_warning', 'independent_decision', 'no_account_sharing'
  )),
  version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  user_agent text,
  UNIQUE (user_id, kind, version)
);

ALTER TABLE public.project_module_acceptances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_module_acceptances_owner_select ON public.project_module_acceptances;
CREATE POLICY project_module_acceptances_owner_select ON public.project_module_acceptances
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_internal_staff(auth.uid()));
GRANT SELECT ON public.project_module_acceptances TO authenticated;
GRANT ALL ON public.project_module_acceptances TO service_role;

-- ---------------------------------------------------------------------------
-- Nieusuwalny log audytowy modułu (wzorzec aml_audit_log: append-only,
-- trigger blokuje UPDATE i DELETE nawet dla właściciela).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_module_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid,            -- kto wykonał (użytkownik / admin / NULL = system)
  subject_user_id uuid,     -- kogo dotyczy (inwestor)
  entity_type text NOT NULL, -- access | application | screening | project | assignment | proposal | document | settings
  entity_id text,
  action text NOT NULL,
  previous_status text,
  new_status text,
  reason text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_module_audit_entity_idx
  ON public.project_module_audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS project_module_audit_subject_idx
  ON public.project_module_audit_log (subject_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.project_module_audit_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  RAISE EXCEPTION 'project_module_audit_log jest append-only (operacja % zabroniona)', TG_OP;
END $fn$;

DROP TRIGGER IF EXISTS project_module_audit_no_update ON public.project_module_audit_log;
CREATE TRIGGER project_module_audit_no_update
  BEFORE UPDATE OR DELETE ON public.project_module_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.project_module_audit_immutable();

ALTER TABLE public.project_module_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_module_audit_staff_select ON public.project_module_audit_log;
CREATE POLICY project_module_audit_staff_select ON public.project_module_audit_log
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));
GRANT SELECT ON public.project_module_audit_log TO authenticated;
GRANT INSERT, SELECT ON public.project_module_audit_log TO service_role;

-- ---------------------------------------------------------------------------
-- Cache Dilisense — klient src/lib/aml/dilisense.server.ts już z niej korzysta,
-- ale tabela nie miała dotąd migracji. Tworzymy idempotentnie; dostęp tylko
-- service_role (RLS włączone bez polityk dla użytkowników).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dilisense_cache (
  cache_key text PRIMARY KEY,
  search_type text NOT NULL,
  query jsonb,
  result jsonb,
  total_hits int NOT NULL DEFAULT 0,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  error_code text,
  error_message text
);

ALTER TABLE public.dilisense_cache ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.dilisense_cache TO service_role;

-- updated_at — wspólny trigger modułu
CREATE OR REPLACE FUNCTION public.project_module_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN NEW.updated_at := now(); RETURN NEW; END $fn$;

DROP TRIGGER IF EXISTS project_module_access_touch ON public.project_module_access;
CREATE TRIGGER project_module_access_touch
  BEFORE UPDATE ON public.project_module_access
  FOR EACH ROW EXECUTE FUNCTION public.project_module_touch_updated_at();

DROP TRIGGER IF EXISTS project_module_applications_touch ON public.project_module_applications;
CREATE TRIGGER project_module_applications_touch
  BEFORE UPDATE ON public.project_module_applications
  FOR EACH ROW EXECUTE FUNCTION public.project_module_touch_updated_at();

DROP TRIGGER IF EXISTS project_module_settings_touch ON public.project_module_settings;
CREATE TRIGGER project_module_settings_touch
  BEFORE UPDATE ON public.project_module_settings
  FOR EACH ROW EXECUTE FUNCTION public.project_module_touch_updated_at();
