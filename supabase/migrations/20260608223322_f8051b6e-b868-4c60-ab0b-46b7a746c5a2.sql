
CREATE TABLE public.loan_reminder_email_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  preview_text text,
  body_html text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  active boolean NOT NULL DEFAULT true,
  weight numeric NOT NULL DEFAULT 1,
  sent_count integer NOT NULL DEFAULT 0,
  opened_count integer NOT NULL DEFAULT 0,
  clicked_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_reminder_email_variants TO authenticated;
GRANT ALL ON public.loan_reminder_email_variants TO service_role;
ALTER TABLE public.loan_reminder_email_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lrev_staff_read" ON public.loan_reminder_email_variants
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'administrator'::app_role) OR has_role(auth.uid(),'operator'::app_role));
CREATE POLICY "lrev_admin_write" ON public.loan_reminder_email_variants
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'administrator'::app_role))
  WITH CHECK (has_role(auth.uid(),'administrator'::app_role));
CREATE TRIGGER set_lrev_updated_at BEFORE UPDATE ON public.loan_reminder_email_variants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.loan_reminder_email_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id uuid NOT NULL REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.loan_reminder_email_variants(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_hour_warsaw smallint NOT NULL,
  opened_at timestamptz,
  open_count integer NOT NULL DEFAULT 0,
  clicked_at timestamptz,
  click_count integer NOT NULL DEFAULT 0,
  mg_message_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lres_loan_sent ON public.loan_reminder_email_sends(loan_application_id, sent_at DESC);
CREATE INDEX idx_lres_variant ON public.loan_reminder_email_sends(variant_id);
CREATE INDEX idx_lres_open_hour ON public.loan_reminder_email_sends(loan_application_id, sent_hour_warsaw) WHERE opened_at IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_reminder_email_sends TO authenticated;
GRANT ALL ON public.loan_reminder_email_sends TO service_role;
ALTER TABLE public.loan_reminder_email_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lres_staff_read" ON public.loan_reminder_email_sends
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'administrator'::app_role) OR has_role(auth.uid(),'operator'::app_role));

ALTER TABLE public.loan_applications
  ADD COLUMN IF NOT EXISTS preferred_email_hour smallint,
  ADD COLUMN IF NOT EXISTS reminder_email_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reminder_email_first_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_email_unsubscribed boolean NOT NULL DEFAULT false;

-- preferowana godzina: jeśli puste, losujemy z 9..19 przy pierwszej wysyłce (robi to kod)
