
CREATE OR REPLACE FUNCTION public.leads_auto_dedup_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Uruchamiaj tylko gdy jest telefon lub email — inaczej nie mamy po czym łączyć.
  IF NEW.phone_normalized IS NULL AND NEW.email IS NULL THEN
    RETURN NEW;
  END IF;
  -- Odpal deduplikację w tle synchronicznie (mały koszt, kilka par max).
  PERFORM public.dedup_leads();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_auto_dedup ON public.leads;
CREATE TRIGGER leads_auto_dedup
AFTER INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.leads_auto_dedup_trigger();
