-- Studio publikacji — bank klipów hooka: dobór do TREŚCI rolki.
--
-- Klip nie jest już losowany ani rotowany: AI (a bez AI słowa kluczowe)
-- porównuje scenariusz i tekst hooka z opisem i tagami konceptu klipu
-- i bierze klip tylko przy wyraźnym dopasowaniu (src/lib/studio-hook-clips.ts).
-- `description` — po polsku: co klip znaczy, jaki problem widza ilustruje.
-- `tags` (już są) — frazy, którymi lektor o tym mówi.

ALTER TABLE public.studio_hook_clips
  ADD COLUMN IF NOT EXISTS description text;

-- Dobór czyta wszystkie aktywne klipy toru i grupuje je po koncepcie.
CREATE INDEX IF NOT EXISTS idx_studio_hook_clips_concept
  ON public.studio_hook_clips (concept);

COMMENT ON COLUMN public.studio_hook_clips.description IS
  'Znaczenie klipu po polsku (jaki problem widza ilustruje) — po nim i po tagach klip jest dobierany do treści rolki.';

COMMENT ON TABLE public.studio_hook_clips IS
  'Studio publikacji: bank klipów hooka (clip_bank) — klipy ~5 s kończące się na ścianie z logo za awatarami e0db…/65ef…; pliki w buckecie studio-media, dobór do treści rolki (AI / słowa kluczowe po opisie i tagach konceptu), w koncepcie najwyższa ocena.';
