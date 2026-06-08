ALTER TABLE public.tracking_settings 
  ADD COLUMN IF NOT EXISTS ga4_measurement_id TEXT,
  ADD COLUMN IF NOT EXISTS gtm_container_id TEXT,
  ADD COLUMN IF NOT EXISTS google_ads_conversion_id TEXT;

UPDATE public.tracking_settings SET ga4_measurement_id = 'G-J0M18FWNWM' WHERE id = 1;