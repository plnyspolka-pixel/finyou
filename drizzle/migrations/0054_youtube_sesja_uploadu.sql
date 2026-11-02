-- Kolejka YouTube: sesja resumable upload zapisana zaraz po inicjacji.
-- Wpis ucięty w `uploading` (29.10.2026: film był na kanale, wpis wisiał
-- cztery dni) tick rozstrzyga pytaniem YouTube o stan sesji
-- (src/lib/youtube-stalled-upload.ts) zamiast zostawić go na zawsze.
ALTER TABLE public.youtube_publish_queue
  ADD COLUMN IF NOT EXISTS upload_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS upload_session_url text,
  ADD COLUMN IF NOT EXISTS upload_bytes bigint;

COMMENT ON COLUMN public.youtube_publish_queue.upload_session_url IS
  'Adres sesji resumable upload YouTube (zapisany przed wysyłką pliku); czyszczony po rozstrzygnięciu.';
