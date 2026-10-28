-- Formularz Meta w trybie „tylko mailing”: per formularz można wyłączyć SMS
-- powitalny i dopisać leady do listy mailingowej z wybranymi tagami.
-- Telefon voicebota wyłącza istniejąca kolumna voicebot_enabled.
ALTER TABLE public.meta_lead_forms
  ADD COLUMN IF NOT EXISTS welcome_sms_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS subscriber_tags text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.meta_lead_forms.welcome_sms_enabled IS
  'false = lead z tego formularza nie dostaje SMS-a powitalnego.';
COMMENT ON COLUMN public.meta_lead_forms.subscriber_tags IS
  'Niepuste = lead z e-mailem trafia do email_subscribers z tymi tagami (segment pod kampanię mailową).';
