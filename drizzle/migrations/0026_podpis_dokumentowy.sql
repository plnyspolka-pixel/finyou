-- =====================================================================
-- PODPIS DOKUMENTOWY FINANCE YOU (moduł e-podpisu w formie dokumentowej)
--
-- Podpis elektroniczny w rozumieniu art. 3 pkt 10 eIDAS, składany w formie
-- dokumentowej (art. 77(2) i 77(3) KC): oświadczenie woli w postaci dokumentu
-- (PDF) złożone w sposób umożliwiający ustalenie osoby składającej
-- oświadczenie. Ustalenie osoby zapewnia weryfikacja tożsamości Didit
-- (dokument + liveness + porównanie twarzy), kontrola kanału — kod
-- jednorazowy (SMS/e-mail), a integralność — SHA-256 pliku źródłowego
-- i podpisanego oraz łańcuch hashy dziennika zdarzeń.
--
--   esign_envelopes — koperta: dokument źródłowy, status, plik końcowy
--   esign_signers   — podpisujący: link (hash tokenu), tożsamość, podpis
--   esign_events    — dziennik („Historia dokumentu”), łańcuch SHA-256
--
-- Dostęp wyłącznie przez server functions (service_role). RLS daje odczyt
-- nadawcy koperty, podpisującemu z kontem i personelowi wewnętrznemu.
-- =====================================================================

create sequence if not exists public.esign_envelope_seq;

create table if not exists public.esign_envelopes (
  id uuid primary key default gen_random_uuid(),
  seq bigint not null default nextval('public.esign_envelope_seq'),
  -- Czytelny identyfikator drukowany na każdej stronie: FY-SIGN-000012.
  public_id text generated always as ('FY-SIGN-' || lpad(seq::text, 6, '0')) stored,
  -- Kod publicznej strony weryfikacji (/weryfikacja/<kod>).
  verify_code text not null unique,
  title text not null,
  message text,
  status text not null default 'szkic'
    check (status in ('szkic', 'wyslana', 'zakonczona', 'odrzucona', 'anulowana', 'wygasla')),
  -- 'rownolegle' — wszyscy dostają link od razu; 'kolejno' — po kolei (order_no).
  signing_mode text not null default 'rownolegle' check (signing_mode in ('rownolegle', 'kolejno')),
  created_by uuid not null references auth.users (id) on delete restrict,
  owner_role text not null check (owner_role in ('admin', 'operator', 'inwestor')),
  sender_name text,
  sender_email text,
  source_bucket text not null default 'podpisy',
  source_path text not null,
  source_filename text not null,
  source_sha256 text not null,
  source_bytes integer not null,
  page_count integer not null,
  final_path text,
  final_sha256 text,
  final_bytes integer,
  sent_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  -- Powiązania (wniosek, oferta, klient, projekt) — luźno, bez FK.
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists esign_envelopes_public_id_idx on public.esign_envelopes (public_id);
create index if not exists esign_envelopes_owner_idx on public.esign_envelopes (created_by, created_at desc);
create index if not exists esign_envelopes_status_idx on public.esign_envelopes (status);

comment on table public.esign_envelopes is
  'Koperty podpisu dokumentowego (art. 77(2) KC): dokument PDF, status, plik podpisany ze znacznikami i Kartą podpisów.';

create table if not exists public.esign_signers (
  id uuid primary key default gen_random_uuid(),
  envelope_id uuid not null references public.esign_envelopes (id) on delete cascade,
  order_no integer not null default 1,
  role_label text,
  full_name text not null,
  email text not null,
  phone text,
  -- Podpisujący z kontem (inwestor/personel) — pozwala użyć KYC z pipeline'u.
  user_id uuid references auth.users (id) on delete set null,
  investor_id uuid,
  signer_kind text not null default 'zewnetrzny'
    check (signer_kind in ('zewnetrzny', 'inwestor', 'personel')),
  -- osoba — we własnym imieniu; firma — w imieniu podmiotu z `company`;
  -- wybor — inwestor wybiera przy podpisie (osoba albo spółka z profilu).
  capacity_mode text not null default 'osoba' check (capacity_mode in ('osoba', 'firma', 'wybor')),
  company jsonb,
  signed_capacity jsonb,
  token_hash text not null unique,
  token_expires_at timestamptz,
  status text not null default 'oczekuje'
    check (status in ('oczekuje', 'otwarty', 'weryfikacja', 'zweryfikowany', 'niezgodnosc', 'podpisany', 'odrzucony')),
  didit_session_id text,
  didit_status text,
  identity jsonb,
  identity_verified_at timestamptz,
  identity_source text,
  identity_mismatch_note text,
  otp_hash text,
  otp_channel text,
  otp_target text,
  otp_sent_at timestamptz,
  otp_expires_at timestamptz,
  otp_attempts integer not null default 0,
  statements jsonb,
  signed_at timestamptz,
  signature_ip text,
  signature_user_agent text,
  signature_hash text,
  rejected_at timestamptz,
  rejection_reason text,
  invited_at timestamptz,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists esign_signers_envelope_idx on public.esign_signers (envelope_id, order_no);
create index if not exists esign_signers_user_idx on public.esign_signers (user_id) where user_id is not null;
create index if not exists esign_signers_didit_idx on public.esign_signers (didit_session_id) where didit_session_id is not null;

comment on table public.esign_signers is
  'Podpisujący w kopercie: link (hash tokenu), weryfikacja tożsamości Didit, kod jednorazowy, snapshot podpisu (czas, IP, urządzenie, reprezentacja).';

create table if not exists public.esign_events (
  id bigint generated always as identity primary key,
  envelope_id uuid not null references public.esign_envelopes (id) on delete cascade,
  signer_id uuid references public.esign_signers (id) on delete set null,
  event_type text not null,
  actor_kind text not null check (actor_kind in ('system', 'podpisujacy', 'nadawca', 'admin')),
  actor_user_id uuid,
  ip text,
  user_agent text,
  payload jsonb not null default '{}'::jsonb,
  -- Łańcuch: hash = SHA-256(prev_hash | envelope_id | event_type | created_at | payload).
  prev_hash text,
  hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists esign_events_envelope_idx on public.esign_events (envelope_id, id);

comment on table public.esign_events is
  'Historia dokumentu (ślad audytowy) z łańcuchem SHA-256 — każde zdarzenie wiąże poprzednie.';

-- updated_at
create or replace function public.esign_touch_updated_at()
returns trigger language plpgsql set search_path = public as $fn$
begin new.updated_at := now(); return new; end $fn$;

drop trigger if exists esign_envelopes_touch on public.esign_envelopes;
create trigger esign_envelopes_touch before update on public.esign_envelopes
  for each row execute function public.esign_touch_updated_at();
drop trigger if exists esign_signers_touch on public.esign_signers;
create trigger esign_signers_touch before update on public.esign_signers
  for each row execute function public.esign_touch_updated_at();

-- Dziennik jest tylko-do-dopisywania: bez UPDATE/DELETE nawet dla service_role.
create or replace function public.esign_events_immutable()
returns trigger language plpgsql as $fn$
begin raise exception 'esign_events jest rejestrem tylko do dopisywania'; end $fn$;
drop trigger if exists esign_events_no_update on public.esign_events;
create trigger esign_events_no_update before update or delete on public.esign_events
  for each row execute function public.esign_events_immutable();

-- RLS
alter table public.esign_envelopes enable row level security;
alter table public.esign_signers enable row level security;
alter table public.esign_events enable row level security;

revoke all on public.esign_envelopes, public.esign_signers, public.esign_events from public, anon;
grant select on public.esign_envelopes, public.esign_signers, public.esign_events to authenticated;
grant all on public.esign_envelopes, public.esign_signers, public.esign_events to service_role;
grant usage, select on sequence public.esign_envelope_seq to service_role;

drop policy if exists esign_envelopes_read on public.esign_envelopes;
create policy esign_envelopes_read on public.esign_envelopes
  for select to authenticated
  using (
    created_by = auth.uid()
    or public.is_internal_staff(auth.uid())
    or exists (
      select 1 from public.esign_signers s
      where s.envelope_id = esign_envelopes.id and s.user_id = auth.uid()
    )
  );

drop policy if exists esign_signers_read on public.esign_signers;
create policy esign_signers_read on public.esign_signers
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_internal_staff(auth.uid())
    or exists (
      select 1 from public.esign_envelopes e
      where e.id = esign_signers.envelope_id and e.created_by = auth.uid()
    )
  );

drop policy if exists esign_events_read on public.esign_events;
create policy esign_events_read on public.esign_events
  for select to authenticated
  using (
    public.is_internal_staff(auth.uid())
    or exists (
      select 1 from public.esign_envelopes e
      where e.id = esign_events.envelope_id and e.created_by = auth.uid()
    )
  );

-- Prywatny bucket na pliki źródłowe i podpisane. Dostęp tylko przez
-- service_role (server functions wydają podpisane adresy / strumieniują bajty).
insert into storage.buckets (id, name, public)
values ('podpisy', 'podpisy', false)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
