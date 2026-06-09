DROP POLICY IF EXISTS "Pixel IDs are public-readable" ON public.tracking_settings;

CREATE POLICY "Admins and operators can read tracking"
  ON public.tracking_settings
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrator'::app_role)
    OR public.has_role(auth.uid(), 'operator'::app_role)
  );

CREATE OR REPLACE FUNCTION public.get_public_tracking_settings()
RETURNS TABLE (
  client_pixel_id text,
  investor_pixel_id text,
  track_lead boolean,
  track_registration boolean,
  track_subscribe boolean,
  track_contact boolean,
  ga4_measurement_id text,
  gtm_container_id text,
  google_ads_conversion_id text,
  google_ads_label_registration text,
  google_ads_label_lead text,
  google_ads_label_submit text,
  google_ads_label_subscribe text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    client_pixel_id,
    investor_pixel_id,
    track_lead,
    track_registration,
    track_subscribe,
    track_contact,
    ga4_measurement_id,
    gtm_container_id,
    google_ads_conversion_id,
    google_ads_label_registration,
    google_ads_label_lead,
    google_ads_label_submit,
    google_ads_label_subscribe
  FROM public.tracking_settings
  WHERE id = 1
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_tracking_settings() TO anon, authenticated;