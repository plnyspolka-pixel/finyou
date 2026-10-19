-- Harmonogram ticka autopilota: co godzinę w 7. minucie (strażnik anomalii,
-- raport dzienny 20:xx i tygodniowy pon. 8:xx czasu warszawskiego).
-- Endpoint niczego nie publikuje; w trybie manual_review / off strażnik
-- nic nie robi, a raport trafia tylko do dziennika.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  job record;
BEGIN
  FOR job IN SELECT jobname FROM cron.job WHERE jobname = 'autopilot-tick' LOOP
    PERFORM cron.unschedule(job.jobname);
  END LOOP;

  PERFORM cron.schedule('autopilot-tick', '7 * * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/autopilot-tick', hdrs));
END $$;
