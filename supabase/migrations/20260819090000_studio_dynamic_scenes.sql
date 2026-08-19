-- Studio publikacji — rolka jako sklejka scen zamiast jednego ujęcia
-- gadającej głowy.
--
-- HeyGen v3 (`POST /v3/videos`, `type: "studio"`) skleja sceny pełnoekranowe:
-- awatar mówiący fragment scenariusza przeplatany pełnoekranową grafiką ze
-- stocku HeyGena (`/v3/assets/search`), przez którą lektor mówi dalej.
-- Warstw (nakładek na awatara) API nie ma, więc „elementy dynamiczne" z paczki
-- pytań zostają instrukcją montażową — realizujemy je jako cięcia i przebitki.
--
--   * dynamic_scenes — czy ten job renderuje się jako sklejka scen,
--   * scene_plan     — plan faktycznie wysłany na render (do podglądu w panelu).

ALTER TABLE public.studio_video_jobs
  ADD COLUMN IF NOT EXISTS dynamic_scenes boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scene_plan jsonb;

COMMENT ON COLUMN public.studio_video_jobs.dynamic_scenes IS
  'Czy render idzie jako sklejka scen HeyGen studio (awatar + przebitki), zamiast jednego ujęcia.';
COMMENT ON COLUMN public.studio_video_jobs.scene_plan IS
  'Plan scen wysłany na render: [{kind:"avatar"|"broll", text, query}]. NULL = pojedyncze ujęcie.';
