# Moduł „Potencjał lokalizacyjny nieruchomości"

Automatyczna preselekcja wniosków o finansowanie w Finance You na podstawie
numeru księgi wieczystej (KW), rodzaju nieruchomości oraz danych
statystyczno‑przestrzennych. Wynik służy **wyłącznie do ustalania kolejności i
zakresu analizy** — nie odrzuca definitywnie żadnego wniosku.

## Co robi

Dla poprawnego numeru KW moduł szacuje:

1. prawdopodobny obszar położenia nieruchomości (rozkład prefiks × rodzaj),
2. **szansę, że nieruchomość leży w okolicy większego skupiska ludzkiego**
   (`probability_good_location`) — to główna wielkość biznesowa; minimalna
   akceptowalna granica skupiska to **~20–30 tys. mieszkańców** (miasto ≥30 tys.,
   jego sąsiedztwo, FUA, klaster miejski lub ≥25 tys. ludności w promieniu 10 km;
   próg konfigurowalny: `nearSettlement.minPopulationWithin10Km`),
3. potencjał lokalizacyjny 0–100 (pomocniczy ranking),
4. priorytet skierowania do automatycznej pełnej analizy,

wraz ze wskaźnikiem pewności (`confidenceScore`) i przedziałem P10–mediana–P90.

**Rodzaj nieruchomości jest pomocniczy.** Gdy jest znany (mieszkanie / dom /
działka), doprecyzowuje rozkład lokalizacji. Gdy jest nieznany lub inny
(lokal usługowy, udział, „inna", brak), scoring działa dalej na rozkładzie
zagregowanym po wszystkich rodzajach — wynik zapisywany z
`property_type='any'` (od migracji `20260729100000`). Sygnał repertoryjny
(kalibrowany per prefiks × rodzaj) jest wtedy pomijany.

Strefy podmiejskie, gminy graniczące z miastami i funkcjonalne obszary miejskie
(FUA) są oceniane wysoko — dom/działka „na wsi”, ale kilka km od dużego miasta,
dostaje wysoką ocenę.

## Architektura (warstwy)

| Warstwa | Pliki | Odpowiedzialność |
|---|---|---|
| Rdzeń (czysty, testowalny) | `src/lib/location-scoring/*` | parser KW, log‑normalizacja, rozkład, wygładzanie bayesowskie, pewność, decyzja |
| Serwer | `src/lib/location-scoring.functions.ts` | autoryzacja, ładowanie danych, scoring, persystencja, priorytet wniosku |
| Baza | `supabase/migrations/20260725120000_location_scoring.sql` | tabele referencyjne, wyniki, obserwacje, konfiguracja, RLS |
| ETL | `scripts/location-scoring/*` | offline: promienie, FUA, sąsiedztwo, oceny bazowe, wagi rodzaju |
| UI | `src/components/location-scoring/*`, `src/routes/admin.potencjal-lokalizacyjny.tsx` | karta wniosku, lista, panel konfiguracji |

**PostGIS nie jest włączony w projekcie** (konwencja: lat/lng + indeksy
B‑drzewo). Ciężkie obliczenia przestrzenne wykonuje **offline** importer ETL, a
do bazy trafiają **gotowe agregaty** (`geo_unit_location_metrics`,
`property_type_location_weights`). Obsługa pojedynczego wniosku nie uruchamia
sumowań przestrzennych. Wymiana źródła danych nie wymaga zmiany API scoringowego
— zmienia się jedynie zawartość tabel `*_metrics` / `*_weights` i `data_version`.

## Numer KW jako dana wrażliwa

- Pełny numer KW **nie jest** zapisywany w tabelach analitycznych. Przechowujemy
  prefiks, numer repertoryjny (liczba) oraz **HMAC** znormalizowanego numeru
  (solony sekretem `LOCATION_SCORING_HMAC_SECRET`) do deduplikacji.
- W logach/UI numer jest maskowany: `RA1R/00****56/7`.
- Ustaw sekret w środowisku serwera:
  ```
  LOCATION_SCORING_HMAC_SECRET=<losowy, długi sekret>
  ```
  Bez sekretu obserwacje uczące (`recordLocationObservation`) są odrzucane
  (świadomie — nie zapisujemy niesolonych pseudonimów).

## Źródła danych (produkcja)

Moduł jest zaprojektowany pod oficjalne, otwarte zbiory:

- **TERYT** — granice i identyfikatory jednostek administracyjnych,
- **Bank Danych Lokalnych GUS** — https://bdl.stat.gov.pl/
- **Portal Geostatystyczny GUS** — https://portal.geo.stat.gov.pl/
- **NSP 2021** — ludność w siatce 125 × 125 m / 250 × 250 m / 1 km,
- dane o budynkach i mieszkaniach w siatce kilometrowej,
- **DEGURBA**, klastry miejskie, **FUA** —
  https://stat.gov.pl/statystyka-regionalna/jednostki-terytorialne/unijne-typologie-terytorialne-tercet/typologia-oparta-na-siatce-kilometrowej/
- mapa prefiksów wydziałów KW — **Ministerstwo Sprawiedliwości** + strony sądów.

Preferencja siatki: **125 m** → jeśli zbyt ciężka, **250 m** (kompromis) →
awaryjnie **1 km** (MVP).

> **Stan danych.** Aktywną warstwą referencyjną jest **`ms-teryt-2026-1`**
> (migracja `20260824130000_location_scoring_ms_teryt.sql`, generowana przez
> `scripts/location-scoring/ms-teryt-import.ts`): **pełne pokrycie 342
> prefiksów KW** z Rozporządzenia MS z 29.05.2026 (Dz.U. 2026 poz. 740, zał. 1)
> × **2477 gmin** LAU 2020 (EDJNet lau_centres / Eurostat GISCO) z realną
> ludnością, powierzchnią i populacyjnie ważonymi środkami. Źródła leżą w repo:
> `scripts/location-scoring/data/`. Przybliżone pozostają: DEGURBA (heurystyka
> ludność/gęstość), FUA (promień od miast ≥100/250 tys.) i promienie ludności
> (po środkach gmin, nie po siatce NSP) — docelowo zastępuje je pełny ETL
> `gus-import.ts` (GUGiK PRG + Eurostat DEGURBA/FUA + BDL). Starsze ziarna
> (seed-dev-1, seed-real-2) pozostają w historii wersji. Po imporcie nowej
> wersji danych tick **sam** cofa do kolejki wnioski `NEEDS_DATA` i `COMPLETED`
> liczone na starszej wersji (jednorazowo — bez pętli przeliczeń).

## Import danych (ETL)

Wymaga wcześniejszego zastosowania migracji `20260725120000_location_scoring.sql`.

```bash
# Ziarno DEV/TEST (bez zapisu do bazy — podgląd metryk i raportu jakości):
LOCATION_SCORING_DRY_RUN=1 bun run scripts/location-scoring/import.ts

# Import do bazy (idempotentny — można uruchamiać wielokrotnie):
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  bun run scripts/location-scoring/import.ts

# Dane produkcyjne — własny zestaw w formacie seed-data.json:
LOCATION_SCORING_SOURCE=/ścieżka/dataset.json \
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  bun run scripts/location-scoring/import.ts
```

Kroki importera (spec §16): normalizacja TERYT → granice → ludność → promienie
10/25/45 km (haversine) → FUA/DEGURBA → sąsiedztwo gmin → oceny bazowe → wagi
rodzaju nieruchomości → wersja danych → raport jakości (`location_scoring_import_jobs.stats`).

**Przygotowanie `dataset.json` z danych GUS:** wygeneruj plik w formacie
`seed-data.json` (klucze: `dataVersion`, `jurisdictionVersion`, `departments[]`
z `areas` = listą TERYT, `geoUnits[]`, `fua{}`). Dla pełnej siatki NSP zamień
przybliżone sumowanie po środkach gmin na sumowanie komórek 125/250/1000 m w
promieniu (pole `population_within_*` w `geo_unit_location_metrics`) — reszta
pipeline’u pozostaje bez zmian.

## Ponowne przeliczenie wyników

Zmiana konfiguracji **nie modyfikuje** historycznych wyników (są wersjonowane
`config_version` / `model_version` / `data_version`). Aby zastosować nowe
parametry lub nowe dane:

- pojedynczy wniosek — karta wniosku → zakładka **Lokalizacja** → „Przelicz
  ponownie” (server fn `runLocationScoring`),
- masowo — wywołaj `runLocationScoring` dla listy wniosków (np. z crona/skryptu
  serwerowego); tabela `location_scoring_results` zachowuje historię, a kolumny
  `loan_applications.location_*` są aktualizowane do najnowszego wyniku.

## Konfiguracja (panel administratora)

`/admin/potencjal-lokalizacyjny` — administrator zmienia wagi promieni, granice
normalizacji ludności, oceny roli obszaru, progi decyzyjne, siłę wygładzania
bayesowskiego (`lambda`) i minimalną próbę sygnału numeru repertoryjnego. Każdy
zapis tworzy **nową wersję** (`location_scoring_settings`).

## Model uczenia

Po pełnej analizie księgi zapisz obserwację (`recordLocationObservation`):
prefiks, numer repertoryjny, rodzaj, rzeczywisty TERYT/miejscowość, rzeczywistą
atrakcyjność i `good_location`. Estymacja jest korygowana **wygładzaniem
bayesowskim** (prior = model przestrzenny; `lambda` ≈ 50–100 obserwacji), więc
kilka przypadkowych obserwacji nie przeważa danych bazowych.

### Bramka sygnału numeru repertoryjnego — działa automatycznie

Sygnał z numeru repertoryjnego (środkowe cyfry KW) jest włączany **tylko** dla
dużej, zwalidowanej próby (`kw_number_range_statistics.validated_offline`). Flaga
`validated_offline` **nie jest ustawiana ręcznie** — po każdej nowej obserwacji
(`recordLocationObservation`) moduł automatycznie:

1. buduje adaptacyjne przedziały numerów dla grupy prefiks × rodzaj,
2. waliduje sygnał **czasowo** (train = starsze, test = nowsze obserwacje):
   sygnał musi obniżyć Brier na zbiorze testowym względem predykcji bazowej
   (base rate) o co najmniej 2%,
3. ustawia `validated_offline` = true tylko, gdy walidacja wypada pozytywnie i
   próba treningowa ≥ `serialSignalMinSample`.

Dzięki temu **bramka aktywuje się sama**, gdy dane to uzasadniają, i pozostaje
wyłączona dla małych/niestabilnych prób — bez ręcznej interwencji. Ręcznie można
też przeliczyć wszystkie grupy w panelu („Przelicz bramkę sygnału KW",
`recalibrateSerialRanges`).

## Testy

```bash
npx vitest run src/lib/location-scoring/
```

Pokrycie: normalizacja + cyfra kontrolna KW, log‑normalizacja, bazowa
atrakcyjność, zasięgi prefiksów (tylko miasto / miasto + podmiejskie / +
odległe), różnice mieszkanie/dom/działka, wygładzanie małej i dużej próby,
pomijanie sygnału repertoryjnego przy małej próbie, wersjonowanie, oraz **test
integracyjny** seed → metryki → rozkład → scoring → priorytet.

## Bezpieczeństwo / RLS

- Wszystkie tabele mają włączone RLS. Wyniki i obserwacje są **narzędziem
  wewnętrznym** — dostęp tylko `administrator`/`operator`; inwestor/klient nie
  widzi estymacji lokalizacji (spec §18).
- Siatka ludności (`population_grid_metrics`) — odczyt tylko
  `administrator`/`service_role`.
- Konfigurację zapisuje wyłącznie `administrator`.
- Klucz `service_role` używany jest **wyłącznie** po stronie serwera (ETL,
  operacje uprzywilejowane); nigdy w przeglądarce. Do autoryzacji nie używamy
  `user_metadata` — tylko `public.has_role()` i `user_roles`.
- Moduł **nie** scrapuje przeglądarki EKW i nie obchodzi CAPTCHA. Uczy się na
  księgach legalnie pozyskanych w toku obsługi wniosków oraz na otwartych
  zbiorach GUS.

## Walidacja modelu (backtest) — zaimplementowana i dostępna z panelu

Backtest jest **działającym kodem** (`src/lib/location-scoring/backtest.ts`,
server fn `runLocationBacktest`), nie tylko metodyką. Panel administratora
(„Kalibracja i backtest") uruchamia go jednym kliknięciem i pokazuje metryki:
precision, recall, ROC‑AUC, PR‑AUC, Brier score, calibration error, precision
spraw kierowanych automatycznie i pokrycie — liczone na **podziale czasowym**
(bez wycieku), z rozbiciem per rodzaj nieruchomości.

**Automatyczne strojenie progu.** `runLocationBacktest` dobiera próg
`AUTO_ANALYZE_HIGH` maksymalizujący pokrycie przy zachowaniu docelowego precision
(domyślnie ≥ 90%). Przycisk „Zastosuj jako nową wersję" zapisuje sugerowany próg
jako nową, wersjonowaną konfigurację. Jeżeli próba nie pozwala osiągnąć celu —
panel pokazuje **rzeczywisty** najlepszy precision i oznacza „cel nieosiągalny na
próbie" (bez deklarowania sztucznej pewności).

Dopóki nie ma zebranych par (predykcja, rzeczywistość), backtest zwraca notatkę
„zbyt mała próba", a moduł **działa na domyślnych, aktywnych wagach/progach**
(`cfg-default-1`, zaseedowana i aktywna w `location_scoring_settings`). Nie jest
wymagana żadna ręczna konfiguracja, aby moduł działał — kalibracja jedynie
poprawia progi w miarę napływu danych.

## Zadania dla Lovable / ops (zminimalizowane)

Wszystko, co dało się zrobić w kodzie, jest zrobione (schemat, RLS, domyślna
konfiguracja aktywna, importer, backtest, auto‑kalibracja, UI). Poza kodem
pozostają **tylko** czynności operacyjne, których z repozytorium wykonać nie
można:

1. **Zastosować migrację** `supabase/migrations/20260725120000_location_scoring.sql`
   (Lovable Cloud aplikuje migracje z katalogu przy wdrożeniu — zweryfikować, że
   przeszła; jest idempotentna).
2. **Ustawić sekret** środowiskowy serwera:
   `LOCATION_SCORING_HMAC_SECRET=<losowy, długi sekret>` — wymagany do zapisu
   obserwacji uczących (pseudonimizacja numeru KW). Bez niego scoring działa,
   ale uczenie na obserwacjach jest wstrzymane (świadomie).
3. **Zaimportować dane produkcyjne** (jednorazowo + przy aktualizacjach GUS):
   przygotować `dataset.json` z oficjalnych zbiorów (instrukcja wyżej) i uruchomić
   `LOCATION_SCORING_SOURCE=/ścieżka/dataset.json SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… bun run scripts/location-scoring/import.ts`.
   Do czasu importu moduł działa na oznaczonym ziarnie `seed-dev-1`.
4. *(Opcjonalnie)* zaplanować cykliczny backtest/rekalibrację — wystarczy
   okresowo wywołać `runLocationBacktest` / `recalibrateSerialRanges` (bramka
   sygnału i tak przelicza się automatycznie po każdej obserwacji).

Punkty 1–2 to jednorazowa konfiguracja; 3 zależy od pozyskania danych GUS. Nic z
tego nie wymaga pisania kodu.

## Znane ograniczenia i elementy do kalibracji na danych Finance You

- **Dane produkcyjne**: obecnie tylko ziarno DEV/TEST — wymagany import
  pełnych zbiorów GUS/TERYT/NSP 2021 oraz kompletnej mapy prefiksów MS.
- **Sąsiedztwo gmin** w seedzie przybliżane progiem odległości środków; produkcja
  używa wspólnej granicy (`geo_unit_adjacency`, długość granicy — odrzucenie
  styku w jednym punkcie).
- **Promienie ludności** w seedzie liczone po środkach gmin; produkcja — po
  komórkach siatki NSP.
- **Wagi działek** bez ewidencji działek → `source_quality = low` (obniżają
  pewność) — do zastąpienia danymi ewidencyjnymi.
- **Wagi, granice i progi** mają aktywne wartości domyślne (`cfg-default-1`) i
  działają od razu. Auto‑strojenie progu i backtest są zaimplementowane i
  dostępne w panelu — dostrajają się na rzeczywistych wynikach Finance You w
  miarę napływu obserwacji (nie jest to warunek działania modułu).
- **Sygnał numeru repertoryjnego** aktywuje się automatycznie (walidacja
  czasowa po każdej obserwacji); domyślnie wyłączony do czasu zebrania dużej,
  zwalidowanej próby — zgodnie z projektem.
