-- Flota agentów ElevenLabs na wspólnej linii: identyfikatory agentów floty
-- i przełącznik wejścia kanałów tekstowych.
--   agent_fleet = {
--     "text_entry": "recepcja" | "intake" | null,   -- null/brak = jak dotąd (A1)
--     "agents": { "recepcja_glos": "...", "recepcja_tekst": "...",
--                 "inwestor_presale_glos": "...", "inwestor_presale_tekst": "...",
--                 "windykacja_glos": "...", "windykacja_tekst": "..." }
--   }
-- Domyślnie pusty obiekt: router wiadomości zostaje przy dotychczasowym
-- agencie, dopóki zespół świadomie nie włączy recepcji.
alter table public.voicebot_settings
  add column if not exists agent_fleet jsonb not null default '{}'::jsonb;
