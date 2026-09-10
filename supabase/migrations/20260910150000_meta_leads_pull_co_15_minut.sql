-- === Pull leadów z Meta co 15 minut ===
-- Przy `*/5 * * * *` limit aplikacji Meta ((#4) Application request limit reached)
-- nadal był stale wyczerpany i blokował wszystkie operacje na Graph API — tworzenie
-- formularzy, kampanii, pobranie listy stron. Limit skaluje się z liczbą użytkowników
-- aplikacji, a dla wewnętrznej aplikacji jest mały.
--
-- Razem ze zmianami w kodzie (odkrywanie stron i formularzy najwyżej raz na godzinę,
-- pomijanie wyłączonych formularzy) daje to kilkanaście zapytań na godzinę zamiast
-- setek. Pull jest tylko backupem webhooka — leady wpadają na bieżąco webhookiem.

DO $$
DECLARE
  job record;
BEGIN
  FOR job IN SELECT jobid FROM cron.job WHERE jobname = 'meta-leads-pull' LOOP
    PERFORM cron.alter_job(job.jobid, schedule := '*/15 * * * *');
  END LOOP;
END $$;
