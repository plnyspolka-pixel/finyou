
CREATE OR REPLACE FUNCTION public.reconcile_object_names(p_offset integer, p_limit integer)
RETURNS TABLE(name text)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public','storage' AS $$
  SELECT o.name FROM storage.objects o
  WHERE o.bucket_id = 'pliki-klienta'
  ORDER BY o.name
  OFFSET greatest(p_offset,0) LIMIT least(greatest(p_limit,1),1000);
$$;

CREATE OR REPLACE FUNCTION public.reconcile_shadow_upsert(p_name text, p_src_bucket text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','storage' AS $$
BEGIN
  IF p_src_bucket NOT IN ('documents','property-photos') THEN RETURN false; END IF;
  DELETE FROM storage.objects WHERE bucket_id = p_src_bucket AND name = p_name;
  INSERT INTO storage.objects (id, bucket_id, name, version, metadata)
  SELECT gen_random_uuid(), p_src_bucket, o.name, o.version, o.metadata
  FROM storage.objects o
  WHERE o.bucket_id = 'pliki-klienta' AND o.name = p_name LIMIT 1;
  RETURN FOUND;
END; $$;

CREATE OR REPLACE FUNCTION public.reconcile_shadow_delete(p_name text, p_src_bucket text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','storage' AS $$
BEGIN
  IF p_src_bucket NOT IN ('documents','property-photos') THEN RETURN; END IF;
  DELETE FROM storage.objects WHERE bucket_id = p_src_bucket AND name = p_name;
END; $$;

REVOKE ALL ON FUNCTION public.reconcile_object_names(integer,integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_shadow_upsert(text,text)      FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_shadow_delete(text,text)      FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reconcile_object_names(integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_shadow_upsert(text,text)      TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_shadow_delete(text,text)      TO service_role;

NOTIFY pgrst, 'reload schema';
