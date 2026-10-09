-- Windykacja: kolumny z migracji 20260803120000_windykacja_simplified, które
-- nie trafiły do bazy produkcyjnej (sprawdzone 2026-10-06: brak
-- wind_events.oplata, wind_documents.potwierdzenie_* i
-- voicebot_settings.windykacja_agent_id). Bez nich „Telefon windykacyjny AI"
-- nie zapisuje zdarzenia w aktach (insert z kolumną oplata), a agent
-- ElevenLabs nie ma gdzie zapisać swojego ID.
-- Polityka Storage na skany (pliki-klienta/windykacja/<uid>/...) z tamtej
-- migracji zostaje poza tym plikiem — dotyczy schematu storage.

-- Opłata naliczona za czynność windykacyjną (0 = bez opłaty).
ALTER TABLE public.wind_events
  ADD COLUMN IF NOT EXISTS oplata NUMERIC NOT NULL DEFAULT 0;

-- Skany potwierdzeń nadania i odbioru dla pism z systemu.
ALTER TABLE public.wind_documents
  ADD COLUMN IF NOT EXISTS potwierdzenie_nadania_url TEXT,
  ADD COLUMN IF NOT EXISTS data_nadania DATE,
  ADD COLUMN IF NOT EXISTS potwierdzenie_odbioru_url TEXT,
  ADD COLUMN IF NOT EXISTS data_odbioru DATE;

-- Agent windykacyjny ElevenLabs (tworzony automatycznie przy pierwszym telefonie).
ALTER TABLE public.voicebot_settings
  ADD COLUMN IF NOT EXISTS windykacja_agent_id TEXT;
