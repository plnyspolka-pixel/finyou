-- Studio publikacji — KOMPRESJA WIDEO PRZED PUBLIKACJĄ.
--
-- PROBLEM: każda platforma ma inne limity i wymagania (X: my buforujemy plik
-- w pamięci workera i tniemy na 64 MB; TikTok / YouTube: 100 MB bufora;
-- Instagram Reels: tylko H.264/AAC ≤ 1080p), a materiały z biblioteki bywają
-- nagrane telefonem (MOV/HEVC, 4K, 60 kl./s) albo mają setki MB. Publikacja
-- kończyła się „Plik za duży" albo odrzuceniem przez platformę.
--
-- ROZWIĄZANIE: jeden „profil publikacji" (MP4 H.264/AAC, ≤ 1080p, ≤ 30 kl./s,
-- ≤ 60 MB), do którego usługa FFmpeg (services/caption-burner, zadanie
-- `transcode`) sprowadza każde wideo PRZED wysyłką. Wynik ląduje w publicznym
-- buckecie `studio-media` (`renditions/<profil>/<id>.mp4`), a ta tabela
-- pamięta go per adres źródłowy — ten sam plik publikowany na cztery platformy
-- kompresuje się raz. Plik już zgodny z profilem (rolka z HeyGena) dostaje
-- `unchanged = true` i publikuje się oryginał.
--
-- Logika: src/lib/video-rendition.ts (decyzje, testy) i
-- src/lib/video-rendition.server.ts (usługa, Storage, kolejki). Publikatory
-- (YouTube / TikTok / X / Meta) wołają ensurePublishableVideo(url) przed
-- pobraniem pliku; gdy kompresja trwa, wpis kolejki wraca do `pending` bez
-- zużycia próby. Bez usługi (brak CAPTION_BURNER_URL) wszystko działa jak dotąd.

CREATE TABLE IF NOT EXISTS public.video_renditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Adres oryginału (dokładnie taki, jaki niesie wpis kolejki).
  source_url text NOT NULL,
  -- Wersja profilu (social-v1); zmiana progów = nowy profil = nowe renditions.
  profile text NOT NULL DEFAULT 'social-v1',
  -- pending → processing (zadanie w usłudze) → ready; failed po wyczerpaniu prób.
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  -- Id zadania w usłudze FFmpeg (gdy trwa) i od kiedy czekamy (limit 2 h).
  job_id text,
  job_started_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  -- Oryginał spełniał profil — nic nie kodowano, output_url zostaje NULL.
  unchanged boolean NOT NULL DEFAULT false,
  -- Publiczny URL skompresowanego pliku w studio-media (NULL, gdy unchanged).
  output_url text,
  output_bytes bigint,
  source_bytes bigint,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_url, profile)
);

-- Tick szuka wpisów do zlecenia i do domknięcia.
CREATE INDEX IF NOT EXISTS idx_video_renditions_open
  ON public.video_renditions (created_at)
  WHERE status IN ('pending', 'processing');

DO $$
BEGIN
  CREATE TRIGGER trg_vr_touch_updated_at
    BEFORE UPDATE ON public.video_renditions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Odczyt dla kadry (panel), zapisy wyłącznie przez service_role (tick, publikatory).
ALTER TABLE public.video_renditions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.video_renditions TO authenticated;
GRANT ALL ON public.video_renditions TO service_role;
DO $$
BEGIN
  CREATE POLICY vr_staff_select ON public.video_renditions FOR SELECT TO authenticated
    USING (has_role(auth.uid(), 'administrator'::app_role) OR has_role(auth.uid(), 'operator'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.video_renditions IS
  'Studio publikacji: wideo skompresowane do profilu publikacji (MP4 H.264/AAC ≤1080p ≤60 MB) per adres źródłowy; usługa services/caption-burner, pliki w studio-media/renditions.';
COMMENT ON COLUMN public.video_renditions.unchanged IS
  'Oryginał spełniał profil — publikujemy source_url bez przekodowania.';
COMMENT ON COLUMN public.video_renditions.output_url IS
  'Publiczny URL skompresowanego pliku (studio-media/renditions/<profil>/<id>.mp4).';
