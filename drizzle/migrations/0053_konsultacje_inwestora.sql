-- Indywidualne konsultacje inwestora (Regulamin abonamentu 1.1, § 3 ust. 3):
-- 4 godziny w Okresie Abonamentowym. Inwestor zgłasza w panelu preferowany
-- termin, właściciel dostaje SMS i potwierdza termin. Zapis tylko przez
-- server functions (service_role); inwestor czyta swoje zgłoszenia.
create table if not exists public.investor_consultation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  preferred_start timestamptz not null,
  duration_minutes integer not null check (duration_minutes in (30, 60, 90, 120)),
  topic text,
  status text not null default 'zgloszona'
    check (status in ('zgloszona', 'potwierdzona', 'odbyta', 'odwolana')),
  owner_sms_sent_at timestamptz,
  owner_sms_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists investor_consultation_requests_user_idx
  on public.investor_consultation_requests (user_id, created_at desc);

alter table public.investor_consultation_requests enable row level security;
drop policy if exists "Inwestor widzi swoje konsultacje" on public.investor_consultation_requests;
create policy "Inwestor widzi swoje konsultacje" on public.investor_consultation_requests
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "Zespół widzi konsultacje" on public.investor_consultation_requests;
create policy "Zespół widzi konsultacje" on public.investor_consultation_requests
  for select to authenticated using (public.is_internal_staff(auth.uid()));
grant select on public.investor_consultation_requests to authenticated;
grant all on public.investor_consultation_requests to service_role;
