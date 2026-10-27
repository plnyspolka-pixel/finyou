-- Automatyczny feedback dla pośredników (decyzja właściciela 27.10.2026):
-- e-mail, gdy inwestor zainteresuje się ofertą klienta pośrednika albo pożyczka
-- zostanie uruchomiona (przez inwestora lub z kapitału Finance You).
-- Tabela deduplikacji — każdy sygnał wysyłamy raz. Dostęp tylko service_role.
create table if not exists public.broker_feedback_notifications (
  key text primary key,
  broker_user_id uuid not null,
  application_id uuid not null,
  kind text not null check (kind in ('zainteresowanie', 'propozycja', 'wyplata')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists broker_feedback_notifications_broker_idx
  on public.broker_feedback_notifications (broker_user_id, created_at desc);
alter table public.broker_feedback_notifications enable row level security;
grant all on public.broker_feedback_notifications to service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  job record;
BEGIN
  FOR job IN SELECT jobname FROM cron.job WHERE jobname = 'broker-feedback-tick' LOOP
    PERFORM cron.unschedule(job.jobname);
  END LOOP;

  PERFORM cron.schedule('broker-feedback-tick', '*/10 * * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/broker-feedback-tick', hdrs));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'broker-feedback cron schedule failed: %', SQLERRM;
END $$;
