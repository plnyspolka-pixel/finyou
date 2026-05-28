## Cel

Zbudować kompletny moduł, który dla każdego wniosku pożyczkowego automatycznie:
- pobiera i scala dane z formularza, dokumentów, RCN (Geoportal), GUS BDL, NBP, Google Maps,
- wylicza benchmark wartości zabezpieczenia,
- liczy scoring nieruchomości 0–100 z 5 komponentami,
- generuje gotowe teksty do oferty inwestycyjnej,
- pokazuje wynik administratorowi (pełny) oraz inwestorowi (uproszczony, bez technikaliów).

## Zakres typów nieruchomości

mieszkanie, dom, lokal usługowy, działka budowlana, działka zabudowana, grunt rolny, inna.

## Architektura (TanStack Start + Lovable Cloud)

Cała logika serwerowa w `createServerFn` (nie edge functions). Cache w Supabase. UI w `src/routes/admin.wnioski.$id.tsx` (zakładka „Analiza zabezpieczenia”) oraz w widoku inwestora.

### Nowe pliki – server functions

```
src/lib/property-analysis/
  types.ts                          # PropertyAnalysisInput, PropertyAnalysisResult, enums
  property-collateral-analysis.functions.ts   # główny orchestrator (createServerFn)
  rcn-geoportal.server.ts           # WFS Geoportal RCN – pobieranie transakcji + statystyki
  rcn-geoportal.functions.ts        # rcn-transaction-benchmark
  gus-bdl.server.ts                 # GUS BDL klient (mieszkania, grunty rolne, klasy)
  gus-bdl.functions.ts              # gus-bdl-property-benchmark
  nbp-real-estate.server.ts         # NBP – import bazy cen mieszkań + trend
  nbp-real-estate.functions.ts      # nbp-real-estate-market-trend
  location-score.server.ts          # Google Maps Geocoding/Places – scoring lokalizacji
  location-score.functions.ts       # property-location-score
  document-extraction.server.ts     # OCR/PDF/AI extraction (Lovable AI Gateway: google/gemini-2.5-pro)
  document-extraction.functions.ts  # property-document-extraction
  scoring.ts                        # calculate-property-collateral-score (czysta funkcja, testowalna)
  offer-text.ts                     # generator tekstów do oferty (czysta funkcja)
  cache.server.ts                   # pomocnicze: get/set z TTL w tabelach cache
```

### Nowe pliki – UI

```
src/components/property-analysis/
  collateral-analysis-section.tsx   # zakładka admina: pełna analiza
  sources-used-list.tsx
  valuation-benchmark-card.tsx
  scoring-breakdown.tsx
  legal-risk-panel.tsx
  investor-summary-card.tsx         # widok dla inwestora (bez technikaliów)
  run-analysis-button.tsx           # uruchamia/odświeża analizę
```

Integracja:
- `src/routes/admin.wnioski.$id.tsx` – nowa zakładka „Analiza zabezpieczenia”.
- `src/routes/inwestor.wniosek.$id.tsx` – sekcja `InvestorSummaryCard`.

## Baza danych (migracje)

Nowe tabele (wszystkie z GRANT + RLS jak istniejące):

1. `property_analyses` – wynik końcowy per wniosek/property
   - id, application_id, property_id, status (pending/running/done/error),
     result_json, collateral_score, collateral_category,
     ltv_percent, estimated_value_pln, main_source, sources_used jsonb,
     warnings jsonb, created_at, updated_at
2. `property_analysis_logs` – log uruchomień (zgodnie z XIV)
3. `rcn_cache` – key (geohash+typ+promień+okres), payload jsonb, fetched_at, expires_at (+30d)
4. `gus_bdl_cache` – key (poziom+terc+wskaźnik+okres), payload, +30d
5. `nbp_real_estate_cache` – key (rynek+okres), payload, +30d
6. (Google Maps reużywa istniejącego `property_location_analysis_cache`.)
7. `property_document_extractions` – id, document_id (FK do `documents`), application_id, doc_kind, extracted_json, raw_text, model, created_at; unikalność per `document_id` z invalidacją gdy plik się zmieni.

RLS:
- staff (admin/operator) – pełny dostęp
- client – SELECT własnych `property_analyses` przez relację do `loan_applications`
- investor – SELECT tylko gdy `loan_applications.available_to_investors = true` (i tylko ograniczone pola, w UI maskowane)

## Sekrety

- `GOOGLE_MAPS_API_KEY` – jest.
- `LOVABLE_API_KEY` – jest (AI Gateway, do OCR/parsowania dokumentów modelem `google/gemini-2.5-pro`).
- `GUS_BDL_API_KEY` – **opcjonalny**, dopytamy użytkownika i dodamy przez `add_secret`, jeśli zechce limity wyższe. Bez klucza funkcja działa anonimowo.
- RCN/Geoportal – publiczny WFS, bez klucza.
- NBP – publiczne pliki (CSV/XLSX) ściągane i cache'owane.

## Orchestrator `property-collateral-analysis`

Krok po kroku (zgodnie z sekcją II promptu):

1. Załaduj wniosek + property + dokumenty z DB.
2. `property-document-extraction` na wszystkich dokumentach (z cache po `document_id`).
   - Wyciąga: KW, adres, działka/obręb, powierzchnie, klasa gruntu, MPZP/WZ, hipoteki, ostrzeżenia, wartość operatu itd.
3. Merge danych formularza + dokumentów (dokument > pusty formularz; konflikt → warning).
4. Geokodowanie adresu (Google Maps przez gateway connector) → lat/lng.
5. `rcn-transaction-benchmark` z eskalacją promienia 1km→2km→5km→powiat oraz okresu 12→24→36 mies.
6. `gus-bdl-property-benchmark`:
   - mieszkania: mediana/średnia zł/m² (powiat, fallback województwo),
   - grunty rolne: zł/ha z mapą klas (I–IIIa dobre, IIIb–IV średnie, V–VI słabe).
7. `nbp-real-estate-market-trend` – tylko jeśli mieszkanie/dom w mieście objętym bazą NBP.
8. `property-location-score` – Google Places (szkoły, sklepy, apteki, komunikacja…) w promieniach 500/1000/3000/5000 m → 0–100 + komentarz płynności.
9. `valuationBenchmark`:
   - dobiera `mainSource` wg poziomów pokrycia (Poziom 1–5),
   - liczy medianę/średnią/Q1/Q3, zakres ostrożnościowy (np. 0.85–1.05 × mediana), wartość szacunkową w PLN,
   - porównuje z `declaredPropertyValuePln` (variance%).
10. LTV = `requestedLoanAmountPln / estimatedValuePln`, kategoria safe ≤50%, moderate ≤65%, high ≤80%, very_high >80%.
11. `calculate-property-collateral-score` – 25/25/20/15/15 → total 0–100, kategoria (bardzo dobre/dobre/akceptowalne/podwyższone ryzyko/nieakceptowalne).
12. `offer-text` – generuje teksty wg sekcji XI (czysty TS, deterministycznie).
13. Zapis do `property_analyses` + `property_analysis_logs`.

Wynik zwracany dokładnie w schemacie z sekcji X promptu.

## Zasady opisu (sekcja XIII)

W tekstach używamy wyłącznie: „benchmark wartości”, „orientacyjna wartość statystyczna”, „pomocnicza analiza”, „punkt odniesienia”. Lista zakazanych słów („operat”, „oficjalna wycena”, „gwarantowana wartość”, „pewna cena sprzedaży”) jest egzekwowana przez assert w `offer-text.ts` (test jednostkowy).

Słabe dane → automatyczny komunikat: „Dostępność danych porównawczych jest ograniczona, dlatego wynik wymaga dodatkowej ręcznej weryfikacji.”

## UI – Admin

W zakładce „Analiza zabezpieczenia”:
- przycisk **Uruchom analizę** / **Odśwież** (wywołuje serverFn, pokazuje progress per źródło),
- karty: Dane nieruchomości, Użyte źródła (z badge'ami status), Benchmark wartości (RCN + GUS BDL + NBP), LTV, Scoring lokalizacji (Google Maps + mapka), Ryzyka prawne, Scoring 0–100 z rozbiciem 5 komponentów, Mocne strony / Ryzyka, Gotowy opis do oferty (kopiowalny).

## UI – Inwestor

`InvestorSummaryCard` pokazuje wyłącznie: krótki opis, benchmark wartości (zakres ostrożnościowy), listę użytych źródeł (po nazwach, bez statusów technicznych), scoring i kategorię, top 3 mocne strony, top 3 ryzyka, rekomendację. Surowy JSON / błędy / OCR confidence są ukryte.

## Testy

`src/lib/property-analysis/__tests__/`:
- `scoring.test.ts` – 5 komponentów + klasyfikacja kategorii.
- `offer-text.test.ts` – brak zakazanych słów, obecność wymaganych fraz, fallback przy słabych danych.
- `gus-bdl-soil-class.test.ts` – mapa klas gruntu.
- `valuation-strategy.test.ts` – wybór `mainSource` po Poziomach 1–5 (mock danych RCN/GUS/NBP).
- `orchestrator.integration.test.ts` (z mockami fetch) – 6 scenariuszy z sekcji XV (mieszkanie pełne, brak RCN, grunt rolny, działka budowlana, dom, lokal usługowy) + brak jednego źródła nie blokuje wyniku.

## Szczegóły techniczne

- Wszystkie wywołania zewnętrzne tylko z `*.server.ts` (poza client bundle).
- Fetch z timeoutem 15s i `try/catch` per źródło – błąd źródła = `status: "error"` w `dataSourcesUsed`, nigdy nie wywala całej analizy.
- Cache: pomocnik `getCached(table, key, ttlDays, fetcher)` w `cache.server.ts`.
- Google Maps – przez connector gateway (Authorization + X-Connection-Api-Key), bez bezpośredniego klucza.
- OCR/parsowanie dokumentów – Lovable AI Gateway `google/gemini-2.5-pro` (multimodal: PDF/obraz) z promptem strukturyzującym do JSON; cache w `property_document_extractions` po `document_id`.
- RCN/Geoportal – WFS GetFeature (GML/JSON) z filtrem BBOX + datą; parser do listy transakcji + statystyki (mediana, średnia, Q1, Q3, count, outlier filter IQR×1.5).
- NBP – pobranie i cache plików kwartalnych z nbp.pl; mapowanie miasta na rynek (lookup table 17 miast).
- Wszystkie serverFn z `requireSupabaseAuth` (tylko staff może uruchamiać analizę).

## Co poza zakresem tej iteracji

- Brak automatycznego uruchamiania analizy na webhooku przy nowym wniosku (uruchamiamy ręcznie z UI; auto-trigger dodamy później).
- Brak edycji wyników ręcznie przez operatora (warning + ponowne uruchomienie).

## Plan wdrożenia (kolejność commitów)

1. Migracja DB (7 tabel + RLS + GRANT).
2. Pliki czyste (typy, `scoring.ts`, `offer-text.ts`) + testy jednostkowe.
3. Klienty źródeł (`*.server.ts`) + cache.
4. ServerFn per źródło + orchestrator + testy integracyjne (z mockami).
5. UI admina (zakładka + komponenty).
6. UI inwestora (`InvestorSummaryCard`).
7. Smoke test na realnym wniosku z bazy.

## Pytania przed startem

1. **Auto-uruchamianie**: czy analiza ma startować automatycznie po wpłynięciu wniosku, czy ma być uruchamiana ręcznie z UI admina (przyciskiem)? (Domyślnie zakładam ręcznie + cache.)
2. **`GUS_BDL_API_KEY`**: czy mam dodać sekret teraz (rekomendowane – wyższe limity), czy startujemy anonimowo?
3. **Widoczność dla klienta** (`/klient/...`) – sekcja „Analiza zabezpieczenia” ma być widoczna dla klienta-pożyczkobiorcy, czy tylko admin + inwestor?
