-- Asystent panelu: pełny dostęp do wszystkich narzędzi.
--
-- Decyzja właściciela (2026-08-26): asystent ma mieć włączone wszystkie
-- uprawnienia — łącznie z wysyłką wiadomości do klientów i inwestorów
-- (`enable_comms_send`), która dotąd była domyślnie wyłączona.
--
-- Bezpieczniki, które ZOSTAJĄ mimo pełnego dostępu:
--   * limit 20 wysyłek na godzinę (ASSISTANT_SEND_LIMIT_PER_HOUR
--     w src/lib/ai-admin.server.ts) — chroni przed pętlą/masówką,
--   * blokada plików z sekretami (.env) i operacji na rolach Postgresa,
--   * pełny audit log każdego wywołania narzędzia (ai_admin_audit_log).
--
-- Uprawnienia dalej można wyłączyć ręcznie w Ustawieniach asystenta —
-- ta migracja tylko włącza wszystko i zmienia domyślne na "włączone".

ALTER TABLE public.ai_admin_settings
  ALTER COLUMN enable_comms_send SET DEFAULT true;

UPDATE public.ai_admin_settings
SET enable_db_read = true,
    enable_db_write = true,
    enable_file_read = true,
    enable_file_write = true,
    enable_memory = true,
    enable_comms_read = true,
    enable_comms_send = true
WHERE singleton = true;
