-- Twardo blokuj duplikaty: 1 mail na (wniosek, wariant)
-- Najpierw usuń istniejące duplikaty (zostaw najstarszy)
DELETE FROM public.loan_reminder_email_sends a
USING public.loan_reminder_email_sends b
WHERE a.loan_application_id = b.loan_application_id
  AND a.variant_id = b.variant_id
  AND a.ctid > b.ctid;

ALTER TABLE public.loan_reminder_email_sends
  ADD CONSTRAINT loan_reminder_email_sends_unique_loan_variant
  UNIQUE (loan_application_id, variant_id);