
CREATE OR REPLACE FUNCTION public.compute_loan_auto_status(_loan_id uuid)
 RETURNS loan_status
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  la public.loan_applications%ROWTYPE;
  ld public.leads%ROWTYPE;
  cl public.clients%ROWTYPE;
  has_first boolean; has_last boolean; has_phone boolean; has_email boolean;
  has_amount boolean; has_kw boolean; has_media boolean;
  cur text;
BEGIN
  SELECT * INTO la FROM public.loan_applications WHERE id = _loan_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  cur := la.status::text;
  IF cur IN (
    'warunki_zaakceptowane','dokumenty_przygotowanie_umowy','notariusz','zamkniete',
    'zaakceptowany_przez_klienta','do_umowy','oczekuje_podpisania_umowy','umowa_podpisana',
    'oczekuje_ustanowienia_zabezpieczen','zabezpieczenia_ustanowione',
    'dokumenty_dostarczone_do_inwestora','oczekuje_wyplaty','wyplacony',
    'wniosek_odrzucony','nie_rokuje','zamkniety','archiwalny'
  ) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO ld FROM public.leads
   WHERE loan_application_id = _loan_id
   ORDER BY created_at DESC LIMIT 1;

  IF la.client_id IS NOT NULL THEN
    SELECT * INTO cl FROM public.clients WHERE id = la.client_id;
  END IF;

  has_first := coalesce(nullif(btrim(ld.first_name), ''), nullif(btrim(cl.first_name), '')) IS NOT NULL;
  has_last  := coalesce(nullif(btrim(ld.last_name), ''),  nullif(btrim(cl.last_name), ''))  IS NOT NULL;
  has_phone := coalesce(nullif(btrim(ld.phone_normalized), ''), nullif(btrim(ld.phone_raw), ''), nullif(btrim(cl.phone), '')) IS NOT NULL;
  has_email := coalesce(nullif(btrim(ld.email), ''), nullif(btrim(cl.email), '')) IS NOT NULL;

  has_amount := coalesce(la.loan_amount, 0) > 0
    OR coalesce((nullif(btrim(ld.application_data ->> 'loan_amount'), ''))::numeric, 0) > 0;

  has_kw := EXISTS (
      SELECT 1 FROM public.properties p
       WHERE p.loan_application_id = _loan_id
         AND nullif(btrim(p.land_register_number), '') IS NOT NULL
    )
    OR nullif(btrim(ld.kw_number), '') IS NOT NULL
    OR nullif(btrim(ld.application_data ->> 'land_register_number'), '') IS NOT NULL
    OR nullif(btrim(ld.application_data ->> 'kw_number'), '') IS NOT NULL;

  has_media := EXISTS (
      SELECT 1 FROM public.properties p
       WHERE p.loan_application_id = _loan_id
         AND coalesce(array_length(p.photos, 1), 0) > 0
    )
    OR EXISTS (SELECT 1 FROM public.documents d WHERE d.loan_application_id = _loan_id);

  IF NOT (has_first AND has_last AND has_phone AND has_email) THEN
    IF NOT (has_first OR has_last OR has_phone OR has_email) THEN
      RETURN 'nowy_lead'::public.loan_status;
    END IF;
    RETURN 'brak_kontaktu'::public.loan_status;
  END IF;

  IF NOT has_amount THEN
    RETURN 'brak_kwoty'::public.loan_status;
  END IF;

  IF NOT has_kw THEN
    RETURN 'brak_kw'::public.loan_status;
  END IF;

  IF NOT has_media THEN
    RETURN 'brak_zdjec_dokumentow'::public.loan_status;
  END IF;

  RETURN 'szukamy_inwestora'::public.loan_status;
END;
$function$;
