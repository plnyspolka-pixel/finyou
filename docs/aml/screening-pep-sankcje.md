# Screening PEP i list sankcyjnych — opis modułu dla osoby odpowiedzialnej za AML

Dokument do dołączenia do wewnętrznej procedury AML Finance You sp. z o.o.
Stan na 9 października 2026 r. (weryfikacja źródeł wykonana tego dnia).

## 1. Cel i podstawa prawna

Moduł ustala, czy klient, beneficjent rzeczywisty, reprezentant, inwestor albo osoba wskazana w oświadczeniu klienta:

- zajmuje eksponowane stanowisko polityczne (PEP);
- jest członkiem rodziny PEP;
- jest osobą znaną jako bliski współpracownik PEP;
- figuruje na liście sankcyjnej.

Podstawa prawna:

- ustawa z dnia 1 marca 2018 r. o przeciwdziałaniu praniu pieniędzy oraz finansowaniu terroryzmu: art. 2 ust. 2 pkt 11 (definicja PEP), art. 46 (oświadczenie klienta), art. 46a–46c (wzmożone środki wobec PEP i krajowy wykaz stanowisk);
- rozporządzenie Ministra Finansów, Funduszy i Polityki Regionalnej z 27 lipca 2021 r. w sprawie wykazu krajowych stanowisk i funkcji publicznych będących eksponowanymi stanowiskami politycznymi (tekst jednolity: Dz.U. 2023 poz. 1632; zmiana: Dz.U. 2023 poz. 2520).
  - Uwaga: krajowy wykaz stanowisk PEP jest rozporządzeniem wydanym na podstawie art. 46c ustawy. Nie jest to komunikat.
  - Zmiana z 2023 r. uchyliła pkt 9 (posłowie do PE). Pkt 12 dotyczy teraz przewodniczącego Trybunału Stanu. Dodano pkt 12a i 12b.
- ustawa z dnia 13 kwietnia 2022 r. o szczególnych rozwiązaniach w zakresie przeciwdziałania wspieraniu agresji na Ukrainę (lista MSWiA).

## 2. Zasady działania

1. **Brak płatnych baz i danych na licencji niekomercyjnej.**
   - Moduł nie używa OpenSanctions (ani jego API, yente czy mirrorów), World-Check, Dow Jones ani ComplyAdvantage.
   - Używa wyłącznie oficjalnych źródeł publicznych oraz Wikidata (CC0).
2. **Automat sam zamyka tylko jedno: „brak trafień”.**
   - Warunek: brak trafień od progu i oświadczenie klienta „nie” na wszystkie pytania.
   - Każde trafienie od progu 70 oraz każda odpowiedź „tak” w oświadczeniu tworzy sprawę do decyzji człowieka.
   - Automat nigdy nie odrzuca klienta i nie potwierdza statusu PEP ani trafienia sankcyjnego.
3. **Niezmienialny ślad audytowy.**
   - Tabela `screening_audit_log` przyjmuje wyłącznie nowe wpisy. Blokują to jednocześnie RLS i trigger, także dla roli serwisowej.
   - Wpisy tworzą łańcuch skrótów SHA-256. Funkcja „Zweryfikuj łańcuch skrótów” wykrywa zmianę lub usunięcie wpisu.
   - Oświadczenia PEP i zamknięte przebiegi screeningu są niezmienialne.
   - Decyzja w sprawie jest ostateczna. Jej zmiana wymaga nowej sprawy.
4. **RODO.**
   - Z zewnątrz pobieramy wyłącznie listy referencyjne.
   - Dopasowanie liczymy w naszej bazie. Dane klientów nie trafiają do żadnego zewnętrznego API.
   - Powiadomienia e-mail zawierają tylko numer sprawy, typ, wynik i link do panelu. Nie zawierają danych klienta.

> **Ważne — istniejące przepływy:** w platformie działają wcześniejsze screeningi przez zewnętrzne API Dilisense:
> - moduł AML inwestora (`aml_screenings`);
> - pipeline inwestora (`investor_screenings`, krok 4);
> - moduł projektów.
>
> Wysyłają one dane osób do dostawcy zewnętrznego, czyli są sprzeczne z zasadą 4. Nowy moduł ich nie usuwa. Decyzję o ich wyłączeniu podejmuje Finance You.

## 3. Źródła danych (weryfikacja 9.10.2026)

| Źródło | Adres | Format | Częstotliwość | Warunki użycia | Status |
|---|---|---|---|---|---|
| Wikidata | `https://query.wikidata.org/sparql` (POST, nagłówek User-Agent z kontaktem) | SPARQL JSON | co tydzień (import etapowy, partiami po 40 stanowisk) | CC0 | działa; przy dużym ruchu zwraca 429/502 — importer ponawia z wycofaniem |
| API Sejmu | `https://api.sejm.gov.pl/sejm/term`, `/sejm/term{N}/MP` | JSON | co tydzień (3 ostatnie kadencje) | informacja publiczna, ponowne wykorzystanie | działa (499 posłów X kadencji, z datą urodzenia i datą wygaśnięcia mandatu) |
| KPRM — skład Rady Ministrów | `https://www.gov.pl/web/premier/sklad-rady-ministrow` | HTML (scraping) | co tydzień | treści gov.pl: CC BY-SA 4.0 | działa (premier, wicepremierzy, ministrowie; bez dat urodzenia) |
| Senat | `https://www.senat.gov.pl/sklad/senatorowie/` | HTML | co miesiąc | — | **niedostępne**: HTTP 403 dla automatycznego pobierania; senatorowie tylko z Wikidata (częściowo) |
| API KRS | `https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/{KRS}?rejestr=P&format=json` | JSON | co miesiąc | informacja publiczna | **bez użytecznych danych**: API maskuje imiona, nazwiska i PESEL członków organów (np. „B*****”) |
| Lista sankcji finansowych UE (FSF) | `https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content?token=…` | XML | codziennie | dane Komisji Europejskiej przeznaczone dla instytucji finansowych; **licencję ponownego wykorzystania potwierdzić** | działa (6241 wpisów); własny token ustaw w `EU_FSF_TOKEN` (bez niego używany jest publiczny token z dokumentacji FSF) |
| Lista ONZ (Rada Bezpieczeństwa) | `https://scsanctions.un.org/resources/xml/en/consolidated.xml` (przekierowanie do pliku) | XML | codziennie | **warunki użycia do potwierdzenia** (kontakt: sc-sanctionslists@un.org); lista jest przeznaczona do wdrażania sankcji, nie redystrybuujemy jej | działa (736 osób + 274 podmioty) |
| Lista MSWiA | `https://www.gov.pl/web/mswia/lista-osob-i-podmiotow-objetych-sankcjami` | HTML (2 tabele) | codziennie | CC BY-SA 4.0 | działa (wersja listy 168.0: 437 osób, 131 podmiotów; wpisy wykreślone mają datę wykreślenia) |
| OFAC SDN (opcjonalnie) | `https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV` + `ALT.CSV` | CSV | codziennie (domyślnie **wyłączone**) | dane rządu USA, domena publiczna | działa (19 416 wpisów) |

Każdy import zapisuje następujące dane w tabeli `screening_source_imports`:

- datę;
- liczbę rekordów;
- liczbę zmienionych i wycofanych rekordów;
- sumę kontrolną pliku SHA-256;
- ewentualny błąd.

Zasady importu:

- **Ochrona danych.**
  - Jeśli źródło zwróci 0 rekordów albo mniej niż 50% dotychczas aktywnych, import kończy się błędem, a stare dane zostają.
  - Wpisy, które zniknęły z listy sankcyjnej, są oznaczane jako nieaktywne. Nie są usuwane.
- **Osoby PEP, które przestały pełnić funkcję, zostają w bazie.** Ich rekord dostaje datę zakończenia funkcji.
- **Zmiana treści listy sankcyjnej uruchamia rescreening.** Obejmuje on cały aktywny portfel, wyłącznie pod kątem sankcji.

## 4. Pokrycie krajowego wykazu i luki

Panel → *Screening PEP i sankcji* → zakładka **Pokrycie wykazu PEP**. Dla każdej pozycji wykazu raport pokazuje:

- podpięte źródła;
- liczbę osób (w tym bieżących);
- datę ostatniej aktualizacji.

Pozycje bez źródła są oznaczone jako **LUKA — tylko oświadczenie**. Najważniejsze luki:

- sędziowie SN, TK i NSA oraz sądów apelacyjnych — Wikidata ma tylko prezesów;
- Trybunał Stanu;
- członkowie zarządu NBP i RPP;
- generałowie (poza Szefem Sztabu Generalnego);
- członkowie organów partii politycznych;
- członkowie zarządów i rad nadzorczych spółek Skarbu Państwa — API KRS anonimizuje dane osób;
- sekretarze i podsekretarze stanu (pokrycie częściowe);
- większość stanowisk z pkt 31–215 wykazu (dyrektorzy generalni, prezesi urzędów centralnych, samorząd).

Dla tych pozycji podstawowym środkiem pozostaje **oświadczenie klienta**. Weryfikujący powinien je uwzględniać przy ocenie ryzyka. Mapowanie stanowisko → źródło → identyfikatory Wikidata można zmieniać w katalogu (`pep_position_catalog`, rola administratora). Każda zmiana trafia do dziennika audytu.

## 5. Jak działa dopasowanie

1. **Normalizacja.**
   - Zamiana na małe litery i transliteracja polskich znaków (oryginał zostaje zachowany).
   - Usunięcie tytułów (dr, prof., inż., mgr, pan/pani…) i interpunkcji.
   - Rozbicie nazwisk dwuczłonowych.
   - Dowolna kolejność imienia i nazwiska.
   - Nazwy zapisane cyrylicą dostają warianty transliteracji: polską, angielską, ISO 9 i ukraińską („г” → h).
2. **Klucze.** Pełne imię i nazwisko w obu kolejnościach, nazwisko z inicjałem, warianty transliteracji oraz aliasy ze źródła.
3. **Wstępna selekcja.** Indeks trigramowy `pg_trgm` po kluczach nazw. Bez niego trzeba by porównywać każdą parę. Test na pełnych listach UE, ONZ, OFAC i MSWiA (118 tys. kluczy) daje 20–90 ms na podmiot.
4. **Scoring (0–100).**
   - **Podobieństwo nazw:**
     - najlepsze dopasowanie tokenów 1:1 metodą Jaro-Winkler, ograniczone odległością edycyjną;
     - porównanie „szkieletu” fonetycznego, np. Szewczenko / Shevchenko;
     - mocna kara za niezgodne imię;
     - drobna kara za brakujące drugie imię.
   - **Data urodzenia:**
     - zgodna pełna data: **+10**;
     - zgodny rok, gdy źródło zna tylko rok: **+5**;
     - niezgodna: **−25**. Wynik nie jest automatycznie zerowany — identyczna nazwa z inną datą daje 75, czyli sprawę do weryfikacji.
   - **Obywatelstwo lub kraj:** zgodne daje **+3**.
   - **Brak daty urodzenia** w źródle albo u klienta: wynik najwyżej **89**, czyli nigdy „silne trafienie”.
   - Premie nie podnoszą słabego dopasowania nazwy ponad próg.
5. **Progi (konfigurowalne w zakładce Ustawienia):**
   - poniżej 70: brak trafienia (do 3 najbliższych kandydatów zapisujemy w logu);
   - 70–89: możliwe trafienie do ręcznej weryfikacji;
   - 90 i więcej: silne trafienie. Sprawa dostaje wysoki priorytet, a wniosek zostaje wstrzymany do decyzji.
6. **Sankcje — reguła ostrożności.** Jeśli sama nazwa ma wynik ≥ 90, a wynik obniżył jedynie brak daty urodzenia, sprawa dostaje priorytet krytyczny i wstrzymuje wniosek.
7. **Status czasowy PEP.**
   - Osoba, która pełniła funkcję w ciągu ostatnich 12 miesięcy, jest PEP.
   - Starsze przypadki oznaczamy jako „były PEP”. Służą do oceny ryzyka i nie wstrzymują wniosku.

**Wyniki testów kontrolnych** (`src/lib/screening/scoring.test.ts`, zestaw 15 osób spoza listy i 10 z listy):

- **0 pominięć** prawdziwych osób, w tym w przypadkach:
  - literówki;
  - odwróconej kolejności;
  - braku polskich znaków;
  - nazwiska dwuczłonowego;
  - transkrypcji z cyrylicy;
  - polskiego zapisu nazwisk wschodnich.
- **Fałszywe trafienia przy domyślnych ustawieniach: 53%** zestawu kontrolnego. Wynikają one głównie z przypadków **z identyczną nazwą i inną datą urodzenia**, co jest zamierzone: zasada brzmi „bez automatycznego odrzucenia przy niezgodnej dacie”.
- **Fałszywe trafienia przy innej nazwie: 6,7%** — 1 przypadek graniczny: podobieństwo nazwy 70 i identyczna data urodzenia.
- **Przy karze za niezgodną datę równej 35** odsetek fałszywych trafień spada do **13%**, nadal bez pominięć. Zmiana wymaga decyzji osoby odpowiedzialnej za AML i kalibracji na danych produkcyjnych.
- **Zmiana nazwiska po ślubie** zostaje wykryta tylko wtedy, gdy znamy nazwisko rodowe (alias). Formularze go nie zbierają, więc to znana luka.

## 6. Przepływ

1. Utworzenie lub zmiana jednego z poniższych wstawia wpis do kolejki: klient, inwestor, oświadczenie.
   - Wpis tworzy trigger w bazie.
   - Kolejkę przetwarza tick co 5 minut.
   - Personel może też użyć przycisku „Sprawdź teraz” na karcie klienta.
2. Synchronizacja podmiotów:
   - klient (data urodzenia z PESEL, jeśli podany);
   - firma klienta;
   - beneficjenci rzeczywiści z CRBR (z pamięci podręcznej, gdy klient ma NIP);
   - inwestor, jego podmiot i reprezentant;
   - osoby wskazane w oświadczeniu.
3. Screening PEP i sankcji każdego podmiotu oraz uwzględnienie oświadczenia.
4. Brak trafień i oświadczenie „nie” → zamknięcie automatem z wpisem do logu.
5. Trafienie od progu 70 albo oświadczenie „tak” → sprawa w kolejce weryfikacji. Widok sprawy pokazuje:
   - dane klienta i rekord źródłowy obok siebie;
   - rozbicie scoringu;
   - link do źródła.
6. Decyzja weryfikującego, z obowiązkowym uzasadnieniem (min. 10 znaków):
   - **Fałszywe trafienie** — zapamiętane dla pary podmiot–rekord. Przy kolejnym rescreeningu para nie tworzy nowej sprawy, dopóki nie zmienią się dane klienta (odcisk) albo rekordu (hash).
   - **Potwierdzony PEP** albo **potwierdzony członek rodziny lub współpracownik** (dla tej drugiej decyzji wskaż, który z nich). Skutki:
     - status klienta „PEP” lub odpowiedni;
     - flaga wzmożonego monitorowania;
     - obowiązkowe pola „źródło majątku” i „źródło środków” z załącznikami;
     - **wstrzymanie relacji do akceptacji członka zarządu** (rola administratora). Akceptacja wymaga wypełnienia obu pól i co najmniej jednego dokumentu.
   - **Trafienie sankcyjne** — natychmiastowe wstrzymanie wszystkich operacji klienta w systemie, e-mail do osoby odpowiedzialnej za AML i do zarządu, osobny status sprawy. Dalsze kroki wykonuje człowiek, nie automat, w tym:
     - zawiadomienie GIIF;
     - zamrożenie wartości majątkowych.
   - Dla spraw z oświadczenia dostępna jest też decyzja **„Oświadczenie »tak« omyłkowe”**.
7. **Wstrzymanie wniosku jest egzekwowane w bazie.** Trigger `screening_application_hold` nie pozwala przenieść wniosku do etapów od „wysłany do inwestorów” do „wypłacony”, gdy:
   - klient ma otwartą sprawę z wstrzymaniem;
   - albo klient ma status „operacje wstrzymane”.

   Odrzucenie i archiwizacja wniosku pozostają możliwe.

### Jak podejmować decyzję (wskazówki dla weryfikującego)

- Porównaj **datę urodzenia** (PESEL klienta wobec źródła), **drugie imię**, **obywatelstwo** i **miejsce urodzenia**, jeśli źródło je podaje.
- Rekord z Wikidata otwórz linkiem i sprawdź zajmowane stanowiska i daty.
- W razie wątpliwości poproś klienta o dokument tożsamości lub wyjaśnienie. Nie zamykaj sprawy bez podstawy.
- W uzasadnieniu wskaż, **które dane** porównano i **z jakim wynikiem**, np. „inna data urodzenia: PESEL 1985-04-12, źródło 1952-03-11; inny drugie imię”.
- Przy trafieniu sankcyjnym nie informuj klienta o podejrzeniu (zakaz tipping-off). Decyzję o zawiadomieniu GIIF podejmuje osoba odpowiedzialna za AML.

## 7. Oświadczenie klienta

Sekcja oświadczenia jest w trzech publicznych formularzach wniosku: strona główna, wizard i formularz osadzany. Jest też w panelu klienta (dla wniosków złożonych przez pośrednika lub przez API) oraz w kroku „Screening” pipeline'u inwestora. Zawiera:

- czy klient jest PEP, z kategorią stanowiska z krajowego wykazu;
- czy klient jest członkiem rodziny PEP, z imieniem, nazwiskiem i stanowiskiem tej osoby;
- czy klient jest bliskim współpracownikiem PEP, z tymi samymi polami;
- klauzulę „Jestem świadomy/a odpowiedzialności karnej za złożenie fałszywego oświadczenia”.

Zapisujemy:

- pełną treść;
- wersję treści (`pep-2026-10-v1`);
- znacznik czasu;
- adres IP;
- user-agent;
- kanał.

Wniosek z formularza publicznego bez oświadczenia jest odrzucany przez serwer. Pośrednik nie składa oświadczenia w imieniu klienta — klient składa je w swoim panelu.

## 8. Rescreening i alerty

Harmonogramy pg_cron (UTC):

- **co 5 minut:** kolejka screeningu;
- **codziennie o 4:17:** listy sankcyjne. Gdy treść listy się zmieniła, uruchamia się rescreening sankcyjny;
- **w poniedziałki o 2:23:** API Sejmu, KPRM i start importu Wikidata. Import Wikidata jest kontynuowany co 10 minut aż do końca;
- **1. dnia miesiąca:** Senat i KRS (oba niedostępne, patrz pkt 3);
- **w poniedziałki o 5:47:** rescreening PEP całego aktywnego portfela, czyli klientów z niezamkniętym wnioskiem lub pożyczką oraz aktywnych inwestorów;
- **codziennie o 7:05:** kontrola stanu źródeł. Wysyła e-mail do osoby odpowiedzialnej za AML, gdy:
  - import nie powiódł się dłużej niż przez 2 cykle;
  - albo kolejka czeka dłużej niż 6 godzin.

Klienci zamknięci nie są rescreenowani. Ich historia zostaje.

## 9. Kontrola GIIF — co pokazać

- **Karta screeningu klienta lub inwestora** (link z wniosku i z karty inwestora). Zawiera:
  - aktualny status PEP i sankcji;
  - wszystkie przebiegi z wersjami źródeł;
  - sprawy i decyzje z uzasadnieniem;
  - oświadczenia.
- **Eksport PDF historii sprawdzeń** — przycisk na karcie. Fakt eksportu trafia do dziennika.
- **Dziennik audytu** z weryfikacją łańcucha skrótów.
- **Raport pokrycia** wykazu PEP i panel źródeł (daty importów, sumy kontrolne).

## 10. Konfiguracja

- **Zakładka Ustawienia** (rola administratora; każda zmiana trafia do dziennika):
  - progi, premie i kary;
  - okres karencji PEP;
  - parametry selekcji;
  - adresy e-mail osoby odpowiedzialnej za AML i zarządu;
  - włączenie źródeł;
  - liczba cykli do alertu.
- **Zmienna `EU_FSF_TOKEN`** — własny token z portalu FSF Komisji Europejskiej (zalecane).
- **Zmienna `CRON_SECRET`** — używana przez istniejący mechanizm hooków. Wymuszenie importu (`force`) działa tylko z prywatnym sekretem.
- **Wstępna konfiguracja po wdrożeniu:**
  - wpisz adresy e-mail AML i zarządu;
  - jednorazowo uruchom importy (zakładka Źródła → ▶);
  - uruchom „Rescreening portfela”.

## 11. Otwarte ryzyka

1. **Luki źródeł PEP** (pkt 4): sędziowie, NBP/RPP, spółki Skarbu Państwa, partie, samorząd. Pokryte wyłącznie oświadczeniem klienta.
2. **Licencje list UE i ONZ** do potwierdzenia prawnie. Obie listy są publikowane dla instytucji finansowych w celu stosowania sankcji. Nie redystrybuujemy ich.
3. **Wikidata ma niejednolite modelowanie stanowisk i limity zapytań.** Pokrycie zależy od kompletności wolontariuszy, a import może trwać kilka cykli.
4. **Fałszywe trafienia przy popularnych nazwiskach** z inną datą urodzenia. Kalibracja kary za datę na danych produkcyjnych to decyzja osoby odpowiedzialnej za AML.
5. **Klienci bez PESEL** (formularz landingu go nie zbiera) mają wyniki ograniczone do „do weryfikacji”. Potrzebne jest zbieranie daty urodzenia lub PESEL na etapie wniosku.
6. **Zmiana nazwiska po ślubie.** Brak pola na nazwisko rodowe.
7. **Wstrzymanie operacji** jest egzekwowane na statusach wniosku. Inne operacje (np. wypłaty poza wnioskiem, oferty inwestora) wymagają podpięcia flagi `operations_hold`.
8. **Limity czasu wykonania** (Cloudflare Worker): importy dużych list i Wikidata działają w partiach. Monitoruj zakładkę Źródła po pierwszym wdrożeniu.
9. **Istniejące screeningi przez Dilisense** wysyłają dane osób na zewnątrz (pkt 2).
