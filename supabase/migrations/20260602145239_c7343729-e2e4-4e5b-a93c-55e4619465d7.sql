CREATE TABLE public.ai_serp_keywords (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  keyword TEXT NOT NULL,
  target_url TEXT,
  location TEXT NOT NULL DEFAULT 'Poland',
  language TEXT NOT NULL DEFAULT 'pl',
  search_volume INTEGER,
  difficulty INTEGER,
  intent TEXT,
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_serp_rankings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword_id UUID NOT NULL REFERENCES public.ai_serp_keywords(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  position INTEGER,
  previous_position INTEGER,
  url TEXT,
  serp_features TEXT[] DEFAULT '{}',
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_serp_rankings_keyword ON public.ai_serp_rankings(keyword_id, checked_at DESC);
CREATE INDEX idx_serp_keywords_user ON public.ai_serp_keywords(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_serp_keywords TO authenticated;
GRANT ALL ON public.ai_serp_keywords TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_serp_rankings TO authenticated;
GRANT ALL ON public.ai_serp_rankings TO service_role;

ALTER TABLE public.ai_serp_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_serp_rankings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage serp keywords" ON public.ai_serp_keywords
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::public.app_role));

CREATE POLICY "Admins manage serp rankings" ON public.ai_serp_rankings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::public.app_role));

CREATE TRIGGER trg_serp_keywords_updated_at
  BEFORE UPDATE ON public.ai_serp_keywords
  FOR EACH ROW EXECUTE FUNCTION public.ai_growth_touch_updated_at();
