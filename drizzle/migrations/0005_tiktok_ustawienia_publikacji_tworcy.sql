-- TikTok — ustawienia publikacji WYBRANE PRZEZ TWÓRCĘ (wymóg audytu).
--
-- Wytyczne Content Posting API (Content Sharing Guidelines) zabraniają
-- hardkodowania prywatności: „Developers should not hardcode one privacy
-- setting… your export screen must reflect those values". Pierwsza wersja
-- integracji wybierała privacy_level po stronie serwera (preferencja
-- PUBLIC_TO_EVERYONE) — to nie przeszłoby audytu, więc wybór przenosimy
-- do panelu i zapisujemy przy wpisie.
--
-- Trzymamy to jako jeden jsonb, bo te pola podróżują razem jako komplet
-- ustawień jednego posta (jak scene_plan na studio_video_jobs). Kształt
-- i walidację pilnuje TS: src/lib/tiktok-upload.ts (parseTiktokPostOptions).
--
-- {
--   "privacyLevel":   "PUBLIC_TO_EVERYONE" | "SELF_ONLY" | ... (z creator_info),
--   "disableComment": bool,
--   "disableDuet":    bool,
--   "disableStitch":  bool,
--   "brandOrganic":   bool,   -- „Your brand"      → brand_organic_toggle
--   "brandedContent": bool    -- „Branded content" → brand_content_toggle
-- }

ALTER TABLE public.social_publish_queue
  ADD COLUMN IF NOT EXISTS tiktok_post_options jsonb;

ALTER TABLE public.studio_video_jobs
  ADD COLUMN IF NOT EXISTS tiktok_post_options jsonb;

COMMENT ON COLUMN public.social_publish_queue.tiktok_post_options IS
  'TikTok: ustawienia posta wybrane przez twórcę w panelu (privacyLevel, przełączniki interakcji, ujawnienie treści komercyjnej). NULL = wpis sprzed wdrożenia ekranu zgodnego z audytem.';
COMMENT ON COLUMN public.studio_video_jobs.tiktok_post_options IS
  'TikTok: ustawienia posta dla auto-publikacji, wybrane przy zakładaniu zadania; kopiowane do social_publish_queue po renderze.';
