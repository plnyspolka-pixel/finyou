-- Bank B-rolli: obok grafik także klipy wideo (scena `video` HeyGena,
-- zapętlona i wyciszona pod lektorem). Kadr podglądowy klipu robi
-- przeglądarka przy uploadzie; po nim Claude opisuje klip.
alter table public.studio_broll_assets add column if not exists media_type text not null default 'image';
alter table public.studio_broll_assets add column if not exists thumbnail_url text;
alter table public.studio_broll_assets add column if not exists duration_seconds numeric;
