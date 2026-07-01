
## Cel
Jedna spójna księgowość w `/admin/ksiegowosc`: wszystkie faktury sprzedaży i kosztowe z Fakturowo i KSeF (dla obu podmiotów: Finance You i Fundacja im. Pieczaka), z możliwością odświeżania, filtrowania i podglądu PDF/XML.

## Zakres

### 1. Baza — jedna tabela `accounting_documents`
Wspólny rejestr dla wszystkich dokumentów (zamiast tylko `sales_invoices`):
- `id`, `entity_id` (FK do `accounting_entities`)
- `direction` — `sales` | `purchase` (koszt)
- `source` — `fakturowo` | `ksef` | `manual`
- `external_id` (id w Fakturowo / numer KSeF), `invoice_number`
- `issue_date`, `sale_date`, `due_date`
- `counterparty_name`, `counterparty_nip`, `counterparty_address`
- `currency`, `net_amount`, `vat_amount`, `gross_amount`, `vat_rate`
- `items` (jsonb), `pdf_url`, `xml_content` (text, dla KSeF UPO/FA)
- `ksef_reference_number`, `ksef_status`
- `raw_payload` (jsonb — surowa odpowiedź API do debugu)
- `imported_at`, `created_at`, `updated_at`
- UNIQUE `(entity_id, source, direction, external_id)` — deduplikacja przy re-syncu

RLS: tylko `has_role('administrator')` i `has_role('ksiegowosc')`. GRANT dla `authenticated` + `service_role`.

Migracja przenosi istniejące `sales_invoices` do nowej tabeli (jako `direction='sales'`, `source` z pola `provider`).

### 2. Server functions do sync-u

`src/lib/accounting/sync-fakturowo.functions.ts`:
- `syncFakturowoForEntity({ entityId })` — dla podmiotu z konfiguracją Fakturowo pobiera listę dokumentów (sprzedaż + koszty) przez `api_zadanie=6` (lista) + `api_zadanie=5` (szczegóły), upsert do `accounting_documents`.
- Paginacja po datach (ostatnie 24 mies. na start; potem inkrementalnie od `imported_at`).

`src/lib/accounting/sync-ksef.functions.ts`:
- `syncKsefForEntity({ entityId, direction })` — używa `KSEF_TOKEN_*` z env (fallback per podmiot, tak jak w `ksef/client.ts`):
  - `POST /api/online/Query/Invoice/Sync` (Subject1 = sprzedaż, Subject2 = koszty)
  - iteracja stron, pobranie XML + metadanych każdej FV
  - upsert do `accounting_documents`
- Wykorzystuje autoryzację challenge → InitToken z `src/lib/ksef/client.ts`.

`syncAllAccounting()` — orkiestrator wywoływany z UI: iteruje po aktywnych podmiotach, wywołuje oba sync-e równolegle. Middleware `requireSupabaseAuth` + check `has_role`.

### 3. UI

`/admin/ksiegowosc` (index) — dashboard:
- Kafle: przychód netto / VAT należny / koszty netto / VAT naliczony / VAT do zapłaty (za wybrany miesiąc)
- Wykres miesięczny (sprzedaż vs koszty, 12 mies.)
- Przycisk **„Synchronizuj teraz"** (uruchamia `syncAllAccounting`) + status ostatniej synchronizacji per podmiot

`/admin/ksiegowosc/dokumenty` (nowa) — jedna tabela wszystkich dokumentów:
- Filtry: podmiot, kierunek (sprzedaż/koszt), źródło (Fakturowo/KSeF), okres, kontrahent, status KSeF
- Kolumny: nr, data, kontrahent, netto, VAT, brutto, źródło, status, akcje (PDF, XML, szczegóły)
- Export CSV

Istniejące `/admin/ksiegowosc/faktury` → alias na filtr `direction=sales`.
Nowa `/admin/ksiegowosc/koszty` → alias na filtr `direction=purchase`.

### 4. Cron
`pg_cron` co godzinę wywołuje `/api/public/hooks/sync-accounting` (chronione `apikey`), który uruchamia `syncAllAccounting` dla wszystkich aktywnych podmiotów.

## Uwagi techniczne
- KSeF Query API zwraca metadane; XML pobierany osobno przez `GET /api/online/Invoice/Get/{ksefRef}`.
- Fakturowo nie ma oficjalnego endpointu „lista faktur kosztowych" — używamy `api_zadanie=6` z `dokument_rodzaj=1` (koszt). Jeśli API zwróci błąd, oznaczamy sync jako częściowy i pokazujemy komunikat w UI.
- Deduplikacja opiera się na `(source, external_id)`, więc powtórne pobranie nie tworzy duplikatów.
- PDF-y dla KSeF generowane on-demand z XML przez `buildFaXml` odwrotnie (link do wizualizacji KSeF MF).

## Poza zakresem (na później)
- Automatyczne dekretowanie do JPK_V7
- Powiązania FV → płatność (istnieje już `payment_id` w `sales_invoices`, przeniesiemy)
- Załączniki (skany) do faktur kosztowych ręcznie dodawanych

## Pytanie
Czy iść z tym zakresem, czy najpierw MVP: **tylko pull z Fakturowo + KSeF → jedna tabela listująca wszystko, bez dashboardu i cronu** (żeby najszybciej zobaczyć dane w apce)?
