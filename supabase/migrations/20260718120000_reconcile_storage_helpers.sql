-- Naprawa plików „przeniesionych" migracjami 20260715090000 / 20260718090000.
--
-- Tamte migracje przeniosły obiekty do bucketu `pliki-klienta` WYŁĄCZNIE przez
-- `UPDATE storage.objects SET bucket_id = 'pliki-klienta'`. W Supabase fizyczny
-- plik leży w S3 pod kluczem `{bucket_id}/{name}/{version}`, więc sama zmiana
-- `bucket_id` w metadanych NIE przenosi bajtów — plik dalej leży pod starym
-- bucketem (`documents` / `property-photos`), a metadane wskazują na
-- `pliki-klienta`. Efekt: `createSignedUrl` się udaje, ale pobranie → 404,
-- a w panelu szare kafelki zamiast miniatur.
--
-- Ta migracja przygotowuje grunt pod funkcję edge `reconcile-storage`, która
-- fizycznie skopiuje osierocone bloby z powrotem do `pliki-klienta`:
--   1) odtwarza puste buckety `documents` / `property-photos`, żeby stare
--      fizyczne bloby znów były adresowalne przez Storage API,
--   2) dodaje funkcje pomocnicze (tylko dla `service_role`), którymi funkcja
--      edge zakłada i kasuje tymczasowe „shadow" wiersze metadanych
--      wskazujące na fizyczny blob w starym buckecie.
--
-- Całość idempotentna i bezpieczna: nie rusza istniejących wierszy
-- `pliki-klienta` — dokłada tylko tymczasowe wiersze w starych bucketach,
-- które funkcja edge kasuje po skopiowaniu.

-- 1) Odtworzenie starych bucketów (prywatne). Fizyczne bloby dalej tam leżą
--    pod S3 — usunięto tylko wiersz z storage.buckets, nie same pliki.
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('documents', 'documents', false),
  ('property-photos', 'property-photos', false)
ON CONFLICT (id) DO NOTHING;

-- 2) Zwraca stronę nazw obiektów z bucketu `pliki-klienta` (do iteracji w edge).
CREATE OR REPLACE FUNCTION public.reconcile_object_names(p_offset integer, p_limit integer)
RETURNS TABLE(name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'storage'
AS $$
  SELECT o.name
  FROM storage.objects o
  WHERE o.bucket_id = 'pliki-klienta'
  ORDER BY o.name
  OFFSET greatest(p_offset, 0)
  LIMIT least(greatest(p_limit, 1), 1000);
$$;

-- 3) Zakłada tymczasowy „shadow" wiersz w starym buckecie wskazujący na TEN SAM
--    fizyczny blob (ta sama nazwa + version), co wiersz w `pliki-klienta`.
--    Dzięki temu Storage API potrafi pobrać osierocony blob. Kopiujemy tylko
--    kolumny obecne od dawna (id, bucket_id, name, version, metadata) — reszta
--    (owner itd.) nieistotna, bo odczyt idzie service_role (omija RLS).
CREATE OR REPLACE FUNCTION public.reconcile_shadow_upsert(p_name text, p_src_bucket text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'storage'
AS $$
BEGIN
  IF p_src_bucket NOT IN ('documents', 'property-photos') THEN
    RETURN false;
  END IF;

  DELETE FROM storage.objects
  WHERE bucket_id = p_src_bucket AND name = p_name;

  INSERT INTO storage.objects (id, bucket_id, name, version, metadata)
  SELECT gen_random_uuid(), p_src_bucket, o.name, o.version, o.metadata
  FROM storage.objects o
  WHERE o.bucket_id = 'pliki-klienta' AND o.name = p_name
  LIMIT 1;

  RETURN FOUND;
END;
$$;

-- 4) Kasuje shadow wiersz po skopiowaniu bloba.
CREATE OR REPLACE FUNCTION public.reconcile_shadow_delete(p_name text, p_src_bucket text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'storage'
AS $$
BEGIN
  IF p_src_bucket NOT IN ('documents', 'property-photos') THEN
    RETURN;
  END IF;
  DELETE FROM storage.objects
  WHERE bucket_id = p_src_bucket AND name = p_name;
END;
$$;

-- Tylko service_role (funkcja edge). Nigdy anon/authenticated.
REVOKE ALL ON FUNCTION public.reconcile_object_names(integer, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_shadow_upsert(text, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_shadow_delete(text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_object_names(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_shadow_upsert(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_shadow_delete(text, text) TO service_role;
