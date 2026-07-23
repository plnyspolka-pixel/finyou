-- === Liczba ludności miejscowości nieruchomości ===
--
-- Nowa kolumna `population` na `properties` przechowuje liczbę ludności
-- miejscowości (lub — w razie braku danych na poziomie miasta — powiatu),
-- pobieraną z GUS BDL po ściągnięciu treści księgi wieczystej.
-- Pole jest uzupełniane automatycznie razem z pozostałymi danymi z KW,
-- ale operator może je ręcznie nadpisać (EditableField).

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS population INTEGER;

COMMENT ON COLUMN public.properties.population IS
  'Liczba ludności miejscowości/powiatu (GUS BDL). Uzupełniana automatycznie po pobraniu danych z KW.';
