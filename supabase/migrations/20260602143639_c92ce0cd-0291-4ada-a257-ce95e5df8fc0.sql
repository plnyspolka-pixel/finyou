-- Outreach targets (portale, blogi, partnerzy do link buildingu)
CREATE TABLE public.ai_outreach_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  url TEXT,
  contact_name TEXT,
  contact_email TEXT,
  niche TEXT,
  language TEXT DEFAULT 'pl',
  priority INTEGER NOT NULL DEFAULT 50 CHECK (priority >= 0 AND priority <= 100),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','queued','contacted','responded','won','rejected','blacklist')),
  notes TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai_discovery','import')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(domain)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_outreach_targets TO authenticated;
GRANT ALL ON public.ai_outreach_targets TO service_role;
ALTER TABLE public.ai_outreach_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage outreach targets" ON public.ai_outreach_targets
  TO authenticated USING (public.has_role(auth.uid(), 'administrator')) WITH CHECK (public.has_role(auth.uid(), 'administrator'));

CREATE TRIGGER trg_ai_outreach_targets_updated BEFORE UPDATE ON public.ai_outreach_targets
  FOR EACH ROW EXECUTE FUNCTION public.ai_growth_touch_updated_at();
CREATE INDEX idx_ai_outreach_targets_status ON public.ai_outreach_targets(status);

-- Outreach messages (drafty, zatwierdzone, wysłane, follow-upy)
CREATE TABLE public.ai_outreach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id UUID NOT NULL REFERENCES public.ai_outreach_targets(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.ai_outreach_messages(id) ON DELETE SET NULL,
  step INTEGER NOT NULL DEFAULT 1,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','sent','replied','bounced')),
  goal TEXT,
  angle TEXT,
  language TEXT DEFAULT 'pl',
  model TEXT,
  sent_at TIMESTAMPTZ,
  reply_excerpt TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_outreach_messages TO authenticated;
GRANT ALL ON public.ai_outreach_messages TO service_role;
ALTER TABLE public.ai_outreach_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage outreach messages" ON public.ai_outreach_messages
  TO authenticated USING (public.has_role(auth.uid(), 'administrator')) WITH CHECK (public.has_role(auth.uid(), 'administrator'));

CREATE TRIGGER trg_ai_outreach_messages_updated BEFORE UPDATE ON public.ai_outreach_messages
  FOR EACH ROW EXECUTE FUNCTION public.ai_growth_touch_updated_at();
CREATE INDEX idx_ai_outreach_messages_target ON public.ai_outreach_messages(target_id, created_at DESC);
CREATE INDEX idx_ai_outreach_messages_status ON public.ai_outreach_messages(status);