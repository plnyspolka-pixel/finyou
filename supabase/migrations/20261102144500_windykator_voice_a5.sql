-- Migracja po wdrożeniu pakietu startowego: NIE zmieniamy starej migracji z main.
alter table public.windykator_orders
  add column if not exists debtor_phone text,
  add column if not exists creditor_balance_confirmed_at timestamptz,
  add column if not exists collection_state text not null default 'awaiting_payment',
  add column if not exists voice_opt_out boolean not null default false;
alter table public.windykator_orders
  add constraint windykator_collection_state_check check (
    collection_state in ('awaiting_payment','active','paused','payment_reported','disputed','settled','expired')
  );

-- Osobny, nowy agent, bez współdzielenia numeru ani identyfikatora A1/A4.
create table if not exists public.windykator_voice_settings (
  id integer primary key default 1 check (id = 1),
  agent_id text unique,
  phone_number_id text unique,
  phone_e164 text unique,
  post_call_webhook_id text,
  post_call_webhook_secret text,
  updated_at timestamptz not null default now()
);
insert into public.windykator_voice_settings(id) values (1) on conflict do nothing;
alter table public.windykator_voice_settings enable row level security;
revoke all on public.windykator_voice_settings from anon, authenticated;
grant all on public.windykator_voice_settings to service_role;

create table if not exists public.windykator_voice_calls (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.windykator_orders(id) on delete cascade,
  direction text not null check(direction in ('inbound','outbound')),
  agent_id text not null,
  phone_e164 text not null,
  conversation_id text unique,
  call_sid text unique,
  status text not null default 'initiating' check(status in ('initiating','in_progress','completed','failed','cancelled')),
  stage_day integer,
  outcome jsonb,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists windykator_voice_case_idx on public.windykator_voice_calls(case_id,created_at desc);
create unique index if not exists windykator_voice_single_live_case
  on public.windykator_voice_calls(case_id) where direction='outbound' and status in ('initiating','in_progress');
alter table public.windykator_voice_calls enable row level security;
create policy windykator_voice_calls_owner_view on public.windykator_voice_calls for select to authenticated
  using(exists(select 1 from public.windykator_orders o where o.id=case_id and o.user_id=auth.uid()));
grant select on public.windykator_voice_calls to authenticated;
grant all on public.windykator_voice_calls to service_role;

create table if not exists public.windykator_voice_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.windykator_orders(id) on delete cascade,
  call_id uuid references public.windykator_voice_calls(id) on delete set null,
  event_key text unique not null,
  event_kind text not null check(event_kind in ('call_completed','payment_reported','disputed','promise','opt_out','identity_unverified','call_failed','callback_request')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists windykator_voice_events_case_idx on public.windykator_voice_events(case_id,created_at desc);
alter table public.windykator_voice_events enable row level security;
create policy windykator_voice_events_owner_view on public.windykator_voice_events for select to authenticated
  using(exists(select 1 from public.windykator_orders o where o.id=case_id and o.user_id=auth.uid()));
grant select on public.windykator_voice_events to authenticated;
grant all on public.windykator_voice_events to service_role;
