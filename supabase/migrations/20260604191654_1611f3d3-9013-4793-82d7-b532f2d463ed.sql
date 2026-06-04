
CREATE TABLE public.text_agent_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  system_prompt TEXT NOT NULL DEFAULT '',
  first_message TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

GRANT SELECT, INSERT, UPDATE ON public.text_agent_settings TO authenticated;
GRANT ALL ON public.text_agent_settings TO service_role;

ALTER TABLE public.text_agent_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read text_agent_settings"
  ON public.text_agent_settings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "admins write text_agent_settings"
  ON public.text_agent_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'));

INSERT INTO public.text_agent_settings (id, system_prompt) VALUES (1, '') ON CONFLICT DO NOTHING;
