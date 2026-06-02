CREATE TABLE public.social_posts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform text NOT NULL CHECK (platform IN ('facebook','instagram','linkedin','x','tiktok','threads')),
  content text NOT NULL,
  hashtags text[] DEFAULT ARRAY[]::text[],
  image_url text,
  link_url text,
  scheduled_at timestamptz,
  published_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','published','failed')),
  ai_prompt text,
  ai_model text,
  campaign text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_social_posts_status ON public.social_posts(status);
CREATE INDEX idx_social_posts_scheduled ON public.social_posts(scheduled_at);
CREATE INDEX idx_social_posts_platform ON public.social_posts(platform);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_posts TO authenticated;
GRANT ALL ON public.social_posts TO service_role;

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage social posts"
ON public.social_posts
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'))
WITH CHECK (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'));

CREATE TRIGGER trg_social_posts_updated_at
BEFORE UPDATE ON public.social_posts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();