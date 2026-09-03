-- Historia zmian statusu wniosku — zasila oś czasu i kartę statusu w panelu
-- klienta (/klient). Zapis wyłącznie triggerem (łapie też zmiany z
-- apply_loan_auto_status i z panelu admina); odczyt: właściciel wniosku
-- albo personel wewnętrzny.

create table if not exists public.loan_status_history (
  id uuid primary key default gen_random_uuid(),
  loan_application_id uuid not null references public.loan_applications(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index if not exists loan_status_history_loan_idx
  on public.loan_status_history (loan_application_id, changed_at desc);

create or replace function public.log_loan_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.loan_status_history (loan_application_id, old_status, new_status, changed_by)
    values (new.id, null, new.status::text, auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.loan_status_history (loan_application_id, old_status, new_status, changed_by)
    values (new.id, old.status::text, new.status::text, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_loan_status_change on public.loan_applications;
create trigger trg_log_loan_status_change
  after insert or update of status on public.loan_applications
  for each row execute function public.log_loan_status_change();

-- Backfill: po jednym wpisie startowym na istniejący wniosek, żeby oś czasu
-- nie zaczynała się od pustki (data = ostatnia aktualizacja wniosku).
insert into public.loan_status_history (loan_application_id, old_status, new_status, changed_at)
select la.id, null, la.status::text, coalesce(la.updated_at, la.created_at)
from public.loan_applications la
where not exists (
  select 1 from public.loan_status_history h where h.loan_application_id = la.id
);

alter table public.loan_status_history enable row level security;

-- Klient widzi historię wyłącznie swojego wniosku.
drop policy if exists "loan_status_history_owner_select" on public.loan_status_history;
create policy "loan_status_history_owner_select" on public.loan_status_history
  for select using (
    exists (
      select 1
      from public.loan_applications la
      join public.clients c on c.id = la.client_id
      where la.id = loan_status_history.loan_application_id
        and c.user_id = auth.uid()
    )
  );

-- Personel wewnętrzny widzi wszystko.
drop policy if exists "loan_status_history_staff_select" on public.loan_status_history;
create policy "loan_status_history_staff_select" on public.loan_status_history
  for select using (public.is_internal_staff(auth.uid()));
