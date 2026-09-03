-- Agent korespondencji z instytucjami: klasyfikacja maili przychodzących
-- (offer_distribution_messages), propozycje zmian kryteriów instytucji
-- (zatwierdzane 1 kliknięciem) i pętla pytań instytucja → klient → instytucje.

-- Znacznik obsłużenia inboundu przez agenta — skan wybiera wyłącznie
-- nieobsłużone wiadomości (bez tego okno limitu zapchałoby się starymi).
alter table public.offer_distribution_messages
  add column if not exists agent_processed_at timestamptz;
create index if not exists odm_agent_pending_idx
  on public.offer_distribution_messages (created_at)
  where direction = 'inbound' and agent_processed_at is null;

-- Klasyfikacja per wiadomość przychodząca (idempotencja skanu).
create table if not exists public.institution_mail_intel (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.offer_distribution_messages(id) on delete cascade,
  distribution_id uuid,
  loan_application_id uuid,
  investor_id uuid,
  category text not null check (category in
    ('question','offer','rejection','criteria_change','auto_ack','other')),
  extraction jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Propozycje zmian kryteriów instytucji wyłapane z maili (rozruch z zatwierdzaniem).
create table if not exists public.criteria_change_proposals (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.investors(id) on delete cascade,
  source_message_id uuid references public.offer_distribution_messages(id) on delete set null,
  proposed_patch jsonb not null,
  summary text,
  status text not null default 'proposed' check (status in ('proposed','applied','rejected')),
  created_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz
);
create index if not exists criteria_change_proposals_status_idx
  on public.criteria_change_proposals (status, created_at desc);

-- Wątki pytań: jedna otwarta sprawa per wniosek; pytania scalane, deduplikowane.
create table if not exists public.institution_qa_threads (
  id uuid primary key default gen_random_uuid(),
  loan_application_id uuid not null references public.loan_applications(id) on delete cascade,
  -- [{text, from: [nazwy instytucji], distribution_ids: [uuid], asked_client_at}]
  questions jsonb not null default '[]'::jsonb,
  status text not null default 'otwarte'
    check (status in ('otwarte','przekazane','zamkniete')),
  client_channel text,
  last_client_message_at timestamptz,
  client_answer text,
  forwarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists institution_qa_open_thread_idx
  on public.institution_qa_threads (loan_application_id)
  where status = 'otwarte';

alter table public.institution_mail_intel enable row level security;
alter table public.criteria_change_proposals enable row level security;
alter table public.institution_qa_threads enable row level security;

drop policy if exists "imi_staff_select" on public.institution_mail_intel;
create policy "imi_staff_select" on public.institution_mail_intel
  for select using (public.is_internal_staff(auth.uid()));
drop policy if exists "ccp_staff_select" on public.criteria_change_proposals;
create policy "ccp_staff_select" on public.criteria_change_proposals
  for select using (public.is_internal_staff(auth.uid()));
drop policy if exists "iqt_staff_select" on public.institution_qa_threads;
create policy "iqt_staff_select" on public.institution_qa_threads
  for select using (public.is_internal_staff(auth.uid()));

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  job record;
BEGIN
  FOR job IN SELECT jobname FROM cron.job WHERE jobname = 'institution-mail-tick' LOOP
    PERFORM cron.unschedule(job.jobname);
  END LOOP;

  PERFORM cron.schedule('institution-mail-tick', '*/15 * * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/institution-mail-tick', hdrs));
END $$;
