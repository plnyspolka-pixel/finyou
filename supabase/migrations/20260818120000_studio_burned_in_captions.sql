-- Studio publikacji — napisy WYPALONE w obrazie zamiast samego pliku SRT.
--
-- PROBLEM: render szedł do HeyGena z `caption: { file_format: "srt", style: … }`,
-- czyli poprawnie zamawiał wypalanie napisów. HeyGen nie nadpisuje jednak
-- `video_url` — wersję z napisami oddaje jako OSOBNY plik
-- (`captioned_video_url`), a `video_url` zostaje czystym masterem. Czytaliśmy
-- tylko `video_url`, więc na YouTube, FB i IG szły filmy bez napisów, mimo
-- włączonego przełącznika „Napisy na wideo" (IG/FB Reels nie przyjmują
-- osobnej ścieżki napisów — tam muszą być wypalone).
--
-- Po zmianie `video_url` trzyma plik, który faktycznie publikujemy (z napisami,
-- gdy je zamówiono), a czysty master ląduje w `video_url_clean`.

ALTER TABLE public.studio_video_jobs
  ADD COLUMN IF NOT EXISTS video_url_clean text,
  ADD COLUMN IF NOT EXISTS caption_wait_since timestamptz;

COMMENT ON COLUMN public.studio_video_jobs.video_url IS
  'Plik do publikacji — wersja z napisami wypalonymi w obrazie, jeśli je zamówiono i HeyGen ją oddał.';
COMMENT ON COLUMN public.studio_video_jobs.video_url_clean IS
  'Czysty master bez napisów (HeyGen video_url) — do montażu; NULL, gdy nie ma osobnej wersji.';
COMMENT ON COLUMN public.studio_video_jobs.caption_wait_since IS
  'Kiedy pierwszy raz zobaczyliśmy gotowe wideo bez wypalonej wersji — od tego liczymy karencję, zanim opublikujemy plik bez napisów.';
COMMENT ON COLUMN public.studio_video_jobs.captions IS
  'Czy video_url ma napisy wypalone w obrazie; false = wyłączone w panelu, odrzucone przez HeyGen albo wersja z napisami nie dojechała.';

-- Wideo wyrenderowane PRZED tą poprawką mają w video_url czysty master, więc
-- flaga captions = true opisywałaby plik, którego nie ma. Prostujemy tylko
-- gotowe joby — te w 'rendering' mogą jeszcze odebrać wersję z napisami.
-- (Starych plików nie da się podmienić wstecz; nowe rendery lecą już poprawnie.)
UPDATE public.studio_video_jobs
   SET captions = false
 WHERE status = 'ready'
   AND captions;
