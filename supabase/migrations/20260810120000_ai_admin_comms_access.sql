-- Asystent panelu: wgląd w korespondencję z klientami i inwestorami oraz
-- (opcjonalnie) wysyłka wiadomości w ich wątkach.
--
-- Dwa osobne uprawnienia, bo ryzyko jest nieporównywalne:
--   * enable_comms_read  — czytanie skrzynki (e-mail, Messenger/Instagram, czat,
--     czat inwestora, wątki z instytucjami). Domyślnie włączone.
--   * enable_comms_send  — wysyłanie i odpowiadanie w tych wątkach. Domyślnie
--     WYŁĄCZONE: to nieodwracalne działanie wobec prawdziwej osoby, więc musi
--     zostać włączone świadomie w ustawieniach asystenta.
--
-- Wiadomości wysłane ręką asystenta mają w `lead_communications.metadata.source`
-- wartość 'ai_admin_assistant' (wątki z instytucjami: `offer_distribution_messages`
-- jak każda inna odpowiedź) — po tym śladzie widać je w skrzynce i po nim liczony
-- jest limit 20 wysyłek na godzinę.
--
-- Logika w TS: src/lib/comms-agent.server.ts (rdzeń czytania i wysyłki, wspólny
-- ze skrzynką panelu), narzędzia `comms_*` w src/lib/ai-admin.server.ts.
-- Dokumentacja: docs/asystent-panelu.md.

ALTER TABLE public.ai_admin_settings
  ADD COLUMN IF NOT EXISTS enable_comms_read boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_comms_send boolean NOT NULL DEFAULT false;

-- Skrzynka asystenta filtruje po znaczniku źródła, a limit godzinowy liczy
-- outboundy z ostatniej godziny — bez indeksu byłby to skan całej tabeli.
CREATE INDEX IF NOT EXISTS idx_lc_assistant_outbound
  ON public.lead_communications (created_at DESC)
  WHERE direction = 'outbound' AND metadata->>'source' = 'ai_admin_assistant';
