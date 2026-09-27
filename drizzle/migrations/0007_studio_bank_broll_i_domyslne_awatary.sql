CREATE TABLE IF NOT EXISTS public.studio_broll_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'broll' CHECK (kind IN ('broll', 'hook')),
  title text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  media_url text NOT NULL,
  storage_path text,
  source text NOT NULL DEFAULT 'url',
  source_query text NOT NULL DEFAULT '',
  orientation text,
  attribution text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  use_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_broll_kind_active ON public.studio_broll_assets (kind, last_used_at NULLS FIRST) WHERE active;
CREATE INDEX IF NOT EXISTS idx_broll_tags ON public.studio_broll_assets USING gin (tags);
CREATE UNIQUE INDEX IF NOT EXISTS idx_broll_media_url ON public.studio_broll_assets (media_url);
CREATE TABLE IF NOT EXISTS public.studio_default_avatars (
  avatar_id text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  preview text,
  kind text NOT NULL DEFAULT 'avatar' CHECK (kind IN ('avatar', 'talking_photo')),
  position integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_default_avatars_position ON public.studio_default_avatars (position);
ALTER TABLE public.studio_video_jobs
  ADD COLUMN IF NOT EXISTS reel_structure boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS avatar_ids text[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN public.studio_video_jobs.reel_structure IS 'Czy rolka idzie stałą strukturą: ujęcie → wizual hook → przebitka → a-roll innego domyślnego awatara.';
COMMENT ON COLUMN public.studio_video_jobs.avatar_ids IS 'Rotacja domyślnych awatarów użyta przy tym jobie (pusta = tylko avatar_id).';
DO $$ BEGIN
  CREATE TRIGGER trg_broll_touch_updated_at BEFORE UPDATE ON public.studio_broll_assets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_default_avatars_touch_updated_at BEFORE UPDATE ON public.studio_default_avatars FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT ON public.studio_broll_assets TO authenticated;
GRANT ALL ON public.studio_broll_assets TO service_role;
ALTER TABLE public.studio_broll_assets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY broll_staff_select ON public.studio_broll_assets FOR SELECT TO authenticated
    USING (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT ON public.studio_default_avatars TO authenticated;
GRANT ALL ON public.studio_default_avatars TO service_role;
ALTER TABLE public.studio_default_avatars ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY default_avatars_staff_select ON public.studio_default_avatars FOR SELECT TO authenticated
    USING (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TABLE public.studio_broll_assets IS 'Studio publikacji: bank b-rolli i wizual hooków (pliki w buckecie studio-media, dobór po tagach z rotacją).';
COMMENT ON TABLE public.studio_default_avatars IS 'Studio publikacji: stały zestaw domyślnych awatarów; position wyznacza rotację a-rolli w rolce.';