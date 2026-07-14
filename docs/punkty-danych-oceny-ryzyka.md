# Na ilu punktach danych opiera się system oceny ryzyka?

**Nagłówek: system oceny ryzyka FinYou analizuje ponad 650 punktów danych z 13 źródeł
(w tym 6 rejestrów rządowych/urzędowych), agreguje je w 7 komponentów scoringu
i 4 twarde reguły bezpieczeństwa. Przy pełnym wniosku (komplet dokumentów, historia
korespondencji, aktywny rynek lokalny) liczba analizowanych punktów przekracza 1000.**

Liczby policzone metodą „każde pole danych pobrane lub wyliczone w jednej pełnej ocenie
= 1 punkt danych" — czyli maksymalnie szeroko, ale w oparciu o realny kod
(`src/lib/risk-assessment/` + `src/lib/property-analysis/`). Poniżej pełne rozbicie.

## Rozbicie po etapach pipeline'u

| # | Etap / moduł | Źródło | Punkty danych |
|---|--------------|--------|---------------|
| 1 | Dane wejściowe wniosku (typ, adres, działka, powierzchnie, wartości, geolokalizacja…) | formularz + załączniki | **42** (18 pól + 6 dok. × 4 metadane) |
| 2 | OCR dokumentów — operaty, wypisy, odpisy KW, MPZP/WZ, umowy, zaświadczenia | Gemini 2.5 (do 6 dokumentów × ~15 pól) | **90** |
| 3 | Księga wieczysta — działy I–IV (właściciele, obciążenia, hipoteki z kwotą/walutą/wierzycielem, egzekucje, służebności, kondygnacja, klasa gruntu) | EKW Ministerstwa Sprawiedliwości | **25** |
| 4 | Analiza właściciela — PESEL (data ur., płeć, wiek, suma kontrolna), zgodność z działem II KW, aktuarialne trwanie życia | algorytm PESEL + tablice GUS (22 węzły e(x) × 2 płcie = 44 pkt referencyjne) | **54** |
| 5 | GUS BDL — przeciętne ceny transakcyjne (lokale zł/m², grunty rolne zł/ha wg 4 klas bonitacyjnych, 3 poziomy: powiat→województwo→kraj, sanity-check) | GUS Bank Danych Lokalnych API | **25** |
| 6 | RCN — rzeczywiste transakcje porównawcze z Rejestru Cen Nieruchomości (mediana, średnia, Q1/Q3, świeżość, 4 okna czasowe, diagnostyka) | Geoportal WFS | **35** + ~4/transakcję |
| 7 | Ryzyko powodziowe — 3 scenariusze (10%, 1%, 0,2%), strefa szczególnego zagrożenia, głębokość wody, prędkość przepływu, przecięcie map ryzyka | ISOK / Wody Polskie WMS | **11** |
| 8 | Lokalizacja i infrastruktura — geokodowanie + 6 kategorii POI × do 20 obiektów w promieniu 1,5 km | Google Maps Platform | **128** |
| 9 | Prognoza łatwości sprzedaży — populacja i trend, najbliższe duże miasto, 6 czynników popytu (miasto 50 km, woda 20 km, kurort, sanatorium, atrakcje, droga S/A/DK), popyt na najem, siła nabywcza | Perplexity sonar-pro | **20** |
| 10 | Czynnik kondygnacji (mieszkania) | KW / OCR | **5** |
| 11 | Charakter zabudowy działki (budowlana / zagrodowa RM / rolna) i krąg nabywców | MPZP / wypis | **5** |
| 12 | Aktywne oferty lokalne — 6 portali (otodom, olx, morizon, gratka, domiporta, nieruchomości-online), oferty biur vs prywatne, mediana zł/m², próbka ofert × 7 pól | Firecrawl | **86** |
| 13 | Wycena porównawcza AI (przedziały zł/m², min/max, trend, płynność, comparables, cytowania) | Perplexity sonar-pro | **14** |
| 14 | Wycena nadrzędna „master" (widełki wartości, max kwota pożyczki, cap LTV, trend, rekomendacja) | Perplexity sonar-pro | **14** |
| 15 | Trend rynku mieszkaniowego (zmiana kwartalna/roczna) | NBP | **5** |
| 16 | Weryfikacja podmiotu gospodarczego (forma prawna, status, PKD, adres, KRS) | GUS REGON BIR 1.1 | **8** |
| 17 | Analiza behawioralna korespondencji — sentyment, poziom współpracy, presja czasowa, red flags, deklarowane fakty, niespójności z KW/wnioskiem | Gmail / Messenger / transkrypcje voicebota | **10** + 1/wiadomość |
| 18 | Wycena wymuszonej sprzedaży — ceny wywoławcze I i II licytacji (art. 965 i 983 KPC), blokada licytacji lokalu mieszkalnego (art. 952¹ § 2 KPC), pokrycie pożyczki | wyliczenia wg KPC | **16** |
| 19 | Benchmark wyceny + LTV + score zabezpieczenia (5 komponentów) | agregacja | **22** |
| 20 | Scoring końcowy — 7 komponentów ważonych, 4 twarde ograniczenia (hard caps), ocena 0–100, klasa A–E, rekomendacja, do 12 ryzyk i 10 mocnych stron | `risk-scoring.ts` | **40** |

**Suma pól stałych: ~650 punktów danych.**

Do tego elementy zmienne, liczone per sztuka:

- każda transakcja porównawcza z RCN: ~4 punkty (cena, data, powierzchnia, typ) — typowo 10–50 transakcji,
- każda wiadomość w korespondencji z klientem: 1+ punkt — typowo 20–100 wiadomości,
- każda znaleziona oferta lokalna: 7 punktów.

**Typowa pełna ocena: 800–1000+ punktów danych. Bogaty wniosek (dużo transakcji RCN,
długa korespondencja): 1200+.**

## Liczby pomocnicze (do komunikacji)

- **13 źródeł danych** w katalogu (`data-sources.ts`), w **7 kategoriach**
- **6 źródeł rządowych/urzędowych**: EKW (Min. Sprawiedliwości), GUS BDL, tablice trwania życia GUS, GUS REGON BIR, ISOK/Wody Polskie, RCN/Geoportal
- **7 komponentów scoringu** z wagami: zabezpieczenie 24%, stan prawny 22%, płynność wyjścia 17%, pewność wyceny 12%, ryzyko dożycia 10%, korespondencja 9%, kompletność dokumentów 6%
- **4 twarde reguły bezpieczeństwa** (hard caps): egzekucja w KW, niezgodność właściciela, bardzo wysokie ryzyko powodziowe, ≥3 red flags w korespondencji
- **Skala 0–100**, **5 klas ryzyka A–E**, **4 poziomy rekomendacji**
- **3 artykuły KPC** stosowane wprost w wycenie wymuszonej sprzedaży (art. 965, 983, 952¹ § 2)

## Metodologia (żeby liczba była obronialna)

Punkt danych = pojedyncze pole pobrane ze źródła zewnętrznego lub wyliczone przez system
w ramach jednej oceny (pola interfejsów `InvestmentRiskAssessment`,
`PropertyAnalysisResult` i modułów składowych). Punkty referencyjne (tablice GUS,
progi KPC) liczone raz na ocenę. Elementy powtarzalne (dokumenty, transakcje, oferty,
wiadomości) liczone per sztuka — stąd widełki. Liczba nie obejmuje tokenów/tekstu
surowego analizowanego przez modele AI (przy ich uwzględnieniu byłaby o rzędy wielkości
większa).
