-- Aliasy prefiksów KW spoza aktualnego wykazu MS (Dz.U. 2026 poz. 740),
-- występujące w numerach ksiąg w bazie wniosków:
--   * SW2K — dawny VII Zamiejscowy Wydział KW SR w Kłodzku z siedzibą w Nowej
--     Rudzie (zweryfikowane; stare numery ksiąg pozostają w obiegu) → obszar
--     właściwości SR w Kłodzku (SW1K), pewność 0.85,
--   * PL10 — literówka prefiksu PL1O (cyfra 0 zamiast litery O; SR w
--     Sochaczewie) → obszar PL1O, pewność 0.35.
-- Kopiujemy wydział, obszary właściwości i wagi rozkładu w ramach wersji
-- 2026.1-ms / ms-teryt-2026-1. Idempotentne.

INSERT INTO public.kw_court_departments
  (prefix, court_name, department_name, jurisdiction_version_id, mapping_confidence, source, fetched_at)
SELECT a.alias,
       d.court_name || ' (alias prefiksu ' || a.src || ')',
       d.department_name,
       d.jurisdiction_version_id,
       a.conf,
       'ALIAS ' || a.src,
       now()
FROM (VALUES ('PL10', 'PL1O', 0.35), ('SW2K', 'SW1K', 0.85)) a(alias, src, conf)
JOIN public.kw_court_departments d ON d.prefix = a.src
JOIN public.kw_jurisdiction_versions v
  ON v.id = d.jurisdiction_version_id AND v.version_label = '2026.1-ms'
ON CONFLICT (prefix, jurisdiction_version_id) DO NOTHING;

INSERT INTO public.kw_jurisdiction_areas (department_id, teryt, jurisdiction_role, confidence, source)
SELECT nd.id, ar.teryt, ar.jurisdiction_role, LEAST(ar.confidence, nd.mapping_confidence), 'ALIAS'
FROM (VALUES ('PL10', 'PL1O'), ('SW2K', 'SW1K')) a(alias, src)
JOIN public.kw_jurisdiction_versions v ON v.version_label = '2026.1-ms'
JOIN public.kw_court_departments sd ON sd.prefix = a.src AND sd.jurisdiction_version_id = v.id
JOIN public.kw_court_departments nd ON nd.prefix = a.alias AND nd.jurisdiction_version_id = v.id
JOIN public.kw_jurisdiction_areas ar ON ar.department_id = sd.id
ON CONFLICT (department_id, teryt, jurisdiction_role, valid_from) DO NOTHING;

INSERT INTO public.property_type_location_weights
  (prefix, property_type, teryt, weight, source_quality, data_version)
SELECT a.alias, w.property_type, w.teryt, w.weight, w.source_quality, w.data_version
FROM (VALUES ('PL10', 'PL1O'), ('SW2K', 'SW1K')) a(alias, src)
JOIN public.property_type_location_weights w
  ON w.prefix = a.src AND w.data_version = 'ms-teryt-2026-1'
ON CONFLICT (prefix, property_type, teryt, data_version) DO UPDATE SET weight = EXCLUDED.weight;

-- Wnioski zakończone NEEDS_DATA wracają do kolejki (tick przeliczy je na
-- nowych aliasach; auto-requeue w ticku i tak by je podniósł po zmianie
-- wersji danych, ale tu wersja się nie zmienia — stąd jawny reset).
UPDATE public.loan_applications la
  SET location_scoring_status = 'PENDING'
  WHERE la.location_scoring_status = 'NEEDS_DATA'
    AND EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.loan_application_id = la.id
        AND p.land_register_number IS NOT NULL
        AND btrim(p.land_register_number) <> ''
    );
