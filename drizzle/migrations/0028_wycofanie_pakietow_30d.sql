-- =====================================================================
-- WYCOFANIE PAKIETÓW 30-DNIOWYCH (2026-10-06)
--
-- Decyzja właściciela: dostęp sprzedajemy wyłącznie na rok (365 dni).
-- Abonament inwestora 30 dni (1 500 zł) i pakiet pośrednika 30 dni
-- (499 zł) przestają być w sprzedaży. Wiersze zostają w katalogu
-- (nieaktywne) — historia płatności i webhook dla transakcji
-- rozpoczętych wcześniej nadal się do nich odwołują. Kod blokuje te
-- kody niezależnie (lib/access/core.ts, RETIRED_PRODUCT_CODES).
-- Regulamin abonamentu inwestora v3: lib/legal/regulamin-abonamentu.ts.
-- Migracja jest idempotentna.
-- =====================================================================

update public.access_products
   set active = false,
       updated_at = now()
 where code in ('investor_access_30d', 'broker_access_30d')
   and active;
