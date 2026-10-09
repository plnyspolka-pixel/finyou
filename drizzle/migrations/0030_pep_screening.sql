-- =====================================================================
-- Moduł screeningu PEP i list sankcyjnych (Finance You jako instytucja
-- obowiązana, ustawa AML z 1 marca 2018 r.).
--
-- Zasady:
--  * dane referencyjne (listy PEP, listy sankcyjne) pobieramy z publicznych
--    źródeł dopuszczających użycie komercyjne; danych klientów NIE wysyłamy
--    do żadnego zewnętrznego API — dopasowanie liczymy u siebie;
--  * automat zamyka sam wyłącznie „brak trafień”; każde trafienie ≥ progu
--    oraz każde oświadczenie „tak” tworzy sprawę do decyzji człowieka;
--  * screening_audit_log jest append-only (RLS bez polityk UPDATE/DELETE
--    + trigger blokujący UPDATE/DELETE także dla service_role).
-- Zapis do tabel odbywa się z serwera (service_role) po sprawdzeniu
-- uprawnień personelu; personel ma odczyt przez RLS.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ---------------------------------------------------------------------
-- 1. Ustawienia (singleton) — progi, częstotliwości, adresy, źródła
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.screening_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- progi scoringu (0–100)
  possible_match_threshold int NOT NULL DEFAULT 70,
  strong_match_threshold int NOT NULL DEFAULT 90,
  -- składniki scoringu
  dob_exact_bonus int NOT NULL DEFAULT 10,
  dob_year_bonus int NOT NULL DEFAULT 5,
  dob_mismatch_penalty int NOT NULL DEFAULT 25,
  nationality_bonus int NOT NULL DEFAULT 3,
  -- PEP: ile miesięcy po zakończeniu funkcji osoba nadal jest PEP
  pep_grace_months int NOT NULL DEFAULT 12,
  -- Wikidata: pomijamy stanowiska zakończone przed tym rokiem (były PEP > N lat)
  wikidata_min_end_year int NOT NULL DEFAULT 2000,
  -- wstępna selekcja pg_trgm
  candidate_min_similarity numeric(4,3) NOT NULL DEFAULT 0.35,
  candidate_limit int NOT NULL DEFAULT 60,
  -- powiadomienia
  aml_officer_emails text[] NOT NULL DEFAULT '{}',
  board_emails text[] NOT NULL DEFAULT '{}',
  -- źródła: adresy, tokeny, przełączniki (bez sekretów — token UE trzymamy w env)
  sources jsonb NOT NULL DEFAULT '{
    "sejm_api": {"enabled": true, "base_url": "https://api.sejm.gov.pl/sejm", "terms_back": 3},
    "wikidata": {"enabled": true, "endpoint": "https://query.wikidata.org/sparql", "page_size": 5000},
    "senat": {"enabled": false, "url": "https://www.senat.gov.pl/sklad/senatorowie/"},
    "kprm": {"enabled": true, "url": "https://www.gov.pl/web/premier/sklad-rady-ministrow"},
    "krs": {"enabled": false, "base_url": "https://api-krs.ms.gov.pl/api/krs", "krs_numbers": []},
    "eu_fsf": {"enabled": true, "url": "https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content"},
    "un_sc": {"enabled": true, "url": "https://scsanctions.un.org/resources/xml/en/consolidated.xml"},
    "mswia": {"enabled": true, "url": "https://www.gov.pl/web/mswia/lista-osob-i-podmiotow-objetych-sankcjami"},
    "ofac_sdn": {"enabled": false, "sdn_url": "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV", "alt_url": "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/ALT.CSV"}
  }'::jsonb,
  -- częstotliwości (opis harmonogramu; pg_cron trzyma faktyczny harmonogram)
  frequencies jsonb NOT NULL DEFAULT '{
    "sejm_api": "weekly", "wikidata": "weekly", "senat": "monthly", "kprm": "weekly",
    "krs": "monthly", "eu_fsf": "daily", "un_sc": "daily", "mswia": "daily", "ofac_sdn": "daily",
    "pep_rescreening": "weekly", "sanctions_rescreening": "on_change"
  }'::jsonb,
  -- alert, gdy import nie powiódł się dłużej niż N cykli
  import_alert_failed_cycles int NOT NULL DEFAULT 2,
  -- wersja treści oświadczenia PEP obowiązująca w formularzach
  declaration_text_version text NOT NULL DEFAULT 'pep-2026-10-v1',
  -- User-Agent dla źródeł (Wikidata wymaga kontaktu)
  http_user_agent text NOT NULL DEFAULT 'FinanceYouAMLScreening/1.0 (+https://financeyou.pl; aml)',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.screening_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Historia importów źródeł
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.screening_source_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','success','unchanged','failed')),
  record_count int,
  upserted_count int,
  deactivated_count int,
  file_checksum text,
  changed boolean,
  attempts int NOT NULL DEFAULT 1,
  error text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS screening_source_imports_source_idx
  ON public.screening_source_imports (source, started_at DESC);

-- ---------------------------------------------------------------------
-- 3. Katalog stanowisk PEP (krajowy wykaz — rozporządzenie MF)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pep_position_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,               -- np. 'PL-007' (pkt wykazu) / 'INT-...'
  position_name text NOT NULL,
  category text NOT NULL,                   -- litera art. 2 ust. 2 pkt 11 / grupa
  scope text NOT NULL DEFAULT 'domestic' CHECK (scope IN ('domestic','foreign','international')),
  legal_basis text,
  data_sources text[] NOT NULL DEFAULT '{}', -- 'sejm_api','wikidata','senat','kprm','krs'
  wikidata_ids text[] NOT NULL DEFAULT '{}',
  wikidata_mode text NOT NULL DEFAULT 'direct' CHECK (wikidata_mode IN ('direct','subclass_pl','subclass_any')),
  gap_notes text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 4. Warstwa referencyjna — osoby PEP (wszystkie źródła, pole source)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pep_reference_persons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,                     -- 'sejm_api' | 'wikidata' | 'senat' | 'kprm' | 'krs'
  source_id text NOT NULL,
  full_name text NOT NULL,
  normalized_name text NOT NULL,
  aliases jsonb NOT NULL DEFAULT '[]'::jsonb,
  birth_date date,
  birth_year int,
  nationality text[] NOT NULL DEFAULT '{}', -- kody ISO-3166 alpha-2
  positions jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{title, catalog_code, from, to}]
  latest_position_end date,                 -- null = pełni funkcję (lub brak daty)
  is_current boolean NOT NULL DEFAULT false,
  source_url text,
  record_hash text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,  -- false = zniknął ze źródła (zachowany do audytu)
  UNIQUE (source, source_id)
);
CREATE INDEX IF NOT EXISTS pep_reference_persons_norm_trgm
  ON public.pep_reference_persons USING gin (normalized_name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS pep_reference_persons_positions_gin
  ON public.pep_reference_persons USING gin (positions jsonb_path_ops);

-- ---------------------------------------------------------------------
-- 5. Warstwa referencyjna — listy sankcyjne
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sanctions_reference_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_name text NOT NULL,                  -- 'eu_fsf' | 'un_sc' | 'mswia' | 'ofac_sdn'
  source_id text NOT NULL,
  entity_type text NOT NULL DEFAULT 'person' CHECK (entity_type IN ('person','entity','vessel','aircraft','unknown')),
  names jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{name, first, last, strong, lang}]
  primary_name text NOT NULL,
  birth_dates jsonb NOT NULL DEFAULT '[]'::jsonb, -- ['1973-10-05', '1960', ...]
  nationalities text[] NOT NULL DEFAULT '{}',
  programme text,
  listed_at date,
  delisted_at date,
  remarks text,
  source_url text,
  record_hash text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  file_checksum text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (list_name, source_id)
);

-- ---------------------------------------------------------------------
-- 6. Indeks nazw (klucze dopasowania) — wstępna selekcja pg_trgm
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.screening_name_index (
  id bigserial PRIMARY KEY,
  reference_type text NOT NULL CHECK (reference_type IN ('pep','sanction')),
  reference_id uuid NOT NULL,
  name_key text NOT NULL,                   -- znormalizowany wariant nazwy
  surname_key text,                         -- znormalizowane nazwisko (jeśli znane)
  is_active boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS screening_name_index_key_trgm
  ON public.screening_name_index USING gin (name_key extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS screening_name_index_surname_trgm
  ON public.screening_name_index USING gin (surname_key extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS screening_name_index_ref
  ON public.screening_name_index (reference_type, reference_id);

-- ---------------------------------------------------------------------
-- 7. Podmioty screeningu (klient, inwestor, BO, reprezentant, osoba
--    powiązana wskazana w oświadczeniu). Dane z tabel źródłowych są
--    synchronizowane przez serwer; subject_fingerprint zmienia się, gdy
--    zmieniają się dane wpływające na dopasowanie.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.screening_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN
    ('client','client_company','investor','investor_company','beneficial_owner','representative','related_person')),
  kind text NOT NULL DEFAULT 'person' CHECK (kind IN ('person','entity')),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  investor_id uuid REFERENCES public.investors(id) ON DELETE SET NULL,
  parent_subject_id uuid REFERENCES public.screening_subjects(id) ON DELETE SET NULL,
  source_key text NOT NULL,                 -- stabilny klucz synchronizacji, np. 'client:<uuid>'
  first_name text,
  last_name text,
  full_name text NOT NULL,
  birth_date date,
  birth_year int,
  nationality text[] NOT NULL DEFAULT '{}',
  relation text,                            -- dla related_person: 'family' | 'associate'; BO: rola
  subject_fingerprint text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_key)
);
CREATE INDEX IF NOT EXISTS screening_subjects_client_idx ON public.screening_subjects (client_id);
CREATE INDEX IF NOT EXISTS screening_subjects_investor_idx ON public.screening_subjects (investor_id);
CREATE INDEX IF NOT EXISTS screening_subjects_parent_idx ON public.screening_subjects (parent_subject_id);

-- Aktualny status podmiotu (PEP / sankcje / wstrzymanie / EDD)
CREATE TABLE IF NOT EXISTS public.screening_subject_status (
  subject_id uuid PRIMARY KEY REFERENCES public.screening_subjects(id) ON DELETE CASCADE,
  pep_status text NOT NULL DEFAULT 'unknown' CHECK (pep_status IN
    ('unknown','none','pep','former_pep','family_member','close_associate')),
  sanctions_status text NOT NULL DEFAULT 'unknown' CHECK (sanctions_status IN ('unknown','none','hit')),
  operations_hold boolean NOT NULL DEFAULT false,
  hold_reason text,
  hold_case_id uuid,
  enhanced_monitoring boolean NOT NULL DEFAULT false,
  board_approval_required boolean NOT NULL DEFAULT false,
  board_approved_by uuid,
  board_approved_at timestamptz,
  board_approval_note text,
  source_of_wealth text,
  source_of_funds text,
  sow_attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_screened_at timestamptz,
  last_run_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 8. Oświadczenia PEP (niezmienialne po zapisie)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pep_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('client','investor')),
  subject_id uuid NOT NULL,                 -- clients.id / investors.id
  loan_application_id uuid REFERENCES public.loan_applications(id) ON DELETE SET NULL,
  -- {is_pep: bool, pep_position_code, pep_position_label, is_family_member: bool, is_close_associate: bool,
  --  criminal_liability_acknowledged: true}
  answers jsonb NOT NULL,
  -- [{relation:'family'|'associate', family_relation, first_name, last_name, position}]
  related_persons jsonb NOT NULL DEFAULT '[]'::jsonb,
  any_yes boolean GENERATED ALWAYS AS (
    coalesce((answers->>'is_pep')::boolean, false)
    OR coalesce((answers->>'is_family_member')::boolean, false)
    OR coalesce((answers->>'is_close_associate')::boolean, false)
  ) STORED,
  declaration_text_version text NOT NULL,
  declaration_text text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  user_agent text,
  declared_by_user_id uuid,
  channel text                              -- 'landing' | 'broker' | 'operator' | 'investor_pipeline'
);
CREATE INDEX IF NOT EXISTS pep_declarations_subject_idx
  ON public.pep_declarations (subject_type, subject_id, signed_at DESC);

-- ---------------------------------------------------------------------
-- 9. Kolejka screeningu (trigger → kolejka → tick)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.screening_queue (
  id bigserial PRIMARY KEY,
  source_table text NOT NULL CHECK (source_table IN ('clients','investors','pep_declarations','screening_subjects')),
  source_id uuid NOT NULL,
  trigger text NOT NULL CHECK (trigger IN ('onboarding','rescreening','data_change','list_change','declaration','manual')),
  scope text NOT NULL DEFAULT 'all' CHECK (scope IN ('all','pep','sanctions')),
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  not_before timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  last_error text
);
CREATE UNIQUE INDEX IF NOT EXISTS screening_queue_pending_uniq
  ON public.screening_queue (source_table, source_id, scope) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS screening_queue_pending_idx
  ON public.screening_queue (not_before) WHERE processed_at IS NULL;

-- ---------------------------------------------------------------------
-- 10. Przebiegi, trafienia, sprawy
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.screening_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL,
  subject_id uuid NOT NULL REFERENCES public.screening_subjects(id) ON DELETE RESTRICT,
  trigger text NOT NULL CHECK (trigger IN ('onboarding','rescreening','data_change','list_change','declaration','manual')),
  scope text NOT NULL DEFAULT 'all' CHECK (scope IN ('all','pep','sanctions')),
  subject_snapshot jsonb NOT NULL,          -- dane użyte do dopasowania (dowód dla GIIF)
  sources_versions jsonb NOT NULL DEFAULT '{}'::jsonb, -- źródło → data ostatniego udanego importu
  settings_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  declaration_id uuid REFERENCES public.pep_declarations(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  result text CHECK (result IN ('no_hits','possible_match','strong_match','declaration_yes','error')),
  max_score int,
  candidates_checked int,
  error text
);
CREATE INDEX IF NOT EXISTS screening_runs_subject_idx ON public.screening_runs (subject_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.screening_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_no bigserial,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL REFERENCES public.screening_subjects(id) ON DELETE RESTRICT,
  run_id uuid REFERENCES public.screening_runs(id),
  case_type text NOT NULL CHECK (case_type IN ('pep','sanctions','declaration')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','decided')),
  hits uuid[] NOT NULL DEFAULT '{}',
  max_score int,
  assigned_to uuid,
  decision text CHECK (decision IN
    ('false_positive','confirmed_pep','confirmed_family_or_associate','sanctions_hit','no_pep_declaration_error')),
  justification text,
  decided_by uuid,
  decided_at timestamptz,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  application_hold boolean NOT NULL DEFAULT false,
  declaration_id uuid REFERENCES public.pep_declarations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT screening_cases_decision_needs_justification
    CHECK (decision IS NULL OR (justification IS NOT NULL AND length(btrim(justification)) >= 10
                                AND decided_by IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS screening_cases_open_idx ON public.screening_cases (status, priority, created_at);
CREATE INDEX IF NOT EXISTS screening_cases_subject_idx ON public.screening_cases (subject_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.screening_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.screening_runs(id) ON DELETE RESTRICT,
  case_id uuid REFERENCES public.screening_cases(id),
  reference_type text NOT NULL CHECK (reference_type IN ('pep','sanction')),
  reference_id uuid NOT NULL,
  reference_hash text NOT NULL,
  reference_snapshot jsonb NOT NULL,        -- rekord źródłowy w chwili trafienia
  score int NOT NULL,
  score_breakdown jsonb NOT NULL,
  band text NOT NULL CHECK (band IN ('none','possible','strong')),
  status text NOT NULL DEFAULT 'logged' CHECK (status IN
    ('logged','suppressed_false_positive','pending_review','false_positive','confirmed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS screening_hits_run_idx ON public.screening_hits (run_id);
CREATE INDEX IF NOT EXISTS screening_hits_case_idx ON public.screening_hits (case_id);

-- Pamięć decyzji „fałszywe trafienie” dla pary podmiot–rekord. Para nie
-- generuje nowej sprawy, dopóki nie zmieni się odcisk podmiotu ani hash rekordu.
CREATE TABLE IF NOT EXISTS public.screening_false_positives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.screening_subjects(id) ON DELETE CASCADE,
  reference_type text NOT NULL,
  reference_id uuid NOT NULL,
  subject_fingerprint text NOT NULL,
  reference_hash text NOT NULL,
  case_id uuid NOT NULL REFERENCES public.screening_cases(id),
  decided_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_id, reference_type, reference_id, subject_fingerprint, reference_hash)
);

-- ---------------------------------------------------------------------
-- 11. Log audytowy — tylko INSERT
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.screening_audit_log (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,                 -- np. 'run.finished', 'case.created', 'case.decided', 'import.failed'
  entity_type text NOT NULL,                -- 'run' | 'case' | 'hit' | 'subject' | 'declaration' | 'import' | 'settings' | 'catalog'
  entity_id text,
  subject_id uuid,
  actor_id uuid,                            -- null = automat
  actor_kind text NOT NULL DEFAULT 'system' CHECK (actor_kind IN ('system','user')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash text,
  row_hash text                             -- łańcuch skrótów — wykrywa manipulację poza RLS
);
CREATE INDEX IF NOT EXISTS screening_audit_log_subject_idx ON public.screening_audit_log (subject_id, created_at);
CREATE INDEX IF NOT EXISTS screening_audit_log_entity_idx ON public.screening_audit_log (entity_type, entity_id);

CREATE OR REPLACE FUNCTION public.screening_audit_chain()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $fn$
DECLARE prev text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('screening_audit_log'));
  SELECT row_hash INTO prev FROM public.screening_audit_log ORDER BY id DESC LIMIT 1;
  NEW.created_at := now();
  NEW.prev_hash := prev;
  NEW.row_hash := encode(sha256(convert_to(
    coalesce(prev,'') || '|' || NEW.created_at::text || '|' || NEW.event_type || '|' || NEW.entity_type || '|' ||
    coalesce(NEW.entity_id,'') || '|' || coalesce(NEW.subject_id::text,'') || '|' ||
    coalesce(NEW.actor_id::text,'') || '|' || NEW.details::text, 'UTF8')), 'hex');
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS screening_audit_chain_trg ON public.screening_audit_log;
CREATE TRIGGER screening_audit_chain_trg BEFORE INSERT ON public.screening_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.screening_audit_chain();

-- Weryfikacja łańcucha: przelicza skróty tym samym wzorem co trigger.
CREATE OR REPLACE FUNCTION public.screening_audit_verify()
RETURNS TABLE (checked bigint, broken_ids bigint[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r record; prev text := NULL; n bigint := 0; bad bigint[] := '{}'; h text;
BEGIN
  FOR r IN SELECT * FROM public.screening_audit_log ORDER BY id LOOP
    n := n + 1;
    h := encode(sha256(convert_to(
      coalesce(prev,'') || '|' || r.created_at::text || '|' || r.event_type || '|' || r.entity_type || '|' ||
      coalesce(r.entity_id,'') || '|' || coalesce(r.subject_id::text,'') || '|' ||
      coalesce(r.actor_id::text,'') || '|' || r.details::text, 'UTF8')), 'hex');
    IF r.prev_hash IS DISTINCT FROM prev OR r.row_hash IS DISTINCT FROM h THEN bad := bad || r.id; END IF;
    prev := r.row_hash;
  END LOOP;
  RETURN QUERY SELECT n, bad;
END $fn$;
REVOKE ALL ON FUNCTION public.screening_audit_verify() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.screening_audit_verify() TO service_role;

CREATE OR REPLACE FUNCTION public.screening_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN RAISE EXCEPTION '% jest tylko do zapisu (append-only)', TG_TABLE_NAME; END $fn$;

DROP TRIGGER IF EXISTS screening_audit_no_change ON public.screening_audit_log;
CREATE TRIGGER screening_audit_no_change BEFORE UPDATE OR DELETE OR TRUNCATE ON public.screening_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.screening_immutable();

-- Oświadczenia i przebiegi też są dowodem — bez UPDATE/DELETE.
DROP TRIGGER IF EXISTS pep_declarations_no_change ON public.pep_declarations;
CREATE TRIGGER pep_declarations_no_change BEFORE UPDATE OR DELETE ON public.pep_declarations
  FOR EACH ROW EXECUTE FUNCTION public.screening_immutable();

-- Przebieg: dozwolone wyłącznie domknięcie (finished_at/result/max_score/...) jednokrotnie.
CREATE OR REPLACE FUNCTION public.screening_runs_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'screening_runs: usuwanie zabronione'; END IF;
  IF OLD.finished_at IS NOT NULL THEN RAISE EXCEPTION 'screening_runs: zamknięty przebieg jest niezmienialny'; END IF;
  IF NEW.subject_id <> OLD.subject_id OR NEW.subject_snapshot <> OLD.subject_snapshot
     OR NEW.started_at <> OLD.started_at OR NEW.trigger <> OLD.trigger THEN
    RAISE EXCEPTION 'screening_runs: dane wejściowe przebiegu są niezmienialne';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS screening_runs_guard_trg ON public.screening_runs;
CREATE TRIGGER screening_runs_guard_trg BEFORE UPDATE OR DELETE ON public.screening_runs
  FOR EACH ROW EXECUTE FUNCTION public.screening_runs_guard();

-- Trafienie: zmienia się wyłącznie status/case_id; wynik i snapshot niezmienne.
CREATE OR REPLACE FUNCTION public.screening_hits_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'screening_hits: usuwanie zabronione'; END IF;
  IF NEW.score <> OLD.score OR NEW.score_breakdown <> OLD.score_breakdown
     OR NEW.reference_snapshot <> OLD.reference_snapshot OR NEW.reference_id <> OLD.reference_id
     OR NEW.run_id <> OLD.run_id THEN
    RAISE EXCEPTION 'screening_hits: wynik trafienia jest niezmienialny';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS screening_hits_guard_trg ON public.screening_hits;
CREATE TRIGGER screening_hits_guard_trg BEFORE UPDATE OR DELETE ON public.screening_hits
  FOR EACH ROW EXECUTE FUNCTION public.screening_hits_guard();

-- Sprawa: decyzja raz podjęta jest ostateczna; usuwanie zabronione.
CREATE OR REPLACE FUNCTION public.screening_cases_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'screening_cases: usuwanie zabronione'; END IF;
  IF OLD.decision IS NOT NULL AND (
       NEW.decision IS DISTINCT FROM OLD.decision OR NEW.justification IS DISTINCT FROM OLD.justification
    OR NEW.decided_by IS DISTINCT FROM OLD.decided_by OR NEW.decided_at IS DISTINCT FROM OLD.decided_at) THEN
    RAISE EXCEPTION 'screening_cases: decyzja jest ostateczna — utwórz nową sprawę';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS screening_cases_guard_trg ON public.screening_cases;
CREATE TRIGGER screening_cases_guard_trg BEFORE UPDATE OR DELETE ON public.screening_cases
  FOR EACH ROW EXECUTE FUNCTION public.screening_cases_guard();

-- ---------------------------------------------------------------------
-- 12. Wstępna selekcja kandydatów (pg_trgm)
--     p_keys: znormalizowane warianty nazwy podmiotu (pełne nazwy),
--     p_surnames: znormalizowane nazwiska / człony nazwisk.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.screening_find_candidates(
  p_keys text[], p_surnames text[], p_reference_types text[], p_min_similarity real, p_limit int
) RETURNS TABLE (reference_type text, reference_id uuid, best_similarity real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $fn$
  WITH by_name AS (
    SELECT i.reference_type, i.reference_id, max(similarity(i.name_key, k)) AS sim
    FROM public.screening_name_index i, unnest(p_keys) k
    WHERE i.is_active AND i.reference_type = ANY(p_reference_types)
      AND i.name_key % k
    GROUP BY 1, 2
  ), by_surname AS (
    SELECT i.reference_type, i.reference_id, max(similarity(i.surname_key, s)) AS sim
    FROM public.screening_name_index i, unnest(p_surnames) s
    WHERE i.is_active AND i.reference_type = ANY(p_reference_types)
      AND i.surname_key IS NOT NULL AND i.surname_key % s
    GROUP BY 1, 2
  ), merged AS (
    SELECT reference_type, reference_id, max(sim) AS sim FROM (
      SELECT * FROM by_name UNION ALL SELECT * FROM by_surname
    ) u GROUP BY 1, 2
  )
  SELECT reference_type, reference_id, sim::real
  FROM merged WHERE sim >= p_min_similarity
  ORDER BY sim DESC LIMIT p_limit;
$fn$;
REVOKE ALL ON FUNCTION public.screening_find_candidates(text[], text[], text[], real, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.screening_find_candidates(text[], text[], text[], real, int) TO service_role;

-- Raport pokrycia: pozycje katalogu → liczba osób w warstwie referencyjnej.
CREATE OR REPLACE FUNCTION public.screening_coverage()
RETURNS TABLE (code text, persons bigint, current_persons bigint, last_fetched_at timestamptz, sources text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT c.code,
         count(p.id),
         count(p.id) FILTER (WHERE p.is_current),
         max(p.fetched_at),
         coalesce(array_agg(DISTINCT p.source) FILTER (WHERE p.source IS NOT NULL), '{}')
  FROM public.pep_position_catalog c
  LEFT JOIN public.pep_reference_persons p
    ON p.positions @> jsonb_build_array(jsonb_build_object('catalogCode', c.code))
  GROUP BY c.code;
$fn$;
REVOKE ALL ON FUNCTION public.screening_coverage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.screening_coverage() TO service_role;

-- ---------------------------------------------------------------------
-- 13. Triggery kolejki: utworzenie / zmiana klienta lub inwestora
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.screening_enqueue(p_table text, p_id uuid, p_trigger text, p_scope text DEFAULT 'all')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  INSERT INTO public.screening_queue (source_table, source_id, trigger, scope)
  VALUES (p_table, p_id, p_trigger, p_scope)
  ON CONFLICT (source_table, source_id, scope) WHERE processed_at IS NULL DO NOTHING;
END $fn$;
REVOKE ALL ON FUNCTION public.screening_enqueue(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.screening_enqueue(text, uuid, text, text) TO service_role;

-- Aktywny portfel: klienci z niezamkniętym wnioskiem / pożyczką oraz aktywni
-- inwestorzy. Klienci zamknięci nie są rescreenowani (historia zostaje).
CREATE OR REPLACE FUNCTION public.screening_enqueue_portfolio(p_scope text, p_trigger text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE n int := 0; k int;
BEGIN
  INSERT INTO public.screening_queue (source_table, source_id, trigger, scope)
  SELECT DISTINCT 'clients', la.client_id, p_trigger, p_scope
  FROM public.loan_applications la
  WHERE la.client_id IS NOT NULL AND la.deleted_at IS NULL AND la.archived_at IS NULL
    AND la.status::text NOT IN ('wniosek_odrzucony','archiwalny','zamkniety','zamkniete','nie_rokuje','brak_kontaktu')
  ON CONFLICT (source_table, source_id, scope) WHERE processed_at IS NULL DO NOTHING;
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;

  INSERT INTO public.screening_queue (source_table, source_id, trigger, scope)
  SELECT 'investors', i.id, p_trigger, p_scope FROM public.investors i WHERE i.is_active
  ON CONFLICT (source_table, source_id, scope) WHERE processed_at IS NULL DO NOTHING;
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;
  RETURN n;
END $fn$;
REVOKE ALL ON FUNCTION public.screening_enqueue_portfolio(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.screening_enqueue_portfolio(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.screening_clients_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.screening_enqueue('clients', NEW.id, 'onboarding');
  ELSIF NEW.first_name IS DISTINCT FROM OLD.first_name OR NEW.last_name IS DISTINCT FROM OLD.last_name
     OR NEW.pesel IS DISTINCT FROM OLD.pesel OR NEW.company_name IS DISTINCT FROM OLD.company_name
     OR NEW.nip IS DISTINCT FROM OLD.nip OR NEW.country IS DISTINCT FROM OLD.country THEN
    PERFORM public.screening_enqueue('clients', NEW.id, 'data_change');
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Kolejka nie może zablokować zapisu klienta; tick i tak zrobi pełny przegląd portfela.
  RAISE WARNING 'screening_enqueue(clients) failed: %', SQLERRM;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS screening_clients_enqueue ON public.clients;
CREATE TRIGGER screening_clients_enqueue AFTER INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.screening_clients_trg();

CREATE OR REPLACE FUNCTION public.screening_investors_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE o jsonb; n jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.screening_enqueue('investors', NEW.id, 'onboarding');
    RETURN NEW;
  END IF;
  o := to_jsonb(OLD); n := to_jsonb(NEW);
  IF (o->>'first_name') IS DISTINCT FROM (n->>'first_name') OR (o->>'last_name') IS DISTINCT FROM (n->>'last_name')
     OR (o->>'company_name') IS DISTINCT FROM (n->>'company_name') OR (o->>'pesel') IS DISTINCT FROM (n->>'pesel')
     OR (o->>'country') IS DISTINCT FROM (n->>'country')
     OR (o->>'representative_first_name') IS DISTINCT FROM (n->>'representative_first_name')
     OR (o->>'representative_last_name') IS DISTINCT FROM (n->>'representative_last_name')
     OR ((o->>'is_active')::boolean IS DISTINCT FROM (n->>'is_active')::boolean AND (n->>'is_active')::boolean) THEN
    PERFORM public.screening_enqueue('investors', NEW.id, 'data_change');
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'screening_enqueue(investors) failed: %', SQLERRM;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS screening_investors_enqueue ON public.investors;
CREATE TRIGGER screening_investors_enqueue AFTER INSERT OR UPDATE ON public.investors
  FOR EACH ROW EXECUTE FUNCTION public.screening_investors_trg();

CREATE OR REPLACE FUNCTION public.screening_declarations_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public.screening_enqueue('pep_declarations', NEW.id, 'declaration');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'screening_enqueue(pep_declarations) failed: %', SQLERRM;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS screening_declarations_enqueue ON public.pep_declarations;
CREATE TRIGGER screening_declarations_enqueue AFTER INSERT ON public.pep_declarations
  FOR EACH ROW EXECUTE FUNCTION public.screening_declarations_trg();

-- ---------------------------------------------------------------------
-- 14. Wstrzymanie wniosku: gdy klient ma otwartą sprawę z wstrzymaniem
--     (silne trafienie / sankcje), wniosek nie może przejść do etapów
--     dystrybucji, umowy i wypłaty. Odrzucenie / archiwizacja — dozwolone.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.screening_application_hold_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE held boolean;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status::text NOT IN (
    'wyslany_do_inwestorow','oferta_od_inwestora','oferta_przekazana_klientowi','zaakceptowany_przez_klienta',
    'do_umowy','oczekuje_podpisania_umowy','umowa_podpisana','oczekuje_ustanowienia_zabezpieczen',
    'zabezpieczenia_ustanowione','dokumenty_dostarczone_do_inwestora','oczekuje_wyplaty','wyplacony',
    'szukamy_inwestora','warunki_zaakceptowane','dokumenty_przygotowanie_umowy','notariusz'
  ) THEN
    RETURN NEW;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.screening_subjects s
    JOIN public.screening_subject_status st ON st.subject_id = s.id
    WHERE (s.client_id = NEW.client_id OR s.parent_subject_id IN (
             SELECT id FROM public.screening_subjects WHERE client_id = NEW.client_id))
      AND st.operations_hold
  ) OR EXISTS (
    SELECT 1 FROM public.screening_cases c
    JOIN public.screening_subjects s ON s.id = c.subject_id
    WHERE c.application_hold AND c.decision IS NULL
      AND (s.client_id = NEW.client_id OR s.parent_subject_id IN (
             SELECT id FROM public.screening_subjects WHERE client_id = NEW.client_id))
  ) INTO held;
  IF held THEN
    RAISE EXCEPTION 'SCREENING_HOLD: wniosek wstrzymany do decyzji w sprawie screeningu PEP/sankcji (panel: Compliance → Screening PEP i sankcji)';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS screening_application_hold ON public.loan_applications;
CREATE TRIGGER screening_application_hold BEFORE UPDATE OF status ON public.loan_applications
  FOR EACH ROW EXECUTE FUNCTION public.screening_application_hold_guard();

-- ---------------------------------------------------------------------
-- 15. RLS — odczyt dla personelu wewnętrznego; zapis tylko serwer.
--     screening_audit_log: brak polityk UPDATE/DELETE (RLS je odrzuca).
-- ---------------------------------------------------------------------
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'screening_settings','screening_source_imports','pep_position_catalog','pep_reference_persons',
    'sanctions_reference_entries','screening_name_index','screening_subjects','screening_subject_status',
    'pep_declarations','screening_queue','screening_runs','screening_cases','screening_hits',
    'screening_false_positives','screening_audit_log'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_staff_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_internal_staff(auth.uid()))',
                   t || '_staff_select', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Log audytowy: personel może dopisywać (INSERT), nikt nie może zmieniać.
DROP POLICY IF EXISTS screening_audit_log_staff_insert ON public.screening_audit_log;
CREATE POLICY screening_audit_log_staff_insert ON public.screening_audit_log
  FOR INSERT TO authenticated WITH CHECK (public.is_internal_staff(auth.uid()) AND actor_id = auth.uid());
GRANT INSERT ON public.screening_audit_log TO authenticated;
GRANT USAGE ON SEQUENCE public.screening_audit_log_id_seq TO authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.screening_audit_log FROM authenticated, anon;

-- ---------------------------------------------------------------------
-- 16. Storage: załączniki spraw (źródło majątku / środków, dowody)
-- ---------------------------------------------------------------------
-- Prywatny bucket „screening-attachments” zakłada się narzędziem do bucketów
-- (narzędzie migracji odrzuca INSERT do storage.buckets); tu tylko reguła odczytu.

DROP POLICY IF EXISTS "screening attachments staff read" ON storage.objects;
CREATE POLICY "screening attachments staff read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'screening-attachments' AND public.is_internal_staff(auth.uid()));

-- ---------------------------------------------------------------------
-- 17. pg_cron: kolejka (co 5 min), importy, rescreening, alerty
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  jobs text[][] := ARRAY[
    -- nazwa joba, harmonogram (UTC), ścieżka, body
    ARRAY['screening-queue-tick',      '*/5 * * * *', '/api/public/hooks/screening-queue-tick', '{}'],
    ARRAY['screening-import-sanctions','17 4 * * *',  '/api/public/hooks/screening-import',     '{"group":"sanctions"}'],
    ARRAY['screening-import-pep',      '23 2 * * 1',  '/api/public/hooks/screening-import',     '{"group":"pep_weekly"}'],
    ARRAY['screening-import-monthly',  '41 3 1 * *', '/api/public/hooks/screening-import',     '{"group":"pep_monthly"}'],
    ARRAY['screening-rescreen-pep',    '47 5 * * 1',  '/api/public/hooks/screening-rescreen',   '{"scope":"pep"}'],
    ARRAY['screening-import-continue', '*/10 * * * *', '/api/public/hooks/screening-import',    '{"group":"continue"}'],
    ARRAY['screening-health',          '5 7 * * *',   '/api/public/hooks/screening-health',     '{}']
  ];
  j text[];
  job record;
BEGIN
  FOREACH j SLICE 1 IN ARRAY jobs LOOP
    FOR job IN SELECT jobname FROM cron.job WHERE jobname = j[1] LOOP
      PERFORM cron.unschedule(job.jobname);
    END LOOP;
    PERFORM cron.schedule(j[1], j[2], format(
      $c$SELECT net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb, timeout_milliseconds := 120000);$c$,
      base_url || j[3], hdrs, j[4]));
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'screening cron schedule failed: %', SQLERRM;
END $$;
