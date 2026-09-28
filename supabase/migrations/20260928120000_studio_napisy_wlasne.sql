-- Studio publikacji — NAPISY WŁASNE (styl, rozmiar, pozycja).
--
-- PROBLEM: HeyGen v3 przyjmuje w `caption.style` wyłącznie "default"
-- (sprawdzone na żywym API — walidacja: „Input should be 'default'"), więc
-- rozmiar, czcionka i pozycja napisów wypalanych przez HeyGena nie są do
-- ustawienia. Wychodziły małe, nisko, w szarym pasku.
--
-- ROZWIĄZANIE: po zakończeniu renderu bierzemy czysty master + plik SRT
-- HeyGena, z SRT budujemy ASS w wybranym stylu (src/lib/caption-style.ts)
-- i wypalamy napisy usługą FFmpeg (services/caption-burner). Gotowy plik
-- ląduje w buckecie `studio-media` i pod `video_url`. Nowy status joba:
-- `captioning` (między `rendering` a `ready`). Gdy usługa nie jest
-- skonfigurowana albo zawiedzie, job schodzi na napisy HeyGena jak dotąd.
--
--   * caption_style            — 'heygen' (dotychczasowe napisy HeyGena)
--                                albo styl własny: reels | tiktok | box | minimal,
--   * caption_burn_id          — id zadania w usłudze wypalania (gdy trwa),
--   * caption_burn_started_at  — od kiedy czekamy (limit 45 min),
--   * caption_burn_attempts    — ile razy zlecono (usługa mogła się zrestartować).

ALTER TABLE public.studio_video_jobs
  ADD COLUMN IF NOT EXISTS caption_style text NOT NULL DEFAULT 'heygen',
  ADD COLUMN IF NOT EXISTS caption_burn_id text,
  ADD COLUMN IF NOT EXISTS caption_burn_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS caption_burn_attempts integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.studio_video_jobs.caption_style IS
  'Styl napisów: heygen = wypalane przez HeyGen (bez kontroli wyglądu); reels | tiktok | box | minimal = wypalane u nas z pliku SRT (src/lib/caption-style.ts).';
COMMENT ON COLUMN public.studio_video_jobs.caption_burn_id IS
  'Id zadania w usłudze wypalania napisów (services/caption-burner) — ustawione, gdy job jest w statusie captioning.';
COMMENT ON COLUMN public.studio_video_jobs.caption_burn_started_at IS
  'Kiedy zlecono wypalanie napisów — po 45 min bez wyniku publikujemy wersję zapasową (HeyGen).';
COMMENT ON COLUMN public.studio_video_jobs.caption_burn_attempts IS
  'Ile razy zlecono wypalanie tego joba (maks. 2 — potem wersja zapasowa).';

-- Tick odpytuje joby w statusach rendering i captioning; indeks częściowy
-- z migracji 20260805120000 obejmował tylko queued/rendering.
CREATE INDEX IF NOT EXISTS studio_video_jobs_captioning_idx
  ON public.studio_video_jobs (created_at)
  WHERE status = 'captioning';
