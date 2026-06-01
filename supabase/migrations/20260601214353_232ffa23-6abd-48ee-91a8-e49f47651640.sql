CREATE TABLE public.tracking_settings (
  id INT PRIMARY KEY DEFAULT 1,
  client_pixel_id TEXT,
  investor_pixel_id TEXT,
  track_lead BOOLEAN NOT NULL DEFAULT true,
  track_registration BOOLEAN NOT NULL DEFAULT true,
  track_subscribe BOOLEAN NOT NULL DEFAULT true,
  track_contact BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tracking_settings_single CHECK (id = 1)
);

INSERT INTO public.tracking_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

GRANT SELECT ON public.tracking_settings TO anon, authenticated;
GRANT ALL ON public.tracking_settings TO service_role;

ALTER TABLE public.tracking_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pixel IDs are public-readable" ON public.tracking_settings
  FOR SELECT USING (true);

CREATE POLICY "Only admins can update tracking" ON public.tracking_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'administrator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'));

CREATE TRIGGER tracking_settings_updated_at
  BEFORE UPDATE ON public.tracking_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();