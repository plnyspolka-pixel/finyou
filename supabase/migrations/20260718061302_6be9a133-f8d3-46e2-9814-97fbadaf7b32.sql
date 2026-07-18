
-- 1) Rozscal 3 wnioski scalone błędnie po placeholderowej nazwie
UPDATE public.loan_applications
SET merged_into_id = NULL,
    archived_at = NULL,
    status = 'brak_kontaktu'::public.loan_status
WHERE id IN (
  '41b1ee0f-477f-4089-b413-dca68eb7fa27',
  'd07f2bd3-f47f-49f1-8fb6-0e38f6fe89b1'
)
AND merged_into_id = '1f9ff0ee-bc79-4841-b69c-1e28a0377bd3';

-- 2) Nowa wersja dedup: placeholderowe nazwy pomijane, name_key wymaga
--    dodatkowego wspólnego kontaktu (telefon/e-mail/KW) w obu rekordach.
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

      DELETE FROM _dedup_live WHERE id IN (SELECT dup_id FROM _dedup_map);
    END LOOP;

    merged_total := merged_total + merged_in_pass;
    EXIT WHEN merged_in_pass = 0;
  END LOOP;

  RETURN merged_total;
END;
$function$;
