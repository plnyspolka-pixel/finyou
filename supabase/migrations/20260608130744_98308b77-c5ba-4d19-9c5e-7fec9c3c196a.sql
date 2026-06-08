
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Usuń stare zadanie jeśli istnieje (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('process-scheduled-calls-tick');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'process-scheduled-calls-tick',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app/api/public/hooks/process-scheduled-calls',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
