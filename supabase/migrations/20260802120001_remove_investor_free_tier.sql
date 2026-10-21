-- =====================================================================
-- USUNIĘCIE DARMOWEGO KONTA INWESTORA.
-- Funkcjonalność (składanie ofert bez płatnego dostępu z oprocentowaniem
-- stałym = odsetki maksymalne, prowizją inwestora 0 i prowizją Finance You
-- 2× wyższą) została wycofana — zajawki ofert są teraz dostępne dopiero po
-- pozytywnej weryfikacji tożsamości (KYC), a wszystko dalej wymaga pełnego
-- (płatnego) dostępu.
--
-- Zostają bez zmian:
--  - darmowe lekcje Akademii Inwestora (kolumna free_lesson + polityki),
--  - polityka SELECT własnych ofert inwestora (offers_investor_own_select) —
--    historyczne oferty pozostają widoczne dla ich autorów.
-- =====================================================================

DROP FUNCTION IF EXISTS public.free_investor_usage(uuid);
