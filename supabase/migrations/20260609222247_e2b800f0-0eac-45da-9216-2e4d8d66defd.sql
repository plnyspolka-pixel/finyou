
CREATE TABLE IF NOT EXISTS public.meta_lead_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_form_id TEXT NOT NULL UNIQUE,
  meta_page_id TEXT,
  form_name TEXT,
  page_name TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  last_synced_at TIMESTAMPTZ,
  last_lead_at TIMESTAMPTZ,
  total_leads_pulled INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_lead_forms TO authenticated;
GRANT ALL ON public.meta_lead_forms TO service_role;
ALTER TABLE public.meta_lead_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage meta lead forms"
  ON public.meta_lead_forms FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'));

CREATE INDEX IF NOT EXISTS idx_meta_lead_forms_enabled ON public.meta_lead_forms (is_enabled) WHERE is_enabled = true;

CREATE TABLE IF NOT EXISTS public.lead_follow_up_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email','sms','call')),
  step_index INTEGER NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','skipped','cancelled','error')),
  sent_at TIMESTAMPTZ,
  external_id TEXT,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lead_id, channel, step_index)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_follow_up_schedule TO authenticated;
GRANT ALL ON public.lead_follow_up_schedule TO service_role;
ALTER TABLE public.lead_follow_up_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view schedule"
  ON public.lead_follow_up_schedule FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'));

CREATE INDEX IF NOT EXISTS idx_followup_due ON public.lead_follow_up_schedule (status, scheduled_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_followup_lead ON public.lead_follow_up_schedule (lead_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_meta_lead_forms_touch ON public.meta_lead_forms;
CREATE TRIGGER trg_meta_lead_forms_touch BEFORE UPDATE ON public.meta_lead_forms
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_lead_follow_up_schedule_touch ON public.lead_follow_up_schedule;
CREATE TRIGGER trg_lead_follow_up_schedule_touch BEFORE UPDATE ON public.lead_follow_up_schedule
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
