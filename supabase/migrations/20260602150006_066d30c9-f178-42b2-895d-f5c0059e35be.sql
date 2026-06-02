CREATE TABLE public.ai_competitors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  urls TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_competitor_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competitor_id UUID NOT NULL REFERENCES public.ai_competitors(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  content_hash TEXT NOT NULL,
  content TEXT,
  changed BOOLEAN NOT NULL DEFAULT false,
  change_summary TEXT,
  ai_analysis JSONB DEFAULT '{}'::jsonb,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_competitor_snapshots_competitor ON public.ai_competitor_snapshots(competitor_id, checked_at DESC);
CREATE INDEX idx_competitor_snapshots_url ON public.ai_competitor_snapshots(url, checked_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_competitors TO authenticated;
GRANT ALL ON public.ai_competitors TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_competitor_snapshots TO authenticated;
GRANT ALL ON public.ai_competitor_snapshots TO service_role;

ALTER TABLE public.ai_competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_competitor_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage competitors" ON public.ai_competitors
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::public.app_role));

CREATE POLICY "Admins manage competitor snapshots" ON public.ai_competitor_snapshots
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::public.app_role));

CREATE TRIGGER trg_competitors_updated_at
  BEFORE UPDATE ON public.ai_competitors
  FOR EACH ROW EXECUTE FUNCTION public.ai_growth_touch_updated_at();
