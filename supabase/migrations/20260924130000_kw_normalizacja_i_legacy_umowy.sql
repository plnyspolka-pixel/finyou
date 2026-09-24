-- ════════════════════════════════════════════════════════════════════
-- 1. Jednorazowa normalizacja numerów KW w nieruchomościach
--
-- Numery zapisane bez zer wiodących (np. „KR1P/610770/2”) psuły pobranie
-- treści z CMD i scoring lokalizacji (INVALID_KW). Dopełniamy numer
-- repertoryjny zerami do 8 cyfr: „KR1P/610770/2” → „KR1P/00610770/2”.
-- Dotyczy properties.land_register_number (pole bywa złożone: kilka numerów
-- i dopiski, np. „| Pow. użytkowa: 80 m²”) oraz additional_land_register_numbers.
--
-- Raport zmian: każda zmieniona nieruchomość → wiersz w audit_logs
-- (action = 'kw_normalization', previous_value / new_value). Numery z błędną
-- cyfrą kontrolną są dopełniane (to nie zmienia ich tożsamości), ale NIE
-- poprawiane — trafiają do raportu jako `bledna_cyfra_kontrolna`
-- (action = 'kw_normalization_invalid'), do ręcznej weryfikacji.
-- Podgląd bez zapisu: scripts/kw-normalizacja-raport.ts.
--
-- Algorytm cyfry kontrolnej = src/lib/kw.ts (kwCheckDigit): cyfry 0–9,
-- X = 10, litery A…Z bez Q i V kolejno od 11; wagi 1-3-7; suma mod 10.
-- Funkcje pomocnicze w pg_temp — znikają po migracji.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION pg_temp.kw_cyfra_kontrolna(kod text, nr8 text)
RETURNS int LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  znaki text := upper(kod) || nr8;
  litery constant text := 'ABCDEFGHIJKLMNOPRSTUWYZ';
  wagi constant int[] := ARRAY[1, 3, 7];
  suma int := 0;
  z text;
  w int;
BEGIN
  IF length(znaki) <> 12 THEN RETURN NULL; END IF;
  FOR i IN 1..12 LOOP
    z := substr(znaki, i, 1);
    IF z ~ '^[0-9]$' THEN w := z::int;
    ELSIF z = 'X' THEN w := 10;
    ELSIF strpos(litery, z) > 0 THEN w := 10 + strpos(litery, z);
    ELSE RETURN NULL;
    END IF;
    suma := suma + w * wagi[((i - 1) % 3) + 1];
  END LOOP;
  RETURN suma % 10;
END $$;

-- Normalizuje każdy numer KW w tekście; zwraca nowy tekst + listę numerów
-- z błędną cyfrą kontrolną (po normalizacji).
CREATE OR REPLACE FUNCTION pg_temp.kw_normalizuj(t text, OUT wynik text, OUT bledne text[])
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  m text[];
  nowy text;
BEGIN
  wynik := t;
  bledne := ARRAY[]::text[];
  IF t IS NULL THEN RETURN; END IF;
  FOR m IN
    SELECT regexp_matches(t, '(\m([A-Za-z]{2}[0-9][A-Za-z0-9])\s*/\s*([0-9]{1,8})\s*/\s*([0-9])\M)', 'g')
  LOOP
    nowy := upper(m[2]) || '/' || lpad(m[3], 8, '0') || '/' || m[4];
    wynik := replace(wynik, m[1], nowy);
    IF pg_temp.kw_cyfra_kontrolna(m[2], lpad(m[3], 8, '0')) IS DISTINCT FROM m[4]::int THEN
      bledne := array_append(bledne, nowy);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  r record;
  n_lrn record;
  nowe_dodatkowe text[];
  bledne text[];
  el text;
  el_n record;
  zmienione int := 0;
  z_bledami int := 0;
BEGIN
  FOR r IN
    SELECT id, land_register_number, additional_land_register_numbers
    FROM public.properties
    WHERE land_register_number ~ '[0-9]\s*/'
       OR array_to_string(additional_land_register_numbers, ' ') ~ '[0-9]\s*/'
  LOOP
    SELECT * INTO n_lrn FROM pg_temp.kw_normalizuj(r.land_register_number);
    bledne := coalesce(n_lrn.bledne, ARRAY[]::text[]);
    nowe_dodatkowe := ARRAY[]::text[];
    FOREACH el IN ARRAY coalesce(r.additional_land_register_numbers, ARRAY[]::text[]) LOOP
      SELECT * INTO el_n FROM pg_temp.kw_normalizuj(el);
      nowe_dodatkowe := array_append(nowe_dodatkowe, el_n.wynik);
      bledne := bledne || el_n.bledne;
    END LOOP;

    IF n_lrn.wynik IS DISTINCT FROM r.land_register_number
       OR nowe_dodatkowe IS DISTINCT FROM coalesce(r.additional_land_register_numbers, ARRAY[]::text[]) THEN
      UPDATE public.properties
         SET land_register_number = n_lrn.wynik,
             additional_land_register_numbers = nowe_dodatkowe
       WHERE id = r.id;
      INSERT INTO public.audit_logs (user_id, object_type, object_id, action, previous_value, new_value)
      VALUES (
        NULL, 'property', r.id, 'kw_normalization',
        jsonb_build_object(
          'land_register_number', r.land_register_number,
          'additional_land_register_numbers', to_jsonb(r.additional_land_register_numbers)
        ),
        jsonb_build_object(
          'land_register_number', n_lrn.wynik,
          'additional_land_register_numbers', to_jsonb(nowe_dodatkowe),
          'bledna_cyfra_kontrolna', to_jsonb(bledne),
          'migracja', '20260924130000_kw_normalizacja_i_legacy_umowy'
        )
      );
      zmienione := zmienione + 1;
    END IF;

    IF array_length(bledne, 1) > 0 THEN
      INSERT INTO public.audit_logs (user_id, object_type, object_id, action, previous_value, new_value)
      VALUES (
        NULL, 'property', r.id, 'kw_normalization_invalid', NULL,
        jsonb_build_object(
          'bledna_cyfra_kontrolna', to_jsonb(bledne),
          'migracja', '20260924130000_kw_normalizacja_i_legacy_umowy'
        )
      );
      z_bledami := z_bledami + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Normalizacja KW: zmienione nieruchomości: %, z błędną cyfrą kontrolną: %',
    zmienione, z_bledami;
END $$;

-- ════════════════════════════════════════════════════════════════════
-- 2. Wzór „u01-04 — umowa pożyczki z załącznikami (REDLINE)” → legacy
--
-- Jedno źródło prawdy dla umowy pożyczki: silnik umów (src/lib/contract-engine)
-- — kreator /admin/kreator-pozyczki, agent umowy /inwestor i MCP
-- (generate_contract_docx). Wzór zostaje w bazie (historia wygenerowanych
-- dokumentów się do niego odwołuje), ale znika z listy kreatora dokumentów,
-- a generatory szablonowe odmawiają jego użycia (use_case = 'legacy').
-- Bez zmian schematu i RLS.
-- ════════════════════════════════════════════════════════════════════

UPDATE public.document_templates
   SET use_case = 'legacy',
       description = 'LEGACY — zastąpiony silnikiem umów (komplet: wniosek, umowa, Zał. 1–3). '
                     || 'Generuj w kreatorze pożyczki: /admin/kreator-pozyczki.'
 WHERE slug = 'u01-04-umowa-pozyczki-z-zalacznikami-redline';
