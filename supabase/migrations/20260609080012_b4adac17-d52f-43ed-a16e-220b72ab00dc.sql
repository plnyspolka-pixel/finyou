ALTER TABLE public.ai_seo_articles
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS cover_image_alt text,
  ADD COLUMN IF NOT EXISTS external_links jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS internal_link_slugs text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS content_refreshed_at timestamptz;

-- Publiczny dostęp do publikowanych artykułów (blog jest publiczny)
GRANT SELECT ON public.ai_seo_articles TO anon, authenticated;
GRANT SELECT ON public.ai_seo_topics TO anon, authenticated;

DROP POLICY IF EXISTS "public can read published articles" ON public.ai_seo_articles;
CREATE POLICY "public can read published articles"
  ON public.ai_seo_articles
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published');
