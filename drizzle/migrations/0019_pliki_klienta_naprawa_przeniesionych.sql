-- Naprawa plików „przeniesionych" migracją 20260715090000_pliki_klienta_unified_bucket.
--
-- Tamta migracja zmieniła tylko storage.objects.bucket_id ('documents' /
-- 'property-photos' → 'pliki-klienta'). To są wyłącznie METADANE — sam plik
-- w magazynie Storage leży pod kluczem <bucket>/<name>/<version>, więc nadal
-- siedzi pod starym bucketem. Skutek: podpisanie linku w 'pliki-klienta' się
-- udaje (wiersz jest), ale pobranie zwraca 404 NoSuchKey — operator widzi
-- puste miniatury i podgląd.
--
-- Naprawę robi narzędzie MCP `repair_client_files` (serwer, rola serwisowa):
--   1) pliki_klienta_do_naprawy — lista kandydatów (obiekty sprzed migracji),
--   2) pliki_klienta_cien(add) — tymczasowy wiersz-cień w starym buckecie
--      (kopia metadanych z tą samą wersją), dzięki któremu Storage API znów
--      widzi plik pod starym kluczem i pozwala go pobrać,
--   3) narzędzie pobiera plik ze starego bucketu i wgrywa go ponownie do
--      'pliki-klienta' (upsert) — teraz już fizycznie pod właściwym kluczem,
--   4) pliki_klienta_cien(remove) — usuwa wiersz-cień (tylko metadane; stary
--      plik w magazynie zostaje nietknięty jako kopia zapasowa).

CREATE OR REPLACE FUNCTION public.pliki_klienta_do_naprawy(
  p_after text DEFAULT '',
  p_limit integer DEFAULT 50,
  p_before timestamptz DEFAULT '2026-07-19 00:00:00+00'
)
RETURNS TABLE (name text, mimetype text, size bigint, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT o.name,
         o.metadata->>'mimetype',
         NULLIF(o.metadata->>'size', '')::bigint,
         o.created_at
  FROM storage.objects o
  WHERE o.bucket_id = 'pliki-klienta'
    AND o.created_at < p_before
    AND o.name > COALESCE(p_after, '')
  ORDER BY o.name
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
$$;

CREATE OR REPLACE FUNCTION public.pliki_klienta_cien(
  p_name text,
  p_bucket text,
  p_add boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cols text;
  n integer;
BEGIN
  IF p_bucket NOT IN ('documents', 'property-photos') THEN
    RAISE EXCEPTION 'pliki_klienta_cien: nieobsługiwany bucket %', p_bucket;
  END IF;

  IF p_add THEN
    -- Kopiujemy wszystkie zwykłe kolumny (bez id, bucket_id i kolumn
    -- generowanych) — lista z katalogu, bo schemat storage.objects zmienia
    -- się między wersjami Supabase.
    SELECT string_agg(quote_ident(c.column_name::text), ', ' ORDER BY c.ordinal_position)
      INTO cols
    FROM information_schema.columns c
    WHERE c.table_schema = 'storage'
      AND c.table_name = 'objects'
      AND c.column_name NOT IN ('id', 'bucket_id')
      AND c.is_generated = 'NEVER';

    EXECUTE format(
      'INSERT INTO storage.objects (bucket_id, %1$s)
       SELECT $1, %1$s FROM storage.objects
       WHERE bucket_id = %2$L AND name = $2
       ON CONFLICT DO NOTHING',
      cols, 'pliki-klienta'
    ) USING p_bucket, p_name;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n > 0;
  END IF;

  -- Usuwamy tylko wiersz metadanych; plik w magazynie zostaje.
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects o WHERE o.bucket_id = p_bucket AND o.name = p_name;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.pliki_klienta_do_naprawy(text, integer, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pliki_klienta_cien(text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pliki_klienta_do_naprawy(text, integer, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.pliki_klienta_cien(text, text, boolean) TO service_role;
