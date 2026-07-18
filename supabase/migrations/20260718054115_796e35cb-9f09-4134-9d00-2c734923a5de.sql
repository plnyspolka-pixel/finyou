
-- 1) Kolumny na wniosku
ALTER TABLE public.loan_applications
  ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES public.loan_applications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_loan_applications_merged_into
  ON public.loan_applications(merged_into_id) WHERE merged_into_id IS NOT NULL;

-- 2) Helpery normalizujące
CREATE OR REPLACE FUNCTION public.pl_strip_diacritics(_s text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(btrim(translate(coalesce(_s,''),
    'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ',
    'acelnoszzACELNOSZZ')));
$$;

-- Słownik zdrobnień → forma kanoniczna (bez ogonków, lowercase).
CREATE OR REPLACE FUNCTION public.pl_first_name_canonical(_name text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  WITH n AS (SELECT public.pl_strip_diacritics(_name) AS v)
  SELECT COALESCE(
    (SELECT canonical FROM (VALUES
      -- męskie
      ('waldek','waldemar'),('waldi','waldemar'),
      ('tomek','tomasz'),('tomcio','tomasz'),('tomus','tomasz'),
      ('kuba','jakub'),('kubus','jakub'),
      ('olek','aleksander'),('aleks','aleksander'),('alek','aleksander'),
      ('kasper','kacper'),
      ('krzysiek','krzysztof'),('krzychu','krzysztof'),('krzysio','krzysztof'),
      ('michu','michal'),('misiek','michal'),('michas','michal'),
      ('maciek','maciej'),('maciu','maciej'),('macius','maciej'),
      ('piotrek','piotr'),('piotrus','piotr'),
      ('pawelek','pawel'),
      ('staszek','stanislaw'),('stasiu','stanislaw'),('stach','stanislaw'),('stas','stanislaw'),
      ('wojtek','wojciech'),('wojtus','wojciech'),
      ('zbyszek','zbigniew'),('zbychu','zbigniew'),
      ('jurek','jerzy'),
      ('janek','jan'),('jasiu','jan'),('jas','jan'),('janusz','janusz'),
      ('rysiek','ryszard'),('rychu','ryszard'),
      ('jozek','jozef'),('juzek','jozef'),
      ('edek','edward'),
      ('heniek','henryk'),('henio','henryk'),
      ('franek','franciszek'),('franus','franciszek'),
      ('bodzio','bogdan'),
      ('darek','dariusz'),('daro','dariusz'),
      ('gienek','eugeniusz'),
      ('witek','witold'),
      ('mietek','mieczyslaw'),
      ('czesiek','czeslaw'),('czesio','czeslaw'),
      ('lucek','lucjan'),
      ('lutek','ludwik'),
      ('felek','feliks'),
      ('ignac','ignacy'),
      ('kazik','kazimierz'),('kazio','kazimierz'),
      ('lolek','karol'),
      ('romek','roman'),
      ('sebek','sebastian'),('seba','sebastian'),
      ('slawek','slawomir'),
      ('zenek','zenon'),
      ('zdzisiek','zdzislaw'),('zdzich','zdzislaw'),
      ('adas','adam'),('adamek','adam'),
      ('antek','antoni'),('antos','antoni'),
      ('bartek','bartlomiej'),('bartus','bartlomiej'),('bartosz','bartosz'),
      ('grzesiek','grzegorz'),('grzes','grzegorz'),
      ('leszek','leszek'),
      ('marcinek','marcin'),
      ('marek','marek'),('mareczek','marek'),
      ('mariuszek','mariusz'),
      ('miki','mikolaj'),
      ('robek','robert'),('robcio','robert'),
      ('rafalek','rafal'),
      ('tadek','tadeusz'),('tadzio','tadeusz'),
      ('wladek','wladyslaw'),('wladzio','wladyslaw'),
      ('luk','lukasz'),('lukaszek','lukasz'),('lucus','lukasz'),
      -- żeńskie
      ('kasia','katarzyna'),('kaska','katarzyna'),('kasienka','katarzyna'),
      ('ania','anna'),('anka','anna'),('aneczka','anna'),
      ('basia','barbara'),('baska','barbara'),
      ('gosia','malgorzata'),('malgosia','malgorzata'),
      ('iza','izabela'),('izunia','izabela'),
      ('ela','elzbieta'),('elzunia','elzbieta'),
      ('magda','magdalena'),('madzia','magdalena'),
      ('ola','aleksandra'),('oleńka','aleksandra'),('olenka','aleksandra'),
      ('aga','agnieszka'),('agusia','agnieszka'),('agnes','agnieszka'),
      ('jola','jolanta'),
      ('kinia','kinga'),
      ('justynka','justyna'),
      ('dorotka','dorota'),
      ('ewka','ewa'),('ewunia','ewa'),
      ('marysia','maria'),('mania','maria'),
      ('krysia','krystyna'),('kryska','krystyna'),
      ('halinka','halina'),
      ('irka','irena'),('irenka','irena'),
      ('jadzia','jadwiga'),
      ('lucyna','lucyna'),('lucyska','lucyna'),
      ('renia','renata'),('renatka','renata'),
      ('teresa','teresa'),('tereska','teresa'),
      ('zosia','zofia'),('zoska','zofia'),
      ('zuza','zuzanna'),('zuzia','zuzanna'),
      ('wanda','wanda'),('wandzia','wanda'),
      ('urszulka','urszula'),('ula','urszula'),
      ('bogda','bogumila'),('boguska','bogumila'),
      ('danka','danuta'),('danusia','danuta'),
      ('helenka','helena'),('hela','helena'),
      ('jagoda','jagoda'),
      ('julka','julia'),('jula','julia'),
      ('kamilka','kamila'),
      ('karolinka','karolina'),
      ('klaudia','klaudia'),('klauska','klaudia'),
      ('lenka','lena'),
      ('martynka','martyna'),
      ('monia','monika'),('monisia','monika'),
      ('natalka','natalia'),('nati','natalia'),
      ('paulinka','paulina'),('pola','paulina'),
      ('sylwka','sylwia'),
      ('wiktorka','wiktoria'),('wika','wiktoria'),
      ('zaneta','zaneta')
    ) AS d(dim, canonical)
     WHERE d.dim = (SELECT v FROM n)),
    (SELECT v FROM n)
  );
$$;

-- 3) Główna funkcja deduplikacji
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

    -- Świeży snapshot żywych wniosków z kluczami dopasowań
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

    -- Dla każdego klucza scal duplikaty (najstarszy = kanoniczny)
    FOREACH key_col IN ARRAY ARRAY['kw','phone','email','name_key'] LOOP
      -- Zbuduj mapę duplikat → kanoniczny
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

      -- Przenieś FK w tabelach zależnych
      FOR tbl IN
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name IN ('loan_application_id','application_id','source_application_id')
          AND table_name NOT IN ('loan_applications')
      LOOP
        EXECUTE format(
          'UPDATE public.%I t SET %I = m.canonical FROM _dedup_map m WHERE t.%I = m.dup_id',
          tbl.table_name, tbl.column_name, tbl.column_name
        );
      END LOOP;

      -- Zarchiwizuj duplikaty
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

      -- Usuń zarchiwizowane ze snapshotu, by kolejne klucze widziały nowy stan
      DELETE FROM _dedup_live WHERE id IN (SELECT dup_id FROM _dedup_map);
    END LOOP;

    EXIT WHEN merged_in_pass = 0;
  END LOOP;

  RETURN merged_total;
END;
$$;

REVOKE ALL ON FUNCTION public.dedup_loan_applications() FROM public, anon, authenticated;

-- 4) Cron co godzinę
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dedup-loan-applications') THEN
    PERFORM cron.unschedule('dedup-loan-applications');
  END IF;
  PERFORM cron.schedule(
    'dedup-loan-applications',
    '17 * * * *',
    $cron$ SELECT public.dedup_loan_applications(); $cron$
  );
END $$;
