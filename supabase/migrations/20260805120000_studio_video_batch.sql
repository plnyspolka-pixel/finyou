-- Studio publikacji — generowanie wsadowe wideo HeyGen + auto-publikacja.
--
-- Nowe kolumny studio_video_jobs:
--   * auto_publish_platforms — po wyrenderowaniu wideo wpis trafia
--     automatycznie do kolejek publikacji tych platform (pusta tablica =
--     auto-publikacja wyłączona),
--   * publish_privacy / publish_title / publish_description — parametry
--     użyte przy auto-publikacji (tytuł/opis generuje AI przy scenariuszu),
--   * auto_published_at — znacznik, że auto-publikacja już poszła (idempotencja).
--
-- Nowe statusy jobów: 'queued' (czeka w kolejce wsadowej, scenariusz powstaje
-- przy przetwarzaniu) i 'generating_script'. Kolejkę przetwarza tick
-- social-publish-tick (co 10 min) oraz otwarty panel admina (na bieżąco).

ALTER TABLE public.studio_video_jobs
  ADD COLUMN IF NOT EXISTS auto_publish_platforms text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS publish_privacy text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS publish_title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS publish_description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS auto_published_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_svj_queued
  ON public.studio_video_jobs (created_at)
  WHERE status IN ('queued', 'rendering');

COMMENT ON COLUMN public.studio_video_jobs.auto_publish_platforms IS
  'Platformy auto-publikacji po wyrenderowaniu (youtube / facebook_reels / instagram_reels / facebook_post); pusta = wyłączona.';
COMMENT ON COLUMN public.studio_video_jobs.auto_published_at IS
  'Kiedy wpisy auto-publikacji trafiły do kolejek (NULL = jeszcze nie).';
