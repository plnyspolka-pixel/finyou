
CREATE TABLE public.meta_ad_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_account_id text NOT NULL UNIQUE,
  name text NOT NULL,
  currency text,
  account_status integer,
  business_name text,
  amount_spent numeric DEFAULT 0,
  balance numeric DEFAULT 0,
  is_active boolean DEFAULT true,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.meta_ad_accounts TO authenticated;
GRANT ALL ON public.meta_ad_accounts TO service_role;
ALTER TABLE public.meta_ad_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/operators read ad accounts" ON public.meta_ad_accounts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'operator'));

CREATE TRIGGER trg_meta_ad_accounts_updated BEFORE UPDATE ON public.meta_ad_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.meta_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_campaign_id text NOT NULL UNIQUE,
  ad_account_id uuid NOT NULL REFERENCES public.meta_ad_accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  objective text,
  status text,
  daily_budget numeric,
  lifetime_budget numeric,
  start_time timestamptz,
  stop_time timestamptz,
  spend numeric DEFAULT 0,
  impressions bigint DEFAULT 0,
  clicks bigint DEFAULT 0,
  ctr numeric DEFAULT 0,
  cpc numeric DEFAULT 0,
  leads_count integer DEFAULT 0,
  cost_per_lead numeric DEFAULT 0,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.meta_campaigns TO authenticated;
GRANT ALL ON public.meta_campaigns TO service_role;
ALTER TABLE public.meta_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/operators read campaigns" ON public.meta_campaigns
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'operator'));

CREATE INDEX idx_meta_campaigns_account ON public.meta_campaigns(ad_account_id);

CREATE TRIGGER trg_meta_campaigns_updated BEFORE UPDATE ON public.meta_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.meta_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_lead_id text NOT NULL UNIQUE,
  meta_form_id text,
  meta_campaign_id text,
  campaign_id uuid REFERENCES public.meta_campaigns(id) ON DELETE SET NULL,
  full_name text,
  email text,
  phone text,
  field_data jsonb,
  lead_application_id uuid REFERENCES public.loan_applications(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.meta_leads TO authenticated;
GRANT ALL ON public.meta_leads TO service_role;
ALTER TABLE public.meta_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/operators read meta leads" ON public.meta_leads
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'operator'));

CREATE INDEX idx_meta_leads_campaign ON public.meta_leads(campaign_id);
CREATE INDEX idx_meta_leads_received ON public.meta_leads(received_at DESC);

CREATE TABLE public.meta_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type text NOT NULL,
  status text NOT NULL,
  items_synced integer DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

GRANT SELECT ON public.meta_sync_log TO authenticated;
GRANT ALL ON public.meta_sync_log TO service_role;
ALTER TABLE public.meta_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/operators read sync log" ON public.meta_sync_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'operator'));
