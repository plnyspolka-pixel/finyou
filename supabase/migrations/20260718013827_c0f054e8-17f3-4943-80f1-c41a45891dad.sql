ALTER TYPE public.loan_status ADD VALUE IF NOT EXISTS 'brak_kw';
ALTER TYPE public.loan_status ADD VALUE IF NOT EXISTS 'brak_zdjec_dokumentow';

COMMIT;
BEGIN;

UPDATE public.loan_applications la
   SET loan_amount = ((l.application_data ->> 'loan_amount')::numeric)
  FROM public.leads l
 WHERE l.loan_application_id = la.id
   AND la.loan_amount IS NULL
   AND (l.application_data ->> 'loan_amount') ~ '^[0-9]+(\.[0-9]+)?$';

CREATE OR REPLACE FUNCTION public.compute_loan_auto_status(_loan_id uuid)
RETURNS public.loan_status
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  la public.loan_applications%ROWTYPE;
  ld public.leads%ROWTYPE;
  cl public.clients%ROWTYPE;
  has_first boolean; has_last boolean; has_phone boolean; has_email boolean;
  has_kw boolean; has_media boolean;
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

  IF NOT has_kw THEN
    RETURN 'brak_kw'::public.loan_status;
  END IF;

  IF NOT has_media THEN
    RETURN 'brak_zdjec_dokumentow'::public.loan_status;
  END IF;

  RETURN 'szukamy_inwestora'::public.loan_status;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.apply_loan_auto_status(_loan_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE new_status public.loan_status;
BEGIN
  IF _loan_id IS NULL THEN RETURN; END IF;
  new_status := public.compute_loan_auto_status(_loan_id);
  IF new_status IS NULL THEN RETURN; END IF;
  UPDATE public.loan_applications
     SET status = new_status
   WHERE id = _loan_id
     AND status IS DISTINCT FROM new_status;
END; $fn$;

CREATE OR REPLACE FUNCTION public.trg_loan_auto_status_self()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.apply_loan_auto_status(NEW.id); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.trg_loan_auto_status_by_loan_col()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  _id := coalesce(NEW.loan_application_id, OLD.loan_application_id);
  PERFORM public.apply_loan_auto_status(_id);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS loan_applications_auto_status ON public.loan_applications;
CREATE TRIGGER loan_applications_auto_status
AFTER INSERT OR UPDATE OF client_id ON public.loan_applications
FOR EACH ROW EXECUTE FUNCTION public.trg_loan_auto_status_self();

DROP TRIGGER IF EXISTS properties_auto_status ON public.properties;
CREATE TRIGGER properties_auto_status
AFTER INSERT OR UPDATE OR DELETE ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.trg_loan_auto_status_by_loan_col();

DROP TRIGGER IF EXISTS documents_auto_status ON public.documents;
CREATE TRIGGER documents_auto_status
AFTER INSERT OR UPDATE OR DELETE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.trg_loan_auto_status_by_loan_col();

DROP TRIGGER IF EXISTS leads_auto_status ON public.leads;
CREATE TRIGGER leads_auto_status
AFTER INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.trg_loan_auto_status_by_loan_col();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.loan_applications LOOP
    PERFORM public.apply_loan_auto_status(r.id);
  END LOOP;
END $$;
