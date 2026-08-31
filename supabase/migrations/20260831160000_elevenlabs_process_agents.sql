-- Agenty procesowe ElevenLabs (decyzja: wszystkie boty procesowe na
-- ElevenLabs). ID agentów trzymamy obok pozostałych ustawień voicebota;
-- agenty są tworzone przez API (ensureElevenLabsProcessAgents) albo wpisane
-- ręcznie z konsoli ElevenLabs.
alter table public.voicebot_settings
  add column if not exists intake_agent_id text,          -- A1: przyjęcie wniosku (klient, wszystkie kanały)
  add column if not exists investor_info_agent_id text,   -- A2: informacja dla inwestora (/dla-inwestora)
  add column if not exists investor_panel_agent_id text;  -- A3: obsługa wniosków w panelu inwestora
