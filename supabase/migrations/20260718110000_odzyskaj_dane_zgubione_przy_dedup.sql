-- Odzyskanie danych zgubionych przy scalaniu duplikatów wniosków.
--
-- Cron `dedup_loan_applications` (migracje 20260718054115/054214/061302) scala
-- duplikaty wniosków: przenosi rekordy podrzędne (properties, documents, leads…)
-- na najstarszy wniosek i archiwizuje nowsze. NIE przenosił jednak:
--   * loan_amount — gdy kanoniczny (najstarszy) wniosek nie miał kwoty, a
--     archiwizowany duplikat miał (np. klient wypełnił później pełny formularz
--     landing_wizard) — kwota „znikała" z panelu (przypadek: Witold Gądek),
--   * danych klienta — gdy duplikat wskazywał INNY rekord `clients` z telefonem
--     i e-mailem, kanoniczny wniosek zostawał z klientem bez kontaktu
--     (przypadek: Waldek/Waldemar Trojanowski, wniosek z Messengera scalony
--     z wnioskami z Meta Lead Ads + landing_wizard),
--   * wątku czatu — `chat_threads` ma UNIQUE(loan_application_id); przy
--     konflikcie generyczna obsługa kasowała wątek duplikatu KASKADOWO razem
--     z wiadomościami.
--
-- Ta migracja: (1) uzupełnia kanoniczne wnioski danymi z ich zarchiwizowanych
-- duplikatów, (2) przelicza statusy, (3) podmienia dedup na wersję, która
-- scala dane w momencie archiwizacji. Całość idempotentna.

-- ============================================================================
-- 1) Mapa duplikat -> ostateczny kanoniczny (łańcuchy merged_into_id).
-- ============================================================================
CREATE TEMP TABLE _merge_map ON COMMIT DROP AS
WITH RECURSIVE chain AS (
  SELECT id AS dup_id, merged_into_id AS canon_id, 1 AS depth
  FROM public.loan_applications
  WHERE merged_into_id IS NOT NULL
  UNION ALL
  SELECT c.dup_id, la.merged_into_id, c.depth + 1
  FROM chain c
  JOIN public.loan_applications la ON la.id = c.canon_id
  WHERE la.merged_into_id IS NOT NULL AND c.depth < 10
)
SELECT DISTINCT ON (dup_id) dup_id, canon_id
FROM chain
ORDER BY dup_id, depth DESC;

-- ============================================================================
-- 2) Kwota pożyczki: kanoniczny bez kwoty dostaje kwotę z duplikatu.
--    Preferencja: kwota wpisana przez klienta w formularzu, potem najnowsza.
-- ============================================================================
WITH best AS (
  SELECT DISTINCT ON (m.canon_id) m.canon_id, dup.loan_amount
  FROM _merge_map m
  JOIN public.loan_applications dup ON dup.id = m.dup_id
  WHERE dup.loan_amount IS NOT NULL AND dup.loan_amount > 0
  ORDER BY m.canon_id,
    (dup.source IN ('landing_wizard','landing_single_page','panel_klienta','embed')) DESC,
    dup.created_at DESC
)
UPDATE public.loan_applications la
SET loan_amount = b.loan_amount,
    updated_at = now()
FROM best b
WHERE la.id = b.canon_id
  AND la.loan_amount IS NULL;

-- ============================================================================
-- 3) Dane klienta kanonicznego wniosku: uzupełnij brakujący kontakt (telefon,
--    e-mail, miasto) i placeholderowe imię/nazwisko danymi klientów z
--    zarchiwizowanych duplikatów. Nadpisujemy WYŁĄCZNIE puste/placeholderowe
--    pola — prawdziwe dane zostają nietknięte.
-- ============================================================================
CREATE TEMP TABLE _client_cand ON COMMIT DROP AS
SELECT
  m.canon_id,
  can.client_id AS canon_client_id,
  dc.first_name, dc.last_name, dc.email, dc.phone, dc.phone_raw,
  dc.phone_normalized, dc.city,
  (dup.source IN ('landing_wizard','landing_single_page','panel_klienta','embed')) AS from_form,
  dup.created_at AS dup_created
FROM _merge_map m
JOIN public.loan_applications can ON can.id = m.canon_id
JOIN public.loan_applications dup ON dup.id = m.dup_id
JOIN public.clients dc ON dc.id = dup.client_id
WHERE can.client_id IS NOT NULL
  AND dc.id <> can.client_id;

-- e-mail
WITH best AS (
  SELECT DISTINCT ON (canon_client_id) canon_client_id, email
  FROM _client_cand
  WHERE nullif(btrim(email), '') IS NOT NULL
  ORDER BY canon_client_id, from_form DESC, dup_created DESC
)
UPDATE public.clients c
SET email = b.email
FROM best b
WHERE c.id = b.canon_client_id
  AND nullif(btrim(c.email), '') IS NULL;

-- telefon (wszystkie trzy warianty naraz, z tego samego kandydata)
WITH best AS (
  SELECT DISTINCT ON (canon_client_id) canon_client_id, phone, phone_raw, phone_normalized
  FROM _client_cand
  WHERE coalesce(nullif(btrim(phone), ''), nullif(btrim(phone_normalized), ''), nullif(btrim(phone_raw), '')) IS NOT NULL
  ORDER BY canon_client_id, from_form DESC, dup_created DESC
)
UPDATE public.clients c
SET phone = coalesce(nullif(btrim(c.phone), ''), nullif(btrim(b.phone), ''), nullif(btrim(b.phone_normalized), ''), b.phone_raw),
    phone_raw = coalesce(nullif(btrim(c.phone_raw), ''), b.phone_raw, b.phone),
    phone_normalized = coalesce(nullif(btrim(c.phone_normalized), ''), b.phone_normalized)
FROM best b
WHERE c.id = b.canon_client_id
  AND nullif(btrim(c.phone), '') IS NULL
  AND nullif(btrim(c.phone_normalized), '') IS NULL;

-- miasto
WITH best AS (
  SELECT DISTINCT ON (canon_client_id) canon_client_id, city
  FROM _client_cand
  WHERE nullif(btrim(city), '') IS NOT NULL
  ORDER BY canon_client_id, from_form DESC, dup_created DESC
)
UPDATE public.clients c
SET city = b.city
FROM best b
WHERE c.id = b.canon_client_id
  AND nullif(btrim(c.city), '') IS NULL;

-- imię i nazwisko — tylko gdy obecne jest puste albo placeholderowe
WITH best AS (
  SELECT DISTINCT ON (canon_client_id) canon_client_id, first_name, last_name
  FROM _client_cand
  WHERE lower(btrim(coalesce(first_name, ''))) NOT IN ('', 'klient', 'klientka', 'brak', '—', '-')
    AND lower(btrim(coalesce(last_name, ''))) NOT IN ('', '(brak nazwiska)', 'brak', 'z leada', '—', '-')
  ORDER BY canon_client_id, from_form DESC, dup_created DESC
)
UPDATE public.clients c
SET first_name = b.first_name,
    last_name = b.last_name
FROM best b
WHERE c.id = b.canon_client_id
  AND (
    lower(btrim(coalesce(c.first_name, ''))) IN ('', 'klient', 'klientka', 'brak', '—', '-')
    OR lower(btrim(coalesce(c.last_name, ''))) IN ('', '(brak nazwiska)', 'brak', 'z leada', '—', '-')
  );

-- ============================================================================
-- 4) Przelicz statusy kanonicznych wniosków po uzupełnieniu danych
--    (np. Gądek: „brak_kwoty" -> dalej po drabince, bo kwota wróciła).
-- ============================================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT canon_id FROM _merge_map LOOP
    PERFORM public.apply_loan_auto_status(r.canon_id);
  END LOOP;
END $$;

-- Wniosek w „szukamy_inwestora" jest z definicji kompletny — wyrównaj pasek
-- kompletności (apply_loan_auto_status zmienia tylko status, nie procent).
UPDATE public.loan_applications
SET completeness_percent = 100
WHERE merged_into_id IS NULL
  AND archived_at IS NULL
  AND status = 'szukamy_inwestora'
  AND coalesce(completeness_percent, 0) < 100;

-- ============================================================================
-- 5) Dedup v4: przy scalaniu przenosi kwotę, dane klienta i wiadomości czatu
--    na wniosek kanoniczny ZANIM zarchiwizuje duplikat; po scaleniu przelicza
--    status kanonicznego. Logika wykrywania duplikatów bez zmian (wersja z
--    20260718061302: placeholderowe nazwy pomijane, name_key wymaga wspólnego
--    kontaktu).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.dedup_loan_applications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  merged_total integer := 0;
  merged_in_pass integer;
  pass integer := 0;
  key_col text;
  tbl record;
  canon_rec record;
  final_statuses text[] := ARRAY[
    'archiwalny','wyplacony','zamkniete','zamkniety','wniosek_odrzucony',
    'umowa_podpisana','zabezpieczenia_ustanowione','dokumenty_dostarczone_do_inwestora',
    'oczekuje_wyplaty'
  ];
  -- Placeholder imion/nazwisk, które NIE mogą być podstawą scalania.
  placeholder_names text[] := ARRAY[
    'klient','klientka','brak','braknazwiska','brakimienia','brakdanych',
    'nieznany','nieznana','anonim','anonimowy','test','testowy','n/a','na',
    'unknown','user','uzytkownik','xxx'
  ];
BEGIN
  LOOP
    pass := pass + 1;
    EXIT WHEN pass > 4;

    DROP TABLE IF EXISTS _dedup_live;
    CREATE TEMP TABLE _dedup_live ON COMMIT DROP AS
    SELECT
      la.id,
      la.created_at,
      NULLIF(c.phone_normalized, '') AS phone,
      NULLIF(lower(btrim(c.email)), '') AS email,
      CASE
        WHEN NULLIF(btrim(c.first_name),'') IS NULL OR NULLIF(btrim(c.last_name),'') IS NULL THEN NULL
        WHEN public.pl_first_name_canonical(c.first_name) = ANY(placeholder_names) THEN NULL
        WHEN public.pl_strip_diacritics(regexp_replace(lower(btrim(c.last_name)), '[^a-z]', '', 'g'))
             = ANY(placeholder_names) THEN NULL
        WHEN length(public.pl_strip_diacritics(regexp_replace(lower(btrim(c.last_name)), '[^a-z]', '', 'g'))) < 3 THEN NULL
        ELSE public.pl_first_name_canonical(c.first_name) || '|' || public.pl_strip_diacritics(c.last_name)
      END AS name_key,
      (
        SELECT upper(regexp_replace(p.land_register_number, '\s', '', 'g'))
        FROM public.properties p
        WHERE p.loan_application_id = la.id
          AND p.land_register_number IS NOT NULL
          AND length(btrim(p.land_register_number)) > 5
        ORDER BY p.created_at NULLS LAST
        LIMIT 1
      ) AS kw
    FROM public.loan_applications la
    JOIN public.clients c ON c.id = la.client_id
    WHERE la.merged_into_id IS NULL
      AND la.status::text <> ALL(final_statuses);

    merged_in_pass := 0;

    FOREACH key_col IN ARRAY ARRAY['kw','phone','email','name_key'] LOOP
      DROP TABLE IF EXISTS _dedup_map;
      IF key_col = 'name_key' THEN
        -- Scalanie po imieniu+nazwisku wymaga dodatkowo wspólnego kontaktu
        -- (telefon/e-mail/KW). Sam zbieżny name_key już nie wystarcza —
        -- inaczej "Jan Kowalski" scalałby się z innym "Jan Kowalski".
        EXECUTE $f$
          CREATE TEMP TABLE _dedup_map ON COMMIT DROP AS
          WITH ranked AS (
            SELECT id, name_key AS k, phone, email, kw,
              first_value(id) OVER (PARTITION BY name_key ORDER BY created_at, id) AS canonical
            FROM _dedup_live
            WHERE name_key IS NOT NULL
          ),
          canon AS (
            SELECT canonical, phone AS c_phone, email AS c_email, kw AS c_kw
            FROM ranked
            WHERE id = canonical
          )
          SELECT r.id AS dup_id, r.canonical
          FROM ranked r
          JOIN canon ON canon.canonical = r.canonical
          WHERE r.id <> r.canonical
            AND (
              (r.phone IS NOT NULL AND r.phone = canon.c_phone)
              OR (r.email IS NOT NULL AND r.email = canon.c_email)
              OR (r.kw    IS NOT NULL AND r.kw    = canon.c_kw)
            );
        $f$;
      ELSE
        EXECUTE format($f$
          CREATE TEMP TABLE _dedup_map ON COMMIT DROP AS
          WITH ranked AS (
            SELECT id, %I AS k,
              first_value(id) OVER (PARTITION BY %I ORDER BY created_at, id) AS canonical
            FROM _dedup_live
            WHERE %I IS NOT NULL
          )
          SELECT id AS dup_id, canonical
          FROM ranked
          WHERE id <> canonical;
        $f$, key_col, key_col, key_col);
      END IF;

      -- === SCALENIE DANYCH (zanim cokolwiek przeniesiemy/zarchiwizujemy) ===

      -- a) Kwota pożyczki: kanoniczny bez kwoty przejmuje kwotę duplikatu.
      UPDATE public.loan_applications can
      SET loan_amount = dup.loan_amount,
          updated_at = now()
      FROM _dedup_map m
      JOIN public.loan_applications dup ON dup.id = m.dup_id
      WHERE can.id = m.canonical
        AND can.loan_amount IS NULL
        AND dup.loan_amount IS NOT NULL;

      -- b) Dane klienta: uzupełnij puste pola klienta kanonicznego danymi
      --    klienta duplikatu (gdy to różne rekordy clients).
      UPDATE public.clients cc
      SET email = coalesce(nullif(btrim(cc.email), ''), dc.email),
          phone = coalesce(nullif(btrim(cc.phone), ''), dc.phone, dc.phone_normalized, dc.phone_raw),
          phone_raw = coalesce(nullif(btrim(cc.phone_raw), ''), dc.phone_raw, dc.phone),
          phone_normalized = coalesce(nullif(btrim(cc.phone_normalized), ''), dc.phone_normalized),
          city = coalesce(nullif(btrim(cc.city), ''), dc.city),
          first_name = CASE
            WHEN lower(btrim(coalesce(cc.first_name, ''))) IN ('', 'klient', 'klientka', 'brak', '—', '-')
              AND nullif(btrim(dc.first_name), '') IS NOT NULL
            THEN dc.first_name ELSE cc.first_name END,
          last_name = CASE
            WHEN lower(btrim(coalesce(cc.last_name, ''))) IN ('', '(brak nazwiska)', 'brak', 'z leada', '—', '-')
              AND nullif(btrim(dc.last_name), '') IS NOT NULL
            THEN dc.last_name ELSE cc.last_name END
      FROM _dedup_map m
      JOIN public.loan_applications can ON can.id = m.canonical
      JOIN public.loan_applications dup ON dup.id = m.dup_id
      JOIN public.clients dc ON dc.id = dup.client_id
      WHERE cc.id = can.client_id
        AND dc.id <> cc.id;

      -- c) Czat: chat_threads ma UNIQUE(loan_application_id). Gdy obie strony
      --    mają wątek, przenieś wiadomości duplikatu do wątku kanonicznego i
      --    usuń pusty wątek — zamiast kasować go kaskadowo z wiadomościami.
      UPDATE public.chat_messages msg
      SET thread_id = ct_can.id
      FROM _dedup_map m
      JOIN public.chat_threads ct_dup ON ct_dup.loan_application_id = m.dup_id
      JOIN public.chat_threads ct_can ON ct_can.loan_application_id = m.canonical
      WHERE msg.thread_id = ct_dup.id;

      DELETE FROM public.chat_threads ct
      USING _dedup_map m, public.chat_threads ct_can
      WHERE ct.loan_application_id = m.dup_id
        AND ct_can.loan_application_id = m.canonical;

      -- === PRZENIESIENIE REKORDÓW PODRZĘDNYCH ===
      FOR tbl IN
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name IN ('loan_application_id','application_id','source_application_id')
          AND table_name NOT IN ('loan_applications')
      LOOP
        BEGIN
          EXECUTE format(
            'UPDATE public.%I t SET %I = m.canonical FROM _dedup_map m WHERE t.%I = m.dup_id',
            tbl.table_name, tbl.column_name, tbl.column_name
          );
        EXCEPTION WHEN unique_violation OR foreign_key_violation OR check_violation THEN
          EXECUTE format(
            'DELETE FROM public.%I t USING _dedup_map m WHERE t.%I = m.dup_id',
            tbl.table_name, tbl.column_name
          );
        END;
      END LOOP;

      -- === ARCHIWIZACJA DUPLIKATU ===
      WITH upd AS (
        UPDATE public.loan_applications la
        SET merged_into_id = m.canonical,
            status = 'archiwalny'::public.loan_status,
            archived_at = now(),
            updated_at = now()
        FROM _dedup_map m
        WHERE la.id = m.dup_id
          AND la.merged_into_id IS NULL
        RETURNING la.id
      )
      SELECT merged_in_pass + count(*) INTO merged_in_pass FROM upd;

      -- Status kanonicznego mógł się zmienić po dosypaniu danych.
      FOR canon_rec IN SELECT DISTINCT canonical FROM _dedup_map LOOP
        PERFORM public.apply_loan_auto_status(canon_rec.canonical);
      END LOOP;

      DELETE FROM _dedup_live WHERE id IN (SELECT dup_id FROM _dedup_map);
    END LOOP;

    merged_total := merged_total + merged_in_pass;
    EXIT WHEN merged_in_pass = 0;
  END LOOP;

  RETURN merged_total;
END;
$function$;

REVOKE ALL ON FUNCTION public.dedup_loan_applications() FROM public, anon, authenticated;
