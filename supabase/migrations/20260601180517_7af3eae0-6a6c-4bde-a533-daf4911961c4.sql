
-- =========================================
-- MODUŁ 1: MAILING
-- =========================================

CREATE TABLE public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL,
  html_body text NOT NULL DEFAULT '',
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates TO authenticated;
GRANT ALL ON public.email_templates TO service_role;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_templates_staff_all ON public.email_templates FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role));
CREATE TRIGGER set_email_templates_updated_at BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL,
  html_body text NOT NULL DEFAULT '',
  text_body text,
  from_email text,
  from_name text,
  audience_type text NOT NULL DEFAULT 'leady',
  audience_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'szkic',
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  recipients_total integer NOT NULL DEFAULT 0,
  error_message text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_campaigns TO authenticated;
GRANT ALL ON public.email_campaigns TO service_role;
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_campaigns_staff_all ON public.email_campaigns FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role));
CREATE TRIGGER set_email_campaigns_updated_at BEFORE UPDATE ON public.email_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_email_campaigns_status_scheduled ON public.email_campaigns(status, scheduled_at);

CREATE TABLE public.email_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  recipient_name text,
  user_id uuid,
  status text NOT NULL DEFAULT 'oczekuje',
  sent_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_campaign_recipients TO authenticated;
GRANT ALL ON public.email_campaign_recipients TO service_role;
ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY ecr_staff_all ON public.email_campaign_recipients FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role));
CREATE INDEX idx_ecr_campaign_status ON public.email_campaign_recipients(campaign_id, status);

-- =========================================
-- MODUŁ 2: META ADS DRAFTS
-- =========================================

CREATE TABLE public.meta_ad_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  ad_account_id uuid REFERENCES public.meta_ad_accounts(id) ON DELETE SET NULL,
  page_id text,
  page_name text,
  objective text NOT NULL DEFAULT 'LEAD_GENERATION',
  daily_budget numeric NOT NULL DEFAULT 50,
  start_time timestamptz,
  end_time timestamptz,
  targeting jsonb NOT NULL DEFAULT '{}'::jsonb,
  creative jsonb NOT NULL DEFAULT '{}'::jsonb,
  lead_form jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'szkic',
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  meta_form_id text,
  meta_creative_id text,
  error_message text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_ad_drafts TO authenticated;
GRANT ALL ON public.meta_ad_drafts TO service_role;
ALTER TABLE public.meta_ad_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY mad_staff_all ON public.meta_ad_drafts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role));
CREATE TRIGGER set_meta_ad_drafts_updated_at BEFORE UPDATE ON public.meta_ad_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- MODUŁ 3: GOOGLE ADS DRAFTS
-- =========================================

CREATE TABLE public.google_ad_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  campaign_type text NOT NULL DEFAULT 'SEARCH',
  daily_budget_pln numeric NOT NULL DEFAULT 50,
  keywords text[] NOT NULL DEFAULT '{}',
  negative_keywords text[] NOT NULL DEFAULT '{}',
  headlines text[] NOT NULL DEFAULT '{}',
  descriptions text[] NOT NULL DEFAULT '{}',
  final_url text,
  display_path1 text,
  display_path2 text,
  target_locations text[] NOT NULL DEFAULT ARRAY['Polska'],
  target_languages text[] NOT NULL DEFAULT ARRAY['pl'],
  status text NOT NULL DEFAULT 'szkic',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_ad_drafts TO authenticated;
GRANT ALL ON public.google_ad_drafts TO service_role;
ALTER TABLE public.google_ad_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY gad_staff_all ON public.google_ad_drafts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role));
CREATE TRIGGER set_google_ad_drafts_updated_at BEFORE UPDATE ON public.google_ad_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- STORAGE: ad-creatives bucket
-- =========================================
INSERT INTO storage.buckets (id, name, public) VALUES ('ad-creatives', 'ad-creatives', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "ad_creatives_public_read" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'ad-creatives');
CREATE POLICY "ad_creatives_staff_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ad-creatives' AND (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role)));
CREATE POLICY "ad_creatives_staff_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'ad-creatives' AND (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role)));
CREATE POLICY "ad_creatives_staff_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ad-creatives' AND (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role)));
