## Cel

Dociągać XML źródłowy każdej faktury zakupowej/sprzedażowej z KSeF 2.0 do istniejącego pola `accounting_documents.xml_content`, dać w adminie eksport ZIP (XML + manifest CSV) i domknąć bezpieczeństwo hooka crona. Bez migracji, bez ruszania outboundu FA(2).

## Zakres zmian

### 1. Pobieranie XML w synchronizacji (`src/lib/accounting/sync-core.server.ts`)

- Po zbudowaniu wiersza z metadanych, jeśli mamy `ksefNumber` (`ref`) i w DB nie ma jeszcze `xml_content` dla danej pary `(entity_id, source, direction, external_id)`, dołożyć krok pobrania XML:
  - `GET {baseUrl}/api/v2/invoices/ksef/{ksefNumber}` z `Authorization: Bearer ${session.accessToken}`, `Accept: application/xml`.
  - Wywołać przez istniejący `ksefFetch` (już ma retry/backoff dla 429/503 z poszanowaniem `Retry-After`).
  - Jeśli odpowiedź zawiera nagłówek integralności (`x-ms-meta-hash` lub równoważny — sprawdzić `content-hash`/`x-ksef-hash`), policzyć `sha256Base64(xml)` (helper już jest w `src/lib/ksef/client.ts`) i porównać stałoczasowo. Mismatch → nie zapisujemy XML, zapisujemy tylko metadane + ostrzeżenie w `raw_payload.xml_fetch_error`.
  - Pole `xml_content` (TEXT, już istnieje) dostaje surowy XML; nic nowego w schemacie.
- Odstępy: dodać `await sleep(150–250 ms)` między pobraniami XML w obrębie kierunku, żeby nie wpaść w limit. Pre-check istnienia XML — jednym zapytaniem `select external_id where xml_content is not null` per (entity, direction), żeby uniknąć N zapytań.
- Skip, gdy `xml_content` już jest — czyli powtórne przebiegi crona są tanie.
- Osobny licznik `xml_fetched`/`xml_skipped` dorzucony do `SyncResult.message` (informacyjnie w UI statusu).
- Zero zmian w outbound / `ksefSubmitInvoice`.

### 2. Eksport paczki dla admina

Etap A — pobranie pojedynczego XML (fundament, tania praca):

- Nowa funkcja serwerowa w `src/lib/accounting/documents.functions.ts`:
  `getAccountingDocumentXml({ id })` — `requireSupabaseAuth` + `assertAccounting`, zwraca `{ filename, xml }`. Filename: `${ksef_reference_number || invoice_number || id}.xml`.
- W `src/routes/admin.ksiegowosc.dokumenty.tsx` na wierszu dokumentu przycisk „Pobierz XML" (widoczny gdy `ksef_reference_number` istnieje i XML w bazie jest; jeśli brak — disabled z tooltipem „Nie pobrano jeszcze XML z KSeF").

Etap B — ZIP dla wybranej spółki + zakresu dat:

- Nowa funkcja serwerowa `exportAccountingZip({ entityId, direction?, from, to })`:
  - `requireSupabaseAuth` + `assertAccounting`.
  - Pobiera dokumenty w zakresie z `xml_content is not null`, składa ZIP w pamięci (biblioteka `fflate` — pure JS, Worker-safe; sprawdzić w `package.json`, w razie braku dołożyć w build-mode).
  - Zawartość: `xml/{invoice_number || ksef_number}.xml` + `manifest.csv` (kolumny: kierunek, źródło, numer, data wystawienia, kontrahent, NIP, netto, VAT, brutto, waluta, ksef_ref, ma_xml). Ten sam schemat kolumn co dotychczasowy CSV — reużywamy formatowania (`cell`, `money`).
  - Zwraca `{ filename, base64 }`; komponent decoduje i triggeruje download (jak w istniejącym eksportcie CSV).
- Cap: max ~1000 faktur / ~50 MB per żądanie, przekroczenie → błąd z sugestią zawężenia zakresu (limity Workera).
- UI: w headerze `admin.ksiegowosc.dokumenty.tsx` obok „Eksport CSV" — „Eksport ZIP (XML + manifest)" z selektem podmiotu i zakresu (już są filtry w widoku, reużyć stan).

### 3. Zabezpieczenie `/api/public/hooks/sync-accounting`

Reużyć istniejący helper `requireCronSecret` z `src/lib/cron-auth.server.ts` (sprawdza nagłówek `x-cron-secret` lub `Authorization: Bearer` względem `CRON_SECRET` — sekret już jest w projekcie):

- Usunąć handler `GET`, zostawić tylko `POST`.
- Na wejściu: `const denied = requireCronSecret(request); if (denied) return denied;`.
- Odpowiedź błędu nie zawiera treści sekretu.
- Zmiana harmonogramu pg_cron: aktualizowany `net.http_post` musi dosyłać `x-cron-secret` (albo `Authorization: Bearer ${CRON_SECRET}`) — do zrobienia jednorazowym `supabase--insert` po zmergowaniu kodu (poza planem kodu, ale wymienić jako krok wdrożeniowy).

## Pliki do zmiany

- `src/lib/accounting/sync-core.server.ts` — dociąganie XML po metadanych + pre-check istnienia.
- `src/lib/accounting/documents.functions.ts` — `getAccountingDocumentXml`, `exportAccountingZip`.
- `src/routes/admin.ksiegowosc.dokumenty.tsx` — przycisk „Pobierz XML" per wiersz + „Eksport ZIP".
- `src/routes/api/public/hooks/sync-accounting.ts` — `requireCronSecret`, tylko POST.
- (build-mode) ewentualnie `bun add fflate`, jeśli nie ma go w projekcie.

## Testy / weryfikacja

- Ręczny run `syncKsef` na jednym podmiocie: sprawdzić w DB, że `xml_content` się wypełnia dla nowych faktur, powtórny run nie generuje ruchu (skip).
- Pobrać XML pojedynczej faktury z UI, otworzyć w edytorze — poprawny FA(2/3).
- Wygenerować ZIP dla podmiotu + miesiąca, rozpakować, sprawdzić manifest CSV i liczbę XML.
- `curl -X POST` na `/api/public/hooks/sync-accounting` bez sekretu → 401; z poprawnym `x-cron-secret` → 200. `GET` → 405/404.
- Sprawdzić logi na Cloudflare: brak `[unenv]`, brak timeoutów; jeśli ZIP przy dużym zakresie zbliża się do limitu — komunikat błędu, użytkownik zawęża zakres.

## Ryzyka (Cloudflare Worker + TanStack Start)

- **Nagłówek integralności**: KSeF 2.0 nie gwarantuje `x-ms-meta-hash` na tym endpoincie — jeśli go nie ma, weryfikację pomijamy (zapisujemy XML mimo to, bez błędu); logika ma to obsłużyć warunkowo, nie twardo wymagać.
- **Limit czasu funkcji**: przy pierwszym backfillu (setki faktur × pobranie XML) sync może się nie zmieścić. Mitigacja: cron leci co godzinę, pre-check `xml_content is not null` sprawia, że każdy przebieg dokłada partię; opcjonalnie hard cap `MAX_XML_PER_RUN` (np. 200) per kierunek.
- **429 z KSeF**: `ksefFetch` już to obsługuje, ale dokładamy trzeci strumień żądań — trzymamy sleep 150–250 ms + małe okno.
- **Rozmiar ZIP**: pamięć Workera ~128 MB; twardy cap na liczbę i rozmiar plików + jasny błąd.
- **fflate**: pure-JS, działa w Workerze (bez native). Gdyby nie było — dołożyć w build-mode.
- **Sekrety**: `CRON_SECRET` już istnieje w projekcie; nie logujemy, nie zwracamy w treści odpowiedzi. Tokeny KSeF pozostają w env (`KSEF_TOKEN_*`), bez zmian.
