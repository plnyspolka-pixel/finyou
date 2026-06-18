CREATE TABLE public.reminder_email_schedule (
  id INTEGER PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  cron_expression TEXT NOT NULL DEFAULT '0 8,20 * * 1-6',
  timezone TEXT NOT NULL DEFAULT 'Europe/Warsaw',
  last_tick_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  last_result JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reminder_email_schedule_singleton CHECK (id = 1)
);

GRANT SELECT, UPDATE ON public.reminder_email_schedule TO authenticated;
GRANT ALL ON public.reminder_email_schedule TO service_role;

ALTER TABLE public.reminder_email_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read reminder schedule"
  ON public.reminder_email_schedule FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "admins update reminder schedule"
  ON public.reminder_email_schedule FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'));

CREATE TRIGGER reminder_email_schedule_touch_updated
  BEFORE UPDATE ON public.reminder_email_schedule
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.reminder_email_schedule (id, enabled, cron_expression, timezone)
VALUES (1, FALSE, '0 8,20 * * 1-6', 'Europe/Warsaw')
ON CONFLICT (id) DO NOTHING;