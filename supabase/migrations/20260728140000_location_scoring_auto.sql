-- Automatyzacja modułu „Potencjał lokalizacyjny" — scoring odpalany SAM dla
-- każdego numeru KW, który jest lub pojawi się w systemie.
--
-- Mechanizm:
--  1) Trigger na public.properties: każda zmiana numeru KW / rodzaju
--     nieruchomości (INSERT lub UPDATE) oznacza wniosek jako PENDING.
--  2) Cron (pg_cron, co 5 min) uderza w idempotentny endpoint
--     /api/public/hooks/location-scoring-tick, który scoruje wnioski
--     oczekujące (status NULL/PENDING) z numerem KW i ustawia status terminalny
--     (COMPLETED/FAILED/NEEDS_DATA) — bez przeliczania w kółko.
--  3) Jednorazowo: istniejące wnioski z numerem KW, jeszcze nieocenione
--     (status NULL), oznaczane są jako PENDING, żeby cron je podchwycił.
--
-- Dzięki temu operator nie musi nic klikać — potencjał liczy się automatycznie
-- dla całej bazy oraz każdego nowego/zmienionego numeru KW.

-- ── 1) Trigger oznaczający wniosek do przeliczenia ───────────────────────────
-- SECURITY DEFINER: zmiana KW przez klienta (RLS tylko-SELECT na loan_applications)
-- musi móc ustawić status — funkcja działa z prawami właściciela, poza RLS.
CREATE OR REPLACE FUNCTION public.mark_location_scoring_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.loan_application_id, OLD.loan_application_id) IS NOT NULL THEN
    UPDATE public.loan_applications
      SET location_scoring_status = 'PENDING'
      WHERE id = COALESCE(NEW.loan_application_id, OLD.loan_application_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_location_scoring_pending ON public.properties;
CREATE TRIGGER trg_mark_location_scoring_pending
  AFTER INSERT OR UPDATE OF land_register_number, property_type ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_location_scoring_pending();

-- ── 2) Jednorazowe oznaczenie istniejących, nieocenionych wniosków z KW ───────
UPDATE public.loan_applications la
  SET location_scoring_status = 'PENDING'
  WHERE la.location_scoring_status IS NULL
    AND EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.loan_application_id = la.id
        AND p.land_register_number IS NOT NULL
        AND btrim(p.land_register_number) <> ''
    );

-- ── 3) Cron: co 5 minut scoruj wnioski oczekujące ────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  job record;
BEGIN
  FOR job IN SELECT jobname FROM cron.job WHERE jobname = 'location-scoring-tick' LOOP
    PERFORM cron.unschedule(job.jobname);
  END LOOP;

  PERFORM cron.schedule('location-scoring-tick', '*/5 * * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/location-scoring-tick', hdrs));
EXCEPTION WHEN OTHERS THEN
  -- Środowiska bez pg_cron/pg_net (lokalny reset) — migracja nie może się wywrócić.
  RAISE NOTICE 'location-scoring-tick: pominięto planowanie (%).', SQLERRM;
END $$;

COMMENT ON FUNCTION public.mark_location_scoring_pending() IS 'Trigger: zmiana numeru KW / rodzaju nieruchomości oznacza wniosek do (ponownego) scoringu lokalizacyjnego (status PENDING).';
