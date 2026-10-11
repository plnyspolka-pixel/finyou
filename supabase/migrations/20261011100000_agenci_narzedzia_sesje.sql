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
  identity_method text,                    -- phone_match | contract_number | dob_last4 | email_link
  identity_verified_at timestamptz,
  identity_attempts integer not null default 0,
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

alter table public.agent_tool_sessions enable row level security;
alter table public.agent_tool_calls enable row level security;
revoke all on public.agent_tool_sessions from public, anon, authenticated;
revoke all on public.agent_tool_calls from public, anon, authenticated;

-- Wynik rozmowy windykacyjnej wyszukuje się po `metadata.conversation_id`
-- (tak działa webhook post-call). Indeks wyrażeniowy zamiast nowej kolumny —
-- bez zmiany konwencji, a wyszukanie zdarzenia przestaje skanować tabelę.
create index if not exists wind_events_conversation_idx
  on public.wind_events ((metadata->>'conversation_id'))
  where metadata ? 'conversation_id';
