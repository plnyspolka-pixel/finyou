-- Stop-klatka wysyłek agenta korespondencji.
--
-- Rozruch procesu ma być z człowiekiem w pętli: agent zbiera maile instytucji,
-- scala i deduplikuje pytania, przygotowuje treści — ale NIC nie wychodzi do
-- klienta ani do instytucji bez kliknięcia operatora. Decyzje operatora będą
-- materiałem, na którym model nauczy się przejąć proces.
--
-- `outbound_paused` domyślnie TRUE: od chwili zastosowania tej migracji
-- automatyczna wysyłka stoi. Ręczne „Wyślij teraz" w panelu działa dalej —
-- to jest właśnie klikniecie operatora.

create table if not exists public.institution_mail_agent_settings (
  id smallint primary key default 1,
  outbound_paused boolean not null default true,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint institution_mail_agent_settings_singleton check (id = 1)
);

insert into public.institution_mail_agent_settings (id) values (1) on conflict (id) do nothing;

alter table public.institution_mail_agent_settings enable row level security;

drop policy if exists "imas_staff_select" on public.institution_mail_agent_settings;
create policy "imas_staff_select" on public.institution_mail_agent_settings
  for select using (public.is_internal_staff(auth.uid()));

comment on column public.institution_mail_agent_settings.outbound_paused is
  'TRUE = agent nie wysyła nic sam (ani pytań do klienta, ani odpowiedzi do instytucji). Ręczna wysyłka z panelu działa.';
