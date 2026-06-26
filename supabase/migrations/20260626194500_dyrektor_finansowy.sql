-- Dyrektor finansowy (AI) dla panelu inwestora.
-- Rozmowy + wiadomości czatu z modelem AI napędzanym przez Anthropic.
-- Dostęp wyłącznie dla roli 'inwestor' (właściciel rozmowy). Operacje serwerowe
-- używają service_role (z weryfikacją inwestora w kodzie), RLS chroni dostęp bezpośredni.

CREATE TABLE public.df_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  investor_id uuid REFERENCES public.investors(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Nowa rozmowa',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_df_conv_user ON public.df_conversations(user_id, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.df_conversations TO authenticated;
GRANT ALL ON public.df_conversations TO service_role;
ALTER TABLE public.df_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Investors own df conversations"
ON public.df_conversations FOR ALL TO authenticated
USING (user_id = auth.uid() AND public.has_role(auth.uid(), 'inwestor'))
WITH CHECK (user_id = auth.uid() AND public.has_role(auth.uid(), 'inwestor'));

CREATE TABLE public.df_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.df_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','tool')),
  content text NOT NULL DEFAULT '',
  tool_calls jsonb,
  tool_results jsonb,
  tokens_in integer,
  tokens_out integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_df_msg_conv ON public.df_messages(conversation_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.df_messages TO authenticated;
GRANT ALL ON public.df_messages TO service_role;
ALTER TABLE public.df_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Investors see messages of own df conversations"
ON public.df_messages FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'inwestor')
  AND EXISTS (SELECT 1 FROM public.df_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'inwestor')
  AND EXISTS (SELECT 1 FROM public.df_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid())
);

-- Audyt narzędzi wywoływanych przez Dyrektora finansowego (na potrzeby bezpieczeństwa).
CREATE TABLE public.df_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  investor_id uuid,
  conversation_id uuid,
  tool_name text NOT NULL,
  tool_input jsonb,
  success boolean NOT NULL DEFAULT true,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_df_audit_user ON public.df_audit_log(user_id, created_at DESC);

GRANT SELECT, INSERT ON public.df_audit_log TO authenticated;
GRANT ALL ON public.df_audit_log TO service_role;
ALTER TABLE public.df_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Investors read own df audit"
ON public.df_audit_log FOR SELECT TO authenticated
USING (user_id = auth.uid() AND public.has_role(auth.uid(), 'inwestor'));
