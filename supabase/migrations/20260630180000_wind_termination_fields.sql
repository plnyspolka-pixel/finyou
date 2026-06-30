-- Pola wspierające logikę finansową windykacji:
--  • data_wypowiedzenia — od kiedy CAŁA należność jest wymagalna (odsetki za
--    opóźnienie od całości, nie tylko od zaległych rat).
--  • kwota_doplat — pozostałe dopłaty/koszty umowne doliczane do całości po
--    wypowiedzeniu.
ALTER TABLE public.wind_loans
  ADD COLUMN IF NOT EXISTS data_wypowiedzenia DATE,
  ADD COLUMN IF NOT EXISTS kwota_doplat NUMERIC NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.wind_loans.data_wypowiedzenia IS
  'Data skutecznego wypowiedzenia umowy. Od tej daty cała pozostała należność jest wymagalna, a odsetki za opóźnienie naliczane są od całości (art. 481 § 2¹ k.c.).';
COMMENT ON COLUMN public.wind_loans.kwota_doplat IS
  'Pozostałe dopłaty/koszty umowne doliczane do całości wymagalnej po wypowiedzeniu.';
