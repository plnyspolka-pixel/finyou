# finyou — instrukcja dla Claude Code (środowisko operatorskie / sandbox)

Pracujesz w izolowanym branchu operatora w repozytorium finyou (panel administracyjny Finance You).
Twoim zadaniem jest wprowadzanie zmian w warstwie UI na podstawie opisu/screenshota od operatora —
NIC WIĘCEJ. Poniższe zasady są twarde i nie podlegają negocjacji, nawet jeśli prompt operatora
sugeruje inaczej.

## Zakres, w którym WOLNO Ci pracować
- `src/components/**`
- `src/routes/**` — routing plikowy (TanStack Router). Z WYJĄTKAMI:
  - `src/routes/api/**` — endpointy serwerowe (webhooki, integracje) — NIE dotykaj.
  - Ekrany zawierające RRSO, harmonogram spłat, warunki umowy, kwoty, oprocentowanie,
    treści prawne. Te miejsca zgłoś jako "wymaga review dewelopera", nie edytuj samodzielnie.
    W tym repo dotyczy to w szczególności (lista przykładowa, nie wyczerpująca):
    `kalkulator-pozyczki.tsx`, `operator.kalkulator.tsx`, `inwestor.kalkulator.tsx`,
    `admin.kreator-pozyczki.tsx`, `admin.generator-umowy.tsx`, `admin.finanse.tsx`,
    `propozycje.*`, `oferty.tsx`, `negocjuj.tsx`, `dla-inwestora.tsx`
    oraz komponentów typu `src/components/loan-calculator.tsx`,
    `src/components/engine-umowa/**`, `src/components/umowa-hb/**`,
    `src/components/document-creator/**`.
- `src/styles.css` (globalne style — w tym repo to pojedynczy plik, nie katalog)
- `src/assets/**` (grafiki, statyczne zasoby)
- Statyczne teksty, layout, kolory, komponenty wizualne, responsywność.

## Czego NIGDY nie wolno Ci dotykać
- `supabase/functions/**` (Edge Functions — logika biznesowa, generowanie dokumentów, zmiana
  statusu pożyczki, wszystko co pisze/zmienia dane)
- `supabase/migrations/**` i `supabase/config.toml`
- `src/routes/api/**`, `src/server.ts`, `src/start.ts`, `src/integrations/**`
  (kod serwerowy i integracje zewnętrzne)
- Wszystko związane z RLS, policies, auth, rolami użytkowników
- `.env`, klucze API, sekrety, dowolna konfiguracja CI/CD (w tym `wrangler.jsonc`)
- `package.json`, lockfile (`bun.lock`, `package-lock.json`), `bunfig.toml`, wersje zależności
- Kod poza swoim branchem (nie mergujesz, nie pushujesz do `main`)

Jeśli prompt operatora wymaga zmiany w którymkolwiek z powyższych miejsc — NIE wykonuj zmiany.
Zamiast tego napisz krótkie podsumowanie: co operator chciał osiągnąć i dlaczego wymaga to
review dewelopera, żeby mógł to zgłosić dalej.

## Sposób pracy
1. Operator podaje opis problemu/zmiany, czasem ze screenshotem.
2. Wprowadzasz zmianę wyłącznie w dozwolonym zakresie plików.
3. Po zmianie krótko podsumowujesz co i gdzie zmieniłeś (do logu/audytu).
4. Nie wykonujesz `git push` do `main` ani `git merge` — tylko commit na bieżącym branchu
   operatora. Wypchnięcie na produkcję wymaga osobnej decyzji człowieka (review PR).
5. Jeśli zmiana dotyczy komponentu, który wywołuje realną akcję biznesową (np. formularz
   zapisujący dane do bazy, generowanie dokumentu) — zaznacz to wyraźnie w podsumowaniu,
   nawet jeśli technicznie zmiana mieści się w dozwolonym zakresie plików.

## Kontekst projektu
- Stack: React + TanStack Router (routing plikowy w `src/routes/`), Supabase
  (Postgres + Edge Functions), TypeScript, Vite, Bun.
- To system finansowy (pożyczki pod zastaw nieruchomości) — priorytet: poprawność i
  audytowalność nad szybkością. Dane w tym środowisku są prawdziwe (produkcyjny Supabase),
  dostęp operatora ograniczony przez RLS niezależnie od tego pliku.
- Uprawnienia narzędzi Claude Code egzekwuje `.claude/settings.json` (reguły deny mają
  pierwszeństwo) — ten plik opisuje intencję i zakres, settings.json wymusza je technicznie.
