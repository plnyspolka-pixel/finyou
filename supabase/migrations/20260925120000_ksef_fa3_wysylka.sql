-- =====================================================================
-- KSeF 2.0: wysyłka faktur FA(3) w sesji interaktywnej + zwolnienia z VAT
-- =====================================================================

-- Podmioty: podstawa zwolnienia (P_19A) i limit zwolnienia podmiotowego (art. 113).
ALTER TABLE public.accounting_entities
  ADD COLUMN IF NOT EXISTS vat_exemption_basis text,
  ADD COLUMN IF NOT EXISTS vat_exempt_limit numeric(14,2);

COMMENT ON COLUMN public.accounting_entities.vat_exemption_basis IS
  'Podstawa prawna zwolnienia z VAT drukowana na fakturze (FA(3) P_19A), np. art. 43 ust. 1 pkt 38 ustawy o VAT albo art. 113 ust. 1 ustawy o VAT.';
COMMENT ON COLUMN public.accounting_entities.vat_exempt_limit IS
  'Limit sprzedaży w roku dla zwolnienia podmiotowego (art. 113). Wystawienie faktury przekraczającej limit jest blokowane.';

-- Faktury: podstawa zwolnienia per faktura + ślad wysyłki do KSeF.
ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS vat_exemption_basis text,
  ADD COLUMN IF NOT EXISTS ksef_session_reference text,
  ADD COLUMN IF NOT EXISTS ksef_invoice_reference text,
  ADD COLUMN IF NOT EXISTS ksef_status_code integer,
  ADD COLUMN IF NOT EXISTS ksef_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS ksef_xml text;

COMMENT ON COLUMN public.sales_invoices.ksef_xml IS
  'XML FA(3) dokładnie w postaci wysłanej do KSeF (skrót musi się zgadzać z UPO).';

CREATE INDEX IF NOT EXISTS idx_sales_invoices_ksef_pending
  ON public.sales_invoices (entity_id)
  WHERE ksef_status = 'pending' AND ksef_invoice_reference IS NOT NULL;

-- ---------------------------------------------------------------------
-- Konfiguracja podmiotów (po NIP; adres uzupełniany tylko, gdy pusty)
-- ---------------------------------------------------------------------

-- Finance You Sp. z o.o. — usługi pośrednictwa/udzielania pożyczek zwolnione
-- przedmiotowo (art. 43 ust. 1 pkt 38 ustawy o VAT): podstawa trafia na każdą
-- fakturę z pozycją „zw”. Domyślna stawka (używana m.in. przy automatycznych
-- fakturach za dostęp do platformy) pozostaje bez zmian — decyzja księgowej.
UPDATE public.accounting_entities
SET provider = 'ksef',
    vat_exemption_basis = COALESCE(vat_exemption_basis, 'art. 43 ust. 1 pkt 38 ustawy o VAT'),
    address_street = COALESCE(NULLIF(address_street, ''), 'ul. Nowogrodzka 31'),
    address_postal_code = COALESCE(NULLIF(address_postal_code, ''), '00-511'),
    address_city = COALESCE(NULLIF(address_city, ''), 'Warszawa'),
    address_country = COALESCE(NULLIF(address_country, ''), 'PL'),
    regon = COALESCE(NULLIF(regon, ''), '365350668'),
    ksef_nip = COALESCE(NULLIF(ksef_nip, ''), nip)
WHERE nip = '7010611803';

-- Fundacja im. Pieczaka — zwolnienie podmiotowe (sprzedaż poniżej limitu).
-- Adres trzeba uzupełnić w panelu (/admin/ksiegowosc/podmioty) — bez niego
-- wysyłka do KSeF jest blokowana przed nadaniem numeru.
UPDATE public.accounting_entities
SET provider = 'ksef',
    vat_payer = false,
    default_vat_rate = 'zw',
    vat_exemption_basis = COALESCE(vat_exemption_basis, 'art. 113 ust. 1 ustawy o VAT'),
    vat_exempt_limit = COALESCE(vat_exempt_limit, 200000),
    ksef_nip = COALESCE(NULLIF(ksef_nip, ''), nip)
WHERE nip = '9462747637';
