-- E-maile o zmianie statusu wniosku: znacznik obsłużenia wpisu historii
-- + cron tick wołający endpoint aplikacji (wzorem pozostałych ticków).

alter table public.loan_status_history
  add column if not exists notified_at timestamptz;

-- Wpisy z backfillu (i wszystko sprzed wdrożenia) oznaczamy jako obsłużone,
-- żeby deploy nie wywołał lawiny maili o dawno zmienionych statusach.
update public.loan_status_history
set notified_at = changed_at
where notified_at is null;

create index if not exists loan_status_history_pending_idx
  on public.loan_status_history (changed_at)
  where notified_at is null;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  job record;
BEGIN
  FOR job IN SELECT jobname FROM cron.job WHERE jobname = 'status-email-tick' LOOP
    PERFORM cron.unschedule(job.jobname);
  END LOOP;

  PERFORM cron.schedule('status-email-tick', '*/15 * * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/status-email-tick', hdrs));
END $$;
