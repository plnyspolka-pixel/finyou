-- Moduł „Potencjał lokalizacyjny nieruchomości" — schemat bazy (spec §15).
--
-- Cel: preselekcja wniosków o finansowanie na podstawie prefiksu KW, rodzaju
-- nieruchomości oraz danych statystyczno-przestrzennych (GUS/TERYT/NSP 2021).
--
-- Uwagi architektoniczne:
--  * PostGIS NIE jest włączony w tym projekcie (konwencja: lat/lng jako numeric
--    + indeksy B-drzewo, zob. 20260718130000_rcn_transactions.sql). Ciężkie
--    obliczenia przestrzenne (promienie 10/25/45 km, sąsiedztwo gmin, FUA)
--    wykonuje OFFLINE importer ETL (scripts/location-scoring), a do bazy trafiają
--    GOTOWE AGREGATY. Dzięki temu obsługa pojedynczego wniosku nie uruchamia
--    sumowań przestrzennych (spec §5, §16). Wymiana źródła danych nie wymaga
--    zmiany API scoringowego — zmienia się jedynie zawartość tabel *_metrics /
--    *_weights i data_version.
--  * RLS włączone na wszystkich tabelach. Szczegółowe wyniki i obserwacje są
--    narzędziem WEWNĘTRZNYM (spec §18) — dostęp tylko administrator/operator.
--    Inwestor/klient nie widzi estymacji lokalizacji.
--  * Numer KW to dana wrażliwa (spec §22): w tabeli analitycznej NIE zapisujemy
--    pełnego numeru — jedynie prefiks, numer repertoryjny (liczba) oraz HMAC
--    znormalizowanego numeru (solony) do deduplikacji.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Mapa prefiksów i właściwości wydziałów KW (wersjonowana) — spec §4
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.kw_jurisdiction_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_label text NOT NULL UNIQUE,          -- np. "2026.1"
  valid_from date,
  valid_to date,                               -- NULL = obowiązująca
  source text NOT NULL,                        -- np. "Ministerstwo Sprawiedliwości"
  source_url text,
  fetched_at timestamptz,
  is_active boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.kw_court_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prefix text NOT NULL,                         -- kod wydziału, np. "RA1R"
  court_name text NOT NULL,                     -- Sąd Rejonowy w …
  department_name text,                         -- np. "V Wydział Ksiąg Wieczystych"
  jurisdiction_version_id uuid REFERENCES public.kw_jurisdiction_versions(id) ON DELETE SET NULL,
  source text NOT NULL,
  source_url text,
  fetched_at timestamptz,
  -- Poziom pewności mapowania prefiksu (0–1). Wpływa na confidenceScore.
  mapping_confidence numeric(4,3) NOT NULL DEFAULT 0.5,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prefix, jurisdiction_version_id)
);

CREATE INDEX IF NOT EXISTS idx_kw_dept_prefix ON public.kw_court_departments (prefix);

-- Obszary obsługiwane przez wydział (właściwość miejscowa: bieżąca/historyczna).
CREATE TABLE IF NOT EXISTS public.kw_jurisdiction_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.kw_court_departments(id) ON DELETE CASCADE,
  teryt text NOT NULL,                          -- kod TERYT gminy/miejscowości
  area_name text,
  -- Rola właściwości: aktualna czy historyczna (prefiks wskazuje wydział z chwili
  -- założenia księgi elektronicznej — zmiany organizacyjne nie mogą mylić przypisania).
  jurisdiction_role text NOT NULL DEFAULT 'current'
    CHECK (jurisdiction_role IN ('current', 'historical')),
  valid_from date,
  valid_to date,
  confidence numeric(4,3) NOT NULL DEFAULT 0.5,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department_id, teryt, jurisdiction_role, valid_from)
);

CREATE INDEX IF NOT EXISTS idx_kw_jur_areas_dept ON public.kw_jurisdiction_areas (department_id);
CREATE INDEX IF NOT EXISTS idx_kw_jur_areas_teryt ON public.kw_jurisdiction_areas (teryt);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Dane przestrzenne (jednostki administracyjne + siatka NSP) — spec §5
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.geo_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teryt text NOT NULL,                          -- kod TERYT
  name text NOT NULL,
  unit_type text NOT NULL                       -- voivodeship/county/municipality/locality
    CHECK (unit_type IN ('voivodeship','county','municipality','locality')),
  parent_teryt text,
  center_lat numeric(9,6),
  center_lng numeric(9,6),
  area_km2 numeric(12,4),
  population integer,
  degurba smallint,                             -- 1 miasto / 2 miasteczko / 3 wieś
  is_city_above_30k boolean NOT NULL DEFAULT false,
  is_city_above_100k boolean NOT NULL DEFAULT false,
  is_city_above_250k boolean NOT NULL DEFAULT false,
  data_version text NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teryt, data_version)
);

CREATE INDEX IF NOT EXISTS idx_geo_units_teryt ON public.geo_units (teryt);
CREATE INDEX IF NOT EXISTS idx_geo_units_latlng ON public.geo_units (center_lat, center_lng);

-- Siatka ludności NSP 2021 (125/250/1000 m). CIĘŻKIE — tylko service_role odczyt.
-- Wchodzi do bazy jako gotowy import (CSV/Parquet → COPY). Nie wystawiamy przez
-- Data API dla zwykłych użytkowników.
CREATE TABLE IF NOT EXISTS public.population_grid_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grid_id text NOT NULL,
  resolution_m integer NOT NULL,                -- 125 / 250 / 1000
  center_lat numeric(9,6) NOT NULL,
  center_lng numeric(9,6) NOT NULL,
  population integer NOT NULL DEFAULT 0,
  dwellings integer,                            -- liczba mieszkań
  multi_family_dwellings integer,              -- lokale w zabudowie wielorodzinnej
  buildings integer,                           -- liczba budynków
  residential_buildings integer,               -- budynki mieszkalne
  data_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grid_id, resolution_m, data_version)
);

CREATE INDEX IF NOT EXISTS idx_pop_grid_latlng ON public.population_grid_metrics (resolution_m, center_lat, center_lng);

-- Zagregowane metryki obszaru (gotowe do scoringu, liczone offline) — spec §6.
CREATE TABLE IF NOT EXISTS public.geo_unit_location_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teryt text NOT NULL,
  data_version text NOT NULL,
  population_within_10km integer NOT NULL DEFAULT 0,
  population_within_25km integer NOT NULL DEFAULT 0,
  population_within_45km integer NOT NULL DEFAULT 0,
  density_per_km2 numeric(10,2) NOT NULL DEFAULT 0,
  is_urban_cluster boolean NOT NULL DEFAULT false,
  fua_code text,
  fua_role text NOT NULL DEFAULT 'none' CHECK (fua_role IN ('core','commuting_zone','none')),
  distance_to_city_30k_km numeric(8,2),
  distance_to_city_100k_km numeric(8,2),
  distance_to_city_250k_km numeric(8,2),
  -- Sąsiedztwo wyznaczone przestrzennie (wspólna granica, nie styk w punkcie).
  is_adjacent_to_city_30k boolean NOT NULL DEFAULT false,
  -- Bazowa atrakcyjność 0–100 policzona daną wersją konfiguracji (audyt).
  base_location_attractiveness integer,
  base_config_version text,
  data_quality text NOT NULL DEFAULT 'high' CHECK (data_quality IN ('high','medium','low')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teryt, data_version)
);

CREATE INDEX IF NOT EXISTS idx_geo_metrics_teryt ON public.geo_unit_location_metrics (teryt, data_version);

-- Sąsiedztwo gmin (wyznaczone przestrzennie w ETL) — spec §6.
CREATE TABLE IF NOT EXISTS public.geo_unit_adjacency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teryt text NOT NULL,
  neighbour_teryt text NOT NULL,
  -- Długość wspólnej granicy (m) — pozwala odrzucić styk w jednym punkcie.
  shared_border_m numeric(12,2),
  data_version text NOT NULL,
  UNIQUE (teryt, neighbour_teryt, data_version)
);

CREATE INDEX IF NOT EXISTS idx_geo_adjacency_teryt ON public.geo_unit_adjacency (teryt, data_version);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Wagi rozkładu lokalizacji zależne od rodzaju nieruchomości — spec §8, §9
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.property_type_location_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prefix text NOT NULL,
  jurisdiction_version_id uuid REFERENCES public.kw_jurisdiction_versions(id) ON DELETE SET NULL,
  property_type text NOT NULL CHECK (property_type IN ('apartment','house','plot')),
  teryt text NOT NULL,
  -- Surowa waga (P przed normalizacją). Scorer normalizuje do sumy 1. Skala może
  -- być duża (proxy ludnościowe), dlatego szeroka precyzja.
  weight numeric(18,6) NOT NULL DEFAULT 0,
  source_quality text NOT NULL DEFAULT 'medium' CHECK (source_quality IN ('high','medium','low')),
  data_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prefix, property_type, teryt, data_version)
);

CREATE INDEX IF NOT EXISTS idx_pt_weights_lookup
  ON public.property_type_location_weights (prefix, property_type, data_version);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Uczenie: obserwacje z poznanych KW + statystyki zakresów — spec §10, §11
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.kw_location_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Odwołanie do wniosku (bez pełnego numeru KW).
  loan_application_id uuid REFERENCES public.loan_applications(id) ON DELETE SET NULL,
  kw_prefix text NOT NULL,
  serial_number integer NOT NULL,               -- numer repertoryjny jako liczba
  property_type text NOT NULL CHECK (property_type IN ('apartment','house','plot')),
  -- HMAC znormalizowanego, PEŁNEGO numeru KW (solony) — deduplikacja bez PII.
  kw_hmac text NOT NULL,
  real_teryt text,                              -- rzeczywisty TERYT po pełnej analizie
  real_locality text,
  real_attractiveness integer,                  -- 0–100
  good_location boolean,
  data_version text,                            -- wersja danych przestrzennych
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (kw_hmac)
);

CREATE INDEX IF NOT EXISTS idx_kw_obs_prefix_type
  ON public.kw_location_observations (kw_prefix, property_type);
CREATE INDEX IF NOT EXISTS idx_kw_obs_serial
  ON public.kw_location_observations (kw_prefix, property_type, serial_number);

-- Statystyki zakresów numerów repertoryjnych (sygnał środkowego numeru KW).
-- Zapełniane przez backtest/ETL; validated_offline=true dopiero po walidacji
-- czasowej i sprawdzeniu kalibracji (spec §11).
CREATE TABLE IF NOT EXISTS public.kw_number_range_statistics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prefix text NOT NULL,
  property_type text NOT NULL CHECK (property_type IN ('apartment','house','plot')),
  range_start integer NOT NULL,
  range_end integer NOT NULL,
  sample_count integer NOT NULL DEFAULT 0,
  positive_count integer NOT NULL DEFAULT 0,
  mean_attractiveness numeric(6,2),
  validated_offline boolean NOT NULL DEFAULT false,
  data_version text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prefix, property_type, range_start, range_end, data_version)
);

CREATE INDEX IF NOT EXISTS idx_kw_range_lookup
  ON public.kw_number_range_statistics (prefix, property_type, range_start, range_end);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Wyniki scoringu + wersje modelu + konfiguracja + zadania importu — §12–§16
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.location_scoring_model_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version text NOT NULL UNIQUE,
  description text,
  algo_params jsonb,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Wersjonowana konfiguracja (wagi, granice, progi, lambda). Każda zmiana = nowa
-- wersja; historyczne wyniki nie zmieniają się bez jawnego przeliczenia (spec §19).
CREATE TABLE IF NOT EXISTS public.location_scoring_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_version text NOT NULL UNIQUE,
  config jsonb NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.location_scoring_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL,                        -- prefixes / gus_teryt / grid / metrics / weights / observations
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','RUNNING','COMPLETED','FAILED')),
  source text,
  data_version text,
  stats jsonb,                                   -- raport jakości importu
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loc_import_jobs_type ON public.location_scoring_import_jobs (job_type, created_at DESC);

-- Wynik scoringu (pełny, wersjonowany, z parametrami i wyjaśnieniem) — spec §14, §15.
CREATE TABLE IF NOT EXISTS public.location_scoring_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id uuid REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  -- Numer KW: TYLKO prefiks + repertorium + HMAC (bez pełnego numeru — spec §22).
  kw_prefix text NOT NULL,
  serial_number integer,
  kw_hmac text,
  masked_kw_number text,                         -- np. RA1R/00****56/7 (do UI)
  property_type text NOT NULL CHECK (property_type IN ('apartment','house','plot')),

  -- Prawdopodobieństwa 0–1 (w UI pokazywane jako procenty).
  probability_urban_core numeric(6,5) NOT NULL DEFAULT 0,
  probability_urban_or_suburban numeric(6,5) NOT NULL DEFAULT 0,
  probability_fua numeric(6,5) NOT NULL DEFAULT 0,
  probability_good_location numeric(6,5) NOT NULL DEFAULT 0,
  probability_remote_area numeric(6,5) NOT NULL DEFAULT 0,

  expected_location_attractiveness integer NOT NULL DEFAULT 0,
  analysis_priority_score integer NOT NULL DEFAULT 0,
  confidence_score integer NOT NULL DEFAULT 0,

  attractiveness_p10 integer NOT NULL DEFAULT 0,
  attractiveness_median integer NOT NULL DEFAULT 0,
  attractiveness_p90 integer NOT NULL DEFAULT 0,

  decision text NOT NULL,
  explanation jsonb NOT NULL,
  -- Pełne parametry użyte do obliczenia (audyt/repro).
  params jsonb NOT NULL,

  court_prefix text,
  court_name text,
  jurisdiction_version text,

  model_version text NOT NULL,
  data_version text NOT NULL,
  config_version text NOT NULL,
  status text NOT NULL DEFAULT 'COMPLETED'
    CHECK (status IN ('PENDING','PROCESSING','COMPLETED','FAILED','NEEDS_DATA')),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS idx_loc_results_application
  ON public.location_scoring_results (loan_application_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_loc_results_prefix
  ON public.location_scoring_results (kw_prefix, property_type, calculated_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Kolumny pomocnicze na wniosku (kolejka priorytetów + lista) — spec §17, §18
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.loan_applications
  ADD COLUMN IF NOT EXISTS location_potential_score integer,
  ADD COLUMN IF NOT EXISTS location_confidence_score integer,
  ADD COLUMN IF NOT EXISTS location_analysis_priority text,
  ADD COLUMN IF NOT EXISTS location_scoring_status text DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS location_scored_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_loan_apps_location_priority
  ON public.loan_applications (location_potential_score DESC NULLS LAST);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RLS — dostęp tylko administrator/operator (narzędzie wewnętrzne, spec §15, §18)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t text;
  staff_tables text[] := ARRAY[
    'kw_jurisdiction_versions','kw_court_departments','kw_jurisdiction_areas',
    'geo_units','geo_unit_location_metrics','geo_unit_adjacency',
    'property_type_location_weights','kw_number_range_statistics',
    'kw_location_observations','location_scoring_results',
    'location_scoring_model_versions','location_scoring_import_jobs'
  ];
BEGIN
  FOREACH t IN ARRAY staff_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    -- Odczyt: administrator lub operator.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_staff_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ('
      || 'public.has_role(auth.uid(), ''administrator''::public.app_role) '
      || 'OR public.has_role(auth.uid(), ''operator''::public.app_role));',
      t || '_staff_read', t);
    -- Zapis (INSERT/UPDATE/DELETE): administrator lub operator.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_staff_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING ('
      || 'public.has_role(auth.uid(), ''administrator''::public.app_role) '
      || 'OR public.has_role(auth.uid(), ''operator''::public.app_role)) WITH CHECK ('
      || 'public.has_role(auth.uid(), ''administrator''::public.app_role) '
      || 'OR public.has_role(auth.uid(), ''operator''::public.app_role));',
      t || '_staff_write', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated;', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role;', t);
  END LOOP;
END $$;

-- population_grid_metrics: dane CIĘŻKIE i wrażliwe — TYLKO service_role (odczyt
-- offline/ETL). Zwykli zalogowani użytkownicy nie mają dostępu (spec §15).
ALTER TABLE public.population_grid_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS population_grid_admin_read ON public.population_grid_metrics;
CREATE POLICY population_grid_admin_read ON public.population_grid_metrics
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::public.app_role));
GRANT SELECT ON public.population_grid_metrics TO authenticated;
GRANT ALL ON public.population_grid_metrics TO service_role;

-- location_scoring_settings: odczyt administrator/operator; zapis TYLKO administrator.
ALTER TABLE public.location_scoring_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS loc_settings_read ON public.location_scoring_settings;
CREATE POLICY loc_settings_read ON public.location_scoring_settings
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrator'::public.app_role)
    OR public.has_role(auth.uid(), 'operator'::public.app_role)
  );
DROP POLICY IF EXISTS loc_settings_admin_write ON public.location_scoring_settings;
CREATE POLICY loc_settings_admin_write ON public.location_scoring_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::public.app_role));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.location_scoring_settings TO authenticated;
GRANT ALL ON public.location_scoring_settings TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Ziarno: wersja modelu + domyślna konfiguracja + pusta wersja właściwości
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.location_scoring_model_versions (model_version, description, is_active)
VALUES ('loc-scoring-1.0.0', 'Bazowy model potencjału lokalizacyjnego (log-normalizacja ludności + rozkład prefiks×rodzaj + wygładzanie bayesowskie).', true)
ON CONFLICT (model_version) DO NOTHING;

INSERT INTO public.location_scoring_settings (config_version, config, is_active)
VALUES (
  'cfg-default-1',
  '{
    "version": "cfg-default-1",
    "weights": {"population10": 0.45, "population25": 0.30, "population45": 0.15, "cluster": 0.10},
    "populationBounds": {"within10Km": [5000, 500000], "within25Km": [20000, 1000000], "within45Km": [50000, 2000000]},
    "clusterScores": {"fuaCore": 1.0, "fuaCommutingZone": 0.85, "cityAbove30k": 0.75, "adjacentToCity30k": 0.70, "urbanCluster": 0.50, "other": 0.15},
    "goodLocationThreshold": 60,
    "priorityWeights": {"expectedAttractiveness": 0.70, "probabilityGoodLocation": 0.30},
    "decisionThresholds": {"autoHighScore": 75, "autoHighConfidence": 60, "autoStandardScore": 60, "autoStandardConfidence": 50, "lightCheckScore": 40},
    "bayesianLambda": 75,
    "serialSignalMinSample": 40
  }'::jsonb,
  true
)
ON CONFLICT (config_version) DO NOTHING;

COMMENT ON TABLE public.location_scoring_results IS 'Wyniki modułu potencjału lokalizacyjnego (wersjonowane modelem/danymi/konfiguracją). Narzędzie wewnętrzne — RLS administrator/operator.';
COMMENT ON TABLE public.kw_location_observations IS 'Pseudonimizowane obserwacje z poznanych KW (prefiks + repertorium + HMAC, bez pełnego numeru) do uczenia estymacji.';
COMMENT ON TABLE public.population_grid_metrics IS 'Siatka ludności NSP 2021 (125/250/1000 m). Dane ciężkie — odczyt tylko administrator/service_role; agregaty liczone offline.';
COMMENT ON COLUMN public.loan_applications.location_potential_score IS 'Potencjał lokalizacyjny 0–100 (moduł preselekcji). Aktualizowany asynchronicznie po scoringu KW.';
