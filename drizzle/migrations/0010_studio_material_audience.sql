-- Studio publikacji → biblioteka materiałów: kategoria (klient / inwestor /
-- pośrednik), do której trafia gotowa rolka. NULL = kategoria domyślna
-- (sekret STUDIO_MATERIALS_AUDIENCE, a bez niego „klient").
-- Powiązanie rolka ↔ materiał nie wymaga kolumny: plik leży pod stałą
-- ścieżką `studio/<id joba>.mp4` w buckecie marketing-materials.
ALTER TABLE public.studio_video_jobs
  ADD COLUMN IF NOT EXISTS material_audience public.marketing_audience;

COMMENT ON COLUMN public.studio_video_jobs.material_audience IS
  'Kategoria w /admin/materialy, do której trafia gotowa rolka; NULL = STUDIO_MATERIALS_AUDIENCE albo klient.';
