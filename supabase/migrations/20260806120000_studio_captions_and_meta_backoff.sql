-- Studio publikacji — dwie poprawki produkcyjne:
--
-- 1. NAPISY W WIDEO (HeyGen): shorty i rolki ogląda się bez dźwięku, więc
--    render idzie domyślnie z napisami (v3 przyjmuje obiekt `caption`).
--    * studio_video_jobs.captions     — czy render ma mieć napisy (po starcie
--      kolumna trzyma stan faktyczny: HeyGen potrafi odrzucić konfigurację
--      i wtedy zapisujemy false, żeby panel nie kłamał),
--    * studio_video_jobs.subtitle_url — plik napisów (SRT) obok wideo,
--      przydatny przy montażu i uploadzie ścieżki napisów na YouTube.
--
-- 2. ODPORNOŚĆ NA LIMITY META (błąd „(#4) Application request limit reached"):
--    * social_publish_queue.ig_container_at — kiedy powstał kontener IG.
--      Wcześniej limit czasu transkodowania liczyliśmy z updated_at, który
--      zmieniał się przy każdym odroczeniu — kontener potrafił „wygasnąć"
--      za wcześnie albo wisieć w nieskończoność.
--    Logika ponawiania (bez zużywania prób, z wykładniczym odstępem) siedzi
--    w src/lib/meta-graph-errors.ts + src/lib/studio-publishing.server.ts.

ALTER TABLE public.studio_video_jobs
  ADD COLUMN IF NOT EXISTS captions boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS subtitle_url text;

COMMENT ON COLUMN public.studio_video_jobs.captions IS
  'Czy wideo renderuje się z napisami (HeyGen caption); false = HeyGen odrzucił napisy albo wyłączono je w panelu.';
COMMENT ON COLUMN public.studio_video_jobs.subtitle_url IS
  'URL pliku napisów (SRT) zwrócony przez HeyGen po zakończeniu renderu.';

ALTER TABLE public.social_publish_queue
  ADD COLUMN IF NOT EXISTS ig_container_at timestamptz;

COMMENT ON COLUMN public.social_publish_queue.ig_container_at IS
  'Kiedy powstał kontener mediów IG — od tego liczymy limit czasu na transkodowanie po stronie Meta.';

-- Wpisy IG, które już czekają w kolejce, dostają punkt odniesienia,
-- żeby po wdrożeniu nie zostały uznane za natychmiast przeterminowane.
UPDATE public.social_publish_queue
   SET ig_container_at = updated_at
 WHERE ig_creation_id IS NOT NULL
   AND ig_container_at IS NULL;
