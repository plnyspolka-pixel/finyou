
CREATE OR REPLACE FUNCTION public.dedup_loan_applications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

      -- Przenoszenie FK; na konflikt unique — usuwamy rekordy duplikatu.
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
            archived_at = COALESCE(la.archived_at, now())
        FROM _dedup_map m
        WHERE la.id = m.dup_id
          AND la.merged_into_id IS NULL
        RETURNING la.id
      )
      SELECT count(*) INTO merged_in_pass FROM upd;

      merged_total := merged_total + merged_in_pass;

      DELETE FROM _dedup_live WHERE id IN (SELECT dup_id FROM _dedup_map);
    END LOOP;

    EXIT WHEN merged_in_pass = 0;
  END LOOP;

  RETURN merged_total;
END;
$$;

REVOKE ALL ON FUNCTION public.dedup_loan_applications() FROM public, anon, authenticated;
