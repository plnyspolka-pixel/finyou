-- Landing pages module
CREATE TABLE public.landing_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  headline TEXT NOT NULL,
  subheadline TEXT,
  cta_text TEXT NOT NULL DEFAULT 'Zapisz się',
  hero_image_url TEXT,
  og_image_url TEXT,
  meta_description TEXT,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  form_fields JSONB NOT NULL DEFAULT '[{"name":"email","label":"Email","type":"email","required":true}]'::jsonb,
  thank_you_message TEXT NOT NULL DEFAULT 'Dziękujemy! Sprawdź skrzynkę.',
  redirect_url TEXT,
  theme JSONB NOT NULL DEFAULT '{"primary":"#0ea5e9","background":"#ffffff"}'::jsonb,
  published BOOLEAN NOT NULL DEFAULT false,
  view_count INT NOT NULL DEFAULT 0,
  conversion_count INT NOT NULL DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.landing_pages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_pages TO authenticated;
GRANT ALL ON public.landing_pages TO service_role;

ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view published landing pages"
  ON public.landing_pages FOR SELECT
  USING (published = true);

CREATE POLICY "Admins can view all landing pages"
  ON public.landing_pages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "Admins can insert landing pages"
  ON public.landing_pages FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "Admins can update landing pages"
  ON public.landing_pages FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "Admins can delete landing pages"
  ON public.landing_pages FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'));

CREATE TRIGGER trg_landing_pages_updated_at
  BEFORE UPDATE ON public.landing_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Leads collected from landing pages
CREATE TABLE public.landing_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_page_id UUID NOT NULL REFERENCES public.landing_pages(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT,
  utm JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_leads TO authenticated;
GRANT ALL ON public.landing_leads TO service_role;

ALTER TABLE public.landing_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view leads"
  ON public.landing_leads FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "Admins can delete leads"
  ON public.landing_leads FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'));

CREATE INDEX idx_landing_leads_page ON public.landing_leads(landing_page_id, created_at DESC);
CREATE INDEX idx_landing_pages_slug ON public.landing_pages(slug) WHERE published = true;