-- Rozdzielenie logik botów inwestorskich:
--   id=2 → inwestorzy INSTYTUCJONALNI (czat publiczny): tylko przekazywanie
--          informacji + przyjęcie prośby o fakturę (FV), bez lejka Klubu,
--   id=3 → inwestorzy PRYWATNI z wykupionym dostępem: asystent w panelu
--          /inwestor (osobna historia rozmów per użytkownik).

ALTER TABLE public.text_agent_settings
  DROP CONSTRAINT IF EXISTS text_agent_settings_id_check;
ALTER TABLE public.text_agent_settings
  ADD CONSTRAINT text_agent_settings_id_check CHECK (id IN (1, 2, 3));

INSERT INTO public.text_agent_settings (id, system_prompt)
VALUES (3, '')
ON CONFLICT DO NOTHING;

-- Historia rozmów asystenta panelowego (inwestorzy z dostępem). Zapisy robi
-- wyłącznie server function przez service_role; użytkownik czyta swoje.
CREATE TABLE public.investor_assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX investor_assistant_messages_user_idx
  ON public.investor_assistant_messages (user_id, created_at);

GRANT SELECT ON public.investor_assistant_messages TO authenticated;
GRANT ALL ON public.investor_assistant_messages TO service_role;

ALTER TABLE public.investor_assistant_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own assistant messages"
  ON public.investor_assistant_messages FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
