# Moduł AML dla inwestorów

Moduł przeciwdziałania praniu pieniędzy (AML) w panelu inwestora
(`/inwestor/aml`). Działa od pierwszego wejścia — bez aktywacji i bez
podpisu kwalifikowanego. Zakres ograniczony do tego, co konieczne:
weryfikacja klienta, ocena ryzyka, rejestr transakcji (z rejestrem
ponadprogowym), sprawy AML, przygotowanie zgłoszeń do GIIF i ewidencja ich
wysyłki.

Platforma **nie łączy się z API SI\*GIIF** (usunięto nieprzetestowaną
integrację mTLS/KMS/CSR i kolejkę wysyłek). Zgłoszenie wysyła inwestor —
elektronicznie w SI\*GIIF albo awaryjnie papierowo — a w module rejestruje
wysyłkę i dołącza potwierdzenie.

## Ekrany

| Ekran           | Ścieżka                    | Zakres                                                                                                 |
| --------------- | -------------------------- | ------------------------------------------------------------------------------------------------------ |
| Przegląd        | `/inwestor/aml`            | liczniki, braki profilu (ostrzeżenie, nie blokada)                                                     |
| Klienci         | `/inwestor/aml/klienci`    | profil AML, CRBR (beneficjenci/reprezentanci/rozbieżności), screening Dilisense, ocena trafień         |
| Oceny ryzyka    | `/inwestor/aml/ryzyko`     | propozycja systemu + ostateczna decyzja inwestora (zmiana wymaga uzasadnienia)                         |
| Transakcje      | `/inwestor/aml/transakcje` | rejestr transakcji + rejestr ponadprogowy (15 000 EUR wg NBP, termin 7 dni, decyzje, „raportuje bank") |
| Sprawy AML      | `/inwestor/aml/sprawy`     | sprawy z klienta/screeningu/CRBR/ryzyka/transakcji/rejestru/ręcznie                                    |
| Zgłoszenia GIIF | `/inwestor/aml/zgloszenia` | przygotowanie, XML+PDF, wysyłka (SI\*GIIF albo papier), potwierdzenia UPO/ZPO                          |
| Ustawienia      | `/inwestor/aml/ustawienia` | osoba odpowiedzialna (auto z profilu), osoba podpisująca, instytucja, audyt                            |

## Osoba odpowiedzialna

Przy pierwszym wejściu `getAmlSettings` tworzy `aml_settings` automatycznie z
profilu inwestora (`profiles` + `investors`): imię, nazwisko, stanowisko,
e-mail, telefon, organizacja, NIP i adres. Braki są tylko ostrzeżeniem —
wymagane dopiero przed wygenerowaniem finalnego zgłoszenia. W ustawieniach
można zmienić osobę odpowiedzialną i wskazać inną osobę podpisującą.

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

1. **Przygotowanie** — automatyczne zebranie danych (instytucja, osoba
   odpowiedzialna, klient, reprezentanci, beneficjenci, strony, rachunki,
   kwoty, umowa, uzasadnienie, załączniki) i kontrola kompletności.
2. **Generowanie XML + PDF** — wersjonowanie i SHA-256 dokumentów, pobranie.
3. **Wysyłka** (przycisk „Wyślij") — jedna z dwóch ścieżek:
   - **Elektronicznie w SI\*GIIF** (ścieżka ustawowa, zalecana): inwestor
     loguje się do SI\*GIIF, wprowadza zgłoszenie i podpisuje je
     kwalifikowanym podpisem elektronicznym / kwalifikowaną pieczęcią
     (własnym — patrz „Model wysyłki” niżej). Profil zaufany nie wystarcza.
     W module wpisuje identyfikator zgłoszenia i dołącza UPO.
   - **Papierowo — bez podpisu kwalifikowanego (awaryjnie)**: inwestor podaje
     przyczynę, moduł generuje zawiadomienie do wydruku (HTML, pełne polskie
     znaki, „Drukuj → Zapisz jako PDF") z adresatem, podstawą prawną,
     danymi, uzasadnieniem, adnotacją o poufności (art. 54) i miejscem na
     podpis własnoręczny. Kopia i SHA-256 trafiają do archiwum zgłoszenia.
     Wysyłka listem poleconym za potwierdzeniem odbioru na adres:
     Generalny Inspektor Informacji Finansowej, Ministerstwo Finansów,
     ul. Świętokrzyska 12, 00-916 Warszawa. W module wpisuje się datę
     i numer nadania oraz dołącza dowód nadania / ZPO.
4. **Potwierdzenie** — UPO albo dowód nadania / ZPO można dołączyć od razu
   lub później (status „Potwierdzone (UPO / ZPO)").

Kanał i numer są zapisywane w `aml_reports` (`giif_status` = `si_giif` /
`paper`, `giif_submission_id`, `submitted_at`, `upo_storage_path`,
`giif_response`), bez zmian schematu bazy.

### Model wysyłki: każdy inwestor własnym podpisem

Każdy inwestor jest odrębną instytucją obowiązaną, więc wysyła zgłoszenia
sam, własnym kwalifikowanym podpisem elektronicznym (albo kwalifikowaną
pieczęcią swojej spółki). Finance You nie podpisuje ani nie wysyła zgłoszeń
za inwestorów — pieczęć Finance You identyfikowałaby Finance You, nie
inwestora. Wysyłka przez pełnomocnika nie jest obsługiwana w module.

Przewodnik „Przygotowanie do wysyłki zgłoszeń (SI\*GIIF)”
(`src/components/aml/giif-readiness.tsx`, na Przeglądzie i w Ustawieniach):

1. kwalifikowany podpis / pieczęć (dostawcy z rejestru NCCert, podpis
   zdalny bez czytnika),
2. rejestracja instytucji w SI\*GIIF formularzem identyfikującym (moduł
   pokazuje dane z profilu do przepisania),
3. wysyłka zgłoszeń z zakładki „Zgłoszenia GIIF”.

Kroki 1–2 inwestor oznacza sam (deklaracja, audytowana). Stan jest trzymany
w istniejącej kolumnie `aml_settings.giif_connection_status`:
`not_connected` → brak, `documents_signed` → ma podpis, `active` → ma podpis
i rejestrację (bez migracji bazy). Dopóki kroki nie są oznaczone, okno
wysyłki w SI\*GIIF pokazuje ostrzeżenie z odesłaniem do przewodnika
i do ścieżki papierowej.

### Czy ścieżka papierowa jest prawidłowa? (weryfikacja 09.2026)

**Tylko jako ścieżka awaryjna.** Ustawa AML (t.j. Dz.U. z 2025 r. poz. 644)
oraz rozporządzenie MF z 4.10.2018 r. (Dz.U. 2018 poz. 1946) przewidują
przekazywanie informacji i zawiadomień do GIIF środkami komunikacji
elektronicznej (SI\*GIIF), a rejestracja instytucji (formularz
identyfikujący) wymaga kwalifikowanego podpisu lub pieczęci. Nie
znaleźliśmy aktualnego przepisu, który czyniłby wersję papierową
równoważnym sposobem wykonania obowiązku przez instytucję obowiązaną.
Dlatego:

- **transakcje ponadprogowe (art. 72)** — papier jest zablokowany
  (wyłącznie SI\*GIIF),
- **zawiadomienia (art. 74, 86, 89)** — papier dozwolony z obowiązkową
  przyczyną; to udokumentowanie niezwłocznego działania, a zgłoszenie
  należy jak najszybciej przekazać także przez SI\*GIIF. Przed pierwszym
  użyciem warto
  potwierdzić tryb telefonicznie w GIIF.

Terminy: art. 74 — niezwłocznie, nie później niż 2 dni robocze od
potwierdzenia podejrzenia; art. 72 — 7 dni od transakcji.

## Bezpieczeństwo

- wszystkie tabele `aml_*` mają RLS: właściciel (`user_id = auth.uid()`) +
  personel wewnętrzny; klient, pośrednik ani inny inwestor nie widzą
  screeningu, ocen, spraw, zgłoszeń ani UPO,
- `aml_audit_log` jest nieusuwalny (INSERT-only, trigger blokuje
  UPDATE/DELETE) i rejestruje każdą zmianę statusu, decyzję, wygenerowanie
  dokumentów, wysyłkę (kanał) i dołączenie potwierdzenia,
- prywatny bucket `aml-private` (ścieżki per `user_id`),
- Finance You nie przechowuje podpisu kwalifikowanego, PIN-u ani klucza
  prywatnego podpisu inwestora — każdy inwestor używa własnego podpisu
  i własnego certyfikatu.

## Migracja bazy (status: `database_migration_pending`)

Migracja `supabase/migrations/20260720120000_aml_module.sql` nie została
jeszcze zastosowana. Kolejność wdrożenia:

1. zastosuj migrację (`supabase db push` albo panel Lovable Cloud/Supabase),
2. sprawdź, że wszystkie tabele `aml_*` istnieją i mają włączone RLS,
3. przetestuj izolację organizacji (drugi użytkownik nie widzi cudzych
   wierszy żadnej tabeli `aml_*` ani plików w `aml-private`),
4. uruchom Supabase Security Advisor i popraw wykryte problemy,
5. zregeneruj typy `Database` (`src/integrations/supabase/types.ts`),
6. usuń luźny dostęp `any` dla tabel `aml_*` (nagłówkowe
   `eslint-disable @typescript-eslint/no-explicit-any` w plikach AML) i
   zastąp go wygenerowanymi typami — wzorzec `wind_*` nie jest
   uzasadnieniem trwałego `any`.

## Testy

Testy jednostkowe: `bun run test` (`src/lib/aml/aml.test.ts`) — XML GIIF,
próg EUR, propozycja ryzyka, PDF, zawiadomienie papierowe.
