-- Cykl Zlecenie–Projekt: teaser wygasa po 24 h bez decyzji inwestora
-- (Karta Leada / rezerwacja / odrzucenie); jednorazowo można go przedłużyć
-- o 12 h. Teaser bez decyzji blokował dotąd Zlecenie (automat nie dobierał
-- kolejnego Projektu) i Projekt (wyłączność sekwencyjna) bez końca.
-- Wygaszanie leniwe w kodzie (expireStaleMatches) — status „wygasle".
ALTER TABLE public.investor_order_matches
  ADD COLUMN IF NOT EXISTS teaser_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS teaser_extended boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.investor_order_matches.teaser_expires_at IS
  'Termin decyzji inwestora przy teaserze: udostępnienie + 24 h (+12 h po jednorazowym przedłużeniu). Po terminie Dopasowanie przechodzi w status wygasle.';
COMMENT ON COLUMN public.investor_order_matches.teaser_extended IS
  'Czy inwestor wykorzystał jednorazowe przedłużenie teasera o 12 h.';

-- Istniejące teasery: termin od udostępnienia (starsze niż 24 h wygasną
-- przy najbliższym otwarciu panelu inwestora).
UPDATE public.investor_order_matches
   SET teaser_expires_at = COALESCE(teaser_released_at, created_at) + interval '24 hours'
 WHERE status = 'teaser'
   AND teaser_expires_at IS NULL;

CREATE INDEX IF NOT EXISTS iom_teaser_expires_idx
  ON public.investor_order_matches (teaser_expires_at)
  WHERE status = 'teaser';
