
-- Backfill: każdy wniosek "szukamy_inwestora" ma być widoczny dla inwestorów
UPDATE public.loan_applications
SET available_to_investors = true
WHERE status = 'szukamy_inwestora' AND available_to_investors IS DISTINCT FROM true;

-- Trigger: utrzymuj spójność statusu i flagi widoczności dla inwestora
CREATE OR REPLACE FUNCTION public.sync_available_to_investors()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'szukamy_inwestora' THEN
    NEW.available_to_investors := true;
  ELSIF NEW.status IN ('archiwalny','brak_kw','brak_kontaktu','brak_kwoty','brak_zdjec_dokumentow') THEN
    NEW.available_to_investors := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_available_to_investors ON public.loan_applications;
CREATE TRIGGER trg_sync_available_to_investors
BEFORE INSERT OR UPDATE OF status ON public.loan_applications
FOR EACH ROW EXECUTE FUNCTION public.sync_available_to_investors();
