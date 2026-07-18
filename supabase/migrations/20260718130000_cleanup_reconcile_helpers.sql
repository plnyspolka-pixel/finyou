-- Sprzątanie po nieudanej próbie odzysku plików (reconcile-storage).
--
-- USTALENIE KOŃCOWE: fizycznych bajtów zaginionych plików nie da się odzyskać.
-- Migracje 20260715090000 / 20260718090000 przeniosły obiekty do bucketu
-- `pliki-klienta` tylko przez `UPDATE storage.objects SET bucket_id` (same
-- metadane). Fizyczne obiekty S3 zostały pod starymi kluczami bez żadnego
-- wiersza metadanych i garbage-collector Supabase Storage sprzątnął je jako
-- osierocone. Legacy buckety są puste także po stronie S3. Odzysk możliwy już
-- tylko przez restore Storage po stronie infrastruktury (support Lovable).
--
-- Dlatego kasujemy martwe funkcje pomocnicze reconcile-* (i tak blokowane przez
-- trigger Supabase „Direct deletion from storage tables is not allowed").
--
-- ========================================================================
-- ZASADA NA PRZYSZŁOŚĆ (żeby ten fail się nie powtórzył):
-- NIGDY nie przenosić plików między bucketami przez `UPDATE storage.objects
-- SET bucket_id`. To zmienia TYLKO metadane — fizyczny blob w S3 zostaje pod
-- kluczem `{stary_bucket}/{name}/{version}` i po utracie wiersza metadanych
-- jest kasowany przez GC. Przenoszenie plików robi się WYŁĄCZNIE przez Storage
-- API (copy/move/upload), które przenosi bajty. Cały upload w aplikacji idzie
-- już do jednego bucketu `pliki-klienta` (patrz src/lib/uploads/unified-upload.ts
-- i inbound-attachments.server.ts) — nie wprowadzać drugiego bucketu na pliki
-- klienta ani migracji bucket_id.
-- ========================================================================

drop function if exists public.reconcile_object_names(integer, integer);
drop function if exists public.reconcile_shadow_upsert(text, text);
drop function if exists public.reconcile_shadow_delete(text, text);
