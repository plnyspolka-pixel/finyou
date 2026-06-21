CREATE TABLE public.avatar_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer_text text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  is_intro boolean NOT NULL DEFAULT false,
  voice_id text NOT NULL DEFAULT '9STbwZjpEbcYG88ZekIQ',
  avatar_id text NOT NULL DEFAULT '5ebd3e687266437287b6c800f034198e',
  video_id text,
  video_url text,
  thumbnail_url text,
  video_status text NOT NULL DEFAULT 'idle',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.avatar_faqs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avatar_faqs TO authenticated;
GRANT ALL ON public.avatar_faqs TO service_role;

ALTER TABLE public.avatar_faqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published avatar faqs"
  ON public.avatar_faqs FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

CREATE POLICY "Admins manage avatar faqs"
  ON public.avatar_faqs FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::public.app_role));

CREATE TRIGGER avatar_faqs_touch_updated_at
  BEFORE UPDATE ON public.avatar_faqs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX avatar_faqs_sort_idx ON public.avatar_faqs (sort_order);