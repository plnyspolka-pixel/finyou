# KRZ — tablica obwieszczeń: pobieranie i analiza AI (PoC)

Stan: **proof of concept, 2026-11-06**. Działa lokalnie, nie jest wdrożone
produkcyjnie. Uzupełnia wcześniejsze ustalenia z
[kw-owner-intelligence.md](kw-owner-intelligence.md) (sekcja „Techniczna próba
bezpośredniego scrapingu KRZ”), gdzie dostęp z CI kończył się HTTP 403.

## Co ustalono o portalu

- `https://krz.ms.gov.pl` to SPA (Angular). Tablica obwieszczeń woła
  wewnętrzne API: `https://krz-rejpub-gui-krz-pub-prod.apps.ocp.prod.ms.gov.pl/api/v1/…`
  - `GET obwieszczenie/wyszukaj-po-dacie?Data Od=…&Data Do=…&podkategoria=R01,…&odebraneKategorie=false`
    → JSON: grupy → kategorie → obwieszczenia (id, numer, data, sygnatura, sąd,
    wydział, imię/nazwisko lub nazwa podmiotu, podkategoria, rodzaj sprawy U/R/Z).
    Maks. **1000 pozycji** na zapytanie (`czyPrzekroczono`). Dwa dni robocze to
    już ~1000, więc skrypt pyta dzień po dniu i dzieli podkategorie na pół.
  - `GET obwieszczenie/xml?id=<idZewnetrzny>` → XML `rej:dokumentObwieszczenia`:
    metryka, `osobaFizyczna` (imię, nazwisko, miejscowość, **PESEL**, NIP,
    prowadziDzialalnosc) lub `uczestnikPodmiot` (nazwa, siedziba, forma prawna,
    KRS, NIP), atrybuty (terminy zaskarżeń), doradcy restrukturyzacyjni, `tresc`
    (HTML).
- Bez nagłówka `Authorization: bearer <JWT>` API zwraca **401**. SPA pobiera
  anonimowy token gościa przez OAuth (`acp-guest-auth-server…/authorize`,
  `client_id=acp-portal-pub`). Token jest ważny ok. **9 godzin**.
- Wejście z headless Chromium / GitHub Actions → **403** (Incapsula). Zwykły
  Chrome z oknem na komputerze użytkownika → 200. Z przechwyconym tokenem
  dalsze wywołania działają już zwykłym `fetch`.
- MS nie publikuje API ani dokumentacji; endpointy mogą się zmienić bez
  ostrzeżenia. Nie jest to podstawa produkcyjna — do produkcji rozważyć płatne
  API MGBI lub czekać na zapowiadane API MS.

## Pliki

| Plik                                                       | Rola                                                                                |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `scripts/krz-tablica.ts`                                   | CLI: `fetch` (token + lista + XML → katalog lub Supabase), `analyze` (AI), `raport` |
| `src/lib/krz/types.ts`                                     | typy odpowiedzi API, szczegółów i wyniku AI                                         |
| `src/lib/krz/parse.ts`                                     | spłaszczenie listy, parser XML (bez PESEL), HTML→tekst                              |
| `src/lib/krz/analyze.server.ts`                            | prompt + schemat JSON, `claudeJson` (Sonnet)                                        |
| `src/lib/krz/__fixtures__/`                                | zanonimizowane odpowiedzi do testów                                                 |
| `src/lib/krz/lookup.ts`, `lookup.server.ts`                | dopasowanie podmiotu z oceny ryzyka do kopii KRZ (NIP/KRS/nazwa)                    |
| `supabase/migrations/20261106180000_krz_obwieszczenia.sql` | tabela `krz_obwieszczenia`, RLS bez polityk, `krz_obwieszczenia_prune()`            |

## Uruchomienie

Wymaga lokalnie Chrome (lub `npx playwright install chromium`) i okna — skrypt
otwiera przeglądarkę na kilka sekund tylko po token.

```sh
bun install            # playwright jest w devDependencies
bun scripts/krz-tablica.ts fetch --od 2026-11-05 --do 2026-11-06 --out tmp/krz
bun scripts/krz-tablica.ts analyze --in tmp/krz --limit 20      # wymaga ANTHROPIC_API_KEY
bun scripts/krz-tablica.ts raport --in tmp/krz
```

Z zapisem do Supabase (po wdrożeniu migracji; wymaga `SUPABASE_URL` i
`SUPABASE_SERVICE_ROLE_KEY`): dodać `--db` do `fetch`, `analyze --db`,
`raport --db`. `fetch` jest idempotentny — pomija już zapisane obwieszczenia,
więc nadaje się do harmonogramu (np. co godzinę w dni robocze, zakres
`--od` wczoraj, `--do` dziś).

Zamiast `bun` działa `npx tsx scripts/krz-tablica.ts …`.

## Co zweryfikowano 2026-11-06

- `fetch` dla 05–06.11.2026: token gościa pobrany w 4 s; jedno zapytanie na
  2 dni zwróciło ucięte 1000 pozycji, po podziale na dni 836 + 799 = 1635
  obwieszczeń; 50 XML-i pobranych bez błędów (ok. 4 obwieszczenia/s).
- Testy parserów i promptu: `vitest run src/lib/krz`.
- **Nie zweryfikowano** `analyze` na żywo: w lokalnym środowisku nie ma
  `ANTHROPIC_API_KEY` (sekret jest tylko na Cloudflare). Prompt i schemat
  structured output są gotowe i przetestowane jednostkowo.
- Migracja nie została wdrożona na projekt Supabase.

## Dane osobowe i zasady

- XML osób fizycznych zawiera PESEL. Parser go **nie zwraca**, a w treści
  maskuje każdy 11-cyfrowy ciąg na `[PESEL]`. Do AI trafia tylko wersja po
  maskowaniu.
- Imię i nazwisko konsumentów (bez działalności) jest publiczne w KRZ, ale
  nie ma powodu trzymać go długo: `krz_obwieszczenia_prune()` usuwa takie
  wiersze po 90 dniach od daty obwieszczenia. Spółki i JDG zostają.
- Tabela ma włączone RLS bez polityk — czyta i pisze wyłącznie service role.
- Skrypt przy 403/429 przerywa i nie ponawia. Nie omija CAPTCHA ani WAF,
  nie używa proxy. Ok. 5 żądań/s.

## Wynik analizy AI (schemat)

`etap` (wniosek / zabezpieczenie / otwarcie / ogloszenie_upadlosci / oddalenie /
uklad / plan_splaty / umorzenie / zakonczenie / inne), `rodzajPodmiotu`
(konsument / jdg / spolka / inny), `streszczenie`, `kluczoweFakty[]`,
`terminDlaWierzycieli`, `sygnalRyzyka` (niski / sredni / wysoki),
`uzasadnienieRyzyka`, `wartoSprawdzicWBazie`, `identyfikatory {krs, nip}`.

## Wpięcie w analityka AI (ocena ryzyka)

Wywiad gospodarczy pożyczkobiorcy i właścicieli z działu II KW
(`src/lib/coowners/owner-intelligence.server.ts`, krok „KRZ/MSiG” w ocenie
ryzyka) sprawdza teraz równolegle z oficjalnym MSiG także lokalną kopię
tablicy KRZ:

- `src/lib/krz/lookup.server.ts` — zapytanie do `krz_obwieszczenia` po NIP,
  KRS i nazwie (ilike), nigdy nie rzuca: brak tabeli lub pusta kopia to
  status „niedostępna”, nie „brak postępowań”.
- `src/lib/krz/lookup.ts` — dopasowanie: NIP/KRS = zgodny identyfikator,
  pełna nazwa lub imię+nazwisko (także w odwrotnej kolejności) = tylko do
  weryfikacji. Samo nazwisko nie wystarcza. Kopia nie ma PESEL, więc osoby
  fizycznej nie da się potwierdzić identyfikatorem.
- Trafienie trafia do `hits` podmiotu jako `court_notice` ze źródłem
  „KRZ — tablica obwieszczeń (kopia lokalna)”; w `detail` jest kategoria,
  sąd, numer obwieszczenia i, jeśli obwieszczenie było już przeanalizowane,
  etap, sygnał ryzyka i streszczenie z AI.
- `summarizeCourtRegistry` pokazuje zakres dat kopii („…i w kopii tablicy
  KRZ (2026-11-01…2026-11-06)”), a `risk-scoring` zamienia ostrzeżenie
  „KRZ niedostępny automatycznie” na „sprawdzony tylko w kopii o ograniczonym
  zakresie dat”. Trafienia z identyfikatorem obniżają ocenę jak dotąd
  (`confirmedHits`), po nazwie liczą się jako niepotwierdzone.

Skuteczność zależy od tego, ile dni jest w kopii: bez harmonogramu `fetch`
analityk zobaczy tylko obwieszczenia z pobranych dni.

## Następne kroki (poza PoC)

1. Harmonogram `fetch` + `analyze --db` na maszynie z Chrome (nie Worker,
   nie Actions), np. co godzinę w dni robocze.
2. Alerty wsteczne: po każdym `fetch` dopasowanie nowych obwieszczeń do
   aktywnych pożyczkobiorców/poręczycieli (dziś sprawdzenie dzieje się tylko
   przy uruchomieniu oceny ryzyka).
3. Decyzja: dalej nieoficjalnie czy API MGBI (200–500 EUR/mies.).
