-- 1) Settings table (singleton)
CREATE TABLE IF NOT EXISTS public.voicebot_settings (
  id integer PRIMARY KEY DEFAULT 1,
  agent_id text,
  agent_phone_number_id text,
  call_trigger text NOT NULL DEFAULT 'auto', -- 'auto' | 'manual' | 'auto_retry'
  call_delay_seconds integer NOT NULL DEFAULT 0,
  retry_count integer NOT NULL DEFAULT 1,
  retry_delay_minutes integer NOT NULL DEFAULT 30,
  sms_enabled boolean NOT NULL DEFAULT false,
  sms_from text,
  sms_template text DEFAULT 'Cześć {imie}, dzięki za zgłoszenie do FinanceYou. Za chwilę zadzwoni do Ciebie nasza asystentka Ania.',
  sms_delay_seconds integer NOT NULL DEFAULT 0,
  sms_trigger text NOT NULL DEFAULT 'before_call', -- 'before_call' | 'after_call' | 'on_failure' | 'off'
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT voicebot_settings_singleton CHECK (id = 1)
);

GRANT SELECT, INSERT, UPDATE ON public.voicebot_settings TO authenticated;
GRANT ALL ON public.voicebot_settings TO service_role;

ALTER TABLE public.voicebot_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voicebot_settings_admin_all" ON public.voicebot_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'::app_role));

CREATE POLICY "voicebot_settings_staff_select" ON public.voicebot_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'::app_role) OR public.has_role(auth.uid(), 'operator'::app_role));

-- 2) Extend call_queue
ALTER TABLE public.call_queue
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS meta_lead_id uuid,
  ADD COLUMN IF NOT EXISTS sms_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS conversation_id text;

CREATE INDEX IF NOT EXISTS idx_call_queue_meta_lead ON public.call_queue(meta_lead_id);
CREATE INDEX IF NOT EXISTS idx_call_queue_source ON public.call_queue(source);

-- 3) Seed defaults (user-provided)
INSERT INTO public.voicebot_settings (id, agent_id, agent_phone_number_id, call_trigger)
VALUES (1, 'agent_7201kshwfj22fcpr0bjpf31282dp', 'phnum_9801kt17m2qtecp84fy57zyznz8f', 'auto')
ON CONFLICT (id) DO UPDATE SET
  agent_id = COALESCE(public.voicebot_settings.agent_id, EXCLUDED.agent_id),
  agent_phone_number_id = COALESCE(public.voicebot_settings.agent_phone_number_id, EXCLUDED.agent_phone_number_id);