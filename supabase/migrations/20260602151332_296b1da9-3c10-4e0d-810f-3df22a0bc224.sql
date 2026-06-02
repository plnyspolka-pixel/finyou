
-- =========================================
-- MARKETING CAMPAIGNS
-- =========================================
CREATE TABLE public.marketing_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  short_code TEXT NOT NULL UNIQUE,
  target_url TEXT NOT NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  cost NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_marketing_campaigns_slug ON public.marketing_campaigns(slug);
CREATE INDEX idx_marketing_campaigns_short_code ON public.marketing_campaigns(short_code);

GRANT SELECT ON public.marketing_campaigns TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaigns TO authenticated;
GRANT ALL ON public.marketing_campaigns TO service_role;

ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active campaigns for redirect" ON public.marketing_campaigns
  FOR SELECT TO anon USING (is_active = TRUE);

CREATE POLICY "Staff manage campaigns" ON public.marketing_campaigns
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'));

CREATE TRIGGER trg_marketing_campaigns_updated_at
  BEFORE UPDATE ON public.marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- CAMPAIGN CLICKS
-- =========================================
CREATE TABLE public.campaign_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  ip_hash TEXT,
  user_agent TEXT,
  referrer TEXT,
  country TEXT,
  device TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_clicks_campaign_id ON public.campaign_clicks(campaign_id);
CREATE INDEX idx_campaign_clicks_created_at ON public.campaign_clicks(created_at DESC);

GRANT INSERT ON public.campaign_clicks TO anon;
GRANT SELECT, INSERT ON public.campaign_clicks TO authenticated;
GRANT ALL ON public.campaign_clicks TO service_role;

ALTER TABLE public.campaign_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can log a click" ON public.campaign_clicks
  FOR INSERT TO anon WITH CHECK (TRUE);

CREATE POLICY "Authenticated can log a click" ON public.campaign_clicks
  FOR INSERT TO authenticated WITH CHECK (TRUE);

CREATE POLICY "Staff view clicks" ON public.campaign_clicks
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'));

-- =========================================
-- LEAD ATTRIBUTIONS
-- =========================================
CREATE TABLE public.lead_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID,
  campaign_id UUID REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  landing_url TEXT,
  referrer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_attributions_lead_id ON public.lead_attributions(lead_id);
CREATE INDEX idx_lead_attributions_campaign_id ON public.lead_attributions(campaign_id);

GRANT INSERT ON public.lead_attributions TO anon;
GRANT SELECT, INSERT ON public.lead_attributions TO authenticated;
GRANT ALL ON public.lead_attributions TO service_role;

ALTER TABLE public.lead_attributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can save attribution" ON public.lead_attributions
  FOR INSERT TO anon WITH CHECK (TRUE);

CREATE POLICY "Authenticated can save attribution" ON public.lead_attributions
  FOR INSERT TO authenticated WITH CHECK (TRUE);

CREATE POLICY "Staff view attributions" ON public.lead_attributions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'));
