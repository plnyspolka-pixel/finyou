
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'pozyczkowy',
  status TEXT NOT NULL DEFAULT 'nowy',
  source TEXT,
  first_name TEXT, last_name TEXT, email TEXT,
  phone_raw TEXT, phone_normalized TEXT,
  consent_rodo BOOLEAN NOT NULL DEFAULT false,
  consent_marketing BOOLEAN NOT NULL DEFAULT false,
  consent_phone BOOLEAN NOT NULL DEFAULT false,
  consent_email BOOLEAN NOT NULL DEFAULT false,
  consent_sms BOOLEAN NOT NULL DEFAULT false,
  user_id UUID,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  loan_application_id UUID REFERENCES public.loan_applications(id) ON DELETE SET NULL,
  investor_id UUID REFERENCES public.investors(id) ON DELETE SET NULL,
  meta_lead_id UUID REFERENCES public.meta_leads(id) ON DELETE SET NULL,
  meta_form_id TEXT, meta_campaign_id TEXT, google_ads_id TEXT,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT,
  current_form_step INTEGER DEFAULT 1,
  return_link_token UUID DEFAULT gen_random_uuid(),
  return_link TEXT,
  application_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  assigned_to UUID, notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON public.leads(phone_normalized);
CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_user ON public.leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_type ON public.leads(type);
CREATE INDEX IF NOT EXISTS idx_leads_source ON public.leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_token ON public.leads(return_link_token);
CREATE INDEX IF NOT EXISTS idx_leads_created ON public.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_loan_app ON public.leads(loan_application_id);
CREATE INDEX IF NOT EXISTS idx_leads_client ON public.leads(client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage leads" ON public.leads FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'));
CREATE POLICY "Users can view own lead" ON public.leads FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can update own lead" ON public.leads FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER leads_set_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.lead_communications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  phone_normalized TEXT, email TEXT,
  channel TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'outbound',
  status TEXT,
  subject TEXT, content TEXT, transcript JSONB,
  recording_url TEXT, duration_seconds INTEGER,
  external_id TEXT, agent_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leadcomm_lead ON public.lead_communications(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leadcomm_phone ON public.lead_communications(phone_normalized);
CREATE INDEX IF NOT EXISTS idx_leadcomm_email ON public.lead_communications(email);
CREATE INDEX IF NOT EXISTS idx_leadcomm_external ON public.lead_communications(external_id);
CREATE INDEX IF NOT EXISTS idx_leadcomm_channel ON public.lead_communications(channel);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_communications TO authenticated;
GRANT ALL ON public.lead_communications TO service_role;
ALTER TABLE public.lead_communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage comms" ON public.lead_communications FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'));
CREATE POLICY "Users view own comms" ON public.lead_communications FOR SELECT TO authenticated
  USING (lead_id IN (SELECT id FROM public.leads WHERE user_id = auth.uid()));

CREATE TRIGGER leadcomm_set_updated_at BEFORE UPDATE ON public.lead_communications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- BACKFILL clients + loan_applications -> leads
INSERT INTO public.leads (
  type, status, source, first_name, last_name, email, phone_raw, phone_normalized,
  consent_rodo, consent_marketing, consent_phone, consent_email, consent_sms,
  user_id, client_id, loan_application_id,
  current_form_step, return_link_token, return_link,
  application_data, notes, created_at, updated_at
)
SELECT 'pozyczkowy',
  COALESCE(la.status::text, 'nowy'),
  COALESCE(la.source, c.source, 'manual'),
  c.first_name, c.last_name, c.email,
  COALESCE(c.phone_raw, c.phone), COALESCE(c.phone_normalized, c.phone),
  c.consent_rodo, c.consent_marketing, c.consent_phone, c.consent_email, c.consent_sms,
  c.user_id, c.id, la.id,
  COALESCE(la.current_form_step, 1),
  COALESCE(NULLIF(la.return_link_token::text,'')::uuid, gen_random_uuid()),
  la.return_link,
  COALESCE(to_jsonb(la.*), '{}'::jsonb),
  c.notes, c.created_at, c.updated_at
FROM public.clients c
LEFT JOIN public.loan_applications la ON la.client_id = c.id;

-- BACKFILL investors -> leads
INSERT INTO public.leads (type, status, source, first_name, last_name, email, phone_raw, phone_normalized, user_id, investor_id, application_data, created_at, updated_at)
SELECT 'inwestorski', 'aktywny', 'manual',
  i.first_name, i.last_name, i.email, i.phone, i.phone,
  i.user_id, i.id, COALESCE(to_jsonb(i.*) - 'id' - 'user_id', '{}'::jsonb),
  i.created_at, i.updated_at
FROM public.investors i;

-- BACKFILL meta_leads (bez powiązanego wniosku) -> leads
INSERT INTO public.leads (type, status, source, first_name, last_name, email, phone_raw, phone_normalized, meta_lead_id, meta_form_id, meta_campaign_id, application_data, created_at, updated_at)
SELECT 'pozyczkowy', 'nowy_lead', 'meta_ads',
  split_part(COALESCE(ml.full_name, ''), ' ', 1),
  NULLIF(substring(COALESCE(ml.full_name, '') from position(' ' in COALESCE(ml.full_name, ' ')) + 1), ''),
  ml.email, ml.phone, ml.phone,
  ml.id, ml.meta_form_id, ml.meta_campaign_id,
  COALESCE(to_jsonb(ml.*), '{}'::jsonb),
  ml.created_at, ml.created_at
FROM public.meta_leads ml
WHERE ml.lead_application_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.meta_lead_id = ml.id);

-- BACKFILL contact_events -> lead_communications
INSERT INTO public.lead_communications (lead_id, phone_normalized, email, channel, direction, status, subject, content, external_id, created_by, created_at)
SELECT l.id, c.phone_normalized, c.email,
  CASE ce.channel::text WHEN 'call' THEN 'voicebot_call' ELSE ce.channel::text END,
  ce.direction::text, ce.status, ce.subject, ce.content, ce.external_id, ce.created_by, ce.created_at
FROM public.contact_events ce
LEFT JOIN public.clients c ON c.id = ce.client_id
LEFT JOIN public.leads l ON (l.loan_application_id IS NOT NULL AND l.loan_application_id = ce.loan_application_id) OR (l.client_id IS NOT NULL AND l.client_id = ce.client_id);

-- BACKFILL call_queue -> lead_communications
INSERT INTO public.lead_communications (lead_id, phone_normalized, channel, direction, status, content, external_id, agent_id, duration_seconds, metadata, created_at)
SELECT l.id, cq.phone_normalized, 'voicebot_call', 'outbound',
  CASE cq.status WHEN 'zakonczona' THEN 'completed' WHEN 'blad' THEN 'failed' WHEN 'w_trakcie' THEN 'initiated' ELSE cq.status END,
  COALESCE(cq.result_summary, cq.transcript),
  cq.conversation_id, cq.agent_id,
  CASE WHEN cq.finished_at IS NOT NULL AND cq.started_at IS NOT NULL THEN EXTRACT(EPOCH FROM (cq.finished_at - cq.started_at))::int ELSE NULL END,
  jsonb_build_object('source', cq.source, 'raw_result', cq.raw_result, 'transcript_full', cq.transcript),
  cq.created_at
FROM public.call_queue cq
LEFT JOIN public.leads l ON (l.loan_application_id IS NOT NULL AND l.loan_application_id = cq.loan_application_id) OR (l.client_id IS NOT NULL AND l.client_id = cq.client_id) OR (l.phone_normalized IS NOT NULL AND l.phone_normalized = cq.phone_normalized);
