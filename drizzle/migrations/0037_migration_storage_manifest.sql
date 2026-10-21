CREATE TABLE public.migration_export_tokens (
  token_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON TABLE public.migration_export_tokens TO service_role;
ALTER TABLE public.migration_export_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.migration_export_tokens FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.migration_list_storage_objects(p_bucket text, p_offset int, p_limit int)
RETURNS TABLE(name text, size bigint, mimetype text, etag text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT o.name::text,
    CASE WHEN o.metadata->>'size' ~ '^[0-9]{1,18}$' THEN (o.metadata->>'size')::bigint ELSE NULL END,
    (o.metadata->>'mimetype')::text,
    COALESCE(o.metadata->>'eTag', o.metadata->>'etag')::text
  FROM storage.objects AS o
  WHERE o.bucket_id = p_bucket
    AND o.name NOT LIKE '%.emptyFolderPlaceholder'
  ORDER BY o.name
  OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)
$$;
REVOKE EXECUTE ON FUNCTION public.migration_list_storage_objects(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migration_list_storage_objects(text, int, int) TO service_role;