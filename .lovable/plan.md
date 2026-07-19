# Integracja z CRBR — plan

## Ważna sprawa o samym API (przeczytaj najpierw)

CRBR **nie ma publicznego, otwartego REST API**. Ministerstwo Finansów udostępnia dwie drogi:

1. **Oficjalna: SOAP `ApiPrzegladoweCRBR`** (`https://bramka.crbr.mf.gov.pl:5058/…/2022/12/01`).
   - Wymaga podpisywania żądań XAdES kwalifikowanym certyfikatem oraz rejestracji podmiotu w MF.
   - To jest jedyna droga, która daje realne, powtarzalne odpowiedzi produkcyjne (ok. **50 zapytań / dobę na podmiot**).
2. **Wewnętrzny endpoint strony `crbr.podatki.gov.pl/adcrbr/api/wyszukajSpolke`** — używany przez frontend gov.pl.
   - **Wymaga tokena reCAPTCHA** (sprawdzone: bez tego zwraca `1022 Niepoprawny NIP` nawet dla poprawnych NIP-ów).
   - Nie ma umowy publicznej, ryzyko blokady i naruszenia ToS.

**Rekomendacja:** implementujemy SOAP jako właściwą integrację. Wymaga to od Ciebie jednorazowo:
- kwalifikowanego certyfikatu (ten sam, którym podpisujesz JPK/KSeF),
- rejestracji podmiotu w CRBR (jeśli jeszcze nie masz).

Do czasu wgrania certyfikatu funkcja odpowiada `status: "not_configured"` i UI pokazuje przycisk „Skonfiguruj CRBR" zamiast błędu.

## Zakres (potwierdzony przez Ciebie)

- **Widget `CompanyLookupInline`** — po pobraniu danych z GUS/KRS automatycznie doczytujemy beneficjentów po NIP (wynik z cache, ważny 90 dni).
- **AML wniosków pożyczkowych (firma jako pożyczkobiorca)** — automatyczne pobranie CRBR na wejściu wniosku firmowego + flaga `aml_status` (`ok` / `mismatch` / `missing` / `not_configured`) do przeglądu operatora.

## Zmiany w bazie (jedna migracja)

- `crbr_cache`
  - `nip` (PK), `krs`, `nazwa_spolki`, `forma_organizacyjna`
  - `beneficjenci` (jsonb: imię, nazwisko, PESEL/data urodzenia, obywatelstwa, charakter uprawnienia, procent udziału)
  - `raw_response` (jsonb — surowy XML sparsowany do JSON, do audytu),
  - `fetched_at`, `expires_at` (fetched_at + 90 dni), `error_code`, `error_message`
  - RLS: SELECT dla `authenticated`, ALL dla `service_role` (jak `gus_bdl_cache`, `krs_cache`).
- `loan_applications.aml_status` (text) + `loan_applications.aml_checked_at` (timestamptz) — dla AML.

## Backend

- `src/lib/crbr.server.ts`
  - Builder SOAP + XAdES (biblioteka `xml-crypto` już nie jest w projekcie — dołożymy tylko jeśli certyfikat jest ustawiony; bez cert konfiguracji nie ładujemy modułu na Workerze).
  - Funkcja `fetchCrbrByNip(nip)`: cache-first (90 dni), przy miss → SOAP → zapis do `crbr_cache`.
  - Guard `hasCrbrConfig()` sprawdza `CRBR_CERT_PEM` + `CRBR_KEY_PEM` (secrets).
- `src/lib/crbr.functions.ts`
  - `getCrbrForCompany({ nip })` — `createServerFn` + `requireSupabaseAuth`. Zwraca `{ status, spolka, beneficjenci, fetchedAt, expiresAt }`.
  - `refreshCrbrForCompany({ nip })` — wymusza pobranie (dla admina/operatora, `has_role`).
- `src/lib/lead-enrichment.server.ts` — w `maybePromoteLeadToApplication` (lub równolegle w `promoteLeadToApplication`) dokładamy krok: jeżeli `borrower_type = firma` i mamy NIP → `fetchCrbrByNip` → wyliczamy `aml_status`:
  - `ok` — właściciel KW (imię+nazwisko) występuje jako beneficjent,
  - `mismatch` — CRBR ma innych beneficjentów niż KW,
  - `missing` — brak wpisu CRBR dla NIP,
  - `not_configured` — brak certyfikatu.

## Frontend

- `src/components/company-lookup-inline.tsx` — po sukcesie GUS/KRS wołamy `getCrbrForCompany`. Wynik przekazujemy w rozszerzonym `ResolvedCompany` (`beneficjenci`, `crbrStatus`, `crbrFetchedAt`).
- Nowy komponent `src/components/crbr-beneficiaries.tsx` — lista beneficjentów (imię, nazwisko, udział, charakter uprawnienia, obywatelstwa) + przycisk „Odśwież CRBR" (tylko admin/operator, dobiera `refreshCrbrForCompany`).
- Wpięcie w miejscach, gdzie już żyje `CompanyLookupInline`: faktury operatora, klienci instytucjonalni, panel inwestora, wnioski firmowe.
- W widoku wniosku (`admin.wnioski.$id.tsx`, `posrednik.wnioski.$id.tsx`) na karcie „Klient/Firma" dokładamy sekcję CRBR + badge `aml_status`.

## Sekrety do dodania (Ty)

- `CRBR_CERT_PEM` — certyfikat kwalifikowany w PEM.
- `CRBR_KEY_PEM` — klucz prywatny w PEM.
- (opcjonalnie) `CRBR_ENDPOINT` — nadpisanie URL (default: `https://bramka.crbr.mf.gov.pl:5058/uslugiBiznesowe/uslugiESB/AP/ApiPrzegladoweCRBR/2022/12/01`).

Poproszę Cię o nie osobnym promptem `add_secret`, kiedy szkielet będzie gotowy — dzięki temu jak wgrasz certyfikat, zapytania od razu działają.

## Czego NIE robię

- Nie wpinam CRBR w rejestrację inwestora (nie było w scope).
- Nie łamię ToS na frontendowym endpoincie z reCAPTCHA — proponuję SOAP.
- Nie ruszam kalkulatora, prowizji FY, ani schematu Tpay.

---

**Pytanie do Ciebie:** idziemy w SOAP (poproszę o certyfikat po zbudowaniu szkieletu), czy wolisz na razie tylko szkielet + cache + UI (bez realnego pobierania), żebyś potem podpiął certyfikat?
