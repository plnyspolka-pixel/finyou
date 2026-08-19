-- Maile od inwestorów instytucjonalnych nie mogą trafiać do ścieżki leadowej.
-- Wiadomość od znanego inwestora bez dopasowanej dystrybucji zapisujemy mimo to
-- w offer_distribution_messages (bez wniosku i bez dystrybucji), żeby była
-- widoczna w zakładce Oferty — stąd loan_application_id przestaje być wymagane.
ALTER TABLE public.offer_distribution_messages
  ALTER COLUMN loan_application_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_odm_inbound_created
  ON public.offer_distribution_messages(created_at DESC)
  WHERE direction = 'inbound';
