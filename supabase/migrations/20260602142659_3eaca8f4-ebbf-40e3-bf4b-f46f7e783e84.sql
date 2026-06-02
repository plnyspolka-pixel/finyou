-- 1. SEO topics (planowanie)
CREATE TABLE public.ai_seo_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  primary_keyword TEXT,
  secondary_keywords TEXT[] DEFAULT '{}',
  search_intent TEXT CHECK (search_intent IN ('informational','commercial','transactional','navigational')),
  difficulty INTEGER,
  priority INTEGER NOT NULL DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','generating','generated','published','rejected')),
  notes TEXT,
  article_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_seo_topics_status ON public.ai_seo_topics(status, priority DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_seo_topics TO authenticated;
GRANT ALL ON public.ai_seo_topics TO service_role;
ALTER TABLE public.ai_seo_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage seo topics" ON public.ai_seo_topics
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'));
CREATE TRIGGER trg_ai_seo_topics_updated BEFORE UPDATE ON public.ai_seo_topics
  FOR EACH ROW EXECUTE FUNCTION public.ai_growth_touch_updated_at();

-- 2. SEO articles
CREATE TABLE public.ai_seo_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES public.ai_seo_topics(id) ON DELETE SET NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  meta_title TEXT,
  meta_description TEXT,
  excerpt TEXT,
  content_md TEXT NOT NULL,
  primary_keyword TEXT,
  keywords TEXT[] DEFAULT '{}',
  reading_minutes INTEGER,
  word_count INTEGER,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','published','archived')),
  cta_url TEXT,
  cta_label TEXT DEFAULT 'Złóż wniosek',
  source TEXT NOT NULL DEFAULT 'ai_autopilot' CHECK (source IN ('manual','ai_autopilot')),
  raw_ai_output JSONB,
  scheduled_for TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_seo_articles_status ON public.ai_seo_articles(status, published_at DESC);
GRANT SELECT ON public.ai_seo_articles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_seo_articles TO authenticated;
GRANT ALL ON public.ai_seo_articles TO service_role;
ALTER TABLE public.ai_seo_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public can view published articles" ON public.ai_seo_articles
  FOR SELECT TO anon, authenticated USING (status = 'published');
CREATE POLICY "admins manage articles" ON public.ai_seo_articles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'));
CREATE TRIGGER trg_ai_seo_articles_updated BEFORE UPDATE ON public.ai_seo_articles
  FOR EACH ROW EXECUTE FUNCTION public.ai_growth_touch_updated_at();

ALTER TABLE public.ai_seo_topics
  ADD CONSTRAINT ai_seo_topics_article_fk FOREIGN KEY (article_id) REFERENCES public.ai_seo_articles(id) ON DELETE SET NULL;