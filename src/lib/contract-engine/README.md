# Silnik klauzul umów pożyczki (`contract-engine`)

Port silnika `umowa_engine` (Python) na TypeScript. Architektura bez zmian:
**AI wypełnia wyłącznie dane zgodne ze schematem, a tekst umowy składa kod
deterministycznie z biblioteki klauzul.** Model nie dotyka treści umowy — nie
może urwać zdania, pomylić numeracji ani zostawić klauzuli o poręczycielu
w umowie bez poręczyciela.

## Pliki

| Plik | Rola | Odpowiednik w silniku |
|---|---|---|
| `schema.ts` | Kontrakt danych (zod + typy TS). `.strict()` = `additionalProperties:false`. | `schema/umowa.schema.json` |
| `clauses.json` | Biblioteka 47 klauzul + 10 sekcji, **kopia 1:1**. Tu edytuje prawnik. | `clauses/klauzule.json` |
| `conditions.ts` | Ewaluator warunków — **własny parser, bez `eval`/`Function()`**. | `ewaluuj_warunek` |
| `facts.ts` | Fakty pochodne + oznaczenia i odmiana stron. | `zbuduj_fakty`, `oznaczenie_strony`, … |
| `renderer.ts` | Złożenie dokumentu, numeracja, podstawianie pól. | `renderuj` |
| `validator.ts` | Dwie warstwy: schemat (zod) + 27 reguł biznesowych (R1–R27). | `validator.py` |
| `formatter.ts` | Podgląd tekstowy (do diffów/przeglądu). Wierny port `textwrap`. | `formatter.py` |
| `fixtures/` | 5 scenariuszy testowych, kopie 1:1. | `tests/` |
| `contract-engine.test.ts` | Port całego `test_suite.py` (194 asercje, w tym 33 negatywne). | `test_suite.py` |

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
   + pole `udzial` przy współwłaścicielu. Komparycja opisuje udziały
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
