-- Pamięć długotrwała asystenta panelu (/admin — „Asystent panelu").
--
-- Rozmowy same w sobie były już zapisywane (ai_admin_conversations +
-- ai_admin_messages), ale każdy nowy wątek startował od zera: bot nie pamiętał
-- ustaleń, nazw własnych ani tego, JAK administrator pracuje. Ta migracja
-- dokłada trzy rzeczy:
--
--   1. `ai_admin_memory` — baza wiedzy destylowana z rozmów (preferencje,
--      procesy, fakty o firmie, słownik pojęć, kontekst projektów). Wstrzykiwana
--      do promptu systemowego przy każdej turze.
--   2. Streszczenia rozmów (`ai_admin_conversations.summary`) — długie wątki
--      dają się przywołać bez czytania całej historii.
--   3. Indeks pełnotekstowy na treści wiadomości — narzędzie
--      `search_conversations` szuka po wszystkich dotychczasowych rozmowach.
--
-- Logika w TS: src/lib/ai-admin.server.ts (narzędzia + destylacja),
-- src/lib/ai-admin.functions.ts (server functions), UI: zakładka „Pamięć"
-- w ustawieniach asystenta (src/components/admin/admin-bot.tsx).
-- Dokumentacja: docs/asystent-panelu.md.

-- ── Baza wiedzy ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_admin_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- preferencja  — jak administrator chce, żeby bot pracował (styl, formaty, zasady)
  -- proces       — jak w firmie przebiega dana czynność (kroki, kto, czym)
  -- fakt         — trwały fakt o firmie/danych (np. co znaczy status X)
  -- slownik      — nazwa własna / skrót i jego znaczenie
  -- projekt      — kontekst bieżącej roboty (na czym teraz pracujemy)
  kind text NOT NULL DEFAULT 'fakt'
    CHECK (kind IN ('preferencja', 'proces', 'fakt', 'slownik', 'projekt')),
  -- Krótka etykieta (klucz deduplikacji — patrz idx_aim_title_unique).
  title text NOT NULL,
  content text NOT NULL,
  -- Wyżej = wcześniej w prompcie, gdy limit pamięci nie mieści wszystkiego.
  weight integer NOT NULL DEFAULT 0,
  -- Ile razy wpis trafił do promptu (sygnał, co faktycznie jest używane).
  uses integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  -- Rozmowa, z której wpis został wydestylowany (NULL po jej usunięciu).
  source_conversation_id uuid REFERENCES public.ai_admin_conversations(id) ON DELETE SET NULL,
  -- Wpis dopisany ręcznie w panelu nie jest nadpisywany przez destylację.
  pinned boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Jeden wpis na etykietę (bez względu na wielkość liter) — destylacja
-- aktualizuje istniejący zamiast mnożyć duplikaty.
CREATE UNIQUE INDEX IF NOT EXISTS idx_aim_title_unique
  ON public.ai_admin_memory (lower(title));

CREATE INDEX IF NOT EXISTS idx_aim_active
  ON public.ai_admin_memory (weight DESC, updated_at DESC)
  WHERE NOT archived;

DO $$
BEGIN
  CREATE TRIGGER trg_aim_touch_updated_at
    BEFORE UPDATE ON public.ai_admin_memory
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.ai_admin_memory ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_admin_memory TO authenticated;
GRANT ALL ON public.ai_admin_memory TO service_role;

DROP POLICY IF EXISTS aim_admin_all ON public.ai_admin_memory;
CREATE POLICY aim_admin_all ON public.ai_admin_memory FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role));

COMMENT ON TABLE public.ai_admin_memory IS
  'Asystent panelu: pamięć długotrwała destylowana z rozmów (preferencje, procesy, fakty, słownik, projekty). Wstrzykiwana do promptu systemowego.';

-- ── Streszczenia rozmów ──────────────────────────────────────────────────────
ALTER TABLE public.ai_admin_conversations
  ADD COLUMN IF NOT EXISTS summary text,
  -- Do ilu wiadomości streszczenie jest aktualne (destylacja przetwarza tylko nowe).
  ADD COLUMN IF NOT EXISTS summarized_message_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS summarized_at timestamptz;

-- ── Szukanie po wszystkich rozmowach ─────────────────────────────────────────
-- 'simple' zamiast 'polish' — konfiguracja polska nie jest gwarantowana na
-- instancji; do wyszukiwania po frazach i nazwach własnych wystarcza.
CREATE INDEX IF NOT EXISTS idx_aiam_content_fts
  ON public.ai_admin_messages USING gin (to_tsvector('simple', content));

-- ── Przełącznik pamięci w ustawieniach ───────────────────────────────────────
ALTER TABLE public.ai_admin_settings
  ADD COLUMN IF NOT EXISTS enable_memory boolean NOT NULL DEFAULT true,
  -- Ile wpisów pamięci maksymalnie ląduje w prompcie (koszt vs. kontekst).
  ADD COLUMN IF NOT EXISTS memory_limit integer NOT NULL DEFAULT 40;
