# Oświadczenie inwestora o źródle pochodzenia środków — opis dla osoby odpowiedzialnej za AML

Dokument do dołączenia do wewnętrznej procedury AML Finance You sp. z o.o.
Stan na 23 października 2026 r. (weryfikacja tekstu ustawy wykonana tego dnia
na tekście jednolitym Dz.U. 2025, ISAP).

## 1. Czy ustawa wymaga oświadczenia od inwestora?

Ustawa z dnia 1 marca 2018 r. o przeciwdziałaniu praniu pieniędzy oraz
finansowaniu terroryzmu nie zawiera przepisu „każdy klient składa oświadczenie
o źródle środków”. Obowiązek wynika z kilku przepisów czytanych razem:

| Przepis                     | Treść (skrót)                                                                                                                                                    | Skutek dla inwestora                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| art. 34 ust. 1 pkt 4 lit. b | środek bezpieczeństwa finansowego: „badanie źródła pochodzenia wartości majątkowych będących w dyspozycji klienta – w przypadkach uzasadnionych okolicznościami” | inwestor wnosi własne środki na pożyczki — sama natura relacji jest okolicznością uzasadniającą badanie; podejście oparte na ryzyku |
| art. 34 ust. 3              | instytucja dokumentuje zastosowane środki i na żądanie organów wykazuje, że były odpowiednie do ryzyka                                                           | oświadczenie z pełną treścią, wersją, IP i czasem to dowód dla kontroli GIIF                                                        |
| art. 43 ust. 4 pkt 2        | transakcje „opiewające na wysokie kwoty, które nie są uzasadnione okolicznościami” → wyjaśnienie okoliczności, intensyfikacja monitoringu                        | deklarowana skala od 1 mln zł rocznie kieruje oświadczenie do analizy człowieka                                                     |
| art. 44 ust. 1 pkt 2        | państwo trzecie wysokiego ryzyka → **obowiązkowo** informacja o źródle majątku i źródle pochodzenia wartości majątkowych                                         | środki spoza EOG, Szwajcarii i Wielkiej Brytanii → analiza człowieka                                                                |
| art. 46 ust. 2 pkt 2        | PEP → **obowiązkowo** „odpowiednie środki w celu ustalenia źródła majątku klienta i źródła pochodzenia wartości majątkowych”                                     | dla potwierdzonego PEP dodatkowo wzmożone środki w module screeningu (źródło majątku + załączniki + akceptacja zarządu)             |
| art. 41 ust. 1              | brak możliwości zastosowania środka → brak nawiązania / rozwiązanie stosunków gospodarczych                                                                      | bez oświadczenia inwestor nie podpisze umów i nie złoży Zlecenia; odmowa = status „odrzucone”                                       |
| art. 49                     | przechowywanie dokumentacji środków bezpieczeństwa przez 5 lat                                                                                                   | tabela oświadczeń jest append-only, bez FK kasujących dane po usunięciu konta                                                       |

Wniosek: dla inwestorów oświadczenie przy onboardingu jest minimalnym,
standardowym sposobem zastosowania środka z art. 34 ust. 1 pkt 4 lit. b
i udokumentowania go (ust. 3); w przypadkach z art. 44 i 46 badanie źródła
jest bezwzględnie obowiązkowe. Dla pożyczkobiorców (klientów) ustawa nie
wymaga takiego oświadczenia przy onboardingu — oni środki otrzymują;
ich transakcje obejmuje bieżące monitorowanie (art. 34 ust. 1 pkt 4 lit. a).

Uwaga redakcyjna: w odróżnieniu od oświadczenia PEP (art. 46 ust. 1) ustawa
nie przewiduje dla oświadczenia o źródle środków klauzuli odpowiedzialności
karnej z art. 233 § 6 Kodeksu karnego. Treść oświadczenia zawiera więc
potwierdzenie prawdziwości oraz pouczenie o skutkach z art. 41 i o możliwym
zawiadomieniu GIIF — bez klauzuli „pod rygorem odpowiedzialności karnej”.

## 2. Miejsce w pipelinie inwestora

Krok 5 — po screeningu list sankcyjnych i PEP (krok 4), przed doręczeniem
pakietu (6), Umową ramową (7), NDA (8), RODO (9) i Zleceniem (10). Środki
bezpieczeństwa finansowego stosuje się przed nawiązaniem stosunków
gospodarczych, więc bez zamkniętego kroku 5 serwer odrzuca:

- akceptację każdego dokumentu pakietu (`acceptLegalDocument`),
- złożenie Zlecenia (`submitInvestorOrder` przez funkcję SQL
  `investor_pipeline_complete`, która wymaga `investors.sof_status` w
  `('zlozone','zaakceptowane')`).

Kolejność kroków i stany liczy `computeInvestorPipeline`
(`src/lib/investor-plan/pipeline.ts`); krok wymaga pozytywnego KYC (krok 3),
żeby oświadczenie składała zweryfikowana osoba.

## 3. Treść oświadczenia

Źródło prawdy: `src/lib/investor-plan/source-of-funds.ts`
(`SOF_DECLARATION_TEXT`, wersja `sof-2026-10-v1`). Inwestor wskazuje:

1. **Źródła środków** (wielokrotny wybór): wynagrodzenie, działalność
   gospodarcza, kapitał spółki (tylko osoba prawna), oszczędności, dochody
   kapitałowe, sprzedaż nieruchomości, sprzedaż firmy / udziałów, darowizna
   lub spadek (nie dla spółki), kredyt lub pożyczka (środki obce), inne
   (z obowiązkowym opisem).
2. **Opis** — zalecany; obowiązkowy dla środków obcych (kto, kiedy, na jakich
   warunkach).
3. **Kraj pochodzenia środków** (kod ISO, domyślnie PL).
4. **Planowaną skalę finansowania** przez Finance You w 12 miesięcy
   (do 100 tys. zł … powyżej 5 mln zł).
5. Trzy oświadczenia (środki własne i nie na rachunek osoby trzeciej; legalne
   pochodzenie; gotowość przedstawienia dokumentów i aktualizacji) oraz
   potwierdzenie prawdziwości i kompletności.

Zmiana treści wymaga podbicia `SOF_DECLARATION_TEXT_VERSION`; serwer odrzuca
oświadczenie złożone na starszej wersji tekstu.

## 4. Podejście oparte na ryzyku — co zamyka automat, co człowiek

`assessSourceOfFunds` liczy sygnały ryzyka przy złożeniu:

| Sygnał                      | Warunek                                        | Podstawa                              |
| --------------------------- | ---------------------------------------------- | ------------------------------------- |
| `inne_zrodlo`               | wybrano „inne”                                 | art. 34 ust. 1 pkt 4 lit. b           |
| `srodki_obce`               | wybrano „kredyt lub pożyczka”                  | pożyczanie środków obcych — nietypowe |
| `kraj_podwyzszonego_ryzyka` | kraj spoza EOG, Szwajcarii i Wielkiej Brytanii | art. 43 ust. 2 pkt 10, art. 44        |
| `wysoka_skala`              | skala „1–5 mln zł” albo „powyżej 5 mln zł”     | art. 43 ust. 4 pkt 2                  |

- **Bez sygnałów** → status `zlozone`: krok zamknięty, pipeline idzie dalej.
- **Co najmniej jeden sygnał** → status `do_weryfikacji`: krok „wymaga uwagi”,
  umowy i Zlecenie wstrzymane, e-mail do osoby odpowiedzialnej za AML
  (`screening_settings.aml_officer_emails`, kto nią jest:
  `docs/aml/osoby-odpowiedzialne.md`) z linkiem do karty inwestora.

Progi (lista krajów, skala) są stałymi w module — zmiana wymaga zmiany kodu
i wpisu w procedurze.

## 5. Decyzje compliance (panel administratora, karta inwestora)

Decyzję dla najnowszego oświadczenia podejmuje administrator albo operator
(`decideInvestorSourceOfFunds`), zawsze z uzasadnieniem (min. 10 znaków):

| Decyzja           | Skutek                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zaakceptowane`   | krok zamknięty, pipeline odblokowany                                                                                                                     |
| `do_uzupelnienia` | treść uzasadnienia widzi inwestor w panelu (co ma dostarczyć); dokumenty przesyła e-mailem; po nich składa nowe oświadczenie — ocena od nowa             |
| `odrzucone`       | brak możliwości zastosowania środka (art. 41) — inwestor nie złoży nowego oświadczenia bez zmiany statusu przez compliance; umowy i Zlecenie zablokowane |

Każde złożenie (`sof_declaration.signed`) i każda decyzja
(`sof_declaration.decided`) trafiają do nieusuwalnego logu
`screening_audit_log` (typ encji `declaration`, `details.kind =
'source_of_funds'`).

Dla potwierdzonego PEP obowiązują dodatkowo wzmożone środki modułu
screeningu (`docs/aml/screening-pep-sankcje.md`, pkt o źródle majątku
i źródle środków z załącznikami oraz akceptacji członka zarządu) — oświadczenie
z kroku 5 jest punktem wyjścia, nie zastępuje tamtej procedury.

## 6. Dane i przechowywanie

- Tabela `investor_source_of_funds_declarations` — pełna treść, wersja,
  `signed_at`, IP, user-agent, kanał, sygnały ryzyka, decyzja. Trigger
  blokuje `DELETE` i każdą zmianę poza polami `review_*`.
- Profil `investors`: `sof_declaration_id`, `sof_status`, `sof_declared_at`,
  `sof_reviewed_at` — stan najnowszego oświadczenia dla pipeline'u.
- RLS: inwestor czyta własne oświadczenia, personel wewnętrzny — wszystkie;
  zapis wyłącznie przez serwer (service role).
- Celowo bez kluczy obcych do `auth.users` i `investors`, żeby usunięcie konta
  nie usuwało dowodu AML (art. 49 — 5 lat).
- Narzędzie MCP `get_investor` zwraca `sof_status` i `sof_declared_at`.

Migracja: `supabase/migrations/20261023090000_oswiadczenie_zrodlo_srodkow_inwestora.sql`
(lustro drizzle `0042`).

## 7. Czego moduł nie robi

- Nie przyjmuje załączników w kroku 5 — dokumenty potwierdzające (PIT/CIT,
  akt notarialny, umowa sprzedaży, wyciąg) inwestor przesyła e-mailem na
  prośbę compliance; dla PEP załączniki trzyma moduł screeningu.
- Nie weryfikuje oświadczenia automatycznie w zewnętrznych bazach — ocena
  prawdziwości należy do człowieka.
- Nie monitoruje transakcji inwestora po onboardingu — to rejestr
  transakcji i sprawy AML (`docs/aml.md`).
