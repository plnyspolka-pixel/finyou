ALTER TABLE public.google_ad_drafts
  ADD COLUMN IF NOT EXISTS external_campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS external_ad_group_id TEXT,
  ADD COLUMN IF NOT EXISTS external_ad_id TEXT,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS publish_error TEXT,
  ADD COLUMN IF NOT EXISTS make_run_id TEXT;