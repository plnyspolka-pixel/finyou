-- Oddzielne kanały: Tinder = pośrednictwo ręczne 1:1, dystrybucja do
-- instytucji = AUTOMATYCZNA wysyłka, gdy rzeczywisty score lokalizacji > 50.
-- Próg wysyłki i B2B są egzekwowane także w kodzie serwera.
INSERT INTO public.auto_distribution_settings (id, enabled, min_location_score, daily_send_limit)
VALUES (1, true, 50, 500)
ON CONFLICT (id) DO UPDATE
SET enabled = true, min_location_score = 50, daily_send_limit = 500;

-- W czasie wysyłki (status sending) nie wolno utworzyć drugiej propozycji
-- dla tego samego wniosku. Chroni przed nakładającymi się wywołaniami cron.
DROP INDEX IF EXISTS public.auto_distribution_open_proposal_idx;
CREATE UNIQUE INDEX IF NOT EXISTS auto_distribution_open_proposal_idx
  ON public.auto_distribution_proposals (loan_application_id)
  WHERE status IN ('proposed', 'sending');

-- Dawna „publiczna” lista propozycji (dla wszystkich zalogowanych inwestorów)
-- nie może pozostać alternatywnym kanałem przeglądania dostępnych finansowań.
REVOKE ALL ON FUNCTION public.list_public_loan_proposals() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_public_loan_proposal(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_loan_proposals() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_public_loan_proposal(uuid) TO service_role;

-- Dotychczasowy atomowy przydział Tindera pozostaje tylko dla service_role;
-- inwestor nie może go sam wywołać z poziomu Supabase RPC.
REVOKE ALL ON FUNCTION public.project_claim_assignment(uuid, uuid, numeric, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_claim_assignment(uuid, uuid, numeric, text, uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';
