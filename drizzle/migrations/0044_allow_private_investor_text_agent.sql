ALTER TABLE public.text_agent_settings DROP CONSTRAINT IF EXISTS text_agent_settings_id_check;
ALTER TABLE public.text_agent_settings ADD CONSTRAINT text_agent_settings_id_check CHECK (id IN (1, 2, 3));
COMMENT ON CONSTRAINT text_agent_settings_id_check ON public.text_agent_settings IS '1 = klient, 2 = inwestor, 3 = inwestor_prywatny. No prompt rows are seeded.';