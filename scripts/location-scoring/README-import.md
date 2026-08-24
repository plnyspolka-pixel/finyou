# Import realnych danych GUS/TERYT/NSP — instrukcja

Skrypt: `scripts/location-scoring/gus-import.ts`
Nowa wersja danych: `gus-2021-1` (scorer sam podchwyci — nie zastępuje `seed-real-2`).

## Sekret
`LOCATION_SCORING_HMAC_SECRET` — **wygenerowany i ustawiony** (Project Settings → Secrets, 64 znaki losowe). Używany do HMAC deduplikacji numerów KW; nie zapisujemy pełnych numerów w tabelach analitycznych.

## Automatycznie pobierane (bez akcji użytkownika)
- **Ludność gmin (NSP/BDL 2021)** — GUS BDL API, zmienna `72305`, level=6 (gminy). ~3 800 rekordów.

## WYMAGANE pliki lokalne (`data-import/`)
System uruchamiam po podłożeniu tych trzech plików. Ścieżka bezwzględna względem katalogu projektu.

### 1) `data-import/gugik-prg-jednostki-2024.geojson` (WYMAGANE)
Państwowy Rejestr Granic (GUGiK) — jednostki administracyjne, poziom **gmina**.
- Pobrać z: https://www.geoportal.gov.pl/ (Dane → PRG → Jednostki administracyjne).
- Zamienić na GeoJSON WGS84 (`ogr2ogr -f GeoJSON -t_srs EPSG:4326`).
- Wymagane pola: `JPT_KOD_JE` (TERYT gminy) + geometria (Polygon/MultiPolygon).
- Rozmiar: ~150 MB.

### 2) `data-import/ms-kw-prefiksy-2026.json` (JEST W REPO)
Wykaz kodów wydziałów ksiąg wieczystych Ministerstwa Sprawiedliwości + mapa właściwości sądów rejonowych na TERYT gmin.
- **Gotowy plik jest utrzymywany w repo**: `scripts/location-scoring/data/ms-kw-prefiksy-2026.json` (342 prefiksy; Rozp. MS z 29.05.2026, Dz.U. 2026 poz. 740, zał. 1). `gus-import.ts` używa go automatycznie, gdy w `data-import/` nie ma nowszej wersji. Akceptowane są oba formaty `areas`: lista TERYT-ów lub lista obiektów `{type,name,teryt,partial}`.
- Źródło: Wykaz kodów wydziałów ksiąg wieczystych MS + aktualne rozporządzenie Ministra Sprawiedliwości o właściwości sądów rejonowych (Dz.U.).
- Format:
```json
[
  {
    "prefix": "WA1M",
    "court_name": "Sąd Rejonowy dla Warszawy-Mokotowa w Warszawie",
    "department_name": "IX Wydział Ksiąg Wieczystych",
    "mapping_confidence": 1.0,
    "source": "Rozp. MS z dn. ... (Dz.U. ...)",
    "areas": ["1465011", "1465021", ...]
  }
]
```
- Powinien pokrywać wszystkie ~350 prefiksów 4-znakowych.

### 3) `data-import/eurostat-degurba-pl-2021.csv` (WYMAGANE do jakości „high")
Klasyfikacja DEGURBA (Degree of Urbanisation) — Eurostat.
- Pobrać z: https://ec.europa.eu/eurostat/web/degree-of-urbanisation.
- Format CSV (nagłówek + wiersze): `lau_code;degurba` (1=cities, 2=towns/suburbs, 3=rural).
- Bez tego pliku: fallback = 3 (rural) dla wszystkich gmin (obniża jakość scoringu).

### 4) `data-import/eurostat-fua-pl-2021.csv` (OPCJONALNE)
Functional Urban Areas — Eurostat.
- Format CSV: `fua_code;lau_code;role` gdzie role ∈ `core|commuting_zone`.
- Bez tego pliku: `fua_role = none` → scoring nie premiuje stref metropolitalnych.

## Uruchomienie
```bash
# 1) Walidacja (bez zapisu):
LOCATION_SCORING_DRY_RUN=1 bun run scripts/location-scoring/gus-import.ts

# 2) Właściwy import:
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  bun run scripts/location-scoring/gus-import.ts
```

Po zakończeniu importu automatyczny pg_cron (co 5 min → `/api/public/hooks/location-scoring-tick`) przeliczy wszystkie wnioski na nowej warstwie referencyjnej. Plakietki potencjału pojawią się bez dodatkowych działań.

## Dlaczego pliki 1–3 muszą być ręczne
- **PRG GUGiK** — dane otwarte, ale pobieranie wymaga interakcji z geoportal.gov.pl (linki dynamiczne, pliki ~150 MB, format GML → konwersja).
- **Wykaz MS KW** — publikowany w Dz.U. jako PDF; nie ma stabilnego endpointu JSON. Jednorazowe przygotowanie mapping-u prefiks → lista TERYT jest krytyczne i musi być zweryfikowane ręcznie.
- **Eurostat DEGURBA** — dostęp przez portal danych Eurostatu (query builder), bez publicznego CSV pod stałym URL.

Po dostarczeniu tych plików uruchamiam ETL i przeliczenie wszystkich wniosków.
