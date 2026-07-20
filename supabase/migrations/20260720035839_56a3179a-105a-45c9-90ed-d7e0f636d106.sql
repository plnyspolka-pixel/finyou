-- MODUŁ AML — pełna migracja bez INSERT do storage.buckets (bucket tworzony osobno).

-- 1. ENUMY
DO $$ BEGIN CREATE TYPE public.aml_screening_status AS ENUM ('not_started','in_progress','clear','review_required','approved_after_review','blocked','error','invalidated'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.aml_hit_resolution AS ENUM ('false_positive','confirmed_pep','confirmed_sanction','confirmed_criminal','unresolved'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.aml_risk_level AS ENUM ('low','standard','high','unacceptable'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.aml_transaction_type AS ENUM ('wyplata_finansowania','splata_kapitalu','odsetki','oplaty','wplata_gotowkowa','wyplata_gotowkowa','przelew_przychodzacy','przelew_wychodzacy','inna_operacja'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.aml_transaction_source AS ENUM ('auto','manual','bank_integration'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.aml_threshold_decision AS ENUM ('reportable','not_reportable','verification_required','report_prepared','submitted','accepted','correction_required'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.aml_case_status AS ENUM ('new','in_analysis','awaiting_information','no_basis_for_report','suspicion_confirmed','report_in_preparation','ready_for_signature','signed','submitted','upo_received','rejected','correction_required','closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.aml_report_type AS ENUM ('transakcja_ponadprogowa','okolicznosci_podejrzane','planowana_transakcja_podejrzana','transakcja_przeprowadzona'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.aml_report_status AS ENUM ('draft','complete','content_approved','awaiting_signature','signed','encrypted','queued','submitted','status_pending','accepted','upo_received','rejected','correction_required','error'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.aml_queue_state AS ENUM ('pending','in_flight','retry_scheduled','delivered','failed','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.aml_giif_connection_status AS ENUM ('not_connected','registration_in_progress','csr_generated','documents_signed','submitted_to_giif','certificate_issued','mtls_verified','active','expired','error'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. USTAWIENIA
CREATE TABLE IF NOT EXISTS public.aml_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  responsible_person jsonb NOT NULL DEFAULT '{}'::jsonb,
  additional_person jsonb,
  signer_person jsonb,
  institution jsonb NOT NULL DEFAULT '{}'::jsonb,
  giif_connection_status public.aml_giif_connection_status NOT NULL DEFAULT 'not_connected',
  giif_institution_id text,
  giif_environment text NOT NULL DEFAULT 'test' CHECK (giif_environment IN ('test','production')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. KLIENCI
CREATE TABLE IF NOT EXISTS public.aml_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid,
  loan_application_id uuid,
  entity_type text NOT NULL DEFAULT 'osoba_fizyczna' CHECK (entity_type IN ('osoba_fizyczna','firma')),
  first_name text, last_name text, company_name text,
  pesel text, dob date, nip text, krs text, regon text,
  document_type text, document_number text,
  address text, country_residence text NOT NULL DEFAULT 'PL',
  country_activity text NOT NULL DEFAULT 'PL',
  citizenship text,
  financing_purpose text,
  repayment_source text,
  crbr_data jsonb,
  beneficial_owners jsonb NOT NULL DEFAULT '[]'::jsonb,
  representatives jsonb NOT NULL DEFAULT '[]'::jsonb,
  crbr_discrepancies jsonb NOT NULL DEFAULT '[]'::jsonb,
  crbr_fetched_at timestamptz,
  screening_status public.aml_screening_status NOT NULL DEFAULT 'not_started',
  pep_status boolean,
  sanction_hit boolean,
  risk_level public.aml_risk_level,
  risk_assessed_at timestamptz,
  screening_fingerprint text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aml_customers_user_idx ON public.aml_customers (user_id);

-- 4. SCREENINGI
CREATE TABLE IF NOT EXISTS public.aml_screenings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.aml_customers(id) ON DELETE CASCADE,
  subject_kind text NOT NULL DEFAULT 'customer' CHECK (subject_kind IN ('customer','representative','beneficial_owner')),
  subject_name text NOT NULL,
  subject_dob date,
  search_type text NOT NULL CHECK (search_type IN ('individual','entity')),
  query jsonb NOT NULL,
  raw_result jsonb,
  total_hits integer,
  status public.aml_screening_status NOT NULL DEFAULT 'in_progress',
  hit_resolution public.aml_hit_resolution,
  resolution_note text,
  resolved_by uuid,
  resolved_at timestamptz,
  invalidated_at timestamptz,
  invalidated_reason text,
  fingerprint text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aml_screenings_customer_idx ON public.aml_screenings (customer_id);
CREATE INDEX IF NOT EXISTS aml_screenings_user_idx ON public.aml_screenings (user_id);

-- 5. RYZYKO
CREATE TABLE IF NOT EXISTS public.aml_risk_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.aml_customers(id) ON DELETE CASCADE,
  proposed_level public.aml_risk_level NOT NULL,
  proposed_factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  final_level public.aml_risk_level NOT NULL,
  override_justification text,
  decided_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aml_risk_override_justified CHECK (final_level = proposed_level OR (override_justification IS NOT NULL AND length(trim(override_justification)) > 0))
);
CREATE INDEX IF NOT EXISTS aml_risk_customer_idx ON public.aml_risk_assessments (customer_id);

-- 6. TRANSAKCJE
CREATE TABLE IF NOT EXISTS public.aml_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  customer_id uuid REFERENCES public.aml_customers(id) ON DELETE SET NULL,
  contract_ref text,
  loan_application_id uuid,
  transaction_type public.aml_transaction_type NOT NULL,
  source public.aml_transaction_source NOT NULL DEFAULT 'manual',
  transaction_date date NOT NULL,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'PLN',
  eur_equivalent numeric(18,2),
  nbp_rate numeric(12,6),
  nbp_table_no text,
  nbp_table_date date,
  above_threshold boolean NOT NULL DEFAULT false,
  counterparty_name text,
  sender_account text,
  receiver_account text,
  description text,
  executed boolean NOT NULL DEFAULT false,
  execution_confirmed_by uuid,
  execution_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aml_transactions_user_idx ON public.aml_transactions (user_id);
CREATE INDEX IF NOT EXISTS aml_transactions_customer_idx ON public.aml_transactions (customer_id);

-- 7. PONADPROGOWE
CREATE TABLE IF NOT EXISTS public.aml_threshold_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  transaction_id uuid NOT NULL UNIQUE REFERENCES public.aml_transactions(id) ON DELETE CASCADE,
  eur_equivalent numeric(18,2) NOT NULL,
  nbp_rate numeric(12,6) NOT NULL,
  nbp_table_no text NOT NULL,
  nbp_table_date date NOT NULL,
  deadline_at timestamptz NOT NULL,
  decision public.aml_threshold_decision,
  decision_note text,
  decided_by uuid,
  decided_at timestamptz,
  reported_by_bank boolean NOT NULL DEFAULT false,
  report_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aml_threshold_user_idx ON public.aml_threshold_entries (user_id);

-- 8. SPRAWY
CREATE TABLE IF NOT EXISTS public.aml_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  case_no text NOT NULL,
  title text NOT NULL,
  status public.aml_case_status NOT NULL DEFAULT 'new',
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('customer','screening','crbr_discrepancy','risk_assessment','transaction','threshold_register','manual')),
  customer_id uuid REFERENCES public.aml_customers(id) ON DELETE SET NULL,
  screening_id uuid REFERENCES public.aml_screenings(id) ON DELETE SET NULL,
  risk_assessment_id uuid REFERENCES public.aml_risk_assessments(id) ON DELETE SET NULL,
  threshold_entry_id uuid REFERENCES public.aml_threshold_entries(id) ON DELETE SET NULL,
  contract_ref text,
  parties jsonb NOT NULL DEFAULT '[]'::jsonb,
  accounts jsonb NOT NULL DEFAULT '[]'::jsonb,
  amounts jsonb NOT NULL DEFAULT '[]'::jsonb,
  description text,
  chronology jsonb NOT NULL DEFAULT '[]'::jsonb,
  justification text,
  decisions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aml_cases_user_idx ON public.aml_cases (user_id);

CREATE TABLE IF NOT EXISTS public.aml_case_transactions (
  case_id uuid NOT NULL REFERENCES public.aml_cases(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.aml_transactions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  PRIMARY KEY (case_id, transaction_id)
);

-- 9. ZGŁOSZENIA
CREATE TABLE IF NOT EXISTS public.aml_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  case_id uuid REFERENCES public.aml_cases(id) ON DELETE SET NULL,
  threshold_entry_id uuid REFERENCES public.aml_threshold_entries(id) ON DELETE SET NULL,
  report_type public.aml_report_type NOT NULL,
  status public.aml_report_status NOT NULL DEFAULT 'draft',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  completeness jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_version integer NOT NULL DEFAULT 0,
  xml_storage_path text,
  pdf_storage_path text,
  xml_sha256 text,
  pdf_sha256 text,
  content_approved_by uuid,
  content_approved_at timestamptz,
  signed_storage_path text,
  signed_sha256 text,
  signature_verified_at timestamptz,
  signer_subject text,
  encryption_cert_fingerprint text,
  giif_submission_id text,
  submitted_at timestamptz,
  giif_status text,
  giif_status_checked_at timestamptz,
  upo_storage_path text,
  upo_received_at timestamptz,
  giif_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aml_reports_user_idx ON public.aml_reports (user_id);
CREATE INDEX IF NOT EXISTS aml_reports_case_idx ON public.aml_reports (case_id);

CREATE TABLE IF NOT EXISTS public.aml_report_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  report_id uuid NOT NULL REFERENCES public.aml_reports(id) ON DELETE CASCADE,
  version integer NOT NULL,
  payload jsonb NOT NULL,
  xml_sha256 text,
  pdf_sha256 text,
  xml_storage_path text,
  pdf_storage_path text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, version)
);

CREATE TABLE IF NOT EXISTS public.aml_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  case_id uuid REFERENCES public.aml_cases(id) ON DELETE CASCADE,
  report_id uuid REFERENCES public.aml_reports(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  content_type text,
  size_bytes bigint,
  sha256 text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aml_attachments_user_idx ON public.aml_attachments (user_id);

-- 10. KOLEJKA
CREATE TABLE IF NOT EXISTS public.aml_submission_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  report_id uuid NOT NULL REFERENCES public.aml_reports(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL UNIQUE,
  state public.aml_queue_state NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 8,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  last_http_status integer,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aml_queue_state_idx ON public.aml_submission_queue (state, next_attempt_at);

-- 11. CERTYFIKATY
CREATE TABLE IF NOT EXISTS public.aml_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  environment text NOT NULL DEFAULT 'test' CHECK (environment IN ('test','production')),
  status text NOT NULL DEFAULT 'csr_generated' CHECK (status IN ('csr_generated','requested','issued','active','expiring','expired','revoked','error')),
  kms_key_ref text NOT NULL,
  csr_pem text NOT NULL,
  certificate_pem text,
  subject_dn text,
  serial_number text,
  valid_from timestamptz,
  valid_to timestamptz,
  matches_csr boolean,
  mtls_tested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aml_certificates_user_idx ON public.aml_certificates (user_id);

-- 12. AUDIT LOG
CREATE TABLE IF NOT EXISTS public.aml_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  actor_id uuid,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aml_audit_user_idx ON public.aml_audit_log (user_id, created_at);
CREATE INDEX IF NOT EXISTS aml_audit_entity_idx ON public.aml_audit_log (entity_type, entity_id);

CREATE OR REPLACE FUNCTION public.aml_audit_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN RAISE EXCEPTION 'aml_audit_log jest nieusuwalny (append-only)'; END $fn$;

DROP TRIGGER IF EXISTS aml_audit_no_update ON public.aml_audit_log;
CREATE TRIGGER aml_audit_no_update BEFORE UPDATE OR DELETE ON public.aml_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.aml_audit_immutable();

-- 13. updated_at
CREATE OR REPLACE FUNCTION public.aml_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN NEW.updated_at := now(); RETURN NEW; END $fn$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['aml_settings','aml_customers','aml_transactions','aml_cases','aml_reports','aml_submission_queue','aml_certificates'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_touch ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER %I_touch BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.aml_touch_updated_at()', t, t);
  END LOOP;
END $$;

-- 14. RLS na tabelach AML
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['aml_settings','aml_customers','aml_screenings','aml_risk_assessments','aml_transactions','aml_threshold_entries','aml_cases','aml_case_transactions','aml_reports','aml_report_versions','aml_attachments','aml_submission_queue','aml_certificates'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_owner_all ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_owner_all ON public.%I FOR ALL TO authenticated USING (user_id = auth.uid() OR public.is_internal_staff(auth.uid())) WITH CHECK (user_id = auth.uid() OR public.is_internal_staff(auth.uid()))', t, t);
  END LOOP;
END $$;

ALTER TABLE public.aml_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aml_audit_select ON public.aml_audit_log;
CREATE POLICY aml_audit_select ON public.aml_audit_log FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_internal_staff(auth.uid()));
DROP POLICY IF EXISTS aml_audit_insert ON public.aml_audit_log;
CREATE POLICY aml_audit_insert ON public.aml_audit_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_internal_staff(auth.uid()));

-- 15. STORAGE POLICIES (bucket aml-private utworzony osobno)
DROP POLICY IF EXISTS aml_private_select ON storage.objects;
CREATE POLICY aml_private_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'aml-private' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_internal_staff(auth.uid())));
DROP POLICY IF EXISTS aml_private_insert ON storage.objects;
CREATE POLICY aml_private_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'aml-private' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_internal_staff(auth.uid())));
DROP POLICY IF EXISTS aml_private_update ON storage.objects;
CREATE POLICY aml_private_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'aml-private' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_internal_staff(auth.uid())));
DROP POLICY IF EXISTS aml_private_delete ON storage.objects;
CREATE POLICY aml_private_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'aml-private' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_internal_staff(auth.uid())));

-- 16. Numeracja spraw
CREATE OR REPLACE FUNCTION public.aml_next_case_no(_user_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT 'AML/' || to_char(now(), 'YYYY') || '/' ||
    (COALESCE((SELECT count(*) FROM public.aml_cases WHERE user_id = _user_id AND date_part('year', created_at) = date_part('year', now())), 0) + 1)::text;
$fn$;

-- 17. GRANTS
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['aml_settings','aml_customers','aml_screenings','aml_risk_assessments','aml_transactions','aml_threshold_entries','aml_cases','aml_case_transactions','aml_reports','aml_report_versions','aml_attachments','aml_submission_queue','aml_certificates'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT ON public.aml_audit_log TO authenticated;
GRANT ALL ON public.aml_audit_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.aml_audit_log_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.aml_audit_log_id_seq TO service_role;