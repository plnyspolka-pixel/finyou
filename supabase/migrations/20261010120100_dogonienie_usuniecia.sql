-- Dogonienie, część 2: usunięcia z niezastosowanych migracji repo (osobny plik, bo konektor Supabase
-- wykonuje DROP tylko po potwierdzeniu; część 1 (20261010120000) jest bez instrukcji destrukcyjnych).
-- Uruchamiać w panelu SQL albo przez `supabase db push`. Idempotentne.
-- ── usunięcia z niezastosowanych migracji repo (skan DROP-ów z 2026-10-10: z 45 obiektów, które repo
--    zamierzało usunąć, w produkcji zostały tylko te 4 funkcje; żadna nie ma zależności w katalogu
--    ani użyć w kodzie) ──
-- z 20260718130000_cleanup_reconcile_helpers: martwe pomocniki po nieudanym odzysku plików
DROP FUNCTION IF EXISTS public.reconcile_object_names(integer, integer);
DROP FUNCTION IF EXISTS public.reconcile_shadow_upsert(text, text);
DROP FUNCTION IF EXISTS public.reconcile_shadow_delete(text, text);
-- z 20260802120001_remove_investor_free_tier: wycofane darmowe konto inwestora
DROP FUNCTION IF EXISTS public.free_investor_usage(uuid);
