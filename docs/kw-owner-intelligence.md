# Rozszerzenie raportu EKW: wywiad gospodarczy właściciela

## Co robi
Po pobraniu KW krok nr 2 istniejącego pipeline'u `analyzeCoOwners` automatycznie
sprawdza każdą rozpoznaną osobę fizyczną z działu II oraz rozpoznane osoby prawne:
- publiczne ogłoszenia z giełd wierzytelności (indeks wyszukiwarki),
- postępowania upadłościowe i restrukturyzacyjne z KRZ i MSiG za pośrednictwem
  komercyjnego API iMSiG.

Wynik trafia do `coowner_registry_checks` / `investor_kw_checks.coowners_json`
(istniejące JSONB) oraz do rozdziału „Wywiad gospodarczy właścicieli” w PDF.
Nie dodajemy osobnego formularza, kroku ani kolumn SQL.

## Konfiguracja źródeł
- **MSiG/KRZ:** zmienna `IMSIG_API_KEY` wyłącznie po stronie serwera.
  API: `GET https://api.imsig.pl/v2/announcements` z autoryzacją w nagłówku
  `Authorization`. Dokumentacja https://www.imsig.pl/inne/dokumentacja-api
- **Publiczne giełdy:** `gielda-dlugow.com`, `dlugi.info`, `dlug.info.pl` —
  indeksowanie przez istniejące `webSearch` z `src/lib/web-fetch.server.ts`.
  To NIE jest integracja z ich bazami ani gwarancja kompletności.
- **KRD/ERIF/BIG InfoMonitor:** nie są objęte. Wymagają osobnych podstaw prawnych,
  umów i uprawnień do odpytania. Nie udawać ich pokrycia.

## Identyfikacja i trafienia
- Osoba fizyczna: PESEL z KW służy do serwerowego zapytania w iMSiG;
  bez PESEL jest tylko wyszukiwanie po nazwisku i imieniu.
- Osoba prawna: KRS/NIP/REGON, jeżeli zidentyfikowany w dziale II;
  w pozostałych przypadkach nazwa.
- Trafienie `identifier` tylko po zgodności identyfikatorów z ogłoszenia.
- Trafienie `name_only` nigdy nie potwierdza tożsamości ani długu.
- Wynik „nie znaleziono” odnosi się tylko do przeszukanego, dostępnego zakresu.
- Upadłość historyczna/zakończona nie znaczy aktywnej upadłości. Pokazujemy
  status, sygnaturę, datę publikacji i źródłowy URL.

## Dane / dostęp / RODO
- Żadna nowa struktura wyniku nie zawiera pełnego numeru PESEL;
  wyszukiwanie giełd nie używa numeru PESEL i maskuje takie ciągi w opisach.
- Przed rezerwacją Projektu `sanitizeCoOwnersForTeaser` usuwa cały wywiad.
- Wgląd z PDF i widoku jest dostępny tylko po bramkach istniejących modułów.
- Publiczne wyszukiwanie za pomocą DuckDuckGo/Jina przesyła imię i nazwisko lub
  nazwę podmiotu do zewnętrznego usługodawcy. **Przed wdrożeniem produkcyjnym**
  ocenić prawidłowość transferów, podstawę przetwarzania i retencję danych.
  Dla wymogu przetwarzania tylko w UE: zamienić `webSearch` na dostawcę UE
  z umową powierzenia albo usunąć wyszukiwanie zewnętrzne.
- Potwierdzić w regulaminach giełd dopuszczalność automatycznej indeksacji
  i dalszego przetwarzania wyników. Nie omijać logowania, CAPTCHA, WAF.
- Błędów rejestru i braku klucza NIE wolno interpretować jako czystej historii.

## Warunki wydania do produkcji
1. Skonfigurować klucz iMSiG; ustalić zakres subskrypcji (archiwum, KRZ/MSiG).
2. Zweryfikować wyniki na syntetycznych fixture, w tym wieloosobowej KW,
   spółce jako właścicielu, tej samej nazwie dwóch osób i błędzie API.
3. Wykonać `vitest`, `tsc` i kontrolę wydajności; integracja w PR nie została
   uruchomiona na środowisku produkcyjnym.
4. Sprawdzić poprawność identyfikacji spółek dla rzeczywistych formatów
   tabel EKW/CMD/EasyMKW; parser jest ostrożny i może wymagać dopracowania.
5. Dla pełnego wdrożenia rozważyć niezależne, identyfikatorowe integracje
   z giełdami po uzyskaniu zgody operatorów; indeks publiczny jest tylko OSINT.

## Techniczna próba bezpośredniego scrapingu KRZ — 2026-11-02
- Oficjalny portal jest dostępny do ręcznej, darmowej weryfikacji,
  ale nie udostępnia oficjalnego API (potwierdzenie MS).
- Próba HTTP przez wyszukiwarkę WWW: `403 Forbidden`.
- Dwie próby z silnikami Firecrawl (w tym z uruchomioną przeglądarką)
  zakończyły się brakiem dostępu do `krz.ms.gov.pl`.
- Nie udało się więc potwierdzić konkretnego endpointu lub schematu odpowiedzi;
  nie wolno kodować zgadywanych URL-i jako działającego API.
- Dodano **diagnostyczny skrypt Playwright**:
  `scripts/krz-public-probe.mjs`. Umożliwia lokalne uruchomienie jednej
  próby po publicznym KRS spółki. Nie wykonuje masowego pobierania, nie obchodzi
  CAPTCHA, nie używa proxy, nie przechwytuje danych sesyjnych.
- Wymaga lokalnego testu w przeglądarce z dostępem do strony. Jeśli portal
  ogranicza ruch automatyczny, przerwać i pozostać przy integracji dostawcy.
- **Nie podłączać** skryptu do Cloudflare Workera ani do kroku produkcyjnego:
  Playwright wymaga uruchomienia przeglądarki poza tym środowiskiem.
- Ponieważ próby bezpośredniego dostępu nie powiodły się, bezpłatna ścieżka
  nie jest rozwiązaniem potwierdzonym produkcyjnie.

Jednorazowy test lokalny:
```sh
bun add -d playwright
bunx playwright install chromium
node scripts/krz-public-probe.mjs --inspect
node scripts/krz-public-probe.mjs --krs 0000304735
```
