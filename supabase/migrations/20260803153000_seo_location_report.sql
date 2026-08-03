-- Linkowalny asset: publiczny raport/ranking lokalizacji (/raport-lokalizacje).
--
-- Zawiera WYŁĄCZNIE dane zagregowane z tabel referencyjnych (geo_units +
-- geo_unit_location_metrics, GUS/TERYT) — żadnych danych klientów, wniosków
-- ani numerów KW. Tabele referencyjne pozostają za RLS staff-only; publiczna
-- strona czyta gotowy snapshot z tej tabeli anon key'em (twarde ograniczenie
-- nr 1 promptu SEO). Wypełnianie: hook seo-location-seed
-- (src/lib/seo-location/server.ts → generateLocationReport).

CREATE TABLE IF NOT EXISTS public.seo_location_report_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teryt text NOT NULL UNIQUE,
  name text NOT NULL,
  voivodeship text NOT NULL,
  rank integer NOT NULL,
  population integer,
  density_per_km2 numeric(10,2),
  population_within_25km integer NOT NULL DEFAULT 0,
  population_within_45km integer NOT NULL DEFAULT 0,
  -- Bazowa atrakcyjność lokalizacji 0–100 z naszego scoringu (liczona offline
  -- w ETL; NULL gdy dana wersja danych jej nie zawiera).
  attractiveness integer,
  fua_role text NOT NULL DEFAULT 'none' CHECK (fua_role IN ('core','commuting_zone','none')),
  data_version text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seo_loc_report_rank
  ON public.seo_location_report_entries (rank);

DO $$
BEGIN
  CREATE TRIGGER trg_seo_loc_report_touch_updated_at
    BEFORE UPDATE ON public.seo_location_report_entries
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS: publiczny odczyt całości (dane zagregowane, jawne statystyki GUS),
-- zapis wyłącznie service_role (generator).
ALTER TABLE public.seo_location_report_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seo_loc_report_public_read ON public.seo_location_report_entries;
CREATE POLICY seo_loc_report_public_read ON public.seo_location_report_entries
  FOR SELECT TO anon, authenticated
  USING (true);

GRANT SELECT ON public.seo_location_report_entries TO anon, authenticated;
GRANT ALL ON public.seo_location_report_entries TO service_role;

COMMENT ON TABLE public.seo_location_report_entries IS
  'Publiczny ranking lokalizacji (asset linkowalny /raport-lokalizacje). Wyłącznie agregaty GUS/TERYT + scoring bazowy; zapis tylko service_role.';
