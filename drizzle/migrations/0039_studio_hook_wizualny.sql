-- Studio publikacji: hook wizualny rolki (0–2,5 s) i orientacja zdjęć awatarów.
--
-- studio_video_jobs.hook — specyfikacja hooka i wygenerowane zasoby
--   { visual_prompt, text, highlight, sfx_prompt, source, music_prompt?,
--     variants?: [...], variant?, assets?: { status, kind, url, sfx_url, … } }
--   Wariant w teście A/B trzyma istniejąca kolumna hook_variant.
-- studio_avatar_orientations — cache orientacji zdjęć awatarów HeyGen
--   (poziome nie prowadzą rolki, ich ujęcia Remotion kadruje do pionu).

ALTER TABLE public.studio_video_jobs
  ADD COLUMN IF NOT EXISTS hook jsonb;

COMMENT ON COLUMN public.studio_video_jobs.hook IS
  'Hook wizualny 0–2,5 s (src/lib/studio-hook.ts): spec + warianty A/B + zasoby (klip, SFX). NULL = zaplanuje generator.';

CREATE TABLE IF NOT EXISTS public.studio_avatar_orientations (
  avatar_id text PRIMARY KEY,
  orientation text NOT NULL CHECK (orientation IN ('portrait', 'landscape', 'square')),
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  focus_x numeric(4, 3) NOT NULL DEFAULT 0.5 CHECK (focus_x BETWEEN 0 AND 1),
  focus_y numeric(4, 3) NOT NULL DEFAULT 0.35 CHECK (focus_y BETWEEN 0 AND 1),
  source text NOT NULL DEFAULT 'preview',
  checked_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON TABLE public.studio_avatar_orientations TO service_role;
ALTER TABLE public.studio_avatar_orientations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.studio_avatar_orientations FROM PUBLIC, anon;

DROP POLICY IF EXISTS "Staff view avatar orientations" ON public.studio_avatar_orientations;
CREATE POLICY "Staff view avatar orientations" ON public.studio_avatar_orientations
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'));
