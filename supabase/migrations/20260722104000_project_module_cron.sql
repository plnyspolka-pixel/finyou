-- === Cron modułu projektów: wygaszanie przypisań + przypomnienia ===
--
-- Co 5 minut odpytujemy endpoint /api/public/hooks/project-assignments-tick
-- (ten sam wzorzec, URL bazowy i apikey co pozostałe ticki automatyzacji —
-- patrz 20260707120000_schedule_automation_crons.sql). Endpoint jest
-- idempotentny: wygasza przeterminowane przypisania (project_expire_assignments
-- z blokadami SKIP LOCKED), wysyła przypomnienia 12h/3h/30m przed wygaśnięciem
-- (dedupe w project_assignment_notifications) i informuje o wygaśnięciach.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  job record;
BEGIN
  FOR job IN SELECT jobname FROM cron.job WHERE jobname = 'project-assignments-tick' LOOP
    PERFORM cron.unschedule(job.jobname);
  END LOOP;

  PERFORM cron.schedule('project-assignments-tick', '*/5 * * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/project-assignments-tick', hdrs));
EXCEPTION WHEN OTHERS THEN
  -- Środowiska bez pg_cron/pg_net (lokalny reset) — migracja nie może wywrócić się.
  RAISE NOTICE 'project-assignments-tick: pominięto planowanie (%).', SQLERRM;
END $$;
