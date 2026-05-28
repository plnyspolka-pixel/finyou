
-- Make KW tables work standalone in /admin/kw (no application required) and add Firecrawl tracking fields.

ALTER TABLE public.kw_fetch_jobs
  ALTER COLUMN application_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS fetch_provider text NOT NULL DEFAULT 'firecrawl',
  ADD COLUMN IF NOT EXISTS created_by uuid NULL;

ALTER TABLE public.kw_fetch_attempts
  ALTER COLUMN application_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS fetch_provider text NOT NULL DEFAULT 'firecrawl',
  ADD COLUMN IF NOT EXISTS firecrawl_request jsonb,
  ADD COLUMN IF NOT EXISTS firecrawl_response jsonb;

ALTER TABLE public.kw_section_sources
  ALTER COLUMN application_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS markdown text,
  ADD COLUMN IF NOT EXISTS screenshot_url text;

ALTER TABLE public.kw_analysis
  ALTER COLUMN application_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS job_id uuid NULL;

-- Drop any old unique constraint on application_id (was used for upsert) so we can have multiple analyses (per job) in test mode.
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.kw_analysis'::regclass AND contype IN ('u','p') AND conname <> 'kw_analysis_pkey'
  LOOP
    EXECUTE format('ALTER TABLE public.kw_analysis DROP CONSTRAINT %I', c);
  END LOOP;
END$$;

CREATE INDEX IF NOT EXISTS idx_kw_jobs_created_at ON public.kw_fetch_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kw_sources_job ON public.kw_section_sources(job_id);
CREATE INDEX IF NOT EXISTS idx_kw_analysis_job ON public.kw_analysis(job_id);
CREATE INDEX IF NOT EXISTS idx_kw_attempts_job ON public.kw_fetch_attempts(job_id);
