-- === STANDARYZACJA NUMERÓW KSIĄG WIECZYSTYCH ===
--
-- Format kanoniczny wszędzie: XXXX/DDDDDDDD/C (np. WA1M/00123456/7).
--
-- Problemy naprawiane tutaj:
-- 1) Formularze landingowe sklejały WIELE numerów KW + powierzchnię użytkową
--    w jedno pole tekstowe `properties.land_register_number`
--    ("WA1M/... | KR1P/... | Pow. użytkowa: 55 m²") — przez co pobieranie
--    treści KW i polityki RLS (join po numerze) nie działały dla wniosków
--    z landingu. Rozbijamy: pierwszy numer → land_register_number,
--    kolejne → additional_land_register_numbers, powierzchnia → area_sqm.
-- 2) `kw_documents.kw_number` był zapisywany w formie zwartej (13 znaków),
--    a properties w formie z ukośnikami — join RLS nigdy nie łapał.
--    Normalizujemy kw_documents do formy kanonicznej.
-- 3) Polityki RLS nie uwzględniały `additional_land_register_numbers` —
--    treść dodatkowych ksiąg była niewidoczna dla klienta/inwestora.

-- Pomocnicza normalizacja: dowolny zapis -> kanoniczny lub NULL.
CREATE OR REPLACE FUNCTION public.normalize_kw_number(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN raw IS NULL THEN NULL
    WHEN upper(regexp_replace(raw, '[\s/]', '', 'g')) ~ '^[A-Z]{2}[0-9][A-Z0-9][0-9]{9}$'
    THEN substr(upper(regexp_replace(raw, '[\s/]', '', 'g')), 1, 4) || '/' ||
         substr(upper(regexp_replace(raw, '[\s/]', '', 'g')), 5, 8) || '/' ||
         substr(upper(regexp_replace(raw, '[\s/]', '', 'g')), 13, 1)
    ELSE NULL
  END;
$$;

-- 1) kw_documents: forma zwarta -> kanoniczna (z pominięciem konfliktów).
UPDATE public.kw_documents kd
SET kw_number = public.normalize_kw_number(kd.kw_number)
WHERE public.normalize_kw_number(kd.kw_number) IS NOT NULL
  AND kd.kw_number <> public.normalize_kw_number(kd.kw_number)
  AND NOT EXISTS (
    SELECT 1 FROM public.kw_documents k2
    WHERE k2.kw_number = public.normalize_kw_number(kd.kw_number)
  );

-- 2) properties: rozbij zanieczyszczone/sklejone wartości.
DO $$
DECLARE
  r record;
  kws text[];
  area_txt text;
  area_val numeric;
  extras text[];
  norm text;
BEGIN
  FOR r IN
    SELECT id, land_register_number, additional_land_register_numbers, area_sqm
    FROM public.properties
    WHERE land_register_number IS NOT NULL
      AND btrim(land_register_number) <> ''
  LOOP
    -- Wyciągnij wszystkie numery KW z pola głównego.
    SELECT COALESCE(array_agg(DISTINCT public.normalize_kw_number(m[1])), '{}')
    INTO kws
    FROM regexp_matches(upper(r.land_register_number), '([A-Z]{2}[0-9][A-Z0-9]/?[0-9]{8}/?[0-9])', 'g') AS m
    WHERE public.normalize_kw_number(m[1]) IS NOT NULL;

    -- Powierzchnia użytkowa doklejona do pola KW -> area_sqm (jeśli puste).
    area_val := NULL;
    area_txt := (regexp_match(r.land_register_number, 'Pow\.?\s*u[żz]ytkowa:?\s*([0-9]+(?:[.,][0-9]+)?)', 'i'))[1];
    IF area_txt IS NOT NULL THEN
      BEGIN
        area_val := replace(area_txt, ',', '.')::numeric;
      EXCEPTION WHEN OTHERS THEN
        area_val := NULL;
      END;
    END IF;

    -- Znormalizuj też dotychczasowe dodatkowe numery.
    SELECT COALESCE(array_agg(DISTINCT public.normalize_kw_number(x)), '{}')
    INTO extras
    FROM unnest(COALESCE(r.additional_land_register_numbers, '{}')) AS x
    WHERE public.normalize_kw_number(x) IS NOT NULL;

    IF array_length(kws, 1) >= 1 THEN
      -- pierwszy numer -> pole główne; reszta -> dodatkowe (bez duplikatów)
      UPDATE public.properties
      SET land_register_number = kws[1],
          additional_land_register_numbers = (
            SELECT COALESCE(array_agg(DISTINCT v), '{}')
            FROM unnest(kws[2:] || extras) AS v
            WHERE v IS NOT NULL AND v <> kws[1]
          ),
          area_sqm = COALESCE(area_sqm, area_val)
      WHERE id = r.id;
    ELSIF area_val IS NOT NULL THEN
      -- brak numeru KW, ale była powierzchnia — przenieś ją i wyczyść śmieć
      UPDATE public.properties
      SET area_sqm = COALESCE(area_sqm, area_val),
          additional_land_register_numbers = extras
      WHERE id = r.id;
    ELSIF extras IS DISTINCT FROM COALESCE(r.additional_land_register_numbers, '{}') THEN
      UPDATE public.properties
      SET additional_land_register_numbers = extras
      WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- 3) RLS: dostęp klienta/inwestora obejmuje też dodatkowe numery KW.
DROP POLICY IF EXISTS "kw_documents_client_read" ON public.kw_documents;
CREATE POLICY "kw_documents_client_read"
ON public.kw_documents FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.properties p
    JOIN public.loan_applications la ON la.id = p.loan_application_id
    JOIN public.clients c ON c.id = la.client_id
    WHERE (
      p.land_register_number = kw_documents.kw_number
      OR kw_documents.kw_number = ANY(COALESCE(p.additional_land_register_numbers, '{}'))
    )
      AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "kw_documents_investor_read" ON public.kw_documents;
CREATE POLICY "kw_documents_investor_read"
ON public.kw_documents FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'inwestor'::app_role)
  AND EXISTS (
    SELECT 1
    FROM public.properties p
    JOIN public.loan_applications la ON la.id = p.loan_application_id
    WHERE (
      p.land_register_number = kw_documents.kw_number
      OR kw_documents.kw_number = ANY(COALESCE(p.additional_land_register_numbers, '{}'))
    )
      AND la.available_to_investors = true
  )
);
