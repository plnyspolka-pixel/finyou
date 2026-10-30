-- Tryb indywidualnego pośrednictwa: wyłączenie publicznej giełdy ofert
-- i automatycznej dystrybucji na poziomie bazy (wdrożenie wymaga migracji).
UPDATE public.auto_distribution_settings SET enabled = false WHERE id = 1;

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
