-- Studio publikacji — opisy PER PLATFORMA przy auto-publikacji po renderze.
--
-- Zasada „jedna platforma — jeden opis": każda platforma ma własne pola
-- (tytuł i/lub treść), własne limity (YouTube tytuł 92 zn. + opis 5000 B,
-- IG / FB Reels 2200 zn. i 30 hashtagów, TikTok podpis 150 zn., X 280 zn.
-- ważonych, post FB 63 206 zn.) i zwyczaje. Kolejki publikacji mają już
-- osobny wiersz per platforma (social_publish_queue.title / message,
-- youtube_publish_queue.title / description), więc opis per platforma zapisuje
-- się tam wprost. Brakuje go tylko zadaniu wideo Studia: auto-publikacja po
-- renderze składała wszystkie wpisy z jednego publish_title /
-- publish_description.
--
-- publish_copy trzyma opisy wpisane w panelu (karty per platforma) albo przez
-- MCP (create_studio_video_job / update_studio_job / publish_studio_job):
--
-- {
--   "youtube":         { "title": "...", "message": "..." },
--   "instagram_reels": { "message": "..." },
--   "tiktok":          { "title": "podpis z hashtagami" },
--   "x":               { "message": "..." }
-- }
--
-- Pole nieobecne / puste = uzupełnia je auto-publikacja ze wspólnego
-- publish_title / publish_description (z panelu albo od AI razem ze
-- scenariuszem), dopasowanego do limitów platformy. Kształt i reguły pilnuje
-- TS: src/lib/platform-copy.ts (parsePlatformCopyMap, fitCopyToPlatform).

ALTER TABLE public.studio_video_jobs
  ADD COLUMN IF NOT EXISTS publish_copy jsonb;

COMMENT ON COLUMN public.studio_video_jobs.publish_copy IS
  'Studio: opisy publikacji per platforma ({platforma: {title?, message?}}) dla auto-publikacji po renderze; NULL / brak pola = szkic ze wspólnego publish_title / publish_description dopasowany do limitów platformy.';
