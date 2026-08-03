-- Uproszczenie modułu windykacji dla inwestora:
-- 1) Opłaty za czynności windykacyjne (rejestr czynności i opłat).
-- 2) Potwierdzenia nadania/odbioru przypięte do pism wygenerowanych w systemie.
-- 3) Osobny agent ElevenLabs do telefonów windykacyjnych (auto-tworzony przez API).
-- 4) Polityka Storage dla skanów windykacyjnych inwestora (bucket pliki-klienta,
--    prefiks windykacja/<uid>/...) — dotychczasowy upload celował w usunięty
--    bucket "documents" i nie miał żadnej pasującej polityki.

-- 1) Opłata naliczona za czynność windykacyjną (0 = bez opłaty).
ALTER TABLE public.wind_events
  ADD COLUMN IF NOT EXISTS oplata NUMERIC NOT NULL DEFAULT 0;

-- 2) Skany potwierdzeń nadania i odbioru dla pism z systemu.
ALTER TABLE public.wind_documents
  ADD COLUMN IF NOT EXISTS potwierdzenie_nadania_url TEXT,
  ADD COLUMN IF NOT EXISTS data_nadania DATE,
  ADD COLUMN IF NOT EXISTS potwierdzenie_odbioru_url TEXT,
  ADD COLUMN IF NOT EXISTS data_odbioru DATE;

-- 3) Agent windykacyjny ElevenLabs (tworzony automatycznie przy pierwszym telefonie).
ALTER TABLE public.voicebot_settings
  ADD COLUMN IF NOT EXISTS windykacja_agent_id TEXT;

-- 4) Inwestor ma pełny dostęp do własnych skanów windykacyjnych:
--    pliki-klienta / windykacja/<auth.uid()>/<caseId>/plik
DROP POLICY IF EXISTS pliki_klienta_windykacja_own ON storage.objects;
CREATE POLICY pliki_klienta_windykacja_own ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'pliki-klienta'
    AND (storage.foldername(name))[1] = 'windykacja'
    AND (storage.foldername(name))[2] = (auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'pliki-klienta'
    AND (storage.foldername(name))[1] = 'windykacja'
    AND (storage.foldername(name))[2] = (auth.uid())::text
  );
