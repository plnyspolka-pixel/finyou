-- =====================================================================
-- ABONAMENT INWESTORA (2026-09-30)
--
-- Decyzja właściciela: Inwestor płaci Opłatę Abonamentową za dostęp do
-- systemu — 1 500 zł brutto za 30 dni albo 7 000 zł brutto za 365 dni,
-- jednorazowo z góry przez Tpay (przelew, BLIK), bez automatycznego
-- odnowienia. Umowa ramowa v7 (FY-LEGAL-2026-09-29) została przed pierwszą
-- akceptacją zmieniona tak, by to przewidywała (allows_investor_fees = true).
-- Ceny w kodzie: src/lib/investor-plan/plans.ts (SUBSCRIPTION_*).
--
-- Kody produktów zostają (investor_access_30d / investor_access_365d) —
-- przed tą migracją nie było ani jednej płatności inwestora, więc zmiana
-- etykiety i ceny nie przekłamuje historii. Pakiet PRO i opłata za okazję
-- pozostają nieaktywne.
-- =====================================================================

-- 1. Produkty abonamentu — aktywne, nowe ceny i etykiety.
insert into public.access_products
  (code, audience, label, duration_days, amount_grosz, currency, active, sort_order, kind, tier, success_fee_bps)
values
  ('investor_access_30d', 'investor', 'Abonament inwestora — 30 dni', 30, 150000, 'PLN', true, 10, 'access', 'podstawowy', 0),
  ('investor_access_365d', 'investor', 'Abonament inwestora — 365 dni', 365, 700000, 'PLN', true, 20, 'access', 'podstawowy', 0)
on conflict (code) do update set
  audience = excluded.audience,
  label = excluded.label,
  duration_days = excluded.duration_days,
  amount_grosz = excluded.amount_grosz,
  currency = excluded.currency,
  active = true,
  sort_order = excluded.sort_order,
  kind = excluded.kind,
  tier = excluded.tier,
  success_fee_bps = 0,
  updated_at = now();

-- 2. Pakiet PRO i opłata za pojedynczą okazję — nieaktywne (rekordy zostają).
update public.access_products
   set active = false, updated_at = now()
 where code in ('investor_pro_180d', 'investor_okazja_unlock')
   and active = true;

-- 3. investor_has_full_access(): personel ALBO inwestor z aktywnym
--    abonamentem (access_entitlements) ALBO z aktywnym dostępem do
--    zamkniętego modułu projektów nadanym przez zespół. Ta sama funkcja
--    stoi za politykami RLS danych inwestycyjnych (20260719106000) i za
--    bramkami serwerowymi (src/lib/access/guards.server.ts).
create or replace function public.investor_has_full_access(_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_internal_staff(_user_id)
      or (public.has_role(_user_id, 'inwestor')
          and (public.has_active_paid_access(_user_id, 'investor')
               or public.investor_module_access_active(_user_id)));
$$;

comment on function public.investor_has_full_access(uuid) is
  'Od 2026-09-30: personel albo inwestor z aktywnym abonamentem (1 500 zł / 30 dni albo 7 000 zł / 365 dni) albo z dostępem modułowym nadanym przez zespół.';

comment on function public.investor_tier(uuid) is
  'Jeden poziom dostępu inwestora (podstawowy). Płatny dostęp określa investor_has_full_access() — abonament od 2026-09-30.';

comment on table public.investor_opportunity_unlocks is
  'HISTORYCZNA. Wykupy pojedynczych okazji (1 500 zł) zniesione od 2026-09 — dane Projektu po akceptacji Karty Leada są dostępne w ramach abonamentu.';

notify pgrst, 'reload schema';
