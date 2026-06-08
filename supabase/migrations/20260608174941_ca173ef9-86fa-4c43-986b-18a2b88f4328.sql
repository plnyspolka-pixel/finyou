
ALTER TABLE public.tracking_settings
  ADD COLUMN IF NOT EXISTS google_ads_label_registration TEXT,
  ADD COLUMN IF NOT EXISTS google_ads_label_lead TEXT,
  ADD COLUMN IF NOT EXISTS google_ads_label_submit TEXT,
  ADD COLUMN IF NOT EXISTS google_ads_label_subscribe TEXT;

UPDATE public.tracking_settings
SET google_ads_conversion_id = 'AW-413945576',
    google_ads_label_registration = 'foxcCOqrrLscEOidscUB'
WHERE id = 1;
