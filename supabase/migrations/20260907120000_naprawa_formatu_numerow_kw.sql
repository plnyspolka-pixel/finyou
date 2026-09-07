-- Naprawa formatu numerów ksiąg wieczystych w properties.
--
-- Część wniosków (zwłaszcza składanych przez operatora) ma poprawne cyfry,
-- ale zepsuty format numeru KW: brak ukośników, spacje/kropki/myślniki jako
-- separatory, małe litery kodu sądu, 7 cyfr bez zera wiodącego. Formularze
-- wymuszają już format WA1M/00123456/7 (walidacja + auto-naprawa w
-- src/lib/kw.ts — validateKwInput/normalizeKwNumbersInText); ta migracja
-- sprowadza do tej samej postaci dane już zapisane w bazie.
--
-- Funkcja przepisuje KAŻDE wystąpienie numeru KW wewnątrz tekstu, zachowując
-- pozostałą treść pola (np. "… | Pow. użytkowa: 140 m²"). Odpowiednik
-- normalizeKwNumbersInText z src/lib/kw.ts. Idempotentna.

CREATE OR REPLACE FUNCTION public.normalize_kw_numbers_in_text(input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  rest text := input;
  out_text text := '';
  m text[];
BEGIN
  IF input IS NULL OR btrim(input) = '' THEN
    RETURN input;
  END IF;
  LOOP
    -- Prefiks (możliwie krótki) + kod sądu (4 znaki, 3. to cyfra) +
    -- 7-8 cyfr numeru + cyfra kontrolna, z dowolnymi separatorami
    -- (spacja / \ . -), + reszta tekstu.
    m := regexp_match(
      rest,
      '^(.*?)\y([A-Za-z0-9]{2}[0-9][A-Za-z0-9])[\s/\\.-]{0,3}([0-9]{7,8})[\s/\\.-]{0,3}([0-9])\y(.*)$'
    );
    EXIT WHEN m IS NULL;
    out_text := out_text || m[1] || upper(m[2]) || '/' || lpad(m[3], 8, '0') || '/' || m[4];
    rest := m[5];
  END LOOP;
  RETURN out_text || rest;
END;
$$;

COMMENT ON FUNCTION public.normalize_kw_numbers_in_text(text) IS
  'Przepisuje wszystkie numery KW w tekście do formy XXXX/NNNNNNNN/C '
  '(odpowiednik normalizeKwNumbersInText z src/lib/kw.ts).';

-- Główne pole numeru KW.
UPDATE public.properties
SET land_register_number = public.normalize_kw_numbers_in_text(land_register_number),
    updated_at = now()
WHERE land_register_number IS NOT NULL
  AND public.normalize_kw_numbers_in_text(land_register_number)
      IS DISTINCT FROM land_register_number;

-- Dodatkowe numery KW (tablica tekstów).
UPDATE public.properties
SET additional_land_register_numbers = (
      SELECT COALESCE(
        array_agg(public.normalize_kw_numbers_in_text(x) ORDER BY ord),
        '{}'::text[]
      )
      FROM unnest(additional_land_register_numbers) WITH ORDINALITY AS t(x, ord)
    ),
    updated_at = now()
WHERE additional_land_register_numbers <> '{}'::text[]
  AND EXISTS (
    SELECT 1
    FROM unnest(additional_land_register_numbers) AS x
    WHERE public.normalize_kw_numbers_in_text(x) IS DISTINCT FROM x
  );
