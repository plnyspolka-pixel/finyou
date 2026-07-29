-- Moduł „Potencjał lokalizacyjny": scoring bez rodzaju nieruchomości + nowa
-- semantyka „dobrej lokalizacji".
--
--  1) Rodzaj nieruchomości jest POMOCNICZY. Wnioski bez obsługiwanego rodzaju
--     (lokal usługowy, udział, inna, brak) scorują się na rozkładzie
--     zagregowanym po wszystkich rodzajach — wynik zapisywany z
--     property_type='any'. CHECK na location_scoring_results musi to dopuścić.
--     (Tabele uczenia — obserwacje/zakresy/wagi — celowo ZOSTAJĄ przy trzech
--     konkretnych rodzajach.)
--  2) probability_good_location = szansa, że nieruchomość leży w okolicy
--     większego skupiska ludzkiego (minimalna akceptowalna granica ~20–30 tys.
--     mieszkańców): miasto ≥30 tys. / sąsiedztwo / FUA / klaster miejski /
--     ludność ≥25 tys. w promieniu 10 km. Nowa aktywna konfiguracja
--     cfg-default-2 przenosi też wagę priorytetu na tę szansę (0.6 vs 0.4).
--  3) Jednorazowo: wszystkie wnioski z numerem KW wracają do PENDING, żeby
--     cron przeliczył je nową semantyką (w tym te wcześniej NEEDS_DATA przez
--     nieobsługiwany rodzaj).

-- ── 1) CHECK property_type na wynikach dopuszcza 'any' ───────────────────────
ALTER TABLE public.location_scoring_results
  DROP CONSTRAINT IF EXISTS location_scoring_results_property_type_check;
ALTER TABLE public.location_scoring_results
  ADD CONSTRAINT location_scoring_results_property_type_check
  CHECK (property_type IN ('apartment','house','plot','any'));

-- ── 2) Nowa aktywna konfiguracja cfg-default-2 ───────────────────────────────
UPDATE public.location_scoring_settings SET is_active = false WHERE is_active = true;
INSERT INTO public.location_scoring_settings (config_version, config, is_active)
VALUES (
  'cfg-default-2',
  '{
    "version": "cfg-default-2",
    "weights": {"population10": 0.45, "population25": 0.3, "population45": 0.15, "cluster": 0.1},
    "populationBounds": {"within10Km": [5000, 500000], "within25Km": [20000, 1000000], "within45Km": [50000, 2000000]},
    "clusterScores": {"fuaCore": 1.0, "fuaCommutingZone": 0.85, "cityAbove30k": 0.75, "adjacentToCity30k": 0.7, "urbanCluster": 0.5, "other": 0.15},
    "goodLocationThreshold": 60,
    "nearSettlement": {"minPopulationWithin10Km": 25000},
    "priorityWeights": {"expectedAttractiveness": 0.4, "probabilityGoodLocation": 0.6},
    "decisionThresholds": {"autoHighScore": 75, "autoHighConfidence": 60, "autoStandardScore": 60, "autoStandardConfidence": 50, "lightCheckScore": 40},
    "bayesianLambda": 75,
    "serialSignalMinSample": 40
  }'::jsonb,
  true
)
ON CONFLICT DO NOTHING;

-- ── 3) Jednorazowe przeliczenie: każdy wniosek z KW wraca do PENDING ─────────
UPDATE public.loan_applications la
  SET location_scoring_status = 'PENDING'
  WHERE EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.loan_application_id = la.id
      AND p.land_register_number IS NOT NULL
      AND btrim(p.land_register_number) <> ''
  );
