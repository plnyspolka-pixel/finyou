
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;

-- Prevent anonymous listing of files in the public ad-creatives bucket.
-- The bucket remains public so direct/CDN URLs continue to work, but the
-- broad SELECT policy that allowed clients to enumerate all files is removed.
DROP POLICY IF EXISTS "ad_creatives_public_read" ON storage.objects;
