# Moduł „Potencjał lokalizacyjny nieruchomości"

Automatyczna preselekcja wniosków o finansowanie w Finance You na podstawie
numeru księgi wieczystej (KW), rodzaju nieruchomości oraz danych
statystyczno‑przestrzennych. Wynik służy **wyłącznie do ustalania kolejności i
zakresu analizy** — nie odrzuca definitywnie żadnego wniosku.

## Co robi

Dla poprawnego numeru KW + rodzaju nieruchomości (mieszkanie / dom / działka)
moduł szacuje:

1. prawdopodobny obszar położenia nieruchomości (rozkład prefiks × rodzaj),
2. prawdopodobieństwo atrakcyjnego skupiska ludności,
3. potencjał lokalizacyjny 0–100,
4. priorytet skierowania do automatycznej pełnej analizy,

wraz ze wskaźnikiem pewności (`confidenceScore`) i przedziałem P10–mediana–P90.

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

> **UWAGA — stan danych.** Repozytorium zawiera wyłącznie **ziarno DEV/TEST**
> (`scripts/location-scoring/seed-data.json`, `data_version = seed-dev-1`) z
> przybliżonymi wartościami dla kilku wydziałów (RA1R, WA1M, KR1P) i ich gmin.
> **To NIE są pełne dane produkcyjne.** Pobieranie zbiorów GUS jest w tym
> środowisku niedostępne (brak sieci do usług zewnętrznych). Importer jest
> gotowy i działa — należy podać produkcyjny `dataset.json` (patrz niżej).

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
kilka przypadkowych obserwacji nie przeważa danych bazowych. Sygnał z numeru
repertoryjnego jest włączany **tylko** dla dużej, zwalidowanej offline próby
(`kw_number_range_statistics.validated_offline`).

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

## Walidacja modelu (backtest)

Zaprojektowana metodyka (do uruchomienia po zebraniu obserwacji): podział
**czasowy** (bez wycieku), walidacja osobno per prefiks i per rodzaj, test nowych
zakresów numerów i wydziałów o małej próbie. Metryki: precision, recall,
ROC‑AUC, PR‑AUC, Brier score, calibration error, precision spraw kierowanych
automatycznie oraz pokrycie. Docelowo próg `AUTO_ANALYZE_HIGH` strojony do
≥ 90% precision — **o ile próba na to pozwoli**; w przeciwnym razie pokazujemy
rzeczywisty wynik bez deklarowania sztucznej pewności.

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
- **Wagi, granice i progi** domyślne — wymagają kalibracji na rzeczywistych
  wynikach preselekcji Finance You (panel konfiguracji + backtest).
- **Sygnał numeru repertoryjnego** domyślnie nieaktywny do czasu zebrania
  dużej, zwalidowanej próby.
