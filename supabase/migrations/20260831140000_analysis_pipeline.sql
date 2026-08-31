-- Automatyczny pipeline analityczny (KW → właściciele → analiza KW → ryzyko)
-- dla kompletnych wniosków z potencjałem lokalizacyjnym > 50.
-- Stan przebiegu per wniosek + cron tick.

create table if not exists public.analysis_pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  loan_application_id uuid not null references public.loan_applications(id) on delete cascade,
  kw_number text not null,
  status text not null default 'running' check (status in ('running','done','error')),
  -- Stan kroków: {kw|coowners|kw_analysis|risk: {status, finished_at?, error?, waits?}}
  steps jsonb not null default '{}'::jsonb,
  trigger_reason text,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists analysis_pipeline_runs_loan_idx
  on public.analysis_pipeline_runs (loan_application_id, started_at desc);
create index if not exists analysis_pipeline_runs_status_idx
  on public.analysis_pipeline_runs (status, started_at);

alter table public.analysis_pipeline_runs enable row level security;

drop policy if exists "apr_staff_select" on public.analysis_pipeline_runs;
create policy "apr_staff_select" on public.analysis_pipeline_runs
  for select using (public.is_internal_staff(auth.uid()));

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  job record;
BEGIN
  FOR job IN SELECT jobname FROM cron.job WHERE jobname = 'analysis-pipeline-tick' LOOP
    PERFORM cron.unschedule(job.jobname);
  END LOOP;

  -- Co 15 minut: kwalifikacja nowych wniosków + posunięcie trwających przebiegów.
  PERFORM cron.schedule('analysis-pipeline-tick', '*/15 * * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/analysis-pipeline-tick', hdrs));
END $$;
