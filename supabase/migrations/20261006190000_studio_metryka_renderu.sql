-- Studio publikacji — metryka renderu rolki.
--
--   * studio_video_jobs.render_meta — czym i jak powstał obraz: kompozytor
--     (HeyGen studio v3 / pojedyncze ujęcie v3; Remotion nie bierze udziału),
--     rozdzielczość, silnik awatara (Avatar V / IV), orientacja looków
--     (poziomy look w sklejce scen = pasy w kadrze 9:16), liczba przebitek,
--     model lektora ElevenLabs, ostrzeżenia jakości. Przy zakładaniu zadania
--     może tu leżeć `requested.allow_letterbox` (świadoma zgoda na pasy).
--   * Ustawienia jakości lądują w istniejącej tabeli studio_settings
--     (klucze: video_resolution, avatar_engine, landscape_avatars).

ALTER TABLE public.studio_video_jobs
  ADD COLUMN IF NOT EXISTS render_meta jsonb;

COMMENT ON COLUMN public.studio_video_jobs.render_meta IS
  'Metryka renderu rolki (src/lib/studio-quality.ts → RenderMeta): kompozytor, rozdzielczość, silnik i orientacja awatarów, przebitki, model lektora, ostrzeżenia jakości.';
