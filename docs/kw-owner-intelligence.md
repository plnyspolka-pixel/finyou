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

## Wynik uruchomienia na GitHub Actions — 2026-11-02
Próba z rzeczywistym Chromium i Playwrightem na runnerze GitHub Actions
(z niezależnym dostępem do Internetu) potwierdziła:
- instalacja Playwright i Chromium: **OK**;
- `GET https://krz.ms.gov.pl/`: **HTTP 403**;
- dodatkowe żądanie `GET /_Incapsula_Resource`: **HTTP 200**;
- `--inspect`: **status blocked** i zakończenie kodem 1;
- formularz wyszukiwania KRS nie został udostępniony, więc nie wykonano
  wyszukiwania danych ani nie potwierdzono endpointu odpowiedzi.

Log w repozytorium:
https://github.com/plnyspolka-pixel/finyou/actions/runs/41440871258

Interpretacja: realna odmowa dostępu na wejściu z automatycznego klienta;
ścieżka Incapsula sugeruje WAF/ochronę aplikacji. Nie jest to test
identyczny z wizytą człowieka ani dowód całkowitej niemożliwości
scrapingu, ale **ta implementacja nie jest dostępna produkcyjnie**.
Nie omijać ochrony, nie traktować HTTP 403 jako braku wpisów KRZ.

W odróżnieniu od tego testu środowisko narzędziowe lokalne blokuje
cały ruch internetowy, w tym DNS; błąd `ERR_BLOCKED_BY_ADMINISTRATOR`
lokalnie nie był dowodem działania zabezpieczeń KRZ.

## Indeksowanie KRZ/MSiG przez wyszukiwarkę — PoC
**Działa niezależnie od portalu KRZ**, wykrywa publicznie zaindeksowane
wzmianki o postępowaniach i wyświetla je jako `name_only`.

- Kwerendy po imieniu i nazwisku/nazwie z działu II KW:
  `site:krpu.pl "Imię Nazwisko"`,
  `site:imsig.pl "Imię Nazwisko"`,
  `"Imię Nazwisko" (KRZ OR "restrukturyzacja" OR "upadłość" OR "GRz-nu")`.
- Silnik: jeśli `SERPER_API_KEY`, używane wyniki **Google przez Serper**.
  Bez klucza próba oficjalnej publicznej strony Google HTML, a po blokadzie
  wyraźnie oznaczony fallback DuckDuckGo. Nie obchodzić `/sorry/`, CAPTCHA.
- Test przeglądarkowy Google na GitHub Actions:
  https://github.com/plnyspolka-pixel/finyou/actions/runs/41441657795
  **HTTP 200, ale przekierowanie na `google.com/sorry/index`**
  z informacją o nietypowym ruchu. To jest BLOKADA odczytu organicznych
  wyników, a nie działający scraping Google (naprawiono diagnostykę).
- Dla opublikowanych w źródłach wtórnych sygnatur typu `GRz-nu`
  rozpoznajemy **wzmiankę o sprawie o zatwierdzenie układu**,
  bez orzekania o wyniku, aktualnym stanie lub tożsamości właściciela KW.
  Weryfikacja znaczenia repertorium: Dz.U. 2021 poz. 2118 §2-5.
- Nazwa + sygnatura w krótkim fragmencie z katalogów (`krpu.pl`)
  jest sygnałem do ręcznej weryfikacji, nie potwierdzeniem długu.
  Zwykłe wpisy kapitałowe KRS w MSiG są odrzucane przez klasyfikator.
  KRS/NIP/PESEL nie trafiają do kwerend wyszukiwarkowych.
- Wynik trafia do istniejącego JSONB i PDF bez nowej tabeli;
  przy braku klucza iMSiG **status sądowy pozostaje częściowy**,
  nawet gdy indeks pokaże trafienia.
- Zakres weryfikacji: testy Vitest + dedykowany TypeScript
  `bunx tsc --project tsconfig.owner-intelligence.json --noEmit`.
  Pełny `tsc` repo wykazał dodatkowo błędy typowania
  w niezwiązanych trasach Resend — nie są modyfikowane w tym PR.
- **Nie wdrażać bez przeglądu RODO oraz ograniczenia natężenia zapytań**.
  Zapytania po nazwisku są przesyłane do dostawców wyszukiwania;
  dla wymagania wyłącznie UE wymagany dostawca i odpowiednie warunki.

## Oficjalny MSiG: potwierdzony odczyt JSON — 2 listopada 2026
Zbadano **oficjalny portal** `https://wyszukiwarka-msig.ms.gov.pl/`
(nie mylić z komercyjnym `imsig.pl`).

**Wyniki rzeczywistych testów:**
1. Strona: `HTTP 200`, Angular; zwykły `fetchHtml()` odczytuje tylko
   977 B szkieletu, nie listę ogłoszeń.
2. Playwright uruchomił formularz; po publicznym numerze KRS
   wysłał `GET /api/Monitor/Search` i otrzymał JSON.
3. Publiczny KRS `0000753937` zwrócił rekord MSiG:
   `id=19407882`, `monitorNumber=213/2026`,
   `dateOfPublication=2026-11-02`,
   `entityName=ANSYS POLAND (...) W LIKWIDACJI`.
4. **Zwykłe serwerowe `fetch()` bez Chromium** do tej samej ścieżki
   zwróciło `HTTP 200`, `list.length=1` i ten sam rekord, przy
   parametrze `from=2001-01-01`. Log:
   https://github.com/plnyspolka-pixel/finyou/actions/runs/41447610548

**Zaimplementowano w gałęzi:** `src/lib/coowners/official-msig.server.ts`
jako opcjonalną kwerendę dla **właścicieli będących spółkami** po
KRS/NIP (albo nazwie). Działa w istniejącym raporcie KW i PDF,
bez nowej tabeli ani abonamentu.
- Jedna strona wyników na rozpoznanego właściciela; limit całej analizy 12 i maksymalnie 2 jednoczesne zapytania.
- Zwykłe ogłoszenia KRS nie generują alarmu o zadłużeniu.
- Wzmianki o likwidacji/upadłości/restrukturyzacji mają status
  `name_only`; należy porównać pełną nazwę, KRS i daty i sprawdzić
  stan prawny w źródle.
- Historyczny MSiG **nie zastępuje KRZ**; brak trafienia to nie
  zaświadczenie o braku postępowania.
- Oficjalny portal nie deklaruje wspieranego API i może zmienić schemat
  JSON lub ograniczyć ruch; interfejs nie jest przeznaczony do masowego
  pobierania. Nie uruchamiać skanowania hurtowego.
- Weryfikację osób fizycznych po nazwisku i imieniu przetestowano osobno, jak opisano niżej.

**Ograniczenia:** na razie nie przechodzimy do pełnej treści pozycji
i nie potwierdzamy bieżących stanów postępowań. Link prowadzi do
wyszukiwarki, nie do odpisu konkretnej sprawy. Przed merge sprawdzić
regulamin, retencję i tolerancję na zmiany wewnętrznego JSON.

## Osoby fizyczne w oficjalnym MSiG — test live i implementacja, 2026-11-02
Po przetestowaniu spółek uruchomiono **tę samą publiczną usługę JSON**
`/api/Monitor/Search` dla osoby fizycznej z opublikowanym historycznym
ogłoszeniem w MSiG 123/2015 (poz. 9228). Log:
https://github.com/plnyspolka-pixel/finyou/actions/runs/41448595187

**Empiryczne wyniki:**
- Nazwisko + imię: HTTP 200, **1 trafienie**; ID `6014927`,
  Monitor `123/2015`, data `2015-06-29`, sygnatura obecna.
- Imię + nazwisko: HTTP 200, **0 trafień**.
- Samo nazwisko: dwa trafienia w krótkim zakresie dat — ryzyko homonimów.
- Pole „Tekst w pozycji”: również dwa trafienia przy samym nazwisku.
- W MSiG osoby fizyczne, także sprzed wprowadzenia KRZ, są publicznie
  indeksowane. **Nie oznacza to dostępności pełnych aktualnych KRZ**.

**Zmiana w kodzie:** `official-msig.server.ts` obsługuje
`kind: "person"` i buduje zapytanie `Nazwisko Imię` z oddzielnych
pól właściciela KW; **nie przesyła numeru PESEL** do tego endpointu.
NIP przedsiębiorcy jest wykorzystywany, jeśli system go zna.
Dopasowanie pozostaje `name_only` nawet przy wyszukaniu po NIP,
jeżeli samo ogłoszenie nie ujawnia potwierdzającego identyfikatora.

Wynik zawiera datę, sygnaturę oraz ogólną informację o ogłoszeniu.
Sama sygnatura / nazwisko nie uprawniają do automatycznej kwalifikacji
dłużnika jako upadłego. W przypadku braku tekstu o zdarzeniu
wynik musi mieć neutralną etykietę „rodzaj sprawy nieustalony”.

Limit MSiG zmieniono z 4 spółek na wszystkich
rozpoznanych właścicieli podlegających limitowi całej analizy
(12), przy dwóch równoczesnych żądaniach; bez masowego crawlowania.
Pusty wynik oznacza wyłącznie brak wzmianki w pobranym zakresie,
nie negatywną weryfikację KRZ, niewypłacalności czy zadłużenia.
