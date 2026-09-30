-- =====================================================================
-- ETAP 0 — BEZPIECZEŃSTWO DANYCH (sprzątanie spójności prawnej 2026-09)
--
-- Decyzja nadrzędna nr 7: teasery Projektów widzi wyłącznie inwestor
-- z PRZYJĘTYM Zleceniem. Żadne prawdziwe wnioski nie są dostępne bez
-- logowania. Ta migracja:
--   1. odbiera anon/authenticated dostęp do widoku public_loan_teasers
--      i usuwa go (nieużywany w kodzie od czasu przejścia na Zlecenia),
--   2. przepisuje investor_offer_teasers(): bez `OR auth.uid() IS NULL`,
--      bez `description` i `photos`, tylko Projekty dopasowane do
--      przyjętych Zleceń wywołującego (investor_orders.status='przyjete'
--      + investor_order_matches w aktywnym statusie), REVOKE dla anon,
--   3. list_public_loan_proposals / get_public_loan_proposal wymagają
--      zalogowanego inwestora albo personelu; anon traci EXECUTE;
--      loan_proposals.is_public nie steruje już widocznością publiczną,
--   4. odbiera anon EXECUTE na funkcjach SECURITY DEFINER zapisujących dane
--      (apply_loan_auto_status, compute_loan_auto_status, dedup_leads).
-- Nie usuwa żadnych danych historycznych.
-- =====================================================================

-- 1. Widok public_loan_teasers — cofnięcie grantów i usunięcie.
do $$
begin
  if exists (
    select 1 from pg_views where schemaname = 'public' and viewname = 'public_loan_teasers'
  ) then
    execute 'revoke all on public.public_loan_teasers from anon, authenticated';
    execute 'drop view public.public_loan_teasers';
  end if;
end $$;

-- 2. investor_offer_teasers(): teaser wyłącznie z dopasowań do przyjętych
--    Zleceń wywołującego. Zmiana listy kolumn wymaga DROP przed CREATE.
drop function if exists public.investor_offer_teasers();

create function public.investor_offer_teasers()
returns table (
  id uuid,
  match_id uuid,
  order_id uuid,
  project_ref text,
  match_status text,
  created_at timestamptz,
  loan_amount numeric,
  preferred_period_months int,
  annual_investor_rate numeric,
  estimated_ltv numeric,
  property_type text,
  city text,
  voivodeship text,
  estimated_value numeric,
  area_sqm numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    la.id,
    m.id as match_id,
    o.id as order_id,
    m.project_ref,
    m.status as match_status,
    la.created_at,
    la.loan_amount,
    la.preferred_period_months,
    la.annual_investor_rate,
    la.estimated_ltv,
    (p.property_type)::text,
    p.city,
    p.voivodeship,
    p.estimated_value,
    p.area_sqm
  from public.investor_orders o
  join public.investor_order_matches m on m.order_id = o.id
  join public.loan_applications la on la.id = m.application_id
  left join lateral (
    select * from public.properties pp
    where pp.loan_application_id = la.id
    order by pp.created_at asc
    limit 1
  ) p on true
  where auth.uid() is not null
    and o.user_id = auth.uid()
    and o.status = 'przyjete'
    and m.status in ('dopasowane','teaser','karta_leada','rezerwacja','transakcja')
    and la.deleted_at is null
  order by m.created_at desc;
$$;

revoke execute on function public.investor_offer_teasers() from public, anon;
grant execute on function public.investor_offer_teasers() to authenticated, service_role;

comment on function public.investor_offer_teasers() is
  'Teasery Projektów dopasowanych do PRZYJĘTYCH Zleceń wywołującego (§ 5 Umowy ramowej). Bez opisu i zdjęć; anon bez dostępu.';

-- 3. Propozycje pożyczek — tylko zalogowany inwestor albo personel.
create or replace function public.list_public_loan_proposals()
returns table (
  id uuid,
  note text,
  amount numeric,
  months integer,
  annual_rate numeric,
  commission_pct numeric,
  commission_pln numeric,
  max_payment numeric,
  nominal_rata numeric,
  capped_rata numeric,
  balloon numeric,
  total_interest numeric,
  total_cost numeric,
  total_to_repay numeric,
  schedule jsonb,
  status text,
  is_public boolean,
  created_at timestamptz,
  updated_at timestamptz,
  source_application_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.note, p.amount, p.months, p.annual_rate, p.commission_pct, p.commission_pln,
    p.max_payment, p.nominal_rata, p.capped_rata, p.balloon, p.total_interest, p.total_cost,
    p.total_to_repay, p.schedule, p.status, p.is_public, p.created_at, p.updated_at,
    p.source_application_id
  from public.loan_proposals p
  where p.is_public = true
    and auth.uid() is not null
    and (public.has_role(auth.uid(), 'inwestor') or public.is_internal_staff(auth.uid()))
  order by p.created_at desc
  limit 200;
$$;

create or replace function public.get_public_loan_proposal(_id uuid)
returns table (
  id uuid,
  note text,
  amount numeric,
  months integer,
  annual_rate numeric,
  commission_pct numeric,
  commission_pln numeric,
  max_payment numeric,
  nominal_rata numeric,
  capped_rata numeric,
  balloon numeric,
  total_interest numeric,
  total_cost numeric,
  total_to_repay numeric,
  schedule jsonb,
  status text,
  is_public boolean,
  created_at timestamptz,
  updated_at timestamptz,
  source_application_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.note, p.amount, p.months, p.annual_rate, p.commission_pct, p.commission_pln,
    p.max_payment, p.nominal_rata, p.capped_rata, p.balloon, p.total_interest, p.total_cost,
    p.total_to_repay, p.schedule, p.status, p.is_public, p.created_at, p.updated_at,
    p.source_application_id
  from public.loan_proposals p
  where p.id = _id
    and p.is_public = true
    and auth.uid() is not null
    and (public.has_role(auth.uid(), 'inwestor') or public.is_internal_staff(auth.uid()));
$$;

revoke execute on function public.list_public_loan_proposals() from public, anon;
revoke execute on function public.get_public_loan_proposal(uuid) from public, anon;
grant execute on function public.list_public_loan_proposals() to authenticated, service_role;
grant execute on function public.get_public_loan_proposal(uuid) to authenticated, service_role;

comment on column public.loan_proposals.is_public is
  'Widoczna dla zalogowanych inwestorów (list_public_loan_proposals). Od 2026-09 NIE oznacza dostępu publicznego bez logowania.';

-- 4. Funkcje SECURITY DEFINER zapisujące dane — bez EXECUTE dla anon.
revoke execute on function public.apply_loan_auto_status(uuid) from public, anon;
revoke execute on function public.compute_loan_auto_status(uuid) from public, anon;
revoke execute on function public.dedup_leads() from public, anon;
grant execute on function public.apply_loan_auto_status(uuid) to authenticated, service_role;
grant execute on function public.compute_loan_auto_status(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
