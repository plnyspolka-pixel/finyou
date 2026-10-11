-- Sesje i audyt narzędzi agentów głosowych/tekstowych (recepcja, intake,
-- presale inwestora, windykacja).
--
-- Po co osobne tabele, a nie automation_events:
--  * `agent_tool_sessions` trzyma JEDYNE miejsce prawdy o tym, KOGO agent ma
--    po drugiej stronie i czy potwierdził tożsamość. Model nie może tego
--    podnieść — zapisuje wyłącznie kod serwera po udanej weryfikacji.
--  * `agent_tool_calls` daje tani licznik do limitów (indeks po rozmowie
--    i czasie) oraz rozliczalny audyt każdego wywołania, także odrzuconego.
--
-- Obie tabele mają RLS bez polityk: dostęp ma tylko klucz serwisowy
-- (supabaseAdmin). Żadna rola przeglądarkowa ich nie widzi.

create table if not exists public.agent_tool_sessions (
  conversation_id text primary key,
  agent_key text not null,
  channel text not null default 'voice_phone',
  -- rozpoznany podmiot rozmowy
  subject_kind text,                       -- lead | client | investor | borrower | unknown
  subject_id uuid,
  lead_id uuid,
  case_id uuid,                            -- wind_collection_cases.id
  loan_id uuid,                            -- wind_loans.id
  investor_user_id uuid,
  -- potwierdzenie tożsamości (RODO: dane sprawy dopiero po nim)
  identity_verified boolean not null default false,
  identity_method text,                    -- contract_number | otp_sms (silne) | phone_match | email_link (lead/klient)
  identity_verified_at timestamptz,        -- ważność: rozmowa 2 h, wątek tekstowy 12 h (guard.server)
  identity_attempts integer not null default 0,
  -- kod SMS na numer z akt: tylko skrót HMAC, ważność, próby i podmiot
  otp_hash text,
  otp_expires_at timestamptz,
  otp_attempts integer not null default 0,
  otp_subject jsonb,
  -- zgody i ograniczenia zebrane w rozmowie
  recording_consent boolean,
  do_not_contact boolean not null default false,
  needs jsonb not null default '{}'::jsonb, -- rozpoznane potrzeby (triage)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_tool_sessions_subject_idx
  on public.agent_tool_sessions (subject_kind, subject_id);
create index if not exists agent_tool_sessions_updated_idx
  on public.agent_tool_sessions (updated_at desc);

create table if not exists public.agent_tool_calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id text,
  agent_key text,
  tool text not null,
  decision text not null,                  -- ok | denied | error
  reason text,
  args_digest jsonb,                       -- argumenty BEZ danych wrażliwych
  rows_returned integer,
  redactions text[],
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists agent_tool_calls_conv_time_idx
  on public.agent_tool_calls (conversation_id, created_at desc);
create index if not exists agent_tool_calls_tool_time_idx
  on public.agent_tool_calls (tool, created_at desc);

-- Nieudane dowody tożsamości wobec KONKRETNEGO podmiotu (umowa się zgadza,
-- nazwisko nie; zły kod SMS). Limit prób w rozmowie zeruje się z nową
-- rozmową — ten licznik nie, więc zgadywanie ma twardy sufit per podmiot.
create table if not exists public.agent_identity_failures (
  id uuid primary key default gen_random_uuid(),
  subject_ref text not null,               -- borrower:<id> | loan:<id> | investor:<id>
  conversation_id text,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists agent_identity_failures_subject_time_idx
  on public.agent_identity_failures (subject_ref, created_at desc);

alter table public.agent_tool_sessions enable row level security;
alter table public.agent_tool_calls enable row level security;
alter table public.agent_identity_failures enable row level security;
revoke all on public.agent_tool_sessions from public, anon, authenticated;
revoke all on public.agent_tool_calls from public, anon, authenticated;
revoke all on public.agent_identity_failures from public, anon, authenticated;

-- Wynik rozmowy windykacyjnej wyszukuje się po `metadata.conversation_id`
-- (tak działa webhook post-call). Indeks wyrażeniowy zamiast nowej kolumny —
-- bez zmiany konwencji, a wyszukanie zdarzenia przestaje skanować tabelę.
create index if not exists wind_events_conversation_idx
  on public.wind_events ((metadata->>'conversation_id'))
  where metadata ? 'conversation_id';
