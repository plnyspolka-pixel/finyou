
-- Subskrybenci newslettera
CREATE TABLE public.email_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  source_id UUID,
  tags TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  unsubscribed_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_subscribers_status ON public.email_subscribers(status);
CREATE INDEX idx_email_subscribers_tags ON public.email_subscribers USING GIN(tags);
CREATE INDEX idx_email_subscribers_source ON public.email_subscribers(source);

GRANT SELECT, INSERT ON public.email_subscribers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_subscribers TO authenticated;
GRANT ALL ON public.email_subscribers TO service_role;

ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can subscribe" ON public.email_subscribers
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Staff view subscribers" ON public.email_subscribers
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'));
CREATE POLICY "Staff update subscribers" ON public.email_subscribers
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'));
CREATE POLICY "Admins delete subscribers" ON public.email_subscribers
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'administrator'));

CREATE TRIGGER email_subscribers_updated_at
  BEFORE UPDATE ON public.email_subscribers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Segmenty (nazwane filtry)
CREATE TABLE public.email_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  subscriber_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_segments TO authenticated;
GRANT ALL ON public.email_segments TO service_role;

ALTER TABLE public.email_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage segments" ON public.email_segments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'));

CREATE TRIGGER email_segments_updated_at
  BEFORE UPDATE ON public.email_segments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Rozszerzenie kampanii o statystyki i AI
ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS preview_text TEXT,
  ADD COLUMN IF NOT EXISTS reply_to TEXT,
  ADD COLUMN IF NOT EXISTS ai_brief TEXT,
  ADD COLUMN IF NOT EXISTS segment_id UUID REFERENCES public.email_segments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivered_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opened_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicked_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bounced_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS complained_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unsubscribed_count INTEGER NOT NULL DEFAULT 0;

-- Rozszerzenie odbiorców o tracking Resend
ALTER TABLE public.email_campaign_recipients
  ADD COLUMN IF NOT EXISTS resend_id TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS complained_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscriber_id UUID REFERENCES public.email_subscribers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ecr_resend_id ON public.email_campaign_recipients(resend_id);
CREATE INDEX IF NOT EXISTS idx_ecr_recipient_email ON public.email_campaign_recipients(recipient_email);
