-- Studio publikacji — bank klipów hooka (`clip_bank`).
--
-- Gotowe klipy 9:16 (~5 s, mp4) na pierwsze sekundy rolki: mocne otwarcie,
-- a OSTATNIA klatka to nieruchoma biała ściana biura z logo 3D financeyou.pl
-- — to samo tło, przed którym stoją pionowe awatary HeyGen
-- e0db8779828f484a8311fd427e815abe i 65ef986081bc48ed890c742cfa73d42e.
-- Klip gra więc w całości (bez efektów Remotion) i tnie się na twardo do
-- awatara. Dobór: tor rolki albo `both`, wyżej oceniane, rotacja
-- „najdawniej użyte” (src/lib/studio-hook-clips.ts).
--
-- Pliki leżą w publicznym buckecie `studio-media` (prefiks
-- `mcp/studio-hook-clips/…`) — źródłowe linki fal.media wygasają.
-- Import: narzędzie MCP `import_hook_clips` (upsert po `slug`).

CREATE TABLE IF NOT EXISTS public.studio_hook_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stały identyfikator klipu (np. h01_vault_kling) — po nim idzie upsert.
  slug text UNIQUE NOT NULL,
  -- Koncept wspólny dla wersji z różnych modeli (np. h01_vault).
  concept text,
  title text,
  track text NOT NULL CHECK (track IN ('pozyczkobiorca', 'inwestor', 'both')),
  -- Model wideo, z którego pochodzi klip (flux, kling, hailuo…).
  model text,
  -- Ocena jakości 1–5; dobór preferuje wyższe.
  rating smallint DEFAULT 3,
  -- Trwały publiczny URL (bucket studio-media) — to on idzie do Remotion.
  media_url text NOT NULL,
  storage_path text,
  -- Oryginalny (wygasający) adres pliku — tylko informacyjnie.
  source_url text,
  -- Długość klipu w sekundach (z nagłówka mp4); NULL = przyjmujemy 5 s.
  duration_s numeric,
  tags text[] DEFAULT '{}',
  active boolean DEFAULT true,
  use_count int DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Dobór: aktywne klipy toru, z rotacją najdawniej użytych.
CREATE INDEX IF NOT EXISTS idx_studio_hook_clips_pick
  ON public.studio_hook_clips (active, track, last_used_at NULLS FIRST);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Jak reszta Studia: odczyt dla kadry, zapisy wyłącznie przez service_role
-- (server functions panelu, narzędzia MCP).
ALTER TABLE public.studio_hook_clips ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.studio_hook_clips TO authenticated;
GRANT ALL ON public.studio_hook_clips TO service_role;

DROP POLICY IF EXISTS hook_clips_staff_select ON public.studio_hook_clips;
CREATE POLICY hook_clips_staff_select ON public.studio_hook_clips FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role));

DROP POLICY IF EXISTS hook_clips_service_all ON public.studio_hook_clips;
CREATE POLICY hook_clips_service_all ON public.studio_hook_clips FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.studio_hook_clips IS
  'Studio publikacji: bank klipów hooka (clip_bank) — klipy ~5 s kończące się na ścianie z logo za awatarami e0db…/65ef…; pliki w buckecie studio-media, dobór po torze z rotacją.';
