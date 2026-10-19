-- MCP `get_updates_since`: kursor „co nowego” per użytkownik. Bez `since`
-- raport zaczyna się od końca okna z ostatniego odpytania tego użytkownika
-- (`last_until`), a nie od sztywnej godziny wstecz. Kursor przesuwa tylko
-- wywołanie bez jawnego `since` / `until` (albo z `advance_cursor: true`);
-- zapytania historyczne go nie ruszają.
CREATE TABLE IF NOT EXISTS public.mcp_digest_cursors (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_until timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mcp_digest_cursors IS
  'Znacznik ostatniego raportu get_updates_since (MCP) per użytkownik — początek okna przy kolejnym pytaniu „co nowego”.';
COMMENT ON COLUMN public.mcp_digest_cursors.last_until IS
  'Koniec okna (`until`) ostatniego raportu, który przesunął kursor.';

ALTER TABLE public.mcp_digest_cursors ENABLE ROW LEVEL SECURITY;

-- Narzędzie MCP pisze tokenem użytkownika: każdy widzi i zmienia tylko swój kursor.
DROP POLICY IF EXISTS mcp_digest_cursors_own_select ON public.mcp_digest_cursors;
CREATE POLICY mcp_digest_cursors_own_select ON public.mcp_digest_cursors
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS mcp_digest_cursors_own_insert ON public.mcp_digest_cursors;
CREATE POLICY mcp_digest_cursors_own_insert ON public.mcp_digest_cursors
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS mcp_digest_cursors_own_update ON public.mcp_digest_cursors;
CREATE POLICY mcp_digest_cursors_own_update ON public.mcp_digest_cursors
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.mcp_digest_cursors FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.mcp_digest_cursors TO authenticated;
GRANT ALL ON public.mcp_digest_cursors TO service_role;
