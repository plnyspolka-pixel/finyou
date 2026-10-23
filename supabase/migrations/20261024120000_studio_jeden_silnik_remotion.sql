-- Studio publikacji — JEDEN SILNIK WYKOŃCZENIA ROLEK: Remotion Lambda.
--
-- Decyzja właściciela (24.10.2026): zamiast trzech dróg (napisy HeyGena,
-- usługa FFmpeg caption-burner, Remotion) zostaje wyłącznie Remotion
-- (services/remotion, kompozycja StudioReel). Usługa caption-burner i jej
-- klient zostały usunięte z kodu.
--
-- Razem z usługą znika kompresja wideo przed publikacją (video_renditions):
-- opierała się na zadaniu `transcode` tej usługi i NIGDY nie zadziałała na
-- produkcji — każdy wiersz kończył się błędem „usługa FFmpeg nie obsługuje
-- jeszcze kompresji (stara wersja)”, a publikatory i tak wysyłały oryginał.
-- Rolki z Remotion (1080×1920, H.264, ~10–16 MB) mieszczą się w limitach
-- wszystkich platform bez kompresji.
--
-- Kolumna `studio_video_jobs.render_engine` zostaje (stare wiersze), ale
-- kod jej nie czyta; `caption_burn_id` niesie id renderu Remotion
-- (`remotion:<bucket>:<renderId>`).

DROP TABLE IF EXISTS public.video_renditions;

COMMENT ON COLUMN public.studio_video_jobs.render_engine IS
  'Nieużywana od 24.10.2026 — jedynym silnikiem wykończenia rolek jest Remotion Lambda (services/remotion). Zostaje dla starych wierszy.';
COMMENT ON COLUMN public.studio_video_jobs.caption_burn_id IS
  'Id renderu Remotion Lambda (remotion:<bucket>:<renderId>) — ustawione, gdy zadanie jest w statusie captioning.';
COMMENT ON COLUMN public.studio_video_jobs.caption_burn_started_at IS
  'Kiedy zlecono wykończenie w Remotion — po limicie (CAPTION_BURN_TIMEOUT_MINUTES, domyślnie 45 min) zadanie pada do ponowienia.';
COMMENT ON COLUMN public.studio_video_jobs.caption_burn_attempts IS
  'Ile razy zlecono wykończenie tego zadania w Remotion (maks. 2 — potem failed z powodem).';
COMMENT ON COLUMN public.studio_video_jobs.caption_style IS
  'Styl napisów wypalanych przez Remotion z pliku SRT (src/lib/caption-style.ts): reels | tiktok | box | minimal; heygen tylko w starych wierszach.';
