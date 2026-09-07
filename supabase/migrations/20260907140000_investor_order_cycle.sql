-- Etap U2 pakietu FY-LEGAL-2026-09-04 — pełny cykl Zlecenie–Projekt (§ 5
-- Umowy ramowej v5): Dopasowanie → teaser (tylko per para Projekt–Zlecenie)
-- → Karta Leada (Zał. 1) → Karta Transferu Danych → Ujawnienie Identyfikujące
-- → rezerwacja 24 h (+12 h) → decyzja / przekazanie do kolejnego Zlecenia.
-- Dziennik zdarzeń z datą i wersjami dokumentów (uwaga wdrożeniowa nr 3),
-- przystąpienia spółek do NDA (Zał. 1 NDA), internetowe odstąpienie
-- Konsumenta (Zał. 4, 14 dni).

-- ── Dopasowania (para Zlecenie–Projekt) ─────────────────────────────────────
create table if not exists public.investor_order_matches (
  id uuid primary key default gen_random_uuid(),
  match_seq bigint generated always as identity,
  project_ref text generated always as ('FY-P-' || match_seq::text) stored unique,
  order_id uuid not null references public.investor_orders(id),
  application_id uuid not null,
  status text not null default 'dopasowane' check (status in
    ('dopasowane','teaser','karta_leada','rezerwacja','transakcja','odrzucone','przekazane','wygasle')),
  teaser jsonb,
  teaser_released_at timestamptz,
  karta_leada jsonb,
  karta_leada_accepted_at timestamptz,
  karta_leada_ip inet,
  karta_leada_user_agent text,
  kara_consumer_statement jsonb,
  kara_consumer_accepted_at timestamptz,
  transfer_card jsonb,
  transfer_card_approved_at timestamptz,
  transfer_card_approved_by uuid,
  disclosed_at timestamptz,
  reservation_expires_at timestamptz,
  reservation_extended boolean not null default false,
  decision_reason text,
  decided_at timestamptz,
  decided_by uuid,
  zal6_confirmed_at timestamptz,
  payout_amount_pln numeric,
  provision_amount_pln numeric,
  passed_from_match_id uuid references public.investor_order_matches(id),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Wyłączność SEKWENCYJNA: jeden aktywny obieg Projektu naraz (kancelaria pkt 4).
create unique index if not exists iom_active_project_uq
  on public.investor_order_matches (application_id)
  where status in ('dopasowane','teaser','karta_leada','rezerwacja');
-- Ten sam Projekt najwyżej raz na dane Zlecenie.
create unique index if not exists iom_order_app_uq
  on public.investor_order_matches (order_id, application_id);
create index if not exists iom_order_idx on public.investor_order_matches (order_id, created_at desc);
create index if not exists iom_status_idx on public.investor_order_matches (status, created_at desc);

-- ── Dziennik cyklu (append-only; data + wersje dokumentów per zdarzenie) ────
create table if not exists public.investor_order_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references public.investor_order_matches(id),
  order_id uuid references public.investor_orders(id),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  document_versions jsonb not null default '[]'::jsonb,
  actor uuid,
  actor_kind text not null default 'system',
  created_at timestamptz not null default now()
);
create index if not exists ioe_match_idx on public.investor_order_events (match_id, created_at);
create index if not exists ioe_order_idx on public.investor_order_events (order_id, created_at);

-- ── Przystąpienie spółki / innego podmiotu do NDA (Zał. 1 NDA v5) ───────────
create table if not exists public.nda_accessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_name text not null,
  registry_no text,
  nip text,
  address text,
  representative text,
  project_refs text[] not null default '{}',
  nda_version text not null,
  nda_sha256 text not null,
  statements jsonb not null default '{}'::jsonb,
  accepted_at timestamptz not null default now(),
  ip inet,
  user_agent text,
  confirmed_at timestamptz,
  confirmed_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists ndaacc_user_idx on public.nda_accessions (user_id, created_at desc);

-- ── Odstąpienie Konsumenta od Umowy ramowej (Zał. 4; funkcja internetowa) ───
create table if not exists public.consumer_withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  document_code text not null default 'umowa_ramowa',
  document_version text,
  content text,
  submitted_at timestamptz not null default now(),
  ip inet,
  user_agent text,
  acknowledged_at timestamptz,
  acknowledged_by uuid
);
create index if not exists cw_user_idx on public.consumer_withdrawals (user_id, submitted_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.investor_order_matches enable row level security;
alter table public.investor_order_events enable row level security;
alter table public.nda_accessions enable row level security;
alter table public.consumer_withdrawals enable row level security;

drop policy if exists "iom_owner_select" on public.investor_order_matches;
create policy "iom_owner_select" on public.investor_order_matches
  for select using (
    public.is_internal_staff(auth.uid())
    or exists (
      select 1 from public.investor_orders o
      where o.id = investor_order_matches.order_id and o.user_id = auth.uid()
    )
  );

drop policy if exists "ioe_owner_select" on public.investor_order_events;
create policy "ioe_owner_select" on public.investor_order_events
  for select using (
    public.is_internal_staff(auth.uid())
    or exists (
      select 1 from public.investor_orders o
      where o.id = investor_order_events.order_id and o.user_id = auth.uid()
    )
  );

drop policy if exists "ndaacc_owner_select" on public.nda_accessions;
create policy "ndaacc_owner_select" on public.nda_accessions
  for select using (user_id = auth.uid() or public.is_internal_staff(auth.uid()));

drop policy if exists "cw_owner_select" on public.consumer_withdrawals;
create policy "cw_owner_select" on public.consumer_withdrawals
  for select using (user_id = auth.uid() or public.is_internal_staff(auth.uid()));

-- ── Ujawnienie Identyfikujące przez Dopasowanie ─────────────────────────────
-- Inwestor z Dopasowaniem w fazie rezerwacji/transakcji widzi PEŁNY wniosek
-- i nieruchomości TEGO Projektu — niezależnie od paywalla przeglądania.
create or replace function public.investor_has_disclosed_match(_user_id uuid, _application_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.investor_order_matches m
    join public.investor_orders o on o.id = m.order_id
    where m.application_id = _application_id
      and o.user_id = _user_id
      and m.status in ('rezerwacja','transakcja')
      and m.disclosed_at is not null
  );
$$;

drop policy if exists "loans_match_disclosure_select" on public.loan_applications;
create policy "loans_match_disclosure_select" on public.loan_applications
  for select to authenticated
  using (
    deleted_at is null
    and public.investor_has_disclosed_match(auth.uid(), id)
  );

drop policy if exists "properties_match_disclosure_select" on public.properties;
create policy "properties_match_disclosure_select" on public.properties
  for select to authenticated
  using (public.investor_has_disclosed_match(auth.uid(), loan_application_id));

-- ── Komplet pakietu: odstąpienie Konsumenta unieważnia komplet ──────────────
create or replace function public.investor_legal_pack_complete(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.legal_documents d
    where d.active
      and not exists (
        select 1 from public.investor_agreement_acceptances a
        where a.user_id = _user_id
          and a.document_code = d.code
          and a.version = d.version
          and a.sha256 = d.sha256
      )
  )
  and exists (select 1 from public.legal_documents where active)
  and not exists (
    select 1
    from public.consumer_withdrawals w
    join public.investor_agreement_acceptances a
      on a.user_id = w.user_id and a.document_code = w.document_code
    where w.user_id = _user_id
      and w.submitted_at >= a.accepted_at
  );
$$;
