-- =====================================================================
-- FAKTURY SPRZEDAŻY: powiązanie z kontem nabywcy + nowy typ źródła
-- 'tpay_payment'. Nabywca (osoba prywatna i firma) może pobrać wyłącznie
-- własne faktury; administrator i księgowość — wszystkie.
-- =====================================================================

ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS buyer_user_id uuid;

CREATE INDEX IF NOT EXISTS idx_sales_invoices_buyer_user
  ON public.sales_invoices(buyer_user_id)
  WHERE buyer_user_id IS NOT NULL;

-- Rozszerzenie dozwolonych typów źródła o 'tpay_payment'.
ALTER TABLE public.sales_invoices DROP CONSTRAINT IF EXISTS sales_invoices_source_type_check;
ALTER TABLE public.sales_invoices
  ADD CONSTRAINT sales_invoices_source_type_check
  CHECK (source_type IN ('manual','stripe_payment','tpay_payment','affiliate_commission','other'));

-- Nabywca czyta wyłącznie własne, wystawione faktury.
DROP POLICY IF EXISTS sales_invoices_buyer_select ON public.sales_invoices;
CREATE POLICY sales_invoices_buyer_select ON public.sales_invoices
  FOR SELECT TO authenticated
  USING (buyer_user_id = auth.uid() AND status <> 'draft');

-- Backfill: historyczne faktury z płatności Tpay/Stripe zapisywały userId
-- nabywcy w source_id — uzupełniamy powiązanie tam, gdzie wskazuje na
-- istniejące konto.
UPDATE public.sales_invoices si
SET buyer_user_id = si.source_id
WHERE si.buyer_user_id IS NULL
  AND si.source_type = 'stripe_payment'
  AND si.source_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = si.source_id);

-- Rejestr sprzedaży osób fizycznych: użytkownik może odczytać własne wpisy
-- (np. powiązanie z fakturą imienną w historii płatności).
DROP POLICY IF EXISTS individual_sales_self_select ON public.individual_sales_register;
CREATE POLICY individual_sales_self_select ON public.individual_sales_register
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
