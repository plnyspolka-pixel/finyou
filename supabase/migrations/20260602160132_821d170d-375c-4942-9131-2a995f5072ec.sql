CREATE TABLE public.ai_admin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  model text NOT NULL DEFAULT 'claude-opus-4-5',
  system_prompt text NOT NULL DEFAULT 'Jesteś AI Administratorem aplikacji Finance You (pożyczki pod nieruchomość, inwestowanie w wierzytelności). Masz dostęp do bazy danych (odczyt + zapis) oraz plików projektu. Pomagasz administratorowi: analizujesz dane, debugujesz problemy, generujesz raporty, sugerujesz zmiany w kodzie. Odpowiadasz po polsku, konkretnie i bez ogólników. Przed każdą zmianą w bazie pokaż co planujesz zrobić i poproś o potwierdzenie, chyba że administrator wyraźnie poprosił o wykonanie bez pytania.',
  enable_db_read boolean NOT NULL DEFAULT true,
  enable_db_write boolean NOT NULL DEFAULT true,
  enable_file_read boolean NOT NULL DEFAULT true,
  max_tokens integer NOT NULL DEFAULT 8000,
  temperature numeric NOT NULL DEFAULT 0.3,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_admin_settings TO authenticated;
GRANT ALL ON public.ai_admin_settings TO service_role;

ALTER TABLE public.ai_admin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ai settings"
ON public.ai_admin_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'administrator'))
WITH CHECK (public.has_role(auth.uid(), 'administrator'));

INSERT INTO public.ai_admin_settings (singleton) VALUES (true);

CREATE TABLE public.ai_admin_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Nowa rozmowa',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_aiac_user ON public.ai_admin_conversations(user_id, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_admin_conversations TO authenticated;
GRANT ALL ON public.ai_admin_conversations TO service_role;
ALTER TABLE public.ai_admin_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins own their conversations"
ON public.ai_admin_conversations FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'administrator') AND user_id = auth.uid())
WITH CHECK (public.has_role(auth.uid(), 'administrator') AND user_id = auth.uid());

CREATE TABLE public.ai_admin_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_admin_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','tool')),
  content text NOT NULL DEFAULT '',
  tool_calls jsonb,
  tool_results jsonb,
  tokens_in integer,
  tokens_out integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_aiam_conv ON public.ai_admin_messages(conversation_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_admin_messages TO authenticated;
GRANT ALL ON public.ai_admin_messages TO service_role;
ALTER TABLE public.ai_admin_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins see messages of own conversations"
ON public.ai_admin_messages FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'administrator')
  AND EXISTS (SELECT 1 FROM public.ai_admin_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'administrator')
  AND EXISTS (SELECT 1 FROM public.ai_admin_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid())
);

CREATE TABLE public.ai_admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  conversation_id uuid,
  tool_name text NOT NULL,
  tool_input jsonb,
  tool_output jsonb,
  success boolean NOT NULL DEFAULT true,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_aial_user ON public.ai_admin_audit_log(user_id, created_at DESC);

GRANT SELECT, INSERT ON public.ai_admin_audit_log TO authenticated;
GRANT ALL ON public.ai_admin_audit_log TO service_role;
ALTER TABLE public.ai_admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read audit log"
ON public.ai_admin_audit_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "Service role inserts audit log"
ON public.ai_admin_audit_log FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'administrator') AND user_id = auth.uid());