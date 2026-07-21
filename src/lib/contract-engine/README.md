# Silnik umów pożyczki — port TypeScript

Port silnika `umowa_engine` (Python) do TypeScript. Architektura bez zmian:
**AI wypełnia wyłącznie dane zgodne ze schematem, a tekst umowy składa
deterministyczny kod.** Model nie dotyka treści — nie może urwać zdania,
pomylić numeracji ani zostawić klauzuli o poręczycielu w umowie bez poręczyciela.

```
dane ─► validateSchema + walidujReguly + walidujHarmonogram ─► (stop, jeśli błędy)
     └─► renderuj(dane, klauzule) ─► struktura dokumentu ─► formatuj / DOCX
```

## Pliki (mapowanie z Pythona)

| TS | Python | Rola |
|---|---|---|
| `schema.ts` | `schema/umowa.schema.json` | kontrakt danych: zod + typy TS + `validateSchema` (warstwa 1) |
| `umowa.schema.json` | jw. | kopia 1:1 schematu (źródło prawdy, używane w testach regresji I3/I4) |
| `clauses.json` | `clauses/klauzule.json` | biblioteka klauzul 1:1 (47 klauzul, 10 sekcji) |
| `conditions.ts` | `renderer.ewaluuj_warunek` | ewaluator warunków — **parser, bez `eval`/`Function`** |
| `facts.ts` | `renderer.zbuduj_fakty` + odmiany | fakty pochodne + oznaczenia stron + odmiana nazwisk |
| `renderer.ts` | `renderer.renderuj` | składanie dokumentu, numeracja, komparycja, załączniki |
| `formatter.ts` | `formatter.py` | podgląd tekstowy (odwzorowany `textwrap.fill`) |
| `validator.ts` | `validator.py` | reguły biznesowe R1–R27 (warstwa 2) |
| `harmonogram.ts` | (§3.2 zlecenia) | walidacja harmonogramu spłat |
| `index.ts` | — | publiczne API (`renderujUmowe`, `podglad`, `waliduj`, …) |
| `engine.test.ts`, `harmonogram.test.ts` | `test_suite.py` | wszystkie asercje portu + testy harmonogramu |

## Kluczowe decyzje portu

- **Ewaluator warunków bez `eval`.** `conditions.ts` to tokenizer + parser zejścia
  rekurencyjnego (operatory `== != and or not ( )`, ścieżki `a.b.c`, literały,
  `null`/`true`/`false`). Literały tekstowe są rozpoznawane jako jeden token, więc
  nie da się podmienić czegoś w ich wnętrzu — **pułapka z pkt 3.1 zlecenia**
  (klauzula prowizji cicho znikała) jest niemożliwa z konstrukcji. Pilnuje jej
  test **A10**.
- **Prawdziwość w stylu Pythona** (`truthy`): puste kontenery / `0` / `""` / `null`
  są fałszywe. Dzięki temu np. pusta tabela `raty: []` jest traktowana jak brak
  danych (reguła R16), a nie jako niezgodność.
- **Testy uruchamialne bez pełnej instalacji.** Plik testowy to standardowy vitest
  (globalne `describe/it/expect`, `resolveJsonModule`-style importy JSON). W repo
  odpala je `vitest run`; lokalnie działa też `bun test src/lib/contract-engine/`
  (Bun mapuje import z `vitest` na własny runner i czyta TS natywnie).

## Uruchomienie testów

```bash
bun run test                          # cały projekt (vitest)
bun test src/lib/contract-engine/     # tylko silnik (Bun, bez instalacji zależności)
```

## Co NIE zostało tu zrobione — elementy ZABLOKOWANE

Zgodnie ze zleceniem (pkt 5 — „dwie rzeczy blokujące, zgłoś je od razu"):

1. **Model finansowy (pkt 2 zlecenia) — do rozstrzygnięcia z Filipem.**
   Kalkulator (`client-profile-math.ts`, `loan-math.ts`) i silnik liczą inaczej
   (prowizja potrącana vs nie-potrącana, kapitał nominalny, rata balonowa jako
   osobny wiersz vs ostatnia z N). Matematyka kalkulatora **nie została ruszona** —
   zlecenie wprost tego zakazuje przed decyzją. `harmonogram.ts` **weryfikuje**
   harmonogram na docelowym (silnikowym) kształcie `raty`, ale **adapter
   `LoanCalcPayload → raty` NIE jest zaimplementowany**, bo payload kalkulatora
   nie zawiera pola na prowizję w racie (bezpośrednia konsekwencja tej rozbieżności).

2. **Integracja z KW / mapper KwExtraction → schemat (pkt 3.3) — zablokowana.**
   Wymaga weryfikacji struktury danych w dokumentacji CMD KW Engine (3.3.0) oraz
   producenta typu `KwExtraction`, którego w repo **nie ma** (typ istnieje, ale nic
   go nie wytwarza — 3.3.1). Mapper nie ma wejścia, więc nie został napisany.

3. **Podmiana kreatora (pkt 3.4)** zależy od powyższych i od decyzji o modelu —
   nieruszona.

## Do weryfikacji prawnej przed produkcją (z README silnika — nie kodować obejść)

1. **ZAB_02** — rozporządzenie opróżnionym miejscem hipotecznym (art. 101¹ u.k.w.h.).
2. **WZA_05 / ZAB_10** — wypłata po przedłożeniu aktu o zrzeczeniu dożywocia, przed
   uwidocznieniem wykreślenia w KW (decyzja biznesowa z opisanym ryzykiem).
3. **POR_05 / POR_05b** — brak zgody małżonka na poręczenie ogranicza egzekucję do
   majątku osobistego (art. 41 § 2 k.r.o.), nie znosi poręczenia.
4. **ZAB_01 stopka** — hipoteka łączna domyślna (art. 76 u.k.w.h.).
5. **Prowizja 26,5% Kwoty Pożyczki** — poniżej progu z art. 388 § 1¹ k.c., ale przy
   wyższych wartościach klauzula KWO_02 nie chroni sama z siebie.

Świadomie usunięte (mają testy regresyjne I1–I12, C25): weksel in blanco, cesja
polisy, współwłasność ułamkowa, klauzula o odstąpieniu po 60 dniach, załącznik
z oświadczeniem poręczyciela.
