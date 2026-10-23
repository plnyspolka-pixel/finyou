ALTER TABLE public.youtube_publish_queue
  ADD COLUMN IF NOT EXISTS first_comment_id text,
  ADD COLUMN IF NOT EXISTS first_comment_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_comment_error text;
COMMENT ON COLUMN public.youtube_publish_queue.first_comment_id IS 'YouTube top-level comment ID for newly published videos; historical comments are not modified.';
COMMENT ON COLUMN public.youtube_publish_queue.first_comment_started_at IS 'Atomic one-shot claim: prevents duplicate comments on retries, including ambiguous API outcomes.';