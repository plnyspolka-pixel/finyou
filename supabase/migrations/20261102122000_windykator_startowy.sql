-- Windykator AI / publiczny Pakiet Startowy 50 zł, osobny od abonamentów inwestora.
-- Tabela jest zamknięta na zapis klientów; operacje wykonują kontrolowane server functions.
create table if not exists public.windykator_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  creditor_kind text not null check (creditor_kind in ('person','business','company')),
  creditor_name text not null,
  creditor_nip text,
  creditor_krs text,
  registry_verification jsonb,
  court_route text,
  court_draft_text text,
  creditor_email text not null,
  debtor_name text not null,
  debtor_phone text,
  creditor_balance_confirmed_at timestamptz,
  collection_state text not null default 'awaiting_payment' check (collection_state in ('awaiting_payment','active','paused','payment_reported','disputed','settled','expired')),
  voice_opt_out boolean not null default false,
  claim_kind text not null check (claim_kind in ('invoice','loan','other')),
  claim_amount numeric(14,2) not null check (claim_amount > 0),
  due_date date not null,
  case_description text,
  source_file_name text not null,
  source_mime text not null,
  source_storage_path text not null,
  source_sha256 text not null,
  status text not null default 'draft' check (status in (
    'draft','qualifying','qualified','needs_documents','rejected','checkout_pending','paid','analysis_running','analysis_ready','review_required','failed','refunded'
  )),
  -- Jedynym źródłem nowej sprawy jest formularz sklepu.
  intake_source text not null default 'shop' check (intake_source = 'shop'),
  qualification_facts jsonb,
  qualification_reasons jsonb not null default '[]'::jsonb,
  qualified_at timestamptz,
  -- 90 dni startuje wyłącznie po prawdziwym webhooku Tpay, a nie po kliknięciu.
  collection_activated_at timestamptz,
  collection_ends_at timestamptz,
  tpay_transaction_id text unique,
  amount_grosz integer not null default 5000 check (amount_grosz = 5000),
  paid_at timestamptz,
  analysis jsonb,
  report_text text,
  notice_text text,
  epu_draft_text text,
  analysis_error text,
  early_start_consent boolean not null,
  withdrawal_notice_ack boolean not null,
  terms_accepted boolean not null,
  privacy_ack boolean not null,
  representation_asserted boolean not null,
  balance_asserted boolean not null,
  undisputed_asserted boolean not null,
  accepted_terms_version text not null,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists windykator_orders_user_created_idx on public.windykator_orders(user_id, created_at desc);
create index if not exists windykator_orders_status_idx on public.windykator_orders(status);
create index if not exists windykator_orders_qualification_idx on public.windykator_orders(qualified_at) where qualified_at is not null;
alter table public.windykator_orders enable row level security;
drop policy if exists windykator_orders_owner_select on public.windykator_orders;
create policy windykator_orders_owner_select on public.windykator_orders
  for select to authenticated using (auth.uid() = user_id);
grant select on public.windykator_orders to authenticated;
grant all on public.windykator_orders to service_role;

-- Dokumenty z danymi dłużników nigdy nie są publiczne, ani udostępniane przez URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('windykator-private','windykator-private',false,5242880,
  array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

comment on table public.windykator_orders is
  'Odrebny jednorazowy pakiet 50 zl; status paid pochodzi wylacznie z serwera Tpay.';

-- Osobny, nowy agent, bez współdzielenia numeru ani identyfikatora A1/A4.
create table if not exists public.windykator_voice_settings (
  id integer primary key default 1 check (id = 1),
  agent_id text unique,
  phone_number_id text unique,
  phone_e164 text unique,
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
  event_kind text not null check(event_kind in ('call_completed','payment_claimed','dispute','promise','opt_out','identity_unverified','call_failed','callback_request')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists windykator_voice_events_case_idx on public.windykator_voice_events(case_id,created_at desc);
alter table public.windykator_voice_events enable row level security;
create policy windykator_voice_events_owner_view on public.windykator_voice_events for select to authenticated
  using(exists(select 1 from public.windykator_orders o where o.id=case_id and o.user_id=auth.uid()));
grant select on public.windykator_voice_events to authenticated;
grant all on public.windykator_voice_events to service_role;
