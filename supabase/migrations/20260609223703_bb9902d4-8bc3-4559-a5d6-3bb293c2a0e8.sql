-- Lead quality scoring + Meta CAPI tracking
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS quality_tier text CHECK (quality_tier IN ('A','B','C','D')),
  ADD COLUMN IF NOT EXISTS quality_score numeric,
  ADD COLUMN IF NOT EXISTS quality_reason text,
  ADD COLUMN IF NOT EXISTS meta_capi_last_event text,
  ADD COLUMN IF NOT EXISTS meta_capi_last_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS marked_bad_lead boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS marked_bad_reason text,
  ADD COLUMN IF NOT EXISTS marked_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_leads_quality_tier ON public.leads(quality_tier);
CREATE INDEX IF NOT EXISTS idx_leads_marked_bad ON public.leads(marked_bad_lead) WHERE marked_bad_lead = true;

-- Log of CAPI events sent to Meta (audit + dedupe)
CREATE TABLE IF NOT EXISTS public.meta_capi_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  event_name text NOT NULL,
  event_id text NOT NULL UNIQUE,
  pixel_id text NOT NULL,
  value numeric,
  currency text DEFAULT 'PLN',
  loan_amount numeric,
  tier text,
  payload jsonb,
  response jsonb,
  status text NOT NULL DEFAULT 'pending',
  error text,
  sent_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.meta_capi_events TO authenticated;
GRANT ALL ON public.meta_capi_events TO service_role;
ALTER TABLE public.meta_capi_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read meta capi events"
  ON public.meta_capi_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_meta_capi_lead ON public.meta_capi_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_meta_capi_sent ON public.meta_capi_events(sent_at DESC);