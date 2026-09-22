-- === Porządki w pg_cron po awarii 22.09.2026 ===
-- 1. `cron.job_run_details` rosło bez ograniczeń (1,38 mln wierszy, 2 GB z 2,5 GB
--    bazy). Codzienne czyszczenie zostawia 7 dni historii.
-- 2. Ticki HTTP (net.http_post) miały domyślny limit 5 s — przy wolnym DNS/TLS
--    z hosta bazy gubiły odpowiedzi. Podnosimy do 20 s tam, gdzie limitu nie było.
-- 3. `meta-leads-pull-every-minute` (co minutę na app.financeyou.pl) dublowało
--    `meta-leads-pull` (co 15 min) i psuło wcześniejszą poprawkę na limity Meta
--    ((#4) Application request limit reached). Zostaje tylko wersja co 15 minut.
-- Wszystko idempotentne: migracja może być uruchomiona ponownie bez skutków ubocznych.

-- 3. duplikat pulla leadów
DO $$
DECLARE job record;
BEGIN
  FOR job IN SELECT jobid FROM cron.job WHERE jobname = 'meta-leads-pull-every-minute' LOOP
    PERFORM cron.unschedule(job.jobid);
  END LOOP;
END $$;

-- 2. limit czasu ticków HTTP
DO $$
DECLARE j record; newcmd text;
BEGIN
  FOR j IN
    SELECT jobid, command FROM cron.job
    WHERE command ILIKE '%net.http_post%' AND command NOT ILIKE '%timeout_milliseconds%'
  LOOP
    newcmd := regexp_replace(j.command, '\)([^)]*)$', ', timeout_milliseconds := 20000)\1');
    PERFORM cron.alter_job(j.jobid, command := newcmd);
  END LOOP;
END $$;

-- 1. codzienne czyszczenie historii uruchomień (7 dni). cron.schedule z tą samą
--    nazwą nadpisuje istniejące zadanie, więc wywołanie jest bezpieczne.
SELECT cron.schedule(
  'purge-cron-history',
  '30 3 * * *',
  $$SET statement_timeout = '10min'; DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';$$
);
