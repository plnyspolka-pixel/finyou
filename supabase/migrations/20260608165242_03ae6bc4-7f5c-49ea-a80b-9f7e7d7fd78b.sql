ALTER TABLE public.tracking_settings
  ADD COLUMN IF NOT EXISTS meta_audience_visitors_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_audience_converters_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_audiences_account_id TEXT;