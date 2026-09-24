# Silnik klauzul umów pożyczki (`contract-engine`)

Port silnika `umowa_engine` (Python) na TypeScript. Architektura bez zmian:
**AI wypełnia wyłącznie dane zgodne ze schematem, a tekst umowy składa kod
deterministycznie z biblioteki klauzul.** Model nie dotyka treści umowy — nie
może urwać zdania, pomylić numeracji ani zostawić klauzuli o poręczycielu
w umowie bez poręczyciela.

## Pliki

| Plik                         | Rola                                                                                                          | Odpowiednik w silniku                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `schema.ts`                  | Kontrakt danych (zod + typy TS). `.strict()` = `additionalProperties:false`.                                  | `schema/umowa.schema.json`             |
| `clauses.json`               | Biblioteka klauzul (v1.3: 110 klauzul, 8 sekcji). Tu edytuje prawnik.                                         | `clauses/klauzule.json`                |
| `umowa-docx.ts`              | Komplet w jednym .docx: wniosek → umowa → Zał. 1–3; podpisy jako niewidoczne tabele.                          | —                                      |
| `komplet.ts`                 | `generujKomplet()` — jedno wejście dla kreatora, agenta i MCP (render + .docx + SHA-256 + wersja biblioteki). | —                                      |
| `oplaty-windykacyjne.ts`     | Stawki Załącznika nr 3 — jedyne miejsce konfiguracji.                                                         | —                                      |
| `conditions.ts`              | Ewaluator warunków — **własny parser, bez `eval`/`Function()`**.                                              | `ewaluuj_warunek`                      |
| `facts.ts`                   | Fakty pochodne + oznaczenia i odmiana stron.                                                                  | `zbuduj_fakty`, `oznaczenie_strony`, … |
| `renderer.ts`                | Złożenie dokumentu, numeracja, podstawianie pól.                                                              | `renderuj`                             |
| `validator.ts`               | Dwie warstwy: schemat (zod) + reguły konstrukcyjne (R1–R32; bez ocen merytorycznych).                         | `validator.py`                         |
| `odeslania.ts`               | Walidacja odesłań wewnętrznych po numeracji (umowa + cały komplet); błąd = blokada generacji.                 | —                                      |
| `kw-nieruchomosci.server.ts` | Nieruchomości z treści KW w cache (sąd, opis, właściciele, obciążenia) — wspólne dla MCP i kreatora.          | —                                      |
| `formatter.ts`               | Podgląd tekstowy (do diffów/przeglądu). Wierny port `textwrap`.                                               | `formatter.py`                         |
| `fixtures/`                  | 5 scenariuszy testowych, kopie 1:1.                                                                           | `tests/`                               |
| `contract-engine.test.ts`    | Port całego `test_suite.py` (194 asercje, w tym 33 negatywne).                                                | `test_suite.py`                        |

## Zmiany po sprawie Kańkowskich (zlecenie)

Cztery zmiany — i tylko te cztery. Zasada nadrzędna zachowana: silnik jest
narzędziem konstrukcyjnym, nie doradcą — **żadnych nowych reguł oceniających
ryzyko prawne**; kontrole spójności konstrukcyjnej zostają.

1. **Autonaprawa rozjazdu groszowego** (`autonaprawHarmonogram` w
   `schedule.ts`): rozjazd sumy rat względem sumy składników w granicach
   tolerancji zaokrągleń (kilka groszy na ratę, łącznie 1–2 zł) jest domykany
   na racie ostatniej (balonowej); korekta jest odnotowana w wyniku
   (`autokorekty` w `generate-umowa.functions.ts`), nie w treści umowy.
   Większy rozjazd pozostaje błędem konstrukcyjnym.
2. **Współwłasność ułamkowa przywrócona**: `wspolwlasnosc.rodzaj = "ulamkowa"`
   - pole `udzial` przy współwłaścicielu. Komparycja opisuje udziały
     („w udziale wynoszącym 1/2 części"), klauzula `ZAB_01c` opisuje, że hipoteka
     obciąża całą nieruchomość, gdy wszyscy współwłaściciele przystępują do
     Umowy. Bez reguły blokującej. Gdy współwłaściciel jest zarazem
     pożyczkobiorcą, żadna zgoda od niego się nie generuje.
3. **Rolnik prowadzący gospodarstwo**: `dzialalnosc = "gospodarstwo_rolne"`
   przy osobie fizycznej; NIP gospodarstwa przy jednym ze współrolników
   (przedstawicielu). Komparycja: „rolnicy prowadzący wspólne gospodarstwo
   rolne". Klauzula niekonsumencka (OSW_01) obejmuje ten status.
4. **Hipoteki przymusowe w dziale IV**: klauzula o stanie obciążeń
   (`OSW_03b/OSW_03c`) opisuje wpisy z działów III/IV — rodzaj (umowna /
   przymusowa), wierzyciel instytucjonalny (KRUS, ZUS, US, Skarb Państwa),
   kwota, treść wpisu. Tylko opis stanu księgi — bez ostrzeżeń o
   pierwszeństwie.

## Jeden silnik, komplet dokumentów (wrzesień 2026)

**Jedno źródło prawdy.** Kreator pożyczki (`/admin/kreator-pozyczki`), agent
umowy (`/inwestor`) i MCP (`draft_contract`, `generate_contract_docx`) składają
dokument tą samą funkcją `generujKomplet()`. Wzór `u01-04-umowa-pozyczki-z-
zalacznikami-redline` w `document_templates` ma `use_case = 'legacy'` —
znika z kreatora dokumentów, a generatory szablonowe odmawiają jego użycia.

**Komplet w jednym .docx** (każda część od nowej strony, pod każdą blok
podpisów jako niewidoczna tabela — nie tabulatory, które psują się w Google
Drive): Wniosek o udzielenie pożyczki → Umowa → Zał. 1 Harmonogram (tabela
rat z prowizją + sumy) → Zał. 2 Protokół z negocjacji → Zał. 3 Tabela opłat
windykacyjnych (`oplaty-windykacyjne.ts`).

**Układ umowy jak we wzorcu Kańkowskich:** §1 Przedmiot, §2 Kwota/prowizja/
wypłata (z warunkami uruchomienia, gdy są), [Poręczenie], Zabezpieczenia,
Windykacja, Oświadczenia stron (w tym RODO i protokół negocjacji),
Postanowienia ogólne, Wypowiedzenie. Treść istniejących klauzul bez zmian —
przesunięte tylko sekcje. Nowe klauzule: `WIN_*`, `OSW_20*`, `OSW_21`,
`OSW_22`, `RODO_01*`, `POG_*`, `WYP_*`.

**Odesłania** (`{{ref:ID}}` → „§ 3 ust. 4”, `{{ref_par:ID}}` → „§ 1”) są
liczone po numeracji — wyłączenie klauzuli nie zostawi błędnego numeru
(odesłanie do wyłączonej klauzuli = błąd renderowania).

**Dokument = wyłącznie treść wiążąca.** Żadnych ostrzeżeń, uwag, komentarzy,
placeholderów ani znaków wodnych (test `komplet.test.ts`). Walidator sprawdza
tylko kompletność i spójność konstrukcyjną — usunięte R9, R10, R13 i
ostrzeżenie „<10% kwoty po spłacie wierzycieli” (oceny merytoryczne).

**Docelowa rata końcowa** (`harmonogram.kwota_raty_koncowej_docelowa`):
silnik dobiera prowizję do grosza tak, by raty regularne mieściły się
w pułapie, a ostatnia rata wyniosła dokładnie cel (np. kapitał + pułap);
różnice groszowe zawsze w ostatniej racie (`loan-schedule.ts`, R29).

**Numery KW** normalizowane na każdym wejściu (`src/lib/kw.ts`:
`validateKwNumber`) — dopełnienie do 8 cyfr + cyfra kontrolna (algorytm EKW).

**Audyt:** każda generacja = trwały wpis w `generated_documents`
(`template_slug = 'silnik-umow-komplet'`, opcjonalnie `loan_application_id`)

- wiersz `audit_logs` (`action = 'contract_generated'`: kto, kiedy, SHA-256
  tekstu dokumentu, wersja biblioteki klauzul).

## Biblioteka 1.3 (wrzesień 2026)

Nowe klauzule (własne ID i `order`; treść istniejących zmieniona tylko za
zgodą z 24.09.2026 — lista niżej):

- `PRZ_03` § 1 ust. 3 — zakaz celu nieruchomościowego (fakt
  `zakaz_celu_nieruchomosciowego`: pole `warunki.zakaz_celu_nieruchomosciowego`,
  domyślnie włączony, wyłączony przy spłacie wierzycieli hipotecznych; R32
  blokuje jawną sprzeczność).
- `KWO_06*` § 2 ust. 6 — warunki wejścia w życie (a) oryginał z podpisem
  poświadczonym notarialnie, (b) wypisy aktów z żądaniem wpisu hipoteki (i
  roszczenia o opróżnione miejsce, gdy dotyczy) oraz 777, (c) oryginały
  dokumentów. Wypłata (`KWO_03`, `KWO_03b`, nowy `KWO_03c`) odsyła do nich
  przez `{{ref}}`; warunki `WZA_*` przesuwają się na ust. 7.
- `OSW_20n` — aktywna działalność gospodarcza (JDG/osoba fizyczna
  przedsiębiorca, nie rolnik); to samo oświadczenie we Wniosku.
- `OSW_03d*` — hipoteki z `sposob_usuniecia = pozostaje_akceptowane`:
  oświadczenie, że dług nie jest spłacany ze środków pożyczki, obowiązek
  terminowej obsługi, zakaz zwiększania, obowiązek informacyjny.
- `WYP_01h` — zwiększenie długu z wcześniejszej hipoteki / egzekucja jej
  wierzyciela; `WYP_01c` odsyła do oświadczeń przez `{{refs_lista:…}}`
  (wypisuje tylko te, które weszły do Umowy, z tematem z `temat_odeslania`).

Zmiany treści istniejącej (zgoda z 24.09.2026): zdanie o prowizji przy
wcześniejszej spłacie w `KWO_02`; `KWO_03`/`KWO_03b` odsyłają do § 2 ust. 6;
usunięte `OSW_20a`/`OSW_20b` (dublowały § 5 ust. 1) i `WZA_01` (dublował § 2
ust. 6); `OSW_21` — „ustanowienie hipoteki nie wymaga zgody osób trzecich” i
wariant bez danych o stanie cywilnym; `WYP_01g` kończy się średnikiem (renderer
stawia kropkę po ostatnim podpunkcie wyliczenia); `ZAB_02b` — „ust. 1” jako
`{{ref}}`; brak rachunku wierzyciela przy spłacie ze środków pożyczki to błąd
R31 zamiast placeholdera w treści.

**Rodzaj gramatyczny:** pole `plec` („K”/„M”), a gdy brak — PESEL (z poprawną
cyfrą kontrolną), w ostateczności imię. Formy `pb_*` mają wariant żeński
(„zawarła”, „świadoma”, „wobec niej”, „jej”); liczba mnoga bez zmian; spółka
— rodzaj męski („Pożyczkobiorca”). Komparycja: „zwaną/zwanym dalej”, przy
kilku pożyczkobiorcach jedno „zwanymi dalej łącznie”. Wniosek w 1. osobie
wg płci (kilku wnioskodawców — liczba mnoga), Protokół wg faktów `pb_*`.

**Odesłania:** w bibliotece wyłącznie jako `{{ref}}`/`{{ref_par}}`/`{{refs_lista}}`
(test lint). Po numeracji `bledyOdeslanUmowy` sprawdza każde „§ N ust. M lit. x”,
„ust. M” i „Załącznik nr N” w Umowie, a `bledyOdeslanKompletu` — odesłania
bezwzględne w całym komplecie (wniosek, załączniki). Cytaty przepisów („art.
777 § 1 pkt 5 k.p.c.”) są pomijane. Błąd = `BladPola`, generacja zablokowana.

**Tekst kompletu:** `tekstKompletu()` — podgląd `draft_contract` i kreatora to
ten sam tekst, który trafia do pliku i do SHA-256. `generate_contract_docx`
zwraca go w polu `tekst`; `get_generated_document_text(id)` odczytuje tekst
pliku z rejestru i porównuje SHA-256 z audytem.

**KW:** kreator uzupełnia nieruchomość z treści KW w cache (jak `kw_numbers`
w MCP; brak treści = ostrzeżenie, nie blokada). Sąd — z okładki księgi albo
innej księgi tego samego wydziału w cache; statycznej tabeli „kod wydziału →
sąd” celowo nie ma (wymaga zweryfikowanego wykazu kodów wydziałów).

## Agent umowy (AI) — główny ekran /inwestor

Silnik jest uzbrojony w **osobnego agenta czatowego tylko do wypełniania
umowy** (`umowa-agent.functions.ts` + jądro `umowa-agent-core.ts`, panel
`components/inwestor/umowa-agent-panel.tsx` na głównym ekranie `/inwestor`).
Architektura zgodna z filozofią silnika: AI zwraca wyłącznie łatkę danych pod
schemat `UmowaData` (deep-merge), a kod deterministycznie dolicza kwoty
słownie, identyfikatory nieruchomości i harmonogram rat
(`buildEngineSchedule`), domyka grosze autonaprawą, waliduje i składa
podgląd/.docx tymi samymi funkcjami co kreator. Agent nie dotyka treści
klauzul i niczego nie liczy sam.

## Weryfikacja wierności

Port był sprawdzany względem oryginału (Python) jako wyroczni:

- **Renderowanie** — dla wszystkich 5 scenariuszy sformatowany dokument jest
  **bajt w bajt identyczny** z wyjściem silnika.
- **Walidator** — pełna zgodność (błędy + ostrzeżenia, co do treści komunikatu)
  dla 5 scenariuszy i 35 przypadków mutacyjnych.
- **Ewaluator warunków, odmiana nazwisk, warstwa schematu** — zgodne
  z odpowiednimi testami (A10 — podmiana tokenów w literale, A11 — odrzucenie
  niebezpiecznego wyrażenia, H15–H19 — odmiana, I5/I10 — schemat odrzuca
  świadomie usunięte pola).

Pułapki z README silnika, na które port zwraca uwagę:

- **A10** — przy podstawianiu tokenów łatwo podmienić coś wewnątrz literału
  tekstowego (`'nie_potracana_raty'`). Parser leksuje literały jako całość, więc
  klauzula o prowizji nie znika po cichu.
- **Prawdziwość w stylu Pythona** — pusta lista jest fałszywa. Dotyczy to m.in.
  reguły R16 (`raty` puste = brak walidacji liczby rat).

## Co jest, a czego jeszcze nie ma

Zrealizowane (pkt 3.1 i 3.5 zlecenia — część niezależna od decyzji blokujących):

- ✅ Port silnika do TS (schema, klauzule, warunki, fakty, renderer, walidator).
- ✅ Port wszystkich 194 testów.

**Nierozstrzygnięte / zablokowane** (wymagają decyzji spoza kodu):

1. **Model finansowy (pkt 2 zlecenia).** Silnik zakłada model Finance You:
   pełna wypłata, prowizja **nie potrącana**, rozłożona na raty jako ułatwienie
   płatnicze (klauzula KWO_02); rata balonowa jako ostatnia z N rat; odsetki od
   kapitału pozostającego do spłaty. Kalkulator w repo (`client-profile-math.ts`,
   `loan-math.ts`) liczy inaczej (`netto + prowizja = nominał`, `riskFee`,
   osobny wiersz „Balon”). **Zanim przepiszemy matematykę, decyzja musi zapaść
   z Filipem.** Schemat pola `warunki.harmonogram.raty` czeka na adapter
   z kalkulatora (pkt 3.2) — w payloadzie `LoanCalcPayload` nie ma pola na
   prowizję w racie, co jest wprost konsekwencją tej rozbieżności.

2. **Producent `KwExtraction` (pkt 3.3.0/3.3.1).** Mapper KW → schemat silnika
   (pkt 3.3.2) nie ma wejścia: w repo nic nie produkuje `KwExtraction` (dane KW
   są trzymane jako HTML). Wybór ścieżki (JSON z API / parser HTML / AI) zależy
   od weryfikacji dokumentacji CMD KW Engine, do której nie ma tu dostępu.

3. **Podmiana kreatora (pkt 3.4)** — na końcu, zależy od 1 i 2.

## Do weryfikacji prawnej (nie kodować obejść)

Za README silnika: opróżnione miejsce hipoteczne (ZAB_02, art. 101¹ u.k.w.h.),
wypłata przed wykreśleniem dożywocia (WZA_05/ZAB_10), zgoda małżonka na
poręczenie (POR_05/POR_05b, art. 41 § 2 k.r.o.). Jeśli w trakcie prac natrafisz
na coś, co wygląda na błąd prawny — **zgłoś, nie poprawiaj po cichu.**
