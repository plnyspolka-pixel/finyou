-- Studio publikacji: lektor ElevenLabs z wyborem modelu, napisy z tekstu
-- scenariusza (bez napisów HeyGena).
--
--   * studio_settings — ustawienia globalne Studia (klucz → wartość); dziś
--     jedno: `tts_model_id` (model ElevenLabs lektora, np. eleven_v4),
--   * studio_video_jobs.tts_model_id — nadpisanie modelu dla jednego zadania
--     (NULL = ustawienie Studia w chwili renderu).
--
-- Napisy nie mają nowej kolumny: `subtitle_url` wskazuje teraz NASZ plik SRT
-- (bucket studio-media), zbudowany z tekstu scenariusza i czasów znaków
-- ElevenLabs, a nie plik z rozpoznawania mowy HeyGena. `caption_style`
-- przyjmuje wyłącznie style własne (reels / tiktok / box / minimal); stare
-- wiersze z 'heygen' zostają jako historia.

CREATE TABLE IF NOT EXISTS public.studio_settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.studio_video_jobs
  ADD COLUMN IF NOT EXISTS tts_model_id text;

COMMENT ON TABLE public.studio_settings IS
  'Studio publikacji: ustawienia globalne (klucz → wartość), np. tts_model_id = model ElevenLabs lektora.';
COMMENT ON COLUMN public.studio_video_jobs.tts_model_id IS
  'Model ElevenLabs lektora dla tego zadania (NULL = ustawienie Studia z studio_settings.tts_model_id).';

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Jak reszta Studia: odczyt dla kadry, zapisy wyłącznie przez service_role.
ALTER TABLE public.studio_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.studio_settings TO authenticated;
GRANT ALL ON public.studio_settings TO service_role;
DO $$
BEGIN
  CREATE POLICY studio_settings_staff_select ON public.studio_settings FOR SELECT TO authenticated
    USING (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
