-- =====================================================================
-- ETAP 1 — CENNIK: INWESTOR NIE PŁACI (sprzątanie spójności prawnej 2026-09)
--
-- Decyzja nadrzędna nr 3: brak Opłaty Sukcesu 5 %, brak abonamentu PRO,
-- brak opłaty 1 500 zł za okazję. Jedyną opłatą w systemie jest Prowizja
-- Klientowska Finance You (7 % Kwoty Udzielonej, min 5 000 zł, bez VAT)
-- obciążająca KLIENTA. Infrastruktura access_products / access_entitlements
-- zostaje (abonament za dostęp do systemu — w przyszłości); produkty
-- inwestora są dezaktywowane, rekordy i płatności historyczne zostają.
-- =====================================================================

-- 1. Produkty inwestora → nieaktywne (rekordy zostają).
update public.access_products
   set active = false, updated_at = now()
 where code in ('investor_pro_180d', 'investor_okazja_unlock', 'investor_access_30d', 'investor_access_365d')
   and active = true;

-- 2. investor_tier(): każdy inwestor = 'podstawowy'. Bez paywalli.
--    (Abonament za dostęp do systemu — w przyszłości; wtedy funkcja wróci
--    do odczytu access_entitlements. Sygnatura bez zmian.)
create or replace function public.investor_tier(_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select 'podstawowy'::text;
$$;

comment on function public.investor_tier(uuid) is
  'Od 2026-09 (Umowa ramowa v7) usługa dla Inwestora jest nieodpłatna: każdy inwestor = podstawowy, bez paywalli. Abonament w przyszłości.';

-- 3. investor_can_open_match(): właściciel Dopasowania zawsze może otworzyć
--    dane Projektu po akceptacji Karty Leada — bez wykupu okazji ani PRO.
create or replace function public.investor_can_open_match(_user_id uuid, _match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.investor_order_matches m
      join public.investor_orders o on o.id = m.order_id
     where m.id = _match_id
       and o.user_id = _user_id
  ) or public.is_internal_staff(_user_id);
$$;

-- 4. investor_has_full_access(): bramka RLS (Akademia, training-videos,
--    pełne dane inwestycyjne) — każdy inwestor z rolą, bez płatności.
create or replace function public.investor_has_full_access(_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_internal_staff(_user_id) or public.has_role(_user_id, 'inwestor');
$$;

-- 5. Opłaty sukcesu — tabela wyłącznie historyczna.
comment on table public.investor_success_fees is
  'HISTORYCZNA. Opłata Sukcesu PRO (5 %) zniesiona od 2026-09 (Umowa ramowa v7: usługa dla Inwestora nieodpłatna). Nowe rekordy nie powstają; istniejące można tylko anulować.';

comment on table public.investor_opportunity_unlocks is
  'HISTORYCZNA. Wykupy pojedynczych okazji (1 500 zł) zniesione od 2026-09 — dane Projektu po akceptacji Karty Leada są dostępne bez opłat.';

notify pgrst, 'reload schema';
