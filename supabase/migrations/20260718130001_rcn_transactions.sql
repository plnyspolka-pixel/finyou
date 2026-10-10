-- Rejestr Cen Nieruchomości — rzeczywiste transakcje wgrane z publicznego zbioru
-- CC0 (deweloperuch/rejestr-cen-nieruchomosci, format GML). Zastępuje odpytywanie
-- Geoportal WMS na żywo: dane trzymamy lokalnie i odpytujemy po współrzędnych.
--
-- Brak PostGIS — geolokalizacja jako lat/lng (WGS84) + indeksy B-drzewo; zapytania
-- przestrzenne realizujemy przez bounding-box (degree bbox) w kodzie aplikacji.

CREATE TABLE IF NOT EXISTS public.rcn_transactions (
  id             UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source         TEXT NOT NULL DEFAULT 'deweloperuch/rejestr-cen-nieruchomosci',
  -- Miasto/zbiór, z którego pochodzi rekord (np. "warszawa").
  city           TEXT,
  -- Identyfikator transakcji/obiektu z GML — do deduplikacji przy re-imporcie.
  external_id    TEXT,
  -- lokal | budynek | dzialka | inne
  property_kind  TEXT NOT NULL DEFAULT 'inne',
  lat            DOUBLE PRECISION NOT NULL,
  lng            DOUBLE PRECISION NOT NULL,
  tx_date        DATE,
  price_pln      NUMERIC,
  area_m2        NUMERIC,
  area_ha        NUMERIC,
  price_per_m2   NUMERIC,
  price_per_ha   NUMERIC,
  -- Sposób korzystania z gruntu (dla działek), np. „R", „B".
  land_use       TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS rcn_tx_lat_idx  ON public.rcn_transactions (lat);
CREATE INDEX IF NOT EXISTS rcn_tx_lng_idx  ON public.rcn_transactions (lng);
CREATE INDEX IF NOT EXISTS rcn_tx_kind_idx ON public.rcn_transactions (property_kind);
CREATE INDEX IF NOT EXISTS rcn_tx_date_idx ON public.rcn_transactions (tx_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rcn_transactions TO authenticated;
GRANT ALL ON public.rcn_transactions TO service_role;
ALTER TABLE public.rcn_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY rcn_tx_staff_all ON public.rcn_transactions FOR ALL TO authenticated
  USING (has_role(auth.uid(),'administrator'::app_role) OR has_role(auth.uid(),'operator'::app_role))
  WITH CHECK (has_role(auth.uid(),'administrator'::app_role) OR has_role(auth.uid(),'operator'::app_role));
