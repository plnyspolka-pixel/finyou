-- === Pull leadów z Meta co 5 minut zamiast co minutę ===
-- `meta-leads-pull` to backup webhooka: przy każdym uruchomieniu pobiera strony,
-- dla każdej strony formularze, a dla każdego formularza leady — czyli kilkadziesiąt
-- zapytań do Graph API. Co minutę wyczerpywało to limit aplikacji
-- ((#4) Application request limit reached) i blokowało wszystkie pozostałe operacje
-- na Meta: tworzenie pikseli, kampanii, pobieranie stron.
--
-- Co 5 minut to 288 zamiast 1440 uruchomień na dobę. Leady i tak wpadają na bieżąco
-- webhookiem — ten pull tylko domyka ewentualne braki, więc kilka minut zwłoki
-- niczego nie psuje.
--
-- Zmieniamy wyłącznie harmonogram; komenda zadania (URL + nagłówki) zostaje ta sama.

DO $$
DECLARE
  job record;
BEGIN
  FOR job IN SELECT jobid FROM cron.job WHERE jobname = 'meta-leads-pull' LOOP
    PERFORM cron.alter_job(job.jobid, schedule := '*/5 * * * *');
  END LOOP;
END $$;
