-- Higiena automatu scoringu lokalizacyjnego.
--
-- Trigger mark_location_scoring_pending oznaczał wniosek PENDING przy KAŻDYM
-- INSERT/UPDATE nieruchomości — także bez numeru KW. Efekt: setki wniosków
-- wiecznie "PENDING", których tick i tak pomija (brak KW). Teraz:
--  1) trigger oznacza wniosek tylko, gdy nieruchomość MA numer KW,
--  2) jednorazowo czyścimy zastane PENDING bez żadnego numeru KW (status NULL
--     = "nie dotyczy", zgodnie z konwencją sprzed automatyzacji).

CREATE OR REPLACE FUNCTION public.mark_location_scoring_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.loan_application_id, OLD.loan_application_id) IS NOT NULL
     AND NEW.land_register_number IS NOT NULL
     AND btrim(NEW.land_register_number) <> '' THEN
    UPDATE public.loan_applications
      SET location_scoring_status = 'PENDING'
      WHERE id = COALESCE(NEW.loan_application_id, OLD.loan_application_id);
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.loan_applications la
  SET location_scoring_status = NULL
  WHERE la.location_scoring_status = 'PENDING'
    AND NOT EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.loan_application_id = la.id
        AND p.land_register_number IS NOT NULL
        AND btrim(p.land_register_number) <> ''
    );
