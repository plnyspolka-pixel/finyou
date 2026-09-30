ALTER TABLE public.accounting_entities
  ADD COLUMN IF NOT EXISTS vat_exemption_basis text;
COMMENT ON COLUMN public.accounting_entities.vat_exemption_basis IS
  'Podstawa zwolnienia z VAT drukowana na fakturze i w KSeF (P_19A), np. art. 113 ust. 1 ustawy o VAT.';