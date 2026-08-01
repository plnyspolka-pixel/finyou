-- Publikacja postów na Instagram (Meta Content Publishing API):
-- identyfikator opublikowanego media + komunikat błędu ostatniej próby.
ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS publish_error text;
