# Moduł AML dla inwestorów

Kompletny moduł przeciwdziałania praniu pieniędzy (AML) w panelu inwestora
(`/inwestor/aml`). **Cały moduł jest dostępny od pierwszego wejścia** — bez
aktywacji, bez konfiguracji SI\*GIIF i bez podpisu kwalifikowanego. Podpis
kwalifikowany jest potrzebny dopiero przy faktycznej wysyłce zgłoszenia do
GIIF (przycisk „Podpisz i zgłoś do GIIF").

## Ekrany

| Ekran | Ścieżka | Zakres |
|---|---|---|
| Przegląd | `/inwestor/aml` | liczniki, braki profilu (ostrzeżenie, nie blokada), stan połączenia SI\*GIIF |
| Klienci i weryfikacje | `/inwestor/aml/klienci` | profil AML, CRBR (beneficjenci/reprezentanci/rozbieżności), screening Dilisense, ocena trafień |
| Oceny ryzyka | `/inwestor/aml/ryzyko` | propozycja systemu + ostateczna decyzja inwestora (zmiana wymaga uzasadnienia) |
| Transakcje | `/inwestor/aml/transakcje` | rejestr transakcji (auto / ręczne / bankowe), potwierdzanie wykonania |
| Transakcje ponadprogowe | `/inwestor/aml/ponadprogowe` | próg 15 000 EUR wg kursu NBP, termin 7 dni, decyzje, „raportuje bank" |
| Sprawy AML | `/inwestor/aml/sprawy` | sprawy z klienta/screeningu/CRBR/ryzyka/transakcji/rejestru/ręcznie |
| Zgłoszenia GIIF | `/inwestor/aml/zgloszenia` | przygotowanie, XML+PDF, wersje+hash, zatwierdzenie, pakiet, podpis i wysyłka |
| UPO i odpowiedzi | `/inwestor/aml/upo` | statusy, odpowiedzi GIIF, pobieranie UPO |
| Ustawienia AML | `/inwestor/aml/ustawienia` | osoba odpowiedzialna (auto z profilu), osoba podpisująca, instytucja, środowisko |

## Osoba odpowiedzialna

Przy pierwszym wejściu `getAmlSettings` tworzy `aml_settings` automatycznie z
profilu inwestora (`profiles` + `investors`): imię, nazwisko, stanowisko,
e-mail, telefon, organizacja, NIP i adres. Braki są tylko ostrzeżeniem —
wymagane dopiero przed wygenerowaniem finalnego zgłoszenia. W ustawieniach
można zmienić osobę odpowiedzialną, dodać osobę uprawnioną i wskazać inną
osobę podpisującą.

## Screening Dilisense

- osoba fizyczna → `GET /v1/checkIndividual` (names, dob, fuzzy_search=1),
- firma → `GET /v1/checkEntity` (names, fuzzy_search=1) + `checkIndividual`
  dla reprezentantów i beneficjentów z CRBR,
- wywołania wyłącznie z backendu; klucz `DILISENSE_API_KEY` w sekretach,
  cache 24 h w `dilisense_cache`,
- statusy: `not_started, in_progress, clear, review_required,
  approved_after_review, blocked, error, invalidated`,
- oceny trafień: `false_positive, confirmed_pep, confirmed_sanction,
  confirmed_criminal, unresolved`; **potwierdzona sankcja i trafienie
  nierozstrzygnięte blokują zawarcie umowy**,
- zmiana danych klienta/reprezentantów/beneficjentów przed umową unieważnia
  screening (fingerprint) i wymusza jego powtórzenie.

## Rejestr ponadprogowy

Dla wykonanej transakcji liczona jest równowartość EUR według średniego kursu
NBP (tabela A) z dnia transakcji (`api.nbp.pl`, cofanie do ostatniego dnia
roboczego). Powyżej 15 000 EUR: wpis w rejestrze z kursem, datą i numerem
tabeli NBP, terminem 7 dni i wymaganą decyzją. Gotówka → domyślnie
`reportable`; przelew → bez domyślnej decyzji, z opcją „raportuje bank lub
inny dostawca usług płatniczych". Transakcja ponadprogowa nie jest
automatycznie podejrzana — można dla niej niezależnie utworzyć sprawę AML.

## Zgłoszenia GIIF

Bez podpisu działa: automatyczne zebranie danych (instytucja, osoba
odpowiedzialna, klient, reprezentanci, beneficjenci, strony, rachunki, kwoty,
umowa, uzasadnienie, załączniki), kontrola kompletności, podgląd, PDF, XML
zgodny ze strukturą GIIF (walidacja strukturalna + miejsce na kanoniczny XSD
z dokumentacji GIIF), wersjonowanie i SHA-256 dokumentów, zatwierdzenie
treści, pobranie pakietu.

„Podpisz i zgłoś do GIIF":

- **Wariant A** (aktywne połączenie): finalny dokument → podpis kwalifikowany
  LOKALNIE (CAdES/PKCS#7) → weryfikacja podpisu → szyfrowanie certyfikatem
  GIIF (CMS EnvelopedData) → wysyłka mTLS → identyfikator zgłoszenia → status
  → UPO. **PIN i klucz podpisu nigdy nie są pobierane ani zapisywane.**
- **Wariant B** (brak połączenia): kontekstowy kreator rejestracji SI\*GIIF
  bez opuszczania zgłoszenia — dane z profilu, dokument rejestracyjny, klucz
  + CSR (klucz w kopercie „KMS"), podpis lokalny, wysyłka rejestracji,
  pobranie certyfikatu, kontrola zgodności z CSR, test mTLS i automatyczny
  powrót do przygotowanego zgłoszenia.

## Infrastruktura

`src/lib/aml/`: generator XML + walidator (`giif-xml.server.ts`), PDF
(`giif-pdf.server.ts`), CSR/CMS/szyfrowanie/KMS (`crypto.server.ts`),
GIIF Connector z kolejką wysyłek, idempotencją (nagłówek `Idempotency-Key` +
obsługa 409), ponowieniami (backoff, 503/timeout), statusami (w tym „X") i
UPO (`giif-connector.server.ts`), kurs EUR NBP (`nbp-eur.server.ts`),
Dilisense (`dilisense.server.ts`), audyt (`audit.server.ts`).

Sekrety środowiska:

- `DILISENSE_API_KEY` — klucz Dilisense (tylko backend),
- `AML_KMS_MASTER_KEY` — master-klucz koperty KMS dla kluczy certyfikatów
  komunikacyjnych (produkcyjnie: prawdziwy KMS/HSM),
- `GIIF_ENCRYPTION_CERT_PEM` — certyfikat GIIF do szyfrowania pakietów,
- `GIIF_MOCK=true` — tryb symulacji SI\*GIIF (wyłącznie dev/test),
- binding Cloudflare `GIIF_MTLS` (`wrangler mtls-certificate`) — certyfikat
  komunikacyjny mTLS.

## Bezpieczeństwo

- wszystkie tabele `aml_*` mają RLS: właściciel (`user_id = auth.uid()`) +
  personel wewnętrzny; klient, pośrednik ani inny inwestor nie widzą
  screeningu, ocen, spraw, zgłoszeń ani UPO,
- `aml_audit_log` jest nieusuwalny (INSERT-only, trigger blokuje
  UPDATE/DELETE) i rejestruje każdą zmianę statusu, decyzję, podpis, wysyłkę
  i odpowiedź GIIF,
- prywatny bucket `aml-private` (ścieżki per `user_id`),
- klucze certyfikatów komunikacyjnych wyłącznie w kopercie KMS
  (w tabeli tylko `kms_key_ref`), nigdy we frontendzie,
- Finance You nie przechowuje podpisu kwalifikowanego, PIN-u ani klucza
  prywatnego podpisu inwestora — każdy inwestor używa własnego podpisu
  i własnego certyfikatu.

## Środowiska SI\*GIIF i testy

- test: `https://test.giif.mofnet.gov.pl/api/rest2018`
- produkcja: `https://www.giif.mofnet.gov.pl/api/rest2018`

Nigdy nie używaj testowych certyfikatów i danych w produkcji.

Testy jednostkowe: `bun run test` (`src/lib/aml/aml.test.ts`).
Testy integracyjne środowiska testowego: `bun scripts/giif-e2e-test.ts`
(checklista: rejestracja, CSR, certyfikat, mTLS, syntetyczna transakcja
ponadprogowa, syntetyczne zawiadomienie, załącznik, status, UPO, błędny XML,
niepoprawny podpis, duplikat, 409, oczekiwanie 503, status X, ponowienie bez
podwójnej wysyłki). Ścieżki endpointów rest2018 należy potwierdzić z aktualną
dokumentacją dystrybuowaną przez GIIF po testowej rejestracji instytucji —
do tego czasu pełny przebieg potoku można zweryfikować z `GIIF_MOCK=true`.
