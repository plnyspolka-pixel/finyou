-- Odblokowanie wniosków zawieszonych w PROCESSING przez błąd ścieżki crona:
-- persistResult wstawiał created_by='' (pusty string) do kolumny uuid, INSERT
-- wyniku padał (invalid input syntax for type uuid), a status wniosku nigdy
-- nie przechodził w stan terminalny. Kod naprawiony (created_by NULL dla
-- automatu; tick podnosi też PROCESSING) — tu tylko jednorazowy reset kolejki.
UPDATE public.loan_applications la
  SET location_scoring_status = 'PENDING'
  WHERE la.location_scoring_status = 'PROCESSING'
    AND EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.loan_application_id = la.id
        AND p.land_register_number IS NOT NULL
        AND btrim(p.land_register_number) <> ''
    );
