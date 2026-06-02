
ALTER TABLE public.lead_communications
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS elevenlabs_conversation_id text,
  ADD COLUMN IF NOT EXISTS thread_external_id text;

CREATE INDEX IF NOT EXISTS idx_leadcomm_thread ON public.lead_communications(thread_external_id);

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS messenger_psid text,
  ADD COLUMN IF NOT EXISTS instagram_igsid text;

CREATE INDEX IF NOT EXISTS idx_leads_messenger_psid ON public.leads(messenger_psid);
CREATE INDEX IF NOT EXISTS idx_leads_instagram_igsid ON public.leads(instagram_igsid);
CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON public.leads(phone_normalized);
