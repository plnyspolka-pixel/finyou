-- Kody rabatowe przy płatności za dostęp. Zniżka wynika z treści kodu
-- (RABAT<procent>-<id>-<podpis HMAC>), więc nie ma tabeli kodów — płatność
-- zapamiętuje użyty kod, procent i cenę katalogową sprzed rabatu.
-- expected_amount_grosz to już kwota PO rabacie (tyle pobiera bramka).
ALTER TABLE public.access_payments
  ADD COLUMN IF NOT EXISTS discount_code text,
  ADD COLUMN IF NOT EXISTS discount_pct smallint
    CHECK (discount_pct IS NULL OR (discount_pct BETWEEN 1 AND 90)),
  ADD COLUMN IF NOT EXISTS list_amount_grosz integer;

-- Jednorazowość kodu sprawdza checkout (zaksięgowana płatność z tym kodem).
CREATE INDEX IF NOT EXISTS access_payments_discount_code_idx
  ON public.access_payments (discount_code)
  WHERE discount_code IS NOT NULL;

COMMENT ON COLUMN public.access_payments.discount_code IS
  'Kod rabatowy użyty przy płatności (postać kanoniczna), NULL = bez rabatu.';
COMMENT ON COLUMN public.access_payments.discount_pct IS
  'Zniżka w % odczytana z kodu rabatowego.';
COMMENT ON COLUMN public.access_payments.list_amount_grosz IS
  'Cena katalogowa produktu przed rabatem (expected_amount_grosz = po rabacie).';
