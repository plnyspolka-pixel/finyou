-- Automatyczna synchronizacja promptów z agentami ElevenLabs.
--
-- Prompt edytowany na /admin/text-agent musi trafić do agenta w ElevenLabs,
-- bo to agent prowadzi Messengera i telefon. Żeby dało się to sprawdzać przed
-- rozmową bez kosztownych zapytań, trzymamy tu odcisk (hash) promptu ostatnio
-- wysłanego dla każdej powierzchni: { "intake": "…", "investor_info": "…" }.
alter table public.voicebot_settings
  add column if not exists agent_prompt_hashes jsonb not null default '{}'::jsonb;

comment on column public.voicebot_settings.agent_prompt_hashes is
  'Odciski promptów ostatnio wysłanych do agentów ElevenLabs, per powierzchnia (intake / investor_info / investor_panel).';
