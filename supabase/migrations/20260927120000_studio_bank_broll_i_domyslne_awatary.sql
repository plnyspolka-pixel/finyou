-- Studio publikacji — bank b-rolli + stały zestaw domyślnych awatarów
-- + struktura rolki (ujęcie → wizual hook → przebitka → a-roll innego awatara).
--
-- DLACZEGO BANK, SKORO JEST STOCK HEYGENA:
--   * `/v3/assets/search` zwraca co przebieg co innego — rolki wychodzą
--     niespójne wizualnie, a tej samej dobrej grafiki nie da się użyć ponownie,
--   * URL-e stocku nie są naszą własnością i mogą wygasnąć w trakcie renderu,
--   * nie da się tam trzymać naszych własnych ujęć (nagrania z biura, ekrany
--     panelu, grafiki AI zrobione w zakładce „Grafiki AI").
-- Bank rozwiązuje wszystkie trzy: pliki lądują w publicznym buckecie
-- `studio-media` (trwały https, ten sam, który czyta HeyGen i Meta), a wybór
-- idzie po tagach, z rotacją „najdawniej użyte".
--
--   * studio_broll_assets   — bank materiałów: przebitki (`broll`) i wizual
--                             hooki (`hook`, czyli efekciarskie ujęcie po
--                             pierwszym zdaniu, które zatrzymuje kciuk),
--   * studio_default_avatars — stały zestaw awatarów ustawiany przyciskiem
--                             w panelu; kolejność (`position`) wyznacza
--                             rotację a-rolli w rolce,
--   * studio_video_jobs.reel_structure / avatar_ids — tryb montażu i rotacja
--                             awatarów zapisane przy jobie (także wsadowym).

-- ── Bank b-rolli ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.studio_broll_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'broll' = materiał ilustracyjny do treści, 'hook' = wizual hook (efekt).
  kind text NOT NULL DEFAULT 'broll' CHECK (kind IN ('broll', 'hook')),
  title text NOT NULL DEFAULT '',
  -- Słowa kluczowe (małymi literami) — po nich dobieramy przebitkę do frazy.
  tags text[] NOT NULL DEFAULT '{}',
  -- Trwały publiczny URL (bucket studio-media) — to on idzie do HeyGena.
  media_url text NOT NULL,
  storage_path text,
  -- Skąd materiał: 'upload' | 'url' | 'heygen' | 'pexels' | 'ai'.
  source text NOT NULL DEFAULT 'url',
  -- Fraza/opis źródłowy (przy imporcie ze stocku) — pomaga dobierać po tekście.
  source_query text NOT NULL DEFAULT '',
  -- 'portrait' | 'square' | 'landscape' | NULL (nieznana) — kadr 9:16 docina.
  orientation text,
  attribution text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  use_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Dobieranie materiału: zawsze po (kind, active), z rotacją najdawniej użytych.
CREATE INDEX IF NOT EXISTS idx_broll_kind_active
  ON public.studio_broll_assets (kind, last_used_at NULLS FIRST)
  WHERE active;

CREATE INDEX IF NOT EXISTS idx_broll_tags
  ON public.studio_broll_assets USING gin (tags);

-- Ten sam plik nie ma prawa wejść do banku dwa razy (seed jest idempotentny).
CREATE UNIQUE INDEX IF NOT EXISTS idx_broll_media_url
  ON public.studio_broll_assets (media_url);

-- ── Domyślne awatary (stały zestaw + kolejność rotacji) ──────────────────────
CREATE TABLE IF NOT EXISTS public.studio_default_avatars (
  avatar_id text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  preview text,
  -- 'avatar' | 'talking_photo' — decyduje o kształcie payloadu HeyGena.
  kind text NOT NULL DEFAULT 'avatar' CHECK (kind IN ('avatar', 'talking_photo')),
  -- Kolejność w rotacji a-rolli: 0 mówi hook, kolejne przejmują dalsze ujęcia.
  position integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_default_avatars_position
  ON public.studio_default_avatars (position);

-- ── Tryb montażu zapisany przy jobie ─────────────────────────────────────────
ALTER TABLE public.studio_video_jobs
  ADD COLUMN IF NOT EXISTS reel_structure boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS avatar_ids text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.studio_video_jobs.reel_structure IS
  'Czy rolka idzie stałą strukturą: ujęcie → wizual hook → przebitka → a-roll innego domyślnego awatara.';
COMMENT ON COLUMN public.studio_video_jobs.avatar_ids IS
  'Rotacja domyślnych awatarów użyta przy tym jobie (pusta = tylko avatar_id).';

-- ── updated_at ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  CREATE TRIGGER trg_broll_touch_updated_at
    BEFORE UPDATE ON public.studio_broll_assets
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TRIGGER trg_default_avatars_touch_updated_at
    BEFORE UPDATE ON public.studio_default_avatars
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Jak reszta Studia: odczyt dla kadry, zapisy wyłącznie przez service_role
-- (server functions panelu).
ALTER TABLE public.studio_broll_assets ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.studio_broll_assets TO authenticated;
GRANT ALL ON public.studio_broll_assets TO service_role;
DO $$
BEGIN
  CREATE POLICY broll_staff_select ON public.studio_broll_assets FOR SELECT TO authenticated
    USING (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.studio_default_avatars ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.studio_default_avatars TO authenticated;
GRANT ALL ON public.studio_default_avatars TO service_role;
DO $$
BEGIN
  CREATE POLICY default_avatars_staff_select ON public.studio_default_avatars FOR SELECT TO authenticated
    USING (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.studio_broll_assets IS
  'Studio publikacji: bank b-rolli i wizual hooków (pliki w buckecie studio-media, dobór po tagach z rotacją).';
COMMENT ON TABLE public.studio_default_avatars IS
  'Studio publikacji: stały zestaw domyślnych awatarów; position wyznacza rotację a-rolli w rolce.';
