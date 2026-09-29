-- =====================================================================
-- ETAP 3 — ZLECENIA I LIMITY MODUŁU PROJEKTÓW (sprzątanie spójności 2026-09)
--
-- Decyzja nadrzędna nr 8: limity wg systemu (i Umowy ramowej v7 § 5):
--   5 aktywnych rezerwacji / przyjętych Zleceń, próg 5 odrzuceń (Zlecenie
--   wygasa), rezerwacja 24 h + jednorazowo 12 h, maks. 2 przedłużone naraz,
--   LTV 60 %. Wartości są w project_module_settings i STAMTĄD czyta je UI.
-- Formularz Zlecenia (Zał. 7): okres 1–120 miesięcy (CHECK dopasowany).
-- =====================================================================

-- 1. Okres Zlecenia: 1–120 miesięcy (było 360). Istniejące dane historyczne
--    powyżej 120 nie są zmieniane — CHECK dodajemy jako NOT VALID.
alter table public.investor_orders
  drop constraint if exists investor_orders_max_period_months_check;
alter table public.investor_orders
  add constraint investor_orders_max_period_months_check
  check (max_period_months between 1 and 120) not valid;

-- 2. Ustawienia modułu — wartości docelowe (jedno źródło prawdy dla UI).
update public.project_module_settings
   set assignment_hours = 24,
       extension_hours = 12,
       max_active_assignments = 5,
       max_extended_assignments = 2,
       rejection_review_threshold = 5,
       max_period_months = 120,
       updated_at = now()
 where id = 1;

-- 3. Atomowy licznik odrzuceń Zlecenia; po osiągnięciu progu Zlecenie wygasa
--    (§ 5 ust. 1 Umowy ramowej v7: „po odrzuceniu przez Inwestora pięciu
--    kolejnych Projektów").
create or replace function public.increment_order_rejections(_order_id uuid)
returns table (rejected_projects_count int, status text, expired boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_threshold int;
  v_count int;
  v_status text;
begin
  select coalesce(s.rejection_review_threshold, 5) into v_threshold
    from public.project_module_settings s where s.id = 1;
  if v_threshold is null then v_threshold := 5; end if;

  update public.investor_orders o
     set rejected_projects_count = o.rejected_projects_count + 1
   where o.id = _order_id
   returning o.rejected_projects_count, o.status into v_count, v_status;

  if v_count is null then
    raise exception 'Nie znaleziono Zlecenia %', _order_id;
  end if;

  if v_status = 'przyjete' and v_count >= v_threshold then
    update public.investor_orders o
       set status = 'wygasle',
           rejection_reason = format('Wygasło po %s odrzuceniach Projektów (§ 5 ust. 1 Umowy ramowej).', v_count)
     where o.id = _order_id;
    v_status := 'wygasle';
  end if;

  return query select v_count, v_status, (v_status = 'wygasle');
end;
$$;

revoke execute on function public.increment_order_rejections(uuid) from public, anon;
grant execute on function public.increment_order_rejections(uuid) to service_role;

comment on function public.increment_order_rejections(uuid) is
  'Atomowy licznik odrzuceń Zlecenia; przy progu rejection_review_threshold Zlecenie wygasa.';

notify pgrst, 'reload schema';
