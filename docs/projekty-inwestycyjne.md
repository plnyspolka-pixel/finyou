# Zamknięty moduł projektów inwestycyjnych

Moduł umożliwia wyłącznie imiennie zweryfikowanym i indywidualnie dopuszczonym
inwestorom otrzymywanie czasowo przypisanych projektów pożyczkowych z
niewidocznej puli wewnętrznej. Inwestor nigdy nie przegląda wspólnego katalogu —
projekty są dobierane serwerowo („Dobierz projekty dla mnie”) i prezentowane
jako mobilne karty w stylu Tindera (zdjęcie, kwota, rodzaj nieruchomości,
miejscowość). Pełne dane projektu stają się dostępne dopiero po wyrażeniu
zainteresowania (pełna karta: szczegóły + analiza ryzyka + kalkulator
propozycji).

Moduł działa w istniejącej aplikacji (TanStack Start + Supabase + panel
`/inwestor` + `/admin`), na istniejącym logowaniu i rolach. Nie jest osobną
aplikacją.

## Zasada nadrzędna bezpieczeństwa

Ukrycie UI nie wystarcza. Każde zapytanie przechodzi przez server functions
(`createServerFn` + `requireSupabaseAuth`), które przed zwróceniem
jakichkolwiek danych projektu sprawdzają po stronie serwera:

1. zalogowanego użytkownika (Bearer token → `userId`),
2. status `approved_investor` w `project_module_access`,
3. istnienie **aktywnego** przypisania w `project_assignments`,
4. zgodność `investor_id` z zalogowanym użytkownikiem,
5. brak wygaśnięcia (czas serwera, nie urządzenia),
6. status projektu.

RLS w Supabase stanowi drugą, niezależną warstwę: inwestor widzi wyłącznie
własne wiersze `project_assignments` / `project_proposals` /
`project_module_acceptances` i **nie ma żadnej** polityki SELECT na
`investment_projects` (pula jest niewidoczna nawet przy bezpośrednim zapytaniu
do PostgREST). Dane projektu do UI trafiają wyłącznie w kształcie dobranym
przez server function (teaser albo pełna karta), nigdy jako surowy wiersz.

Zdjęcia i dokumenty leżą w prywatnym buckecie `pliki-klienta` i są podpisywane
krótkotrwałymi signed URL-ami dopiero po serwerowej weryfikacji przypisania.
Otwarcia dokumentów są logowane (`project_document_access_log`), a podgląd
nakłada dynamiczny znak wodny (imię i nazwisko inwestora, ID konta, data).

## Statusy użytkownika w module (`project_module_access.status`)

`course_user` → (aplikacja jednym klikiem) → `kyc_pending` →
`compliance_review` → `approved_investor`
→ (`access_suspended` / `access_revoked`)

Uproszczony proces aplikacji: „Aplikuj o dostęp” nie ma formularza preferencji
— złożenie aplikacji od razu przenosi użytkownika do KYC. Statusy
`module_application_pending` / `module_application_rejected` pozostają w
schemacie dla historycznych aplikacji oraz decyzji `needs_more_info` /
`additional_review` / `rejected` administratora.

- Zakup szkolenia / płatny abonament inwestora **nie** daje dostępu do modułu.
- Pozytywne KYC samo w sobie **nie** aktywuje dostępu — ostateczną decyzję
  podejmuje administrator Finance You po komplecie: KYC (Didit) + screening
  sankcyjny/PEP (Dilisense) + akceptacje dokumentów (umowa dostępu, NDA,
  ostrzeżenie o ryzyku).
- Aktywny status `approved_investor` daje również pełny dostęp inwestora do
  „Dostępnych wniosków” w panelu `/inwestor` (funkcja
  `investor_module_access_active` włączona do `investor_has_full_access` —
  migracja `20260802120000_module_access_full_investor.sql`). Relacja odwrotna
  nadal nie zachodzi: płatny abonament nie otwiera modułu projektów.
- Dostęp jest imienny; admin może go zawiesić lub cofnąć (z powodem, z wpisem
  audytowym).

## Integracje

- **Didit (KYC)** — używamy istniejącego klienta `src/lib/didit.server.ts`
  i istniejącego webhooka `supabase/functions/didit-webhook` (sesja trafia do
  `didit_verifications`, webhook aktualizuje ją po `session_id`). Moduł zapisuje
  w `project_module_access`: identyfikator sesji, daty rozpoczęcia/zakończenia,
  wynik, datę ostatniej aktualizacji i minimalny wymagany zakres danych
  (minimalizacja danych — nie kopiujemy dokumentów). Statusy modułowe:
  `not_started / pending / approved / manual_review / rejected / expired`.
- **Dilisense (screening)** — istniejący klient `src/lib/aml/dilisense.server.ts`
  (cache w `dilisense_cache`, tworzonej idempotentnie w migracji modułu).
  Wynik klasyfikowany do: `clear / possible_match / manual_review /
  confirmed_sanctions_match / pep_review_required`. Potwierdzone trafienie
  sankcyjne blokuje dostęp; PEP nie odrzuca automatycznie — kieruje do analizy.
- **E-mail** — `sendResendEmail` (istniejący helper); treść przypomnień nie
  ujawnia szczegółów projektu.
- **Kalkulator** — istniejący silnik `buildEngineSchedule`
  (`src/lib/contract-engine/loan-schedule.ts`); wszystkie wyliczenia propozycji
  są wykonywane/weryfikowane serwerowo przed zapisem.

## Nowe tabele (wszystkie addytywne — żadna istniejąca tabela nie jest zmieniana)

| Tabela | Rola |
|---|---|
| `project_module_settings` | jednowierszowa konfiguracja (limity kart, godziny 24/12/48, próg odrzuceń, progi LTV) |
| `project_module_access` | status użytkownika w module + metadane KYC/screeningu/aktywacji |
| `project_module_applications` | aplikacja o dostęp (uproszczona, bez formularza preferencji) + decyzja administratora |
| `project_module_screenings` | wyniki Dilisense (tylko personel) |
| `project_module_acceptances` | wersjonowane akceptacje dokumentów |
| `project_module_audit_log` | nieusuwalny log audytowy (trigger blokuje UPDATE/DELETE) |
| `investment_projects` | wewnętrzna pula projektów (bez żadnej polityki SELECT dla inwestorów) |
| `investment_project_versions` | snapshoty wersji projektu (zmiana istotnych parametrów = nowa wersja) |
| `project_assignments` | czasowe, indywidualne przypisania (partial-unique: jedno aktywne na projekt) |
| `project_assignment_notifications` | dedupe przypomnień (12h/3h/30m, terminy propozycji) |
| `project_proposals` | niezmienne, wersjonowane propozycje finansowania |
| `project_info_requests` | pytania „Poproś o dodatkowe informacje” |
| `project_document_access_log` | log otwarć/pobrań dokumentów |
| `dilisense_cache` | cache odpowiedzi Dilisense (`IF NOT EXISTS` — używany już przez klienta AML) |

## Atomowość przypisań

Przypisania tworzy funkcja SQL `project_claim_assignment(...)`
(SECURITY DEFINER, EXECUTE tylko dla `service_role`): blokuje wiersz projektu
`FOR UPDATE`, ponownie sprawdza status projektu, brak aktywnego przypisania,
status inwestora i limit aktywnych kart, po czym wstawia przypisanie i
przestawia projekt na `temporarily_assigned` w jednej transakcji. Równoczesne
kliknięcia dwóch inwestorów nie mogą przypisać tego samego projektu — dodatkowo
pilnuje tego partial-unique index na `project_assignments(project_id)` dla
statusów aktywnych. Decyzje (`interested`/`rejected`), przedłużenie i otwarcie
karty również przechodzą przez funkcje SQL z blokadą wiersza i są idempotentne.

## Cykl życia przypisania

- 24 h od utworzenia (czas serwera); jedno przedłużenie o 12 h (maks. 36 h),
  tylko przed wygaśnięciem.
- Swipe/przyciski wywołują te same server functions; UI usuwa kartę dopiero po
  potwierdzeniu serwera (offline → komunikat + ponowienie).
- Odrzucenie natychmiast zwalnia projekt do puli (bez automatycznego wysłania
  konkretnej kolejnej osobie).
- `project_expire_assignments()` — wywoływana przez cron
  (`/api/public/hooks/project-assignments-tick`, pg_cron co 5 minut, guard
  `CRON_SECRET`/apikey jak pozostałe ticki) — idempotentnie wygasza przypisania
  po terminie i zainteresowania bez propozycji po terminie (domyślnie 48 h),
  zwalnia projekty i zapisuje log.
- Po N odrzuceniach/wygaśnięciach (konfigurowalne, domyślnie 5) projekt spada do
  `under_review` i wymaga przeglądu przez administratora.

## Statusy projektu i propozycji

Projekt: `draft, under_review, available_internal_pool, temporarily_assigned,
initial_interest, full_offer_review, offer_submitted, paused, withdrawn,
financed, closed`. Tylko `available_internal_pool` podlega dopasowaniu, i tylko
z zaakceptowanym zdjęciem głównym (brak zdjęcia = projekt oznaczony jako
wymagający uzupełnienia; nie używamy zdjęć zastępczych).

Propozycja: `draft, submitted, under_review, additional_information_required,
presented_to_borrower, accepted_for_negotiation, counteroffer, rejected,
withdrawn, expired, accepted, converted_to_transaction`. Po `submitted`
parametry są niezmienne (trigger); inwestor może wycofać, utworzyć nową wersję
albo odpowiedzieć na kontrpropozycję. Złożenie propozycji przestawia projekt na
`offer_submitted` i zatrzymuje dopasowywanie. Złożenie propozycji **nie** jest
zawarciem umowy pożyczki.

## Plan migracji (bezpieczny)

Wyłącznie addytywne pliki (nowe tabele/funkcje/trigger/cron), wszystkie
`IF NOT EXISTS` / `CREATE OR REPLACE` / `DROP POLICY IF EXISTS` w stylu
istniejących migracji. Nie modyfikujemy ani nie usuwamy żadnych istniejących
tabel, danych, polityk ani funkcji:

1. `20260722100000_project_module_core.sql` — dostęp, aplikacje, screeningi,
   akceptacje, ustawienia, log audytowy, `dilisense_cache`.
2. `20260722101000_project_pool.sql` — pula projektów + wersje.
3. `20260722102000_project_assignments.sql` — przypisania, powiadomienia,
   funkcje RPC (claim/open/extend/decide/expire).
4. `20260722103000_project_proposals.sql` — propozycje, pytania o informacje,
   log dostępu do dokumentów, trigger niezmienności.
5. `20260722104000_project_module_cron.sql` — pg_cron `project-assignments-tick`.

## Kod aplikacji

- `src/lib/projects/module-types.ts` — statusy, etykiety PL, typy współdzielone.
- `src/lib/projects/audit.server.ts` — pomocnik logu audytowego.
- `src/lib/projects/module-access.functions.ts` — stan modułu, aplikacja,
  akceptacje, start/refresh KYC (Didit).
- `src/lib/projects/matching.ts` + `matching.test.ts` — czysty ranking dopasowania.
- `src/lib/projects/risk.ts` + `risk.test.ts` — czysta analiza ryzyka
  (wynik, obszary, czerwone flagi, braki; progi LTV z ustawień).
- `src/lib/projects/assignments.functions.ts` — „Dobierz projekty dla mnie”,
  karty, decyzje, przedłużenie, statystyki.
- `src/lib/projects/proposals.functions.ts` — pełna karta, kalkulator
  (serwerowo), walidacje, składanie/wycofanie propozycji, „Moje propozycje”,
  pytania o informacje.
- `src/lib/projects/admin.functions.ts` — panel administratora (aplikacje,
  screeningi, decyzje, projekty, zdjęcia, przypisania, propozycje, logi).
- `src/lib/projects/lifecycle.server.ts` — wygaszanie + przypomnienia
  (używane przez tick).
- `src/routes/api/public/hooks/project-assignments-tick.ts` — endpoint crona.
- Trasy inwestora: `/inwestor/projekty` (gate + aplikacja + karty),
  `/inwestor/projekty/oferta/$assignmentId` (pełna karta),
  `/inwestor/projekty/propozycje`. Trasa admina: `/admin/projekty`.
- Nawigacja: pozycja „Projekty” w panelu inwestora (także na koncie darmowym —
  kursant widzi zablokowaną kartę i „Aplikuj o dostęp”), pozycja w panelu
  admina.

## Czego moduł świadomie nie robi (na tym etapie)

- Nie zawiera umowy pożyczki ani przesyłania pieniędzy.
- Nie łączy finansowania od kilku inwestorów (jedna propozycja = jeden inwestor).
- Nie ujawnia inwestorowi algorytmu dopasowania ani punktacji.
- Nie ujawnia danych kontaktowych pożyczkobiorcy przed dalszymi etapami.
