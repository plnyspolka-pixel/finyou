-- =====================================================================
-- ETAP 5 — REGULAMIN KLIENTA v2 i POLITYKA PRYWATNOŚCI v2
--
-- Plik wygenerowany: npx tsx scripts/legal/build-zgody-v2.ts
-- (nie edytować ręcznie — zmiany w src/lib/legal/zgody-v2.ts).
-- Treść: docs/legal/klient/*-v2.md (v1 zachowana w *-v1.md i w tabeli).
--
-- Regulamin v2: finansowanie wyłącznie na Cel Gospodarczy (B2B),
-- oświadczenie o celu gospodarczym, Prowizja Finance You 7% Kwoty
-- Udzielonej, nie mniej niż 5 000,00 zł, bez VAT, potrącana z wypłaty;
-- ochrona przed obejściem 5 lat; naprawiona numeracja § 12; decyzje
-- odmowne podejmuje człowiek; odsetki nie wyższe niż maksymalne.
-- Polityka v2: IOD niewyznaczony, główni podmioty przetwarzające,
-- transfer poza EOG, § 17 udział człowieka, nagrywanie rozmów z AI.
--
-- Wersja 1 zostaje w tabeli (is_active = false). Zalogowani klienci
-- i inwestorzy akceptują nową wersję przy następnym wejściu do panelu
-- (consent_acceptances, osobna migracja).
-- =====================================================================

-- terms v2
insert into public.consent_documents (kind, title, content, version, is_active)
select 'terms'::public.consent_kind, 'Akceptuję regulamin klienta',
'# REGULAMIN PLATFORMY FINANCE YOU

## dla użytkowników składających wniosek o pożyczkę lub poszukujących finansowania

**wersja 2 — obowiązuje od dnia 29 września 2026 r.**

---

## § 1. Postanowienia ogólne

1. Niniejszy regulamin, zwany dalej „Regulaminem”, określa zasady korzystania z Platformy Finance You przez użytkowników zainteresowanych uzyskaniem finansowania, w szczególności pożyczki zabezpieczonej na nieruchomości.

2. Regulamin dotyczy użytkowników, którzy w szczególności:

   1. składają wniosek o pożyczkę;
   2. publikują ogłoszenie o potrzebie finansowania;
   3. przekazują dane dotyczące swojej sytuacji finansowej, majątkowej lub prawnej;
   4. przekazują dane dotyczące nieruchomości proponowanej jako zabezpieczenie finansowania;
   5. przesyłają dokumenty, zdjęcia, oświadczenia lub inne informacje potrzebne do analizy sprawy;
   6. oczekują kontaktu ze strony Finance You;
   7. oczekują przedstawienia ich sprawy potencjalnym finansującym, inwestorom, partnerom lub podmiotom współpracującym z Finance You;
   8. korzystają z formularzy, panelu klienta, komunikacji elektronicznej lub innych funkcjonalności Platformy.

3. Regulamin nie dotyczy inwestorów, osób zainteresowanych udzielaniem finansowania ani użytkowników korzystających z części inwestorskiej Platformy. Dla tych osób może obowiązywać odrębny regulamin.

4. Właścicielem i operatorem Platformy Finance You jest:

**FINANCE YOU spółka z ograniczoną odpowiedzialnością** z siedzibą w Warszawie,
adres: ul. Nowogrodzka 31, 00-511 Warszawa,
wpisana do rejestru przedsiębiorców Krajowego Rejestru Sądowego pod numerem KRS: 0000635207,
NIP: 7010611803,
REGON: 365350668,
kapitał zakładowy: 389 600,00 zł,
adres e-mail: [kontakt@financeyou.pl](mailto:kontakt@financeyou.pl),

zwana dalej „Usługodawcą”, „Operatorem”, „Spółką” albo „Finance You”.

5. Platforma Finance You jest narzędziem elektronicznym służącym do przyjmowania, porządkowania, wstępnej analizy, publikowania i obsługi zgłoszeń użytkowników poszukujących finansowania.

6. Za pośrednictwem Platformy Finance You organizuje wyłącznie finansowanie przeznaczone na Cel Gospodarczy (finansowanie B2B). Klientem może być przedsiębiorca, w tym osoba fizyczna prowadząca działalność gospodarczą, spółka albo inna jednostka organizacyjna, a także osoba fizyczna działająca w bezpośrednim związku z działalnością gospodarczą. Finance You nie organizuje finansowania na cele konsumpcyjne ani na zaspokojenie prywatnych potrzeb mieszkaniowych, w tym kredytu konsumenckiego i kredytu hipotecznego dla konsumenta.

7. Platforma nie jest bankiem, instytucją kredytową, instytucją pożyczkową, firmą inwestycyjną, domem maklerskim, funduszem inwestycyjnym, alternatywną spółką inwestycyjną, platformą finansowania społecznościowego ani systemem automatycznego udzielania pożyczek.

8. Finance You nie udziela za pośrednictwem Platformy porad prawnych, podatkowych, inwestycyjnych, księgowych ani doradztwa kredytowego w rozumieniu odrębnych przepisów.

9. Złożenie wniosku, założenie konta, przesłanie dokumentów, opublikowanie ogłoszenia albo rozpoczęcie kontaktu z Finance You nie oznacza przyznania pożyczki, promesy finansowania, gwarancji pozyskania inwestora ani zobowiązania Finance You do zorganizowania finansowania.

10. Finansowanie może zostać udzielone wyłącznie po odrębnej analizie sprawy, akceptacji warunków przez właściwe strony oraz podpisaniu odpowiednich dokumentów, w szczególności umowy pożyczki, dokumentów zabezpieczenia, oświadczeń oraz aktów notarialnych, jeżeli będą wymagane.

11. Regulamin jest udostępniany użytkownikowi nieodpłatnie przed rozpoczęciem korzystania z Platformy, w sposób umożliwiający jego pozyskanie, utrwalenie, odtwarzanie i przechowywanie.

12. Korzystanie z Platformy oznacza akceptację Regulaminu.

---

## § 2. Definicje

Na potrzeby Regulaminu poniższe pojęcia oznaczają:

1. **Platforma** albo **Platforma Finance You** – serwis internetowy, aplikacja, formularz, panel klienta, system obsługi zgłoszeń, moduł publikacji ogłoszeń, narzędzia komunikacyjne oraz inne rozwiązania cyfrowe prowadzone przez Usługodawcę pod marką Finance You.

2. **Usługodawca** – Finance You sp. z o.o.

3. **Użytkownik** – osoba fizyczna, osoba prawna albo jednostka organizacyjna korzystająca z Platformy w celu złożenia wniosku, przekazania danych, publikacji ogłoszenia, uzyskania kontaktu lub uzyskania informacji o możliwości finansowania.

4. **Klient** – użytkownik zainteresowany uzyskaniem finansowania.

5. **Konsument** – osoba fizyczna dokonująca z Usługodawcą czynności prawnej niezwiązanej bezpośrednio z jej działalnością gospodarczą lub zawodową.

6. **Przedsiębiorca** – osoba fizyczna, osoba prawna albo jednostka organizacyjna prowadząca działalność gospodarczą lub zawodową.

7. **Przedsiębiorca na prawach konsumenta** – osoba fizyczna zawierająca umowę bezpośrednio związaną z jej działalnością gospodarczą, gdy z treści tej umowy wynika, że nie ma ona dla tej osoby charakteru zawodowego, wynikającego w szczególności z przedmiotu wykonywanej działalności gospodarczej ujawnionego w CEIDG.

8. **Wniosek** – formularz, zgłoszenie, ogłoszenie, wiadomość albo inna forma przekazania przez użytkownika informacji o potrzebie finansowania.

9. **Ogłoszenie** – zaakceptowany przez administratora opis potrzeby finansowania, który może zostać udostępniony w Platformie albo przekazany wybranym inwestorom, finansującym, partnerom lub współpracownikom Finance You.

10. **Finansowanie** – pożyczka, finansowanie prywatne, finansowanie pomostowe, finansowanie zabezpieczone na nieruchomości albo inna forma udostępnienia środków pieniężnych uzgodniona indywidualnie pomiędzy właściwymi stronami.

11. **Inwestor** albo **Finansujący** – osoba albo podmiot potencjalnie zainteresowany udzieleniem finansowania, analizą wniosku albo kontaktem z klientem.

12. **Partner** – podmiot współpracujący z Finance You, w szczególności inwestor, pośrednik, analityk, kancelaria, notariusz, rzeczoznawca, doradca, podmiot finansujący albo inny podmiot uczestniczący w procesie obsługi sprawy.

13. **Administrator** – osoba działająca w imieniu Finance You, uprawniona do weryfikacji, akceptacji, odrzucania, edycji, publikowania i archiwizacji wniosków lub ogłoszeń.

14. **Usługa elektroniczna** – usługa świadczona drogą elektroniczną przez Finance You, polegająca w szczególności na umożliwieniu złożenia wniosku, utworzenia konta, przesłania dokumentów, publikacji ogłoszenia, komunikacji z Finance You lub korzystania z panelu klienta.

15. **Prowizja Finance You** (Prowizja Klientowska) – jedyne wynagrodzenie Finance You należne od Klienta, wyłącznie w przypadku skutecznego zorganizowania finansowania: 7% Kwoty Udzielonej, nie mniej niż 5 000,00 zł, bez VAT, potrącane z wypłaty finansowania, określone w § 12 Regulaminu.

16. **Dokumenty** – wszelkie pliki, zdjęcia, skany, formularze, oświadczenia, zaświadczenia, dokumenty dotyczące nieruchomości, dokumenty dochodowe, dokumenty firmowe, dokumenty tożsamości oraz inne materiały przekazane przez użytkownika.

17. **Dane sprawy** – dane osobowe, dane kontaktowe, dane finansowe, dane dotyczące nieruchomości, dokumenty, informacje o zadłużeniu, celu finansowania, zabezpieczeniu i sytuacji użytkownika.

18. **Dni robocze** – dni od poniedziałku do piątku, z wyłączeniem dni ustawowo wolnych od pracy w Polsce.

19. **Regulamin** – niniejszy regulamin Platformy Finance You dla użytkowników składających wniosek o pożyczkę lub poszukujących finansowania.

20. **Cel Gospodarczy** – cel pozostający w bezpośrednim związku z działalnością gospodarczą lub zawodową Klienta, w szczególności finansowanie bieżącej działalności, inwestycji, zakupu lub remontu nieruchomości w ramach działalności, refinansowanie zobowiązań firmowych. Celem Gospodarczym nie jest cel konsumpcyjny ani zaspokojenie prywatnych potrzeb mieszkaniowych.

21. **Kwota Udzielona** – kwota finansowania wynikająca z umowy pożyczki albo innej umowy finansowania, przed potrąceniem Prowizji Finance You i innych kosztów. Od Kwoty Udzielonej liczone są odsetki i spłata.

---

## § 3. Charakter Platformy

1. Platforma Finance You służy do obsługi zgłoszeń osób i podmiotów poszukujących finansowania.

2. Platforma może umożliwiać w szczególności:

   1. złożenie wniosku o finansowanie;
   2. opisanie celu finansowania;
   3. wskazanie proponowanego zabezpieczenia;
   4. podanie danych nieruchomości;
   5. wpisanie numeru księgi wieczystej;
   6. przesłanie zdjęć, dokumentów i załączników;
   7. złożenie oświadczeń wymaganych w formularzu;
   8. kontakt z administratorem;
   9. uzupełnianie braków;
   10. publikację ogłoszenia po akceptacji administratora;
   11. przekazanie sprawy do analizy inwestorom, finansującym albo partnerom;
   12. otrzymanie informacji zwrotnej o zainteresowaniu finansowaniem;
   13. umówienie dalszych czynności, w tym spotkania, rozmowy, analizy dokumentów albo czynności notarialnych.

3. Platforma ma charakter organizacyjny, informacyjny i pośredniczący w znaczeniu faktycznym. Jej celem jest zebranie, uporządkowanie, opisanie i przedstawienie sprawy potencjalnym finansującym.

4. Finance You nie ma obowiązku udzielenia finansowania ze środków własnych.

5. Finance You nie gwarantuje, że:

   1. wniosek zostanie zaakceptowany;
   2. ogłoszenie zostanie opublikowane;
   3. inwestor zainteresuje się sprawą;
   4. finansowanie zostanie przyznane;
   5. finansowanie zostanie przyznane w oczekiwanej kwocie;
   6. finansowanie zostanie przyznane na oczekiwany okres;
   7. koszt finansowania będzie zgodny z oczekiwaniami użytkownika;
   8. zabezpieczenie zostanie zaakceptowane;
   9. sprawa zakończy się podpisaniem umowy pożyczki;
   10. sprawa zakończy się wypłatą środków.

6. Użytkownik przyjmuje do wiadomości, że każda sprawa wymaga indywidualnej analizy i może zostać odrzucona bez podania szczegółowego uzasadnienia, jeżeli Finance You albo potencjalny finansujący uzna, że nie spełnia ona wymogów formalnych, ekonomicznych, prawnych, zabezpieczeniowych lub ryzyka.

7. Informacje dostępne na Platformie, przekazywane przez formularz, wiadomość e-mail, rozmowę telefoniczną, panel klienta albo inną formę kontaktu mają charakter organizacyjny i informacyjny, chyba że strony wyraźnie zawrą odrębną umowę o innym charakterze.

---

## § 4. Dostęp do Platformy dla klientów

1. Dostęp do Platformy dla użytkowników poszukujących finansowania jest na dzień wejścia w życie Regulaminu nielimitowany i nieodpłatny.

2. Użytkownik nie ponosi opłaty za samo:

   1. wejście na stronę Platformy;
   2. wypełnienie formularza;
   3. przesłanie wniosku;
   4. dodanie dokumentów;
   5. przekazanie danych do wstępnej analizy;
   6. samo opublikowanie ogłoszenia, o ile Finance You nie uzgodni z użytkownikiem inaczej w odrębnej umowie.

3. Brak opłaty za korzystanie z Platformy nie oznacza, że usługa zorganizowania finansowania jest bezpłatna.

4. W przypadku skutecznego zorganizowania finansowania Finance You przysługuje wynagrodzenie określone w § 12 Regulaminu.

5. Finance You może w przyszłości wprowadzić dodatkowe funkcjonalności płatne, jednak będzie to wymagało wyraźnego poinformowania użytkownika przed skorzystaniem z takiej funkcjonalności.

6. Żadna płatność nie zostanie naliczona użytkownikowi wyłącznie na podstawie samego wejścia na stronę Platformy albo samego przeglądania treści informacyjnych.

7. Użytkownik poszukujący finansowania nie dokonuje płatności za pośrednictwem systemu płatności Platformy, chyba że w przyszłości zostanie wyraźnie poinformowany o wprowadzeniu takiej funkcjonalności i zaakceptuje odrębne warunki płatności.

---

## § 5. Zasady składania wniosku

1. Użytkownik może złożyć wniosek poprzez formularz dostępny na Platformie, kontakt e-mailowy, kontakt telefoniczny, wiadomość elektroniczną albo inną formę zaakceptowaną przez Finance You.

2. Wniosek może obejmować w szczególności:

   1. dane identyfikacyjne użytkownika;
   2. dane kontaktowe;
   3. status użytkownika, w tym informację o prowadzonej działalności gospodarczej (NIP) albo o reprezentowanym podmiocie;
   4. oczekiwaną kwotę finansowania;
   5. oczekiwany termin spłaty;
   6. cel finansowania;
   7. opis sytuacji finansowej;
   8. informacje o dochodach;
   9. informacje o zobowiązaniach;
   10. informacje o nieruchomości;
   11. numer księgi wieczystej, jeżeli użytkownik go zna;
   12. dokumenty dotyczące nieruchomości;
   13. zdjęcia nieruchomości;
   14. informacje o istniejących hipotekach, egzekucjach, zajęciach, służebnościach, najmach, dzierżawach lub innych obciążeniach;
   15. inne informacje wymagane w formularzu.

3. Użytkownik zobowiązuje się podawać dane prawdziwe, aktualne, kompletne i zgodne z rzeczywistością.

4. Użytkownik nie może zatajać informacji istotnych dla oceny sprawy, w szczególności informacji o:

   1. zadłużeniu;
   2. egzekucjach;
   3. postępowaniach sądowych;
   4. upadłości;
   5. restrukturyzacji;
   6. zajęciach komorniczych;
   7. hipotekach;
   8. roszczeniach osób trzecich;
   9. sporach dotyczących nieruchomości;
   10. niezgodnościach w księdze wieczystej;
   11. braku zgody współwłaścicieli;
   12. ograniczeniach w rozporządzaniu nieruchomością;
   13. toczących się postępowaniach dotyczących nieruchomości lub użytkownika;
   14. innych okolicznościach, które mogą mieć wpływ na ocenę możliwości finansowania.

5. Jeżeli użytkownik podaje dane innej osoby, w szczególności współwłaściciela, małżonka, wspólnika, członka zarządu, poręczyciela albo właściciela nieruchomości, oświadcza, że posiada podstawę prawną do przekazania tych danych Finance You.

6. Finance You może żądać uzupełnienia wniosku, przesłania dodatkowych dokumentów albo złożenia dodatkowych oświadczeń.

7. Nieuzupełnienie danych lub dokumentów może skutkować pozostawieniem wniosku bez dalszego rozpoznania.

8. Finance You może odmówić dalszej obsługi wniosku, jeżeli:

   1. dane są niepełne;
   2. dane są sprzeczne;
   3. dokumenty budzą wątpliwości;
   4. użytkownik nie odpowiada na kontakt;
   5. sprawa jest niezgodna z profilem Platformy;
   6. ryzyko sprawy jest zbyt wysokie;
   7. zabezpieczenie jest niewystarczające;
   8. istnieje podejrzenie działania niezgodnego z prawem;
   9. użytkownik zachowuje się w sposób agresywny, nieuczciwy lub naruszający dobre obyczaje;
   10. dalsza obsługa sprawy mogłaby narazić Finance You, finansującego albo osobę trzecią na odpowiedzialność, szkodę lub ryzyko prawne;
   11. finansowanie nie jest przeznaczone na Cel Gospodarczy.

9. Składając wniosek, Klient oświadcza, że finansowanie przeznaczy wyłącznie na Cel Gospodarczy, i wskazuje ten cel. Oświadczenie jest składane przez zaznaczenie pola w formularzu (pole nie jest zaznaczone domyślnie) albo w innej utrwalonej formie. Bez tego oświadczenia wniosek nie jest przedstawiany inwestorom ani finansującym.

10. Klient niezwłocznie informuje Finance You, jeżeli cel finansowania ulegnie zmianie. Podanie nieprawdziwej informacji o celu finansowania może skutkować odmową dalszej obsługi sprawy.

---

## § 6. Dokumenty i zdjęcia

1. Użytkownik może przesyłać za pośrednictwem Platformy dokumenty i zdjęcia potrzebne do analizy sprawy.

2. Dokumenty mogą obejmować w szczególności:

   1. dokumenty dotyczące nieruchomości;
   2. odpisy, wypisy, akty notarialne, umowy, decyzje administracyjne;
   3. dokumenty dochodowe;
   4. dokumenty firmowe;
   5. dokumenty potwierdzające zadłużenie;
   6. dokumenty komornicze;
   7. dokumenty sądowe;
   8. zdjęcia nieruchomości;
   9. dokumenty potwierdzające cel finansowania;
   10. inne dokumenty wymagane do oceny wniosku.

3. Użytkownik powinien przesyłać dokumenty czytelne, kompletne i aktualne.

4. Finance You może odmówić analizy dokumentu, który jest nieczytelny, uszkodzony, niepełny, nieaktualny albo budzi wątpliwości co do autentyczności.

5. Użytkownik nie powinien przesyłać dokumentów, których nie jest właścicielem albo których nie ma prawa przekazać.

6. Przesłanie dokumentów nie oznacza, że Finance You potwierdza ich prawdziwość, kompletność, skuteczność prawną albo wystarczalność do zawarcia transakcji.

7. Finance You może korzystać z dokumentów wyłącznie w zakresie potrzebnym do obsługi sprawy, analizy wniosku, kontaktu z potencjalnymi finansującymi, przygotowania procesu finansowania oraz realizacji obowiązków prawnych i umownych.

8. Użytkownik przyjmuje do wiadomości, że do oceny sprawy mogą być potrzebne dokumenty i informacje różnego rodzaju, zależne od rodzaju nieruchomości, celu finansowania, statusu użytkownika, stanu prawnego zabezpieczenia oraz oczekiwań potencjalnego finansującego.

9. Przesłanie dokumentów przez użytkownika nie zobowiązuje Finance You do ich pełnej analizy, sporządzenia opinii ani przedstawienia użytkownikowi szczegółowego raportu, chyba że strony wyraźnie ustalą inaczej.

---

## § 7. Ogłoszenia o potrzebie finansowania

1. Użytkownik może zgłosić sprawę jako ogłoszenie o potrzebie finansowania.

2. Ogłoszenie może zostać opublikowane wyłącznie po akceptacji administratora.

3. Użytkownik nie ma roszczenia o publikację ogłoszenia.

4. Administrator może:

   1. zaakceptować ogłoszenie;
   2. odrzucić ogłoszenie;
   3. zażądać uzupełnienia ogłoszenia;
   4. poprawić oczywiste omyłki;
   5. skrócić opis;
   6. zanonimizować dane;
   7. usunąć dane wrażliwe albo nadmiarowe;
   8. ograniczyć widoczność ogłoszenia;
   9. przekazać ogłoszenie tylko wybranym finansującym;
   10. odmówić publikacji bez podania szczegółowego uzasadnienia.

5. Ogłoszenie zaakceptowane przez administratora jest ważne przez okres 30 dni od dnia publikacji, chyba że Finance You usunie je wcześniej albo przedłuży jego widoczność.

6. Po upływie 30 dni ogłoszenie może zostać:

   1. automatycznie wygaszone;
   2. przeniesione do archiwum;
   3. przedłużone za zgodą administratora;
   4. opublikowane ponownie po aktualizacji danych;
   5. usunięte.

7. Użytkownik zobowiązuje się niezwłocznie poinformować Finance You o każdej istotnej zmianie dotyczącej ogłoszenia, w szczególności:

   1. zmianie kwoty potrzebnego finansowania;
   2. zmianie celu finansowania;
   3. zmianie stanu prawnego nieruchomości;
   4. sprzedaży nieruchomości;
   5. ustanowieniu nowej hipoteki;
   6. wszczęciu egzekucji;
   7. pojawieniu się nowych zobowiązań;
   8. utracie aktualności dokumentów;
   9. pozyskaniu finansowania z innego źródła;
   10. rezygnacji z finansowania.

8. Finance You może usunąć ogłoszenie w każdym czasie, jeżeli:

   1. jest nieaktualne;
   2. zawiera nieprawdziwe informacje;
   3. narusza Regulamin;
   4. narusza prawo;
   5. narusza prawa osób trzecich;
   6. może wprowadzać w błąd;
   7. dotyczy sprawy, której dalsze prezentowanie jest niecelowe;
   8. użytkownik nie odpowiada na kontakt;
   9. użytkownik cofnął zgodę na dalszą obsługę sprawy;
   10. wymaga tego bezpieczeństwo użytkownika, Finance You albo innych osób.

9. Finance You może zdecydować, że dane ogłoszenie nie będzie widoczne publicznie, lecz zostanie przekazane jedynie wybranym inwestorom, finansującym lub partnerom.

10. Użytkownik przyjmuje do wiadomości, że publikacja ogłoszenia nie oznacza akceptacji sprawy przez finansującego ani zobowiązania kogokolwiek do udzielenia finansowania.

---

## § 8. Zakres publikowanych i przekazywanych informacji

1. Finance You może publikować albo przekazywać potencjalnym finansującym wybrane informacje dotyczące sprawy, w zakresie niezbędnym do oceny możliwości finansowania.

2. Zakres publikowanych lub przekazywanych informacji może obejmować w szczególności:

   1. oczekiwaną kwotę finansowania;
   2. przybliżony okres finansowania;
   3. cel finansowania;
   4. rodzaj proponowanego zabezpieczenia;
   5. miejscowość lub region nieruchomości;
   6. przybliżoną wartość nieruchomości;
   7. podstawowe informacje o stanie prawnym nieruchomości;
   8. podstawowe informacje o hipotekach lub obciążeniach;
   9. opis sytuacji sprawy;
   10. zdjęcia nieruchomości, jeżeli ich użycie jest uzasadnione prezentacją sprawy;
   11. dokumenty lub wybrane fragmenty dokumentów, jeżeli jest to niezbędne do oceny sprawy przez finansującego lub partnera.

3. Finance You może ograniczyć zakres danych osobowych widocznych w ogłoszeniu.

4. Dane identyfikujące użytkownika mogą zostać przekazane potencjalnemu finansującemu albo partnerowi wtedy, gdy jest to uzasadnione obsługą sprawy, analizą finansowania, przygotowaniem transakcji albo kontaktem z użytkownikiem.

5. Użytkownik przyjmuje do wiadomości, że skuteczne zorganizowanie finansowania może wymagać przekazania danych sprawy innym podmiotom, w szczególności inwestorom, analitykom, notariuszom, prawnikom, rzeczoznawcom, pośrednikom, partnerom technicznym lub podmiotom wspierającym proces.

6. Finance You nie publikuje w ogólnodostępnej części Platformy dokumentów zawierających dane wrażliwe, dane nadmiarowe albo pełne dane identyfikacyjne, chyba że użytkownik wyraźnie poleci inaczej, a publikacja jest zgodna z prawem.

7. Finance You może anonimizować, skracać, redagować lub porządkować opis sprawy w celu zwiększenia czytelności ogłoszenia, ochrony danych osobowych lub ułatwienia analizy przez finansujących.

---

## § 9. Weryfikacja sprawy

1. Finance You może dokonać wstępnej weryfikacji sprawy na podstawie danych przekazanych przez użytkownika.

2. Weryfikacja może obejmować w szczególności:

   1. analizę kompletności wniosku;
   2. analizę podstawowych danych nieruchomości;
   3. analizę księgi wieczystej;
   4. analizę zadłużeń i obciążeń;
   5. ocenę realności proponowanego zabezpieczenia;
   6. ocenę celu finansowania;
   7. ocenę możliwości przedstawienia sprawy potencjalnym finansującym;
   8. ocenę zgodności sprawy z profilem Platformy;
   9. ocenę, czy przekazane dane są wystarczające do dalszej obsługi.

3. Weryfikacja prowadzona przez Finance You ma charakter wstępny i organizacyjny.

4. Weryfikacja nie stanowi:

   1. opinii prawnej;
   2. operatu szacunkowego;
   3. rekomendacji kredytowej;
   4. gwarancji finansowania;
   5. potwierdzenia zdolności kredytowej;
   6. potwierdzenia wartości nieruchomości;
   7. potwierdzenia skuteczności zabezpieczenia;
   8. potwierdzenia braku ryzyka transakcji;
   9. decyzji o udzieleniu finansowania.

5. Potencjalny finansujący może przeprowadzić własną analizę sprawy i odmówić finansowania niezależnie od wstępnej oceny Finance You.

6. Finance You może odmówić dalszej obsługi sprawy, jeżeli w wyniku weryfikacji uzna, że sprawa jest nierealna, niewystarczająco udokumentowana, zbyt ryzykowna, niezgodna z prawem albo niezgodna z profilem Platformy.

7. Finance You może, ale nie musi, przedstawić użytkownikowi przyczyny odmowy dalszej obsługi sprawy.

8. Narzędzia automatyczne Platformy, w tym modele sztucznej inteligencji, mogą przygotować wstępną ocenę wniosku albo zaproponować jego status, w tym propozycję odmowy. Decyzję o odmowie dalszej obsługi wniosku albo o jego odrzuceniu zawsze podejmuje pracownik Finance You po zapoznaniu się z propozycją. Użytkownik może przedstawić swoje stanowisko i poprosić o ponowne rozpatrzenie sprawy, pisząc na adres [kontakt@financeyou.pl](mailto:kontakt@financeyou.pl).

---

## § 10. Kontakt z użytkownikiem

1. Finance You może kontaktować się z użytkownikiem w sprawie złożonego wniosku poprzez:

   1. e-mail;
   2. telefon, jeżeli użytkownik podał numer telefonu;
   3. SMS;
   4. komunikatory internetowe;
   5. panel klienta;
   6. formularz kontaktowy;
   7. inne kanały wskazane przez użytkownika.

2. Kontakt może dotyczyć w szczególności:

   1. potwierdzenia złożenia wniosku;
   2. uzupełnienia danych;
   3. prośby o dokumenty;
   4. wyjaśnienia celu finansowania;
   5. przekazania informacji o zainteresowaniu sprawą;
   6. ustalenia warunków potencjalnego finansowania;
   7. organizacji czynności formalnych;
   8. przekazania informacji o odmowie dalszej obsługi;
   9. przekazania informacji o wynagrodzeniu Finance You;
   10. przygotowania sprawy do zawarcia umowy finansowania.

3. Użytkownik powinien zapewnić aktualność danych kontaktowych.

4. Brak odpowiedzi użytkownika przez okres dłuższy niż 7 dni może zostać uznany za rezygnację z dalszej obsługi sprawy, chyba że strony ustalą inaczej.

5. Finance You nie odpowiada za skutki podania błędnego adresu e-mail, błędnego numeru telefonu, nieaktywnej skrzynki pocztowej, zablokowanych wiadomości albo braku odbioru wiadomości przez użytkownika.

6. Kontakt dotyczący obsługi wniosku, uzupełnienia danych, organizacji finansowania lub wykonania umowy nie jest traktowany jako marketing, jeżeli jest niezbędny do obsługi sprawy użytkownika.

---

## § 11. Zorganizowanie finansowania

1. Zorganizowanie finansowania oznacza doprowadzenie do sytuacji, w której użytkownik uzyska możliwość zawarcia umowy pożyczki albo innej umowy finansowania z finansującym wskazanym, pozyskanym, skojarzonym albo przedstawionym przez Finance You lub przy udziale Finance You.

2. Za zorganizowanie finansowania może zostać uznane w szczególności:

   1. przedstawienie sprawy potencjalnym finansującym;
   2. pozyskanie zainteresowanego finansującego;
   3. uzgodnienie wstępnych warunków finansowania;
   4. doprowadzenie do akceptacji sprawy przez finansującego;
   5. przygotowanie ścieżki formalnej;
   6. koordynacja kontaktu pomiędzy użytkownikiem a finansującym;
   7. doprowadzenie do podpisania umowy pożyczki;
   8. doprowadzenie do wypłaty środków;
   9. doprowadzenie do zawarcia dokumentów zabezpieczenia;
   10. przygotowanie albo koordynacja przygotowania dokumentów transakcyjnych.

3. Finance You nie ma obowiązku przedstawienia użytkownikowi więcej niż jednej propozycji finansowania.

4. Użytkownik nie jest zobowiązany do przyjęcia zaproponowanego finansowania, chyba że zawrze odrębne zobowiązanie.

5. Jeżeli użytkownik przyjmie finansowanie zorganizowane przez Finance You, zastosowanie ma § 12 Regulaminu dotyczący wynagrodzenia Finance You.

6. Szczegółowe warunki finansowania, w tym kwota, termin, oprocentowanie, prowizje, zabezpieczenia, harmonogram spłaty, koszty notarialne, koszty sądowe, koszty wpisów i inne opłaty, są ustalane indywidualnie i wynikają z odrębnych dokumentów.

7. Finance You może uczestniczyć w komunikacji pomiędzy użytkownikiem a finansującym, lecz nie staje się przez to stroną umowy pożyczki, chyba że z konkretnej umowy wyraźnie wynika inaczej.

8. Oprocentowanie finansowania organizowanego przez Finance You nie może przekraczać odsetek maksymalnych określonych w art. 359 § 2¹ Kodeksu cywilnego, obowiązujących w dniu zawarcia umowy.

---

## § 12. Wynagrodzenie Finance You za zorganizowanie finansowania

1. Korzystanie z Platformy przez użytkownika poszukującego finansowania jest nieodpłatne na etapie złożenia wniosku, publikacji ogłoszenia i wstępnej analizy sprawy.

2. W przypadku skutecznego zorganizowania finansowania Finance You przysługuje wynagrodzenie za zorganizowanie finansowania.

3. Wynagrodzenie Finance You (Prowizja Finance You) wynosi **7% Kwoty Udzielonej, nie mniej niż 5 000,00 zł, bez VAT**, chyba że strony wyraźnie ustalą inaczej w formie dokumentowej, elektronicznej albo pisemnej. Jest to jedyne wynagrodzenie Finance You należne od Klienta.

4. Prowizja Finance You nie jest powiększana o podatek VAT. Przykład: przy Kwocie Udzielonej 100 000,00 zł Prowizja Finance You wynosi 7 000,00 zł, a Klient otrzymuje 93 000,00 zł; przy Kwocie Udzielonej 50 000,00 zł Prowizja Finance You wynosi 5 000,00 zł (kwota minimalna), a Klient otrzymuje 45 000,00 zł. Wysokość Prowizji i kwota do wypłaty są podawane Klientowi przed podpisaniem umowy finansowania.

5. Wynagrodzenie staje się należne w przypadku zawarcia przez użytkownika umowy pożyczki albo innej umowy finansowania z finansującym pozyskanym, wskazanym, skojarzonym albo przedstawionym przez Finance You lub przy udziale Finance You.

6. Finance You ma prawo wystawić fakturę za zorganizowanie finansowania.

7. Prowizja Finance You jest potrącana z wypłaty finansowania. Na podstawie dyspozycji wypłaty podpisanej przez Klienta finansujący przekazuje Prowizję Finance You bezpośrednio na rachunek Finance You, a pozostałą część Kwoty Udzielonej wypłaca Klientowi.

8. Potrącenie oznacza, że Klient otrzymuje do dyspozycji Kwotę Udzieloną pomniejszoną o Prowizję Finance You, a odsetki i spłata są liczone od pełnej Kwoty Udzielonej.

9. Jeżeli potrącenie wynagrodzenia z kwoty finansowania nie będzie możliwe, użytkownik zobowiązany jest zapłacić wynagrodzenie na podstawie faktury wystawionej przez Finance You, w terminie wskazanym na fakturze.

10. Wynagrodzenie Finance You nie obejmuje kosztów zewnętrznych, w szczególności:

   1. kosztów notarialnych;
   2. podatków;

   3. opłat sądowych;
   4. opłat za wpisy w księgach wieczystych;

   5. kosztów wyceny nieruchomości;
   6. kosztów dokumentów urzędowych;

   7. kosztów pełnomocnictw;
   8. kosztów obsługi prawnej;

   9. kosztów przelewów;
   10. kosztów innych usług zewnętrznych.

11. Koszty zewnętrzne ponosi użytkownik, chyba że strony wyraźnie ustalą inaczej.

12. Jeżeli użytkownik po przedstawieniu mu finansującego lub po uzgodnieniu warunków finansowania zawrze umowę z pominięciem Finance You, z finansującym albo podmiotem powiązanym z finansującym przedstawionym przez Finance You, wynagrodzenie Finance You pozostaje należne, o ile zawarcie umowy nastąpiło w związku ze sprawą obsługiwaną przez Finance You.

13. Postanowienie ust. 12 stosuje się przez okres 5 lat od dnia przedstawienia użytkownikowi finansującego albo przekazania sprawy finansującemu, chyba że strony ustalą inaczej.

14. Użytkownik zobowiązuje się nie podejmować działań mających na celu obejście obowiązku zapłaty wynagrodzenia Finance You.

15. Wobec przedsiębiorcy na prawach konsumenta postanowienia niniejszego paragrafu stosuje się wyłącznie w zakresie dopuszczalnym przez bezwzględnie obowiązujące przepisy prawa oraz po przekazaniu mu informacji o wynagrodzeniu przed związaniem go odpłatną usługą.

16. Samo złożenie wniosku nie powoduje obowiązku zapłaty wynagrodzenia. Prowizja Finance You staje się należna dopiero w przypadku zawarcia umowy finansowania i jest pobierana przy wypłacie.

---

## § 13. Brak gwarancji finansowania

1. Finance You nie gwarantuje uzyskania finansowania.

2. Finance You nie odpowiada za decyzję finansującego o:

   1. odmowie finansowania;
   2. obniżeniu kwoty finansowania;
   3. zmianie warunków finansowania;
   4. żądaniu dodatkowych zabezpieczeń;
   5. żądaniu dodatkowych dokumentów;
   6. wycofaniu się z rozmów;
   7. odmowie podpisania umowy.

3. Użytkownik przyjmuje do wiadomości, że potencjalny finansujący może samodzielnie ocenić ryzyko sprawy i odmówić finansowania bez podania przyczyny.

4. Finance You nie odpowiada za sytuację, w której sprawa nie zostanie sfinansowana z powodu:

   1. niewystarczającej wartości zabezpieczenia;
   2. nieuregulowanego stanu prawnego nieruchomości;
   3. zbyt wysokiego zadłużenia;
   4. zajęć komorniczych;
   5. niezgodności danych;
   6. niepełnych dokumentów;
   7. braku zgody współwłaścicieli;
   8. negatywnej oceny celu finansowania;
   9. braku zainteresowania finansujących;
   10. innych okoliczności niezależnych od Finance You.

5. Użytkownik przyjmuje do wiadomości, że finansowanie zabezpieczone na nieruchomości może wymagać spełnienia dodatkowych warunków, w szczególności zawarcia aktu notarialnego, ustanowienia hipoteki, złożenia oświadczenia o poddaniu się egzekucji, uzyskania zgód, wykreślenia obciążeń lub przedstawienia dodatkowych dokumentów.

---

## § 14. Obowiązki użytkownika

1. Użytkownik zobowiązuje się:

   1. korzystać z Platformy zgodnie z prawem i Regulaminem;
   2. podawać prawdziwe, aktualne i kompletne dane;
   3. nie wprowadzać Finance You ani finansujących w błąd;
   4. nie zatajać istotnych informacji;
   5. posiadać prawo do przekazywania dokumentów i danych;
   6. aktualizować dane sprawy;
   7. odpowiadać na uzasadnione pytania Finance You;
   8. nie publikować treści bezprawnych;
   9. nie naruszać praw osób trzecich;
   10. nie wykorzystywać Platformy do wyłudzeń, oszustw, obchodzenia prawa ani działań nieuczciwych.

2. Użytkownik ponosi odpowiedzialność za treść przekazanych danych, dokumentów, zdjęć, oświadczeń i informacji.

3. Użytkownik zobowiązuje się zwolnić Finance You z odpowiedzialności w przypadku roszczeń osób trzecich wynikających z przekazania przez użytkownika danych, dokumentów lub informacji bez wymaganej podstawy prawnej.

4. Użytkownik nie może:

   1. podszywać się pod inną osobę;
   2. zgłaszać nieruchomości, do której nie ma praw albo upoważnienia;
   3. przekazywać cudzych danych bez podstawy prawnej;
   4. przesyłać fałszywych dokumentów;
   5. przesyłać dokumentów przerobionych lub podrobionych;
   6. ukrywać obciążeń nieruchomości;
   7. ukrywać zadłużenia;
   8. wykorzystywać Platformy do obejścia prawa;
   9. kontaktować się z finansującymi w sposób naruszający ustalenia z Finance You;
   10. omijać Finance You w celu uniknięcia zapłaty wynagrodzenia, jeżeli wynagrodzenie stało się należne.

5. Użytkownik zobowiązuje się niezwłocznie poinformować Finance You, jeżeli po złożeniu wniosku pozyska finansowanie z innego źródła albo zrezygnuje z finansowania.

---

## § 15. Zasady korzystania z konta i panelu klienta

1. Platforma może umożliwiać utworzenie konta albo panelu klienta.

2. Konto może służyć w szczególności do:

   1. zapisania wniosku;
   2. uzupełniania danych;
   3. przesyłania dokumentów;
   4. śledzenia statusu sprawy;
   5. odbierania wiadomości;
   6. edycji danych;
   7. kontaktu z administratorem.

3. Użytkownik jest zobowiązany chronić dane logowania do konta.

4. Użytkownik nie może udostępniać konta osobom trzecim bez zgody Finance You.

5. Finance You może zablokować konto użytkownika, jeżeli:

   1. użytkownik narusza Regulamin;
   2. konto jest wykorzystywane niezgodnie z przeznaczeniem;
   3. istnieje podejrzenie nieuprawnionego dostępu;
   4. użytkownik podał nieprawdziwe dane;
   5. użytkownik narusza prawa osób trzecich;
   6. wymaga tego bezpieczeństwo Platformy.

6. Użytkownik może zażądać usunięcia konta, wysyłając wiadomość na adres [kontakt@financeyou.pl](mailto:kontakt@financeyou.pl).

7. Usunięcie konta nie oznacza automatycznego usunięcia danych, które Finance You musi przechowywać w celu wykazania wykonania usług, obsługi roszczeń, wykonania obowiązków prawnych, księgowych, podatkowych lub ochrony przed roszczeniami.

---

## § 16. Treści zabronione

1. Użytkownik nie może przekazywać za pomocą Platformy treści:

   1. bezprawnych;
   2. nieprawdziwych;
   3. naruszających prawa osób trzecich;
   4. naruszających dobra osobiste;
   5. zawierających groźby;
   6. obraźliwych;
   7. dyskryminujących;
   8. wulgarnych;
   9. nawołujących do przemocy;
   10. służących wyłudzeniu;
   11. służących praniu pieniędzy;
   12. naruszających tajemnicę przedsiębiorstwa;
   13. zawierających dane osobowe osób trzecich bez podstawy prawnej;
   14. zawierających wirusy, złośliwe oprogramowanie lub szkodliwe skrypty.

2. Finance You może usuwać, blokować albo ograniczać dostęp do treści naruszających Regulamin.

3. Finance You może zawiadomić właściwe organy, jeżeli treści lub zachowanie użytkownika wskazują na możliwość popełnienia przestępstwa albo innego naruszenia prawa.

---

## § 17. Odpowiedzialność Finance You

1. Finance You odpowiada za prawidłowe świadczenie usług elektronicznych w zakresie wynikającym z Regulaminu i obowiązujących przepisów prawa.

2. Finance You nie odpowiada za:

   1. brak uzyskania finansowania;
   2. decyzje finansujących;
   3. treść decyzji inwestora;
   4. warunki zaproponowane przez finansującego;
   5. działania lub zaniechania użytkownika;
   6. nieprawdziwe dane przekazane przez użytkownika;
   7. nieaktualne dokumenty przekazane przez użytkownika;
   8. błędy wynikające z niepełnych informacji;
   9. brak skuteczności zabezpieczenia wynikający z okoliczności niezależnych od Finance You;
   10. działania notariuszy, sądów, komorników, urzędów, rzeczoznawców, prawników, finansujących albo innych podmiotów zewnętrznych;
   11. przerwy techniczne, awarie, problemy operatorów telekomunikacyjnych albo problemy dostawców usług zewnętrznych;
   12. utratę danych wynikającą z działania użytkownika, siły wyższej albo zdarzeń niezależnych od Finance You.

3. Finance You nie ponosi odpowiedzialności za treści przekazane przez użytkownika, jeżeli nie wie o ich bezprawnym charakterze, a w razie uzyskania wiarygodnej wiadomości o ich bezprawnym charakterze niezwłocznie uniemożliwi do nich dostęp.

4. Wobec użytkowników będących konsumentami odpowiedzialność Finance You nie jest wyłączona ani ograniczona w zakresie, w jakim byłoby to sprzeczne z bezwzględnie obowiązującymi przepisami prawa.

5. Wobec użytkowników niebędących konsumentami odpowiedzialność Finance You, w najszerszym dopuszczalnym przez prawo zakresie, ogranicza się do rzeczywistej straty poniesionej przez użytkownika i nie obejmuje utraconych korzyści.

6. Finance You nie odpowiada za skutki decyzji użytkownika o przyjęciu albo odrzuceniu określonej propozycji finansowania.

---

## § 18. Zawarcie umowy o świadczenie usług elektronicznych

1. Do zawarcia umowy o świadczenie usług elektronicznych dochodzi z chwilą rozpoczęcia korzystania przez użytkownika z danej funkcjonalności Platformy, w szczególności poprzez:

   1. wejście na stronę Platformy;
   2. rozpoczęcie wypełniania formularza;
   3. wysłanie wniosku;
   4. utworzenie konta;
   5. przesłanie dokumentów;
   6. zaakceptowanie Regulaminu;
   7. wysłanie wiadomości przez formularz kontaktowy.

2. Umowa o świadczenie usług elektronicznych dotycząca samego korzystania z Platformy jest zawierana na czas korzystania z danej usługi.

3. Użytkownik może zakończyć korzystanie z Platformy w każdym czasie.

4. Zakończenie korzystania z Platformy nie wpływa na:

   1. obowiązek zapłaty wynagrodzenia, jeżeli stało się należne;
   2. skuteczność wcześniej zawartych umów;
   3. obowiązek przechowywania danych przez Finance You, jeżeli wynika on z prawa albo uzasadnionego interesu;
   4. odpowiedzialność użytkownika za przekazane dane, dokumenty i oświadczenia.

5. Umowa dotycząca odpłatnej usługi zorganizowania finansowania może zostać zawarta w sposób odrębny, w szczególności poprzez zaakceptowanie warunków wynagrodzenia, podpisanie dokumentów, zaakceptowanie ustaleń w wiadomości e-mail albo przystąpienie do czynności zmierzających do zawarcia finansowania po poinformowaniu użytkownika o wynagrodzeniu Finance You.

---

## § 19. Prawo odstąpienia od umowy przez konsumenta

1. Użytkownik będący konsumentem, który zawarł z Finance You umowę na odległość, może co do zasady odstąpić od tej umowy w terminie 14 dni bez podawania przyczyny, o ile przepisy prawa nie stanowią inaczej.

2. Termin do odstąpienia od umowy o świadczenie usług elektronicznych liczony jest od dnia zawarcia umowy.

3. Do zachowania terminu wystarczy wysłanie oświadczenia o odstąpieniu przed upływem terminu.

4. Oświadczenie o odstąpieniu można wysłać na adres e-mail: [kontakt@financeyou.pl](mailto:kontakt@financeyou.pl).

5. Użytkownik może skorzystać ze wzoru formularza odstąpienia stanowiącego załącznik nr 1 do Regulaminu, jednak nie jest to obowiązkowe.

6. Prawo odstąpienia od umowy nie ma wpływu na prawo Finance You do wynagrodzenia za usługi wykonane na wyraźne żądanie konsumenta przed upływem terminu odstąpienia, jeżeli obowiązujące przepisy pozwalają na takie rozliczenie, a konsument został prawidłowo poinformowany o skutkach złożenia takiego żądania.

7. Jeżeli konsument wyraźnie żąda rozpoczęcia świadczenia usługi przed upływem terminu do odstąpienia, powinien złożyć odpowiednie oświadczenie poprzez zaznaczenie właściwego pola w formularzu albo złożenie oświadczenia w innej utrwalonej formie.

8. Jeżeli usługa została w pełni wykonana za wyraźną i uprzednią zgodą konsumenta, po poinformowaniu go o utracie prawa odstąpienia po spełnieniu świadczenia, konsument może utracić prawo odstąpienia w zakresie przewidzianym przez prawo.

9. W przypadku samego nieodpłatnego korzystania z Platformy odstąpienie od umowy polega w praktyce na zaprzestaniu korzystania z Platformy, żądaniu usunięcia konta albo wysłaniu oświadczenia o odstąpieniu.

10. Postanowienia niniejszego paragrafu stosuje się również do przedsiębiorcy na prawach konsumenta w zakresie przewidzianym przez przepisy prawa.

---

## § 20. Reklamacje

1. Użytkownik może złożyć reklamację dotyczącą działania Platformy albo usług świadczonych przez Finance You.

2. Reklamację należy wysłać na adres e-mail: [kontakt@financeyou.pl](mailto:kontakt@financeyou.pl).

3. Reklamacja powinna zawierać:

   1. imię i nazwisko albo nazwę użytkownika;
   2. adres e-mail;
   3. opis sprawy;
   4. datę wystąpienia problemu;
   5. żądanie użytkownika;
   6. ewentualne załączniki pomocne w rozpoznaniu reklamacji.

4. Finance You rozpatruje reklamację w terminie 14 dni od dnia jej otrzymania, chyba że przepisy prawa wymagają innego terminu.

5. Jeżeli rozpatrzenie reklamacji wymaga uzupełnienia danych, Finance You może zwrócić się do użytkownika o dodatkowe informacje.

6. Odpowiedź na reklamację zostanie wysłana na adres e-mail wskazany przez użytkownika.

7. Reklamacja dotycząca braku uzyskania finansowania nie będzie uznana za zasadną, jeżeli Finance You nie zobowiązało się wyraźnie do zapewnienia finansowania.

8. Reklamacja dotycząca decyzji finansującego nie będzie uznana za reklamację dotyczącą działania Platformy, chyba że dotyczy błędu Finance You w przekazaniu danych albo obsłudze sprawy.

---

## § 21. Dane osobowe

1. Administratorem danych osobowych użytkowników jest Finance You sp. z o.o.

2. Dane osobowe są przetwarzane w szczególności w celu:

   1. obsługi Platformy;
   2. przyjęcia wniosku;
   3. analizy sprawy;
   4. kontaktu z użytkownikiem;
   5. przekazania sprawy potencjalnym finansującym;
   6. organizacji finansowania;
   7. przygotowania dokumentów;
   8. wykonania umów;
   9. wystawienia faktury;
   10. obsługi reklamacji;
   11. obrony przed roszczeniami;
   12. wykonania obowiązków prawnych, podatkowych i księgowych;
   13. prowadzenia działań marketingowych, jeżeli użytkownik wyraził odpowiednią zgodę albo istnieje inna podstawa prawna.

3. Szczegółowe zasady przetwarzania danych osobowych określa Polityka prywatności Platformy.

4. Użytkownik przyjmuje do wiadomości, że obsługa sprawy może wymagać przekazania danych osobowych podmiotom trzecim, w szczególności:

   1. potencjalnym finansującym;
   2. inwestorom;
   3. partnerom;
   4. notariuszom;
   5. prawnikom;
   6. rzeczoznawcom;
   7. analitykom;
   8. podmiotom świadczącym usługi IT;
   9. podmiotom księgowym;
   10. podmiotom obsługującym komunikację elektroniczną;
   11. organom publicznym, jeżeli wynika to z przepisów prawa.

5. Użytkownik, przekazując dane osób trzecich, oświadcza, że posiada podstawę prawną do ich przekazania i zobowiązuje się poinformować te osoby o przekazaniu danych Finance You, jeżeli wymagają tego przepisy prawa.

6. Użytkownik ma prawo dostępu do swoich danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, przenoszenia danych, wniesienia sprzeciwu oraz wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych, na zasadach określonych w przepisach prawa.

---

## § 22. Zgody marketingowe i kontakt handlowy

1. Finance You może przesyłać użytkownikowi informacje handlowe drogą elektroniczną wyłącznie na podstawie właściwej zgody albo innej podstawy prawnej.

2. Użytkownik może wyrazić zgodę na:

   1. kontakt e-mailowy;
   2. kontakt telefoniczny;
   3. kontakt SMS;
   4. kontakt przez komunikatory;
   5. otrzymywanie newslettera;
   6. otrzymywanie informacji o ofertach, usługach, szkoleniach lub możliwościach finansowania.

3. Zgoda marketingowa jest dobrowolna i może zostać cofnięta w każdym czasie.

4. Cofnięcie zgody nie wpływa na zgodność z prawem działań dokonanych przed jej cofnięciem.

5. Kontakt dotyczący złożonego wniosku, obsługi sprawy, uzupełnienia dokumentów, organizacji finansowania albo wykonania umowy nie stanowi newslettera i może być prowadzony w zakresie niezbędnym do obsługi sprawy.

---

## § 23. Poufność

1. Finance You zobowiązuje się zachować poufność informacji przekazanych przez użytkownika, z zastrzeżeniem sytuacji, w których przekazanie informacji jest konieczne do obsługi sprawy, organizacji finansowania, wykonania obowiązków prawnych albo ochrony uzasadnionych interesów Finance You.

2. Użytkownik przyjmuje do wiadomości, że przekazanie sprawy potencjalnym finansującym wymaga ujawnienia im określonych informacji dotyczących sprawy.

3. Finance You może udostępniać informacje o sprawie wyłącznie w zakresie uzasadnionym celem obsługi wniosku.

4. Obowiązek poufności nie dotyczy informacji:

   1. publicznie dostępnych;
   2. ujawnionych za zgodą użytkownika;
   3. wymaganych przez przepisy prawa;
   4. wymaganych przez sąd, organ administracji, organ ścigania albo inny uprawniony organ;
   5. niezbędnych do dochodzenia lub obrony roszczeń.

---

## § 24. Własność intelektualna

1. Prawa do Platformy, jej układu, treści, formularzy, tekstów, grafik, znaków, logotypów, rozwiązań technicznych, baz danych, materiałów i dokumentów należą do Finance You albo podmiotów, od których Finance You uzyskało odpowiednie prawa.

2. Użytkownik nie może kopiować, rozpowszechniać, sprzedawać, udostępniać, modyfikować ani wykorzystywać elementów Platformy poza zakresem dozwolonego korzystania wynikającego z Regulaminu.

3. Użytkownik zachowuje prawa do dokumentów, zdjęć i treści, które sam przekazuje, z zastrzeżeniem ust. 4.

4. Użytkownik udziela Finance You niewyłącznej, nieodpłatnej licencji na korzystanie z przekazanych treści, dokumentów i zdjęć w zakresie niezbędnym do obsługi sprawy, publikacji ogłoszenia, prezentacji sprawy finansującym, analizy wniosku, archiwizacji i wykonania umowy.

5. Licencja, o której mowa w ust. 4, obejmuje w szczególności:

   1. utrwalanie;
   2. przechowywanie;
   3. kopiowanie techniczne;
   4. przesyłanie;
   5. udostępnianie wybranym finansującym i partnerom;
   6. publikację w Platformie w zakresie zaakceptowanym przez administratora;
   7. anonimizację;
   8. opracowanie opisu sprawy.

6. Licencja wygasa w zakresie, w jakim dalsze korzystanie z treści nie jest potrzebne do obsługi sprawy, wykonania obowiązków prawnych, rozliczeń, archiwizacji albo obrony przed roszczeniami.

---

## § 25. Przerwy techniczne i dostępność Platformy

1. Finance You dokłada starań, aby Platforma działała prawidłowo i była dostępna dla użytkowników.

2. Finance You nie gwarantuje nieprzerwanej dostępności Platformy.

3. Dostęp do Platformy może być ograniczony w szczególności z powodu:

   1. prac technicznych;
   2. aktualizacji;
   3. awarii;
   4. problemów z hostingiem;
   5. problemów z dostawcami zewnętrznymi;
   6. cyberataków;
   7. siły wyższej;
   8. konieczności zapewnienia bezpieczeństwa danych.

4. Finance You może zmieniać funkcjonalności Platformy, jeżeli nie narusza to praw nabytych użytkowników ani bezwzględnie obowiązujących przepisów prawa.

---

## § 26. Zakończenie obsługi sprawy

1. Obsługa sprawy może zostać zakończona w szczególności w przypadku:

   1. uzyskania finansowania przez użytkownika;
   2. odmowy finansowania;
   3. braku zainteresowania finansujących;
   4. rezygnacji użytkownika;
   5. braku kontaktu z użytkownikiem;
   6. nieuzupełnienia dokumentów;
   7. upływu ważności ogłoszenia;
   8. usunięcia ogłoszenia;
   9. naruszenia Regulaminu;
   10. podejrzenia działania niezgodnego z prawem.

2. Zakończenie obsługi sprawy nie wyłącza prawa Finance You do wynagrodzenia, jeżeli wynagrodzenie stało się należne zgodnie z Regulaminem albo odrębnymi ustaleniami.

3. Po zakończeniu obsługi sprawy Finance You może przechowywać dokumentację sprawy przez okres wymagany przepisami prawa albo uzasadniony ochroną przed roszczeniami.

---

## § 27. Pozasądowe rozwiązywanie sporów

1. Użytkownik będący konsumentem może korzystać z pozasądowych sposobów rozpatrywania reklamacji i dochodzenia roszczeń.

2. Informacje o pozasądowych sposobach rozwiązywania sporów konsumenckich są dostępne na stronach właściwych organów ochrony konsumentów.

3. Finance You każdorazowo informuje konsumenta o swoim stanowisku wobec ewentualnego udziału w pozasądowym postępowaniu po zakończeniu procedury reklamacyjnej, jeżeli taki obowiązek wynika z przepisów prawa.

---

## § 28. Zmiany Regulaminu

1. Finance You może zmienić Regulamin z ważnych przyczyn, w szczególności:

   1. zmiany przepisów prawa;
   2. zmiany funkcjonalności Platformy;
   3. zmiany modelu działania Platformy;
   4. zmiany danych Finance You;
   5. potrzeby doprecyzowania postanowień;
   6. potrzeby zwiększenia bezpieczeństwa;
   7. zmiany zasad publikacji ogłoszeń;
   8. zmiany zasad obsługi spraw;
   9. zmiany zasad rozliczeń.

2. Zmieniony Regulamin zostanie udostępniony na Platformie.

3. W przypadku użytkowników posiadających konto albo aktywną sprawę Finance You może poinformować o zmianie Regulaminu drogą elektroniczną.

4. Do spraw rozpoczętych przed zmianą Regulaminu stosuje się Regulamin obowiązujący w chwili rozpoczęcia sprawy, chyba że zmiana Regulaminu jest korzystna dla użytkownika albo bezwzględnie wymagają jej przepisy prawa.

5. Użytkownik, który nie akceptuje zmian Regulaminu, może zaprzestać korzystania z Platformy albo zażądać usunięcia konta.

---

## § 29. Postanowienia końcowe

1. Prawem właściwym dla Regulaminu jest prawo polskie.

2. W sprawach nieuregulowanych Regulaminem zastosowanie mają właściwe przepisy prawa polskiego.

3. Wszelkie spory z użytkownikiem będącym konsumentem będą rozstrzygane przez właściwy sąd zgodnie z przepisami prawa.

4. Wszelkie spory z użytkownikiem niebędącym konsumentem będą rozstrzygane przez sąd właściwy miejscowo dla siedziby Finance You, o ile przepisy prawa pozwalają na takie ustalenie.

5. Jeżeli którekolwiek postanowienie Regulaminu okaże się nieważne, bezskuteczne albo niewykonalne, nie wpływa to na ważność pozostałych postanowień Regulaminu.

6. Regulamin w wersji 2 obowiązuje od dnia 29 września 2026 r.. Do spraw rozpoczętych przed tym dniem stosuje się § 28 ust. 4.

---

# ZAŁĄCZNIK NR 1

## Wzór formularza odstąpienia od umowy

Adresat:
Finance You sp. z o.o.
ul. Nowogrodzka 31
00-511 Warszawa
e-mail: [kontakt@financeyou.pl](mailto:kontakt@financeyou.pl)

Ja, niżej podpisany/a:

Imię i nazwisko: ............................................................

Adres: ...........................................................................

Adres e-mail: ..................................................................

niniejszym informuję o moim odstąpieniu od umowy o świadczenie usług drogą elektroniczną zawartej za pośrednictwem Platformy Finance You.

Data zawarcia umowy / rozpoczęcia korzystania z Platformy: ....................................

Numer sprawy, jeżeli został nadany: ....................................

Data: ....................................

Podpis, jeżeli formularz jest składany w wersji papierowej: ....................................
',
  2, true
where not exists (
  select 1 from public.consent_documents
   where kind = 'terms'::public.consent_kind and version = 2
);

update public.consent_documents
   set is_active = false
 where kind = 'terms'::public.consent_kind and version < 2 and is_active;

-- privacy v2
insert into public.consent_documents (kind, title, content, version, is_active)
select 'privacy'::public.consent_kind, 'Akceptuję politykę prywatności',
'# POLITYKA PRYWATNOŚCI PLATFORMY FINANCE YOU

**wersja 2 — obowiązuje od dnia 29 września 2026 r.**

---

## § 1. Postanowienia ogólne

1. Niniejsza polityka prywatności, zwana dalej „Polityką prywatności”, określa zasady przetwarzania danych osobowych użytkowników korzystających z Platformy Finance You, w szczególności osób składających wniosek o pożyczkę, poszukujących finansowania, przekazujących dane dotyczące nieruchomości, przesyłających dokumenty lub korzystających z formularzy, panelu klienta, komunikacji elektronicznej i innych funkcjonalności Platformy.

2. Polityka prywatności ma zastosowanie do Platformy Finance You prowadzonej przez Finance You sp. z o.o., w tym do strony internetowej, formularzy, panelu użytkownika, systemu obsługi zgłoszeń, komunikacji e-mail, komunikacji telefonicznej, komunikacji SMS, komunikatorów internetowych oraz innych narzędzi wykorzystywanych przez Finance You do obsługi wniosków i spraw użytkowników.

3. Polityka prywatności dotyczy w szczególności:

   1. użytkowników składających wniosek o finansowanie;
   2. użytkowników publikujących ogłoszenie o potrzebie finansowania;
   3. osób przekazujących dane dotyczące nieruchomości;
   4. osób przesyłających dokumenty, zdjęcia lub załączniki;
   5. osób kontaktujących się z Finance You;
   6. osób korzystających z panelu klienta;
   7. osób zapisujących się na komunikację marketingową lub informacyjną;
   8. osób, których dane zostały przekazane przez użytkownika, w szczególności współwłaścicieli nieruchomości, małżonków, wspólników, członków organów, poręczycieli, dłużników, wierzycieli lub pełnomocników.

4. Polityka prywatności stanowi wykonanie obowiązków informacyjnych wynikających z rozporządzenia Parlamentu Europejskiego i Rady UE 2016/679 z dnia 27 kwietnia 2016 r., zwanego dalej „RODO”.

5. Korzystanie z Platformy oznacza zapoznanie się z zasadami przetwarzania danych opisanymi w niniejszej Polityce prywatności.

---

## § 2. Administrator danych osobowych

1. Administratorem danych osobowych jest:

**FINANCE YOU spółka z ograniczoną odpowiedzialnością** z siedzibą w Warszawie,
adres: ul. Nowogrodzka 31, 00-511 Warszawa,
KRS: 0000635207,
NIP: 7010611803,
REGON: 365350668,
kapitał zakładowy: 389 600,00 zł,
adres e-mail: [kontakt@financeyou.pl](mailto:kontakt@financeyou.pl),

zwana dalej „Administratorem”, „Spółką” albo „Finance You”.

2. We wszystkich sprawach dotyczących danych osobowych można kontaktować się z Administratorem pod adresem e-mail: [kontakt@financeyou.pl](mailto:kontakt@financeyou.pl).

3. Administrator nie wyznaczył inspektora ochrony danych (IOD). We wszystkich sprawach dotyczących danych osobowych właściwy jest adres [kontakt@financeyou.pl](mailto:kontakt@financeyou.pl).

---

## § 3. Najważniejsze zasady przetwarzania danych

1. Finance You przetwarza dane osobowe zgodnie z prawem, rzetelnie i w sposób przejrzysty dla osoby, której dane dotyczą.

2. Finance You przetwarza dane osobowe wyłącznie w konkretnych, wyraźnych i prawnie uzasadnionych celach.

3. Finance You zbiera dane w zakresie adekwatnym, stosownym i ograniczonym do tego, co niezbędne dla realizacji określonych celów.

4. Finance You podejmuje działania, aby dane były prawidłowe i w razie potrzeby aktualizowane.

5. Finance You przechowuje dane przez okres nie dłuższy, niż jest to niezbędne do realizacji celów przetwarzania, wykonania obowiązków prawnych, rozliczeń, obrony przed roszczeniami albo dochodzenia roszczeń.

6. Finance You stosuje odpowiednie środki techniczne i organizacyjne w celu ochrony danych osobowych przed nieuprawnionym dostępem, utratą, zniszczeniem, zmianą, ujawnieniem lub nieuprawnionym wykorzystaniem.

---

## § 4. Jakie dane osobowe możemy przetwarzać

1. Finance You może przetwarzać następujące kategorie danych osobowych użytkownika:

   1. **dane identyfikacyjne**, w szczególności imię, nazwisko, firma, nazwa przedsiębiorcy, NIP, REGON, KRS, PESEL, seria i numer dokumentu tożsamości, dane reprezentantów, pełnomocników, wspólników lub członków organów;
   2. **dane kontaktowe**, w szczególności adres e-mail, numer telefonu, adres korespondencyjny, adres zamieszkania, adres siedziby, dane do komunikatorów internetowych;

   3. **dane dotyczące statusu prawnego użytkownika**, w szczególności informacja, czy użytkownik działa jako konsument, przedsiębiorca, osoba reprezentująca spółkę, pełnomocnik, właściciel nieruchomości, współwłaściciel, małżonek, poręczyciel lub inna osoba uczestnicząca w sprawie;
   4. **dane dotyczące finansowania**, w szczególności oczekiwana kwota finansowania, cel finansowania, proponowany okres spłaty, preferowana forma spłaty, informacje o potrzebie refinansowania, restrukturyzacji, spłacie zobowiązań lub pozyskaniu środków na działalność;

   5. **dane finansowe i majątkowe**, w szczególności informacje o dochodach, źródłach przychodów, zobowiązaniach, zaległościach, zadłużeniu, egzekucjach, zajęciach komorniczych, upadłości, restrukturyzacji, postępowaniach sądowych, sytuacji majątkowej i posiadanych składnikach majątku;
   6. **dane dotyczące nieruchomości**, w szczególności numer księgi wieczystej, adres lub położenie nieruchomości, rodzaj nieruchomości, powierzchnia, stan prawny, stan techniczny, przeznaczenie, sposób korzystania, obciążenia, hipoteki, służebności, roszczenia, ostrzeżenia, najmy, dzierżawy, zdjęcia nieruchomości, dokumenty dotyczące nieruchomości;

   7. **dane zawarte w dokumentach**, w szczególności dane z aktów notarialnych, umów, odpisów, wypisów, zaświadczeń, decyzji administracyjnych, dokumentów sądowych, dokumentów komorniczych, dokumentów księgowych, dokumentów firmowych, dokumentów potwierdzających dochód, dokumentów dotyczących zobowiązań lub zabezpieczeń;
   8. **dane komunikacyjne**, w szczególności treść wiadomości e-mail, formularzy, SMS, wiadomości z komunikatorów, notatki z rozmów, historia kontaktu, ustalenia dotyczące sprawy;

   9. **dane techniczne**, w szczególności adres IP, identyfikatory cookies, dane o urządzeniu, przeglądarce, systemie operacyjnym, czasie wizyty, źródle wejścia na stronę, aktywności w Platformie;
   10. **dane rozliczeniowe**, w szczególności dane potrzebne do wystawienia faktury, dane dotyczące wynagrodzenia Finance You, dane dotyczące potrącenia wynagrodzenia z kwoty finansowania, dane dotyczące płatności lub rozliczeń;

   11. **dane marketingowe**, w szczególności zgody marketingowe, historia udzielonych zgód, źródło zgody, data zgody, kanał komunikacji, historia wysłanych wiadomości marketingowych.

2. Zakres przetwarzanych danych zależy od rodzaju sprawy, sposobu korzystania z Platformy, danych przekazanych przez użytkownika, rodzaju nieruchomości, celu finansowania oraz zakresu niezbędnego do obsługi sprawy.

3. Finance You nie wymaga od użytkownika przekazywania danych nadmiarowych. Użytkownik powinien przekazywać wyłącznie dane potrzebne do obsługi sprawy.

4. Jeżeli użytkownik przekaże dane szczególnych kategorii, dane wrażliwe albo dane nadmiarowe, Finance You może je przetwarzać wyłącznie w zakresie, w jakim jest to niezbędne, dopuszczalne prawem albo konieczne do obsługi sprawy, ochrony roszczeń lub wykonania obowiązków prawnych.

---

## § 5. Źródła danych osobowych

1. Finance You może pozyskiwać dane osobowe bezpośrednio od użytkownika, w szczególności poprzez:

   1. formularz na Platformie;
   2. panel klienta;
   3. wiadomość e-mail;
   4. rozmowę telefoniczną;
   5. SMS;
   6. komunikator internetowy;
   7. przesłane dokumenty;
   8. przesłane zdjęcia;
   9. spotkanie lub kontakt bezpośredni.

2. Finance You może pozyskiwać dane osobowe również z innych źródeł, w szczególności:

   1. od osób działających w imieniu użytkownika;
   2. od współwłaścicieli nieruchomości;
   3. od małżonków, wspólników, członków organów, pełnomocników lub poręczycieli;
   4. od inwestorów, finansujących lub partnerów;
   5. z publicznych rejestrów, w szczególności ksiąg wieczystych, KRS, CEIDG, REGON, rejestrów publicznych i baz urzędowych;
   6. z dokumentów przekazanych przez użytkownika lub osoby trzecie;
   7. z korespondencji dotyczącej sprawy;
   8. z ogólnodostępnych źródeł, jeżeli jest to niezbędne do analizy sprawy.

3. Jeżeli użytkownik przekazuje Finance You dane osobowe innych osób, powinien posiadać odpowiednią podstawę prawną do ich przekazania i poinformować te osoby o przekazaniu danych Finance You, jeżeli wymagają tego przepisy prawa.

---

## § 6. Cele i podstawy prawne przetwarzania danych

1. Finance You przetwarza dane osobowe w następujących celach:

### 1. Obsługa Platformy i świadczenie usług drogą elektroniczną

2. Dane są przetwarzane w celu umożliwienia korzystania z Platformy, formularzy, panelu klienta, konta użytkownika, przesyłania dokumentów, publikacji ogłoszeń i komunikacji z Finance You.

3. Podstawą prawną przetwarzania jest:

   1. art. 6 ust. 1 lit. b RODO – wykonanie umowy lub podjęcie działań przed zawarciem umowy;
   2. art. 6 ust. 1 lit. f RODO – prawnie uzasadniony interes Administratora polegający na prowadzeniu i zabezpieczeniu Platformy.

### 2. Przyjęcie i analiza wniosku o finansowanie

4. Dane są przetwarzane w celu przyjęcia wniosku, weryfikacji kompletności danych, oceny możliwości przedstawienia sprawy finansującym oraz przygotowania sprawy do dalszej obsługi.

5. Podstawą prawną przetwarzania jest:

   1. art. 6 ust. 1 lit. b RODO – podjęcie działań na żądanie osoby, której dane dotyczą, przed zawarciem umowy;
   2. art. 6 ust. 1 lit. f RODO – prawnie uzasadniony interes Administratora polegający na analizie sprawy i organizacji procesu finansowania.

### 3. Publikacja lub przekazanie ogłoszenia o potrzebie finansowania

6. Dane są przetwarzane w celu przygotowania, moderowania, publikacji, udostępnienia albo przekazania ogłoszenia potencjalnym finansującym, inwestorom lub partnerom.

7. Podstawą prawną przetwarzania jest:

   1. art. 6 ust. 1 lit. b RODO – wykonanie usługi zleconej przez użytkownika;
   2. art. 6 ust. 1 lit. f RODO – prawnie uzasadniony interes Administratora polegający na umożliwieniu przedstawienia sprawy potencjalnym finansującym.

### 4. Przekazanie sprawy inwestorom, finansującym i partnerom

8. Dane są przetwarzane w celu przedstawienia sprawy potencjalnym finansującym, inwestorom, partnerom, analitykom, notariuszom, prawnikom, rzeczoznawcom albo innym podmiotom uczestniczącym w procesie organizacji finansowania.

9. Podstawą prawną przetwarzania jest:

   1. art. 6 ust. 1 lit. b RODO – podjęcie działań zmierzających do zorganizowania finansowania;
   2. art. 6 ust. 1 lit. f RODO – prawnie uzasadniony interes Administratora, użytkownika i potencjalnych finansujących polegający na analizie możliwości zawarcia transakcji;
   3. zgoda użytkownika, jeżeli w konkretnym przypadku jest wymagana.

### 5. Kontakt z użytkownikiem

10. Dane są przetwarzane w celu prowadzenia kontaktu dotyczącego wniosku, uzupełnienia dokumentów, wyjaśnienia sprawy, przekazania informacji o statusie sprawy, organizacji finansowania lub wykonania umowy.

11. Podstawą prawną przetwarzania jest:

   1. art. 6 ust. 1 lit. b RODO – wykonanie umowy lub podjęcie działań przed jej zawarciem;
   2. art. 6 ust. 1 lit. f RODO – prawnie uzasadniony interes Administratora polegający na obsłudze korespondencji i komunikacji.

### 6. Zorganizowanie finansowania i rozliczenie wynagrodzenia Finance You

12. Dane są przetwarzane w celu zorganizowania finansowania, przygotowania lub koordynacji dokumentów, ustalenia wynagrodzenia Finance You, wystawienia faktury, rozliczenia potrącenia wynagrodzenia z kwoty finansowania oraz obsługi płatności.

13. Podstawą prawną przetwarzania jest:

   1. art. 6 ust. 1 lit. b RODO – wykonanie umowy;
   2. art. 6 ust. 1 lit. c RODO – wykonanie obowiązków prawnych, w szczególności podatkowych i rachunkowych;

   3. art. 6 ust. 1 lit. f RODO – prawnie uzasadniony interes Administratora polegający na dochodzeniu należnego wynagrodzenia i dokumentowaniu rozliczeń.

### 7. Obsługa reklamacji, zapytań i zgłoszeń

14. Dane są przetwarzane w celu rozpoznania reklamacji, odpowiedzi na pytania, obsługi zgłoszeń, wyjaśnienia problemów technicznych lub organizacyjnych.

15. Podstawą prawną przetwarzania jest:

   1. art. 6 ust. 1 lit. b RODO – wykonanie umowy;
   2. art. 6 ust. 1 lit. c RODO – obowiązki prawne, jeżeli reklamacja wynika z przepisów;

   3. art. 6 ust. 1 lit. f RODO – prawnie uzasadniony interes Administratora polegający na obsłudze zgłoszeń i ochronie przed roszczeniami.

### 8. Dochodzenie roszczeń i obrona przed roszczeniami

16. Dane są przetwarzane w celu ustalenia, dochodzenia lub obrony roszczeń, zabezpieczenia dowodów, dokumentowania przebiegu sprawy, rozliczenia usług i ochrony interesów Finance You.

17. Podstawą prawną przetwarzania jest art. 6 ust. 1 lit. f RODO – prawnie uzasadniony interes Administratora.

### 9. Wykonanie obowiązków prawnych

18. Dane są przetwarzane w celu wykonania obowiązków wynikających z przepisów prawa, w szczególności przepisów podatkowych, rachunkowych, cywilnych, konsumenckich, dotyczących świadczenia usług drogą elektroniczną, ochrony danych osobowych oraz obowiązków wobec uprawnionych organów.

19. Podstawą prawną przetwarzania jest art. 6 ust. 1 lit. c RODO.

### 10. Marketing własny Finance You

20. Dane mogą być przetwarzane w celu przesyłania informacji handlowych, newslettera, informacji o usługach, materiałach edukacyjnych, webinarach, ofertach lub możliwościach współpracy.

21. Podstawą prawną przetwarzania jest:

   1. zgoda użytkownika – art. 6 ust. 1 lit. a RODO, jeżeli jest wymagana;
   2. art. 6 ust. 1 lit. f RODO – prawnie uzasadniony interes Administratora polegający na marketingu własnym, z zastrzeżeniem przepisów dotyczących zgód na komunikację elektroniczną i telefoniczną.

### 11. Analityka, bezpieczeństwo i rozwój Platformy

22. Dane techniczne i eksploatacyjne mogą być przetwarzane w celu zapewnienia bezpieczeństwa Platformy, wykrywania nadużyć, prowadzenia statystyk, analizy działania strony, poprawy funkcjonalności i jakości usług.

23. Podstawą prawną przetwarzania jest:

   1. art. 6 ust. 1 lit. f RODO – prawnie uzasadniony interes Administratora;
   2. zgoda użytkownika – w zakresie, w jakim wymagana jest zgoda na określone pliki cookies lub podobne technologie.

---

## § 7. Dane osób trzecich przekazane przez użytkownika

1. Użytkownik może przekazać Finance You dane osób trzecich wyłącznie wtedy, gdy posiada ku temu odpowiednią podstawę prawną.

2. Dane osób trzecich mogą dotyczyć w szczególności:

   1. współwłaścicieli nieruchomości;
   2. małżonków;
   3. wspólników;
   4. członków zarządu;
   5. prokurentów;
   6. pełnomocników;
   7. poręczycieli;
   8. dłużników;
   9. wierzycieli;
   10. najemców lub dzierżawców;
   11. osób wskazanych w dokumentach dotyczących sprawy.

3. Finance You może przetwarzać dane tych osób w zakresie niezbędnym do analizy sprawy, oceny możliwości finansowania, przygotowania dokumentów, kontaktu, wykonania umowy, realizacji obowiązków prawnych lub ochrony roszczeń.

4. Jeżeli przepisy prawa wymagają przekazania osobie trzeciej informacji o przetwarzaniu jej danych, użytkownik powinien pomóc Finance You w wykonaniu tego obowiązku albo przekazać tej osobie informację o przetwarzaniu danych przez Finance You.

---

## § 8. Odbiorcy danych osobowych

1. Dane osobowe mogą być ujawniane podmiotom, które uczestniczą w obsłudze Platformy, obsłudze wniosku, organizacji finansowania albo wykonaniu obowiązków prawnych.

2. Odbiorcami danych mogą być w szczególności:

   1. inwestorzy i potencjalni finansujący;
   2. partnerzy Finance You;
   3. pośrednicy i analitycy współpracujący z Finance You;
   4. notariusze;
   5. kancelarie prawne;
   6. rzeczoznawcy majątkowi;
   7. księgowi i biura rachunkowe;
   8. dostawcy hostingu;
   9. dostawcy poczty elektronicznej;
   10. dostawcy systemów CRM;
   11. dostawcy formularzy, baz danych i systemów obsługi zgłoszeń;
   12. dostawcy narzędzi analitycznych;
   13. dostawcy narzędzi marketingowych;
   14. dostawcy usług IT i cyberbezpieczeństwa;
   15. operatorzy płatności (Tpay);
   16. banki, jeżeli jest to potrzebne do rozliczeń;
   17. organy publiczne, sądy, komornicy, urzędy, organy ścigania albo inne podmioty uprawnione na podstawie przepisów prawa.

3. Dane mogą być powierzane podmiotom przetwarzającym dane osobowe w imieniu Finance You na podstawie odpowiednich umów powierzenia przetwarzania danych.

4. Dane mogą być udostępniane innym administratorom danych, jeżeli taki podmiot samodzielnie decyduje o celach i sposobach przetwarzania danych, na przykład notariusz, kancelaria prawna, inwestor, finansujący, rzeczoznawca albo organ publiczny.

5. Finance You przekazuje dane osobowe wyłącznie w zakresie niezbędnym do realizacji określonego celu.

6. Podmioty przetwarzające dane w imieniu Finance You (stan na 29 września 2026 r.):
   1. **Lovable Labs Incorporated** (USA), w Unii Europejskiej reprezentowana przez **Lovable Labs Sweden AB**, Regeringsgatan 25, 111 53 Sztokholm, Szwecja – hosting aplikacji i bazy danych Platformy (Lovable Cloud), uwierzytelnianie, przechowywanie plików oraz dostęp do modeli sztucznej inteligencji wykorzystywanych do wstępnej analizy dokumentów, przygotowania opisów spraw i działania asystentów AI. Dalszymi podmiotami przetwarzającymi Lovable są w szczególności: Supabase Pte. Ltd., 65 Chulia Street #38-02/03, OCBC Centre, Singapur 049513 (baza danych na infrastrukturze Amazon Web Services), Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA (uruchamianie aplikacji i sieć dostarczania treści), Google LLC, 1600 Amphitheatre Parkway, Mountain View, CA 94043, USA (modele Gemini) oraz OpenAI (modele językowe i transkrypcja mowy);
   2. **Anthropic Ireland, Limited**, 6th Floor, South Bank House, Barrow Street, Dublin 4, D04 TR29, Irlandia – model językowy Claude w narzędziach wewnętrznych zespołu Finance You; dane nie są wykorzystywane do trenowania modeli;
   3. **Didit Identity Spain, S.L.**, Calle Nápoles 227, P. 1, 08013 Barcelona, Hiszpania (CIF B22929327) – weryfikacja tożsamości (KYC), w tym weryfikacja dokumentu tożsamości i zdjęcia twarzy;
   4. **dilisense GmbH**, Weinbergstrasse 131, 8006 Zurych, Szwajcaria (UID CHE-406.519.053) – weryfikacja na listach sankcyjnych i listach osób zajmujących eksponowane stanowiska polityczne (AML);
   5. **Eleven Labs Inc.**, 169 Madison Ave #2484, New York, NY 10016, USA – agenci głosowi i tekstowi AI, synteza i rozpoznawanie mowy, transkrypcja rozmów;
   6. **Twilio Ireland Limited**, Dublin, Irlandia (nr rejestru CRO 557454) – połączenia telefoniczne i wiadomości SMS;
   7. **Krajowy Integrator Płatności S.A.** (Tpay), pl. Władysława Andersa 3, 61-894 Poznań (KRS 0000412357, NIP 7773061579) – obsługa płatności elektronicznych;
   8. **Plus Five Five, Inc.** (Resend), 2261 Market Street #5039, San Francisco, CA 94114, USA – wysyłka wiadomości e-mail.

7. **Meta Platforms Ireland Limited**, Merrion Road, Dublin 4, D04 X2K5, Irlandia – formularze reklamowe (Lead Ads), komunikacja przez Messenger i Instagram oraz piksel Meta i Conversions API. W zakresie zbierania i przekazywania danych o zdarzeniach (piksel, Conversions API) Finance You i Meta Platforms Ireland Limited są współadministratorami (art. 26 RODO); w pozostałym zakresie Meta działa jako podmiot przetwarzający albo odrębny administrator. Narzędzia pomiaru reklam uruchamiamy na podstawie zgody.

8. Aktualną listę podmiotów przetwarzających dane można uzyskać, pisząc na adres [kontakt@financeyou.pl](mailto:kontakt@financeyou.pl).

---

## § 9. Przekazywanie danych poza Europejski Obszar Gospodarczy

1. Finance You co do zasady dąży do korzystania z rozwiązań technicznych i organizacyjnych zapewniających przetwarzanie danych na terenie Europejskiego Obszaru Gospodarczego.

2. Niektóre narzędzia informatyczne, hostingowe, analityczne, marketingowe lub komunikacyjne mogą wiązać się z przekazaniem danych poza Europejski Obszar Gospodarczy, w szczególności do państw, w których siedzibę lub infrastrukturę mają dostawcy tych narzędzi.

3. W przypadku przekazywania danych poza Europejski Obszar Gospodarczy Finance You stosuje mechanizmy przewidziane przez RODO, w szczególności:

   1. decyzję Komisji Europejskiej stwierdzającą odpowiedni stopień ochrony;
   2. standardowe klauzule umowne;
   3. dodatkowe środki bezpieczeństwa;
   4. inne podstawy przewidziane przez RODO.

4. Przekazanie danych poza Europejski Obszar Gospodarczy dotyczy w szczególności:
   1. Lovable Labs Incorporated (USA) i jej dalszych podmiotów przetwarzających, w tym Supabase Pte. Ltd. (Singapur) – standardowe klauzule umowne;
   2. Anthropic i OpenAI (USA) – standardowe klauzule umowne;
   3. Eleven Labs Inc., Plus Five Five, Inc. (Resend), Google LLC i Cloudflare, Inc. (USA) – decyzja Komisji Europejskiej w sprawie EU-US Data Privacy Framework wobec podmiotów certyfikowanych oraz standardowe klauzule umowne;
   4. Twilio Inc. (USA) – wiążące reguły korporacyjne (BCR), EU-US Data Privacy Framework oraz standardowe klauzule umowne;
   5. Meta Platforms, Inc. (USA) – EU-US Data Privacy Framework oraz standardowe klauzule umowne;
   6. dilisense GmbH (Szwajcaria) – decyzja Komisji Europejskiej stwierdzająca odpowiedni stopień ochrony danych w Szwajcarii.

   Didit Identity Spain, S.L. i Krajowy Integrator Płatności S.A. przetwarzają dane co do zasady w Europejskim Obszarze Gospodarczym.

5. Użytkownik może uzyskać dodatkowe informacje o stosowanych zabezpieczeniach, kontaktując się z Finance You pod adresem [kontakt@financeyou.pl](mailto:kontakt@financeyou.pl).

---

## § 10. Okres przechowywania danych

1. Dane osobowe są przechowywane przez okres niezbędny do realizacji celów, dla których zostały zebrane.

2. Dane związane z kontem użytkownika lub korzystaniem z Platformy są przechowywane przez okres korzystania z Platformy, a następnie przez okres niezbędny do rozliczeń, obrony przed roszczeniami lub wykonania obowiązków prawnych.

3. Dane związane z wnioskiem o finansowanie są przechowywane przez okres obsługi sprawy, a następnie przez okres niezbędny do wykazania przebiegu sprawy, dochodzenia roszczeń, obrony przed roszczeniami albo wykonania obowiązków prawnych.

4. Dane związane z ogłoszeniem są przechowywane przez okres publikacji ogłoszenia, archiwizacji sprawy oraz przez okres niezbędny do wykazania przebiegu obsługi sprawy.

5. Dane związane z rozliczeniami, fakturami i obowiązkami podatkowymi są przechowywane przez okres wymagany przepisami prawa podatkowego i rachunkowego.

6. Dane przetwarzane na podstawie zgody są przechowywane do czasu cofnięcia zgody, chyba że istnieje inna podstawa prawna dalszego przetwarzania danych.

7. Dane przetwarzane w celu dochodzenia roszczeń lub obrony przed roszczeniami są przechowywane do czasu upływu terminów przedawnienia roszczeń albo zakończenia postępowań dotyczących tych roszczeń.

8. Dane techniczne, analityczne i cookies są przechowywane przez okres wynikający z ustawień danego narzędzia, przeglądarki, zgody użytkownika lub konfiguracji Platformy.

9. Po upływie okresu przechowywania dane są usuwane, anonimizowane albo ograniczane w zakresie dalszego przetwarzania, chyba że przepisy prawa wymagają dalszego przechowywania.

---

## § 11. Prawa osoby, której dane dotyczą

1. Osobie, której dane dotyczą, przysługują prawa określone w RODO, w szczególności:

   1. prawo dostępu do danych;
   2. prawo do uzyskania kopii danych;
   3. prawo do sprostowania danych;
   4. prawo do usunięcia danych;
   5. prawo do ograniczenia przetwarzania;
   6. prawo do przenoszenia danych;
   7. prawo do wniesienia sprzeciwu wobec przetwarzania danych;
   8. prawo do cofnięcia zgody w dowolnym momencie, jeżeli dane są przetwarzane na podstawie zgody;
   9. prawo do wniesienia skargi do organu nadzorczego.

2. Żądanie dotyczące realizacji praw można wysłać na adres e-mail: [kontakt@financeyou.pl](mailto:kontakt@financeyou.pl).

3. Finance You odpowiada na żądanie bez zbędnej zwłoki, co do zasady nie później niż w terminie miesiąca od otrzymania żądania, chyba że RODO dopuszcza przedłużenie tego terminu.

4. W przypadku wątpliwości co do tożsamości osoby składającej żądanie Finance You może poprosić o dodatkowe informacje niezbędne do potwierdzenia tożsamości.

5. Prawo do usunięcia danych nie ma charakteru bezwzględnego. Finance You może odmówić usunięcia danych, jeżeli dalsze przetwarzanie jest niezbędne w szczególności do wykonania obowiązku prawnego, dochodzenia roszczeń, obrony przed roszczeniami, rozliczeń albo wykazania przebiegu sprawy.

6. Cofnięcie zgody nie wpływa na zgodność z prawem przetwarzania dokonanego przed cofnięciem zgody.

7. Osoba, której dane dotyczą, ma prawo wnieść skargę do Prezesa Urzędu Ochrony Danych Osobowych, jeżeli uważa, że przetwarzanie jej danych narusza przepisy o ochronie danych osobowych.

---

## § 12. Sprzeciw wobec przetwarzania danych

1. Jeżeli dane są przetwarzane na podstawie prawnie uzasadnionego interesu Finance You, osoba, której dane dotyczą, może wnieść sprzeciw wobec przetwarzania danych z przyczyn związanych z jej szczególną sytuacją.

2. W przypadku wniesienia sprzeciwu Finance You przestanie przetwarzać dane w celu objętym sprzeciwem, chyba że wykaże istnienie ważnych prawnie uzasadnionych podstaw do przetwarzania, nadrzędnych wobec interesów, praw i wolności osoby, której dane dotyczą, albo podstaw do ustalenia, dochodzenia lub obrony roszczeń.

3. Jeżeli dane są przetwarzane na potrzeby marketingu bezpośredniego, osoba, której dane dotyczą, może wnieść sprzeciw w każdym czasie. Po wniesieniu sprzeciwu Finance You nie będzie przetwarzać danych w tym celu.

---

## § 13. Dobrowolność podania danych

1. Podanie danych osobowych jest dobrowolne, ale może być niezbędne do skorzystania z określonych funkcjonalności Platformy.

2. Niepodanie danych wymaganych w formularzu może uniemożliwić:

   1. złożenie wniosku;
   2. analizę sprawy;
   3. publikację ogłoszenia;
   4. przekazanie sprawy potencjalnym finansującym;
   5. kontakt z użytkownikiem;
   6. zorganizowanie finansowania;
   7. wystawienie faktury;
   8. wykonanie obowiązków prawnych.

3. Podanie danych do celów marketingowych jest dobrowolne i nie jest warunkiem złożenia wniosku ani korzystania z podstawowych funkcjonalności Platformy.

---

## § 14. Zgody marketingowe i komunikacja elektroniczna

1. Finance You może kontaktować się z użytkownikiem w sprawie obsługi wniosku, uzupełnienia dokumentów, analizy sprawy, organizacji finansowania, rozliczeń, reklamacji lub wykonania umowy bez odrębnej zgody marketingowej, jeżeli kontakt jest niezbędny do realizacji tych celów.

2. Wysyłka informacji handlowych, newslettera, ofert, materiałów promocyjnych albo komunikatów marketingowych odbywa się zgodnie z obowiązującymi przepisami, w szczególności na podstawie zgody użytkownika, jeżeli taka zgoda jest wymagana.

3. Zgoda marketingowa może obejmować w szczególności:

   1. kontakt e-mailowy;
   2. kontakt telefoniczny;
   3. kontakt SMS;
   4. kontakt przez komunikatory internetowe;
   5. wysyłkę newslettera;
   6. przesyłanie informacji o usługach, ofertach, szkoleniach, webinarach lub możliwościach finansowania.

4. Zgoda marketingowa jest dobrowolna i może zostać cofnięta w każdym czasie.

5. Cofnięcie zgody marketingowej nie wpływa na zgodność z prawem komunikacji prowadzonej przed cofnięciem zgody.

6. Cofnięcie zgody marketingowej nie wpływa na możliwość kontaktu w sprawach związanych z obsługą wniosku, wykonaniem umowy, rozliczeniami, reklamacją, obowiązkami prawnymi lub ochroną roszczeń.

---

## § 15. Cookies i podobne technologie

1. Platforma może korzystać z plików cookies oraz podobnych technologii.

2. Cookies to niewielkie pliki zapisywane na urządzeniu użytkownika, które umożliwiają prawidłowe działanie strony, zapamiętanie ustawień, analizę ruchu, zapewnienie bezpieczeństwa lub prowadzenie działań marketingowych.

3. Platforma może wykorzystywać następujące rodzaje cookies:

   1. **cookies niezbędne** – potrzebne do prawidłowego działania Platformy, formularzy, sesji, bezpieczeństwa i podstawowych funkcji;
   2. **cookies analityczne** – służące do badania sposobu korzystania z Platformy, statystyk, źródeł ruchu i poprawy działania strony;
   3. **cookies funkcjonalne** – umożliwiające zapamiętanie ustawień użytkownika;
   4. **cookies marketingowe** – służące do prowadzenia działań reklamowych, remarketingu, mierzenia skuteczności kampanii lub personalizacji komunikacji.

4. Cookies niezbędne mogą być stosowane bez zgody użytkownika, jeżeli są konieczne do świadczenia usługi drogą elektroniczną.

5. Cookies analityczne, marketingowe lub inne niewymagane technicznie są stosowane zgodnie z obowiązującymi przepisami, w szczególności na podstawie zgody użytkownika, jeżeli taka zgoda jest wymagana.

6. Użytkownik może zarządzać cookies poprzez ustawienia przeglądarki lub mechanizm zgód dostępny na Platformie, jeżeli został wdrożony.

7. Ograniczenie albo wyłączenie cookies może wpłynąć na działanie niektórych funkcjonalności Platformy.

---

## § 16. Narzędzia analityczne, reklamowe i zewnętrzne

1. Finance You może korzystać z narzędzi analitycznych, reklamowych, hostingowych, komunikacyjnych, CRM, formularzy, automatyzacji, systemów mailingowych i innych narzędzi wspierających działanie Platformy.

2. Narzędzia te mogą przetwarzać dane techniczne, dane o aktywności użytkownika, identyfikatory cookies, adres IP, informacje o urządzeniu, źródle wizyty lub interakcjach z Platformą.

3. Zakres działania poszczególnych narzędzi może zależeć od aktualnej konfiguracji Platformy oraz zgód udzielonych przez użytkownika.

4. Jeżeli dane narzędzie wymaga zgody użytkownika, Finance You uruchamia je zgodnie z udzieloną zgodą, o ile jest to technicznie możliwe i wymagane przez przepisy.

5. Finance You może zmieniać dostawców narzędzi technicznych i analitycznych, pod warunkiem zachowania zgodności z przepisami o ochronie danych osobowych.

---

## § 17. Profilowanie i zautomatyzowane podejmowanie decyzji

1. Finance You może stosować podstawowe formy profilowania technicznego lub marketingowego, polegające w szczególności na analizie źródła wejścia na stronę, aktywności użytkownika, zainteresowania usługami, historii kontaktu lub rodzaju złożonego wniosku.

2. Profilowanie może być wykorzystywane w celu:

   1. dopasowania komunikacji;
   2. oceny skuteczności kampanii marketingowych;
   3. usprawnienia obsługi użytkownika;
   4. kierowania odpowiednich komunikatów;
   5. poprawy działania Platformy.

3. Finance You nie podejmuje wobec użytkownika decyzji opartych wyłącznie na zautomatyzowanym przetwarzaniu, które wywoływałyby wobec niego skutki prawne lub w podobny sposób istotnie na niego wpływały, chyba że użytkownik zostanie o tym wyraźnie poinformowany i zostaną spełnione wymagania wynikające z RODO.

4. Decyzja o udzieleniu finansowania, odmowie finansowania albo zaproponowaniu określonych warunków finansowania nie jest podejmowana automatycznie przez Platformę Finance You. Decyzje te mogą zależeć od indywidualnej analizy sprawy przez Finance You, inwestora, finansującego lub partnera.

5. Narzędzia automatyczne Platformy, w tym modele sztucznej inteligencji, mogą przygotować wstępną ocenę wniosku (np. kompletność dokumentów, relacja kwoty do wartości zabezpieczenia) albo zaproponować status wniosku, w tym propozycję jego odrzucenia. Propozycja nie wywołuje skutków wobec użytkownika. Decyzję o odrzuceniu wniosku albo odmowie dalszej obsługi zawsze podejmuje człowiek – pracownik Finance You – po weryfikacji propozycji.

6. Użytkownik ma prawo uzyskać interwencję człowieka, wyrazić własne stanowisko i zakwestionować decyzję, pisząc na adres [kontakt@financeyou.pl](mailto:kontakt@financeyou.pl).

---

## § 18. Bezpieczeństwo danych

1. Finance You stosuje środki techniczne i organizacyjne odpowiednie do ryzyka związanego z przetwarzaniem danych osobowych.

2. Środki bezpieczeństwa mogą obejmować w szczególności:

   1. kontrolę dostępu do systemów;
   2. zabezpieczenie kont użytkowników;
   3. szyfrowanie transmisji, jeżeli jest dostępne;
   4. ograniczanie dostępu do danych wyłącznie do osób uprawnionych;
   5. stosowanie haseł i uprawnień;
   6. kopie zapasowe;
   7. zabezpieczenia systemów informatycznych;
   8. monitoring incydentów;
   9. umowy powierzenia przetwarzania danych z dostawcami usług;
   10. procedury reagowania na naruszenia ochrony danych.

3. Użytkownik również powinien dbać o bezpieczeństwo swoich danych, w szczególności:

   1. nie udostępniać osobom trzecim danych logowania;
   2. korzystać z bezpiecznego urządzenia;
   3. nie przesyłać dokumentów przez niezabezpieczone kanały, jeżeli nie jest to konieczne;
   4. informować Finance You o podejrzeniu nieuprawnionego dostępu do konta lub danych.

4. Żaden system informatyczny nie gwarantuje pełnego bezpieczeństwa danych. Finance You dokłada jednak starań, aby ryzyko naruszenia ochrony danych było ograniczone.

---

## § 19. Dane dzieci

1. Platforma Finance You nie jest kierowana do dzieci.

2. Finance You co do zasady nie zbiera świadomie danych dzieci za pośrednictwem Platformy.

3. Jeżeli w dokumentach przekazywanych przez użytkownika znajdują się dane dzieci, Finance You może je przetwarzać wyłącznie w zakresie niezbędnym do obsługi sprawy, wykonania obowiązków prawnych albo ochrony roszczeń.

4. Użytkownik nie powinien przekazywać danych dzieci, jeżeli nie jest to konieczne dla obsługi sprawy.

---

## § 20. Dane dotyczące nieruchomości i ksiąg wieczystych

1. W ramach obsługi wniosku Finance You może przetwarzać dane dotyczące nieruchomości, w szczególności numer księgi wieczystej, dane ujawnione w księdze wieczystej, informacje o właścicielach, współwłaścicielach, hipotekach, roszczeniach, ograniczeniach, ostrzeżeniach i innych wpisach.

2. Dane z ksiąg wieczystych i dokumentów dotyczących nieruchomości mogą być przetwarzane w celu:

   1. analizy możliwości zabezpieczenia finansowania;
   2. oceny stanu prawnego nieruchomości;
   3. przygotowania opisu sprawy;
   4. przedstawienia sprawy potencjalnym finansującym;
   5. przygotowania dokumentów transakcyjnych;
   6. ochrony przed roszczeniami.

3. Użytkownik powinien przekazywać dane dotyczące nieruchomości wyłącznie wtedy, gdy jest do tego uprawniony albo posiada odpowiednią podstawę prawną.

4. Finance You nie gwarantuje, że dane ujawnione w księdze wieczystej lub przekazane przez użytkownika są kompletne, aktualne albo wystarczające do zawarcia transakcji.

---

## § 21. Dokumenty zawierające dane szczególne lub dane nadmiarowe

1. Użytkownik powinien unikać przekazywania danych szczególnych kategorii, jeżeli nie są one potrzebne do obsługi sprawy.

2. Dane szczególnych kategorii to w szczególności dane ujawniające pochodzenie rasowe lub etniczne, poglądy polityczne, przekonania religijne, przynależność do związków zawodowych, dane genetyczne, biometryczne, dane dotyczące zdrowia, seksualności lub orientacji seksualnej.

3. Jeżeli użytkownik przekaże dokument zawierający takie dane, Finance You może:

   1. pominąć je w analizie;
   2. ograniczyć ich przetwarzanie;
   3. usunąć albo zanonimizować nadmiarowy fragment dokumentu, jeżeli jest to możliwe;
   4. przetwarzać je wyłącznie wtedy, gdy istnieje odpowiednia podstawa prawna.

4. Użytkownik powinien, o ile to możliwe, anonimizować lub zasłaniać dane, które nie są potrzebne do oceny sprawy.

---

## § 22. Nagrywanie rozmów i notatki z kontaktu

1. Finance You może sporządzać notatki z rozmów, ustaleń i kontaktów z użytkownikiem w celu prawidłowej obsługi sprawy.

2. Rozmowy telefoniczne mogą być nagrywane wyłącznie wtedy, gdy użytkownik zostanie o tym wcześniej poinformowany i istnieje odpowiednia podstawa prawna. Rozmowy z agentem głosowym AI są nagrywane i transkrybowane; na początku rozmowy agent informuje, że jest asystentem AI i że rozmowa jest nagrywana.

3. Notatki z rozmów mogą obejmować w szczególności:

   1. datę i godzinę kontaktu;
   2. temat rozmowy;
   3. ustalenia dotyczące sprawy;
   4. informacje o brakujących dokumentach;
   5. informacje o decyzjach użytkownika;
   6. informacje o dalszych krokach.

4. Notatki z kontaktu są przetwarzane w celu obsługi sprawy, ochrony interesów Finance You i wykazania przebiegu komunikacji.

---

## § 23. Formularze i dokumenty elektroniczne

1. Dane przekazywane przez formularze elektroniczne są przetwarzane w celu obsługi konkretnego formularza i sprawy, której formularz dotyczy.

2. Formularz może wymagać podania danych oznaczonych jako obowiązkowe. Brak podania takich danych może uniemożliwić wysłanie formularza albo dalszą obsługę sprawy.

3. Dane przesłane przez formularz mogą zostać zapisane w systemie obsługi zgłoszeń, bazie danych, systemie CRM, poczcie e-mail lub innym narzędziu wykorzystywanym przez Finance You.

4. Finance You może łączyć dane przekazane różnymi kanałami, jeżeli dotyczą tej samej sprawy albo tego samego użytkownika.

---

## § 24. Udostępnianie danych inwestorom i finansującym

1. Użytkownik przyjmuje do wiadomości, że istotą usługi Finance You może być przedstawienie jego sprawy potencjalnym finansującym.

2. Przekazanie danych inwestorowi lub finansującemu może obejmować w szczególności:

   1. opis sprawy;
   2. kwotę finansowania;
   3. cel finansowania;
   4. dane dotyczące nieruchomości;
   5. numer księgi wieczystej;
   6. informacje o zabezpieczeniu;
   7. informacje o zadłużeniach lub obciążeniach;
   8. dokumenty potrzebne do oceny sprawy;
   9. dane kontaktowe użytkownika, jeżeli jest to potrzebne do dalszego procesu.

3. Finance You przekazuje dane inwestorom i finansującym w zakresie niezbędnym do oceny możliwości finansowania.

4. Inwestor lub finansujący może być odrębnym administratorem danych osobowych w zakresie, w jakim samodzielnie decyduje o celach i sposobach przetwarzania danych.

5. Finance You nie odpowiada za samodzielne działania inwestora lub finansującego jako odrębnego administratora danych, chyba że przepisy prawa stanowią inaczej.

---

## § 25. Zmiany Polityki prywatności

1. Finance You może zmienić Politykę prywatności w szczególności w przypadku:

   1. zmiany przepisów prawa;
   2. zmiany sposobu działania Platformy;
   3. zmiany zakresu przetwarzanych danych;
   4. zmiany narzędzi technicznych;
   5. zmiany odbiorców danych;
   6. zmiany danych Administratora;
   7. potrzeby doprecyzowania informacji.

2. Aktualna wersja Polityki prywatności jest publikowana na Platformie.

3. Jeżeli zmiana Polityki prywatności istotnie wpływa na prawa użytkowników lub sposób przetwarzania danych, Finance You może poinformować użytkowników o zmianie drogą elektroniczną.

4. Polityka prywatności w wersji 2 obowiązuje od dnia 29 września 2026 r..

---

## § 26. Kontakt w sprawach danych osobowych

1. W sprawach dotyczących danych osobowych należy kontaktować się z Finance You pod adresem e-mail: [kontakt@financeyou.pl](mailto:kontakt@financeyou.pl).

2. W wiadomości warto wskazać:

   1. imię i nazwisko;
   2. adres e-mail;
   3. numer sprawy, jeżeli został nadany;
   4. opis żądania;
   5. dane pozwalające zidentyfikować sprawę.

3. Finance You może poprosić o dodatkowe informacje, jeżeli będzie to konieczne do potwierdzenia tożsamości osoby składającej żądanie albo ustalenia, jakiej sprawy dotyczy żądanie.

---

# ZAŁĄCZNIK NR 1

## Skrócona informacja o przetwarzaniu danych osobowych

Administratorem danych osobowych jest Finance You sp. z o.o. z siedzibą w Warszawie, ul. Nowogrodzka 31, 00-511 Warszawa, KRS: 0000635207, NIP: 7010611803, REGON: 365350668, e-mail: [kontakt@financeyou.pl](mailto:kontakt@financeyou.pl).

Dane osobowe są przetwarzane w celu obsługi Platformy Finance You, przyjęcia i analizy wniosku o finansowanie, kontaktu z użytkownikiem, publikacji lub przekazania ogłoszenia, przedstawienia sprawy potencjalnym finansującym, organizacji finansowania, rozliczenia wynagrodzenia Finance You, wykonania obowiązków prawnych, obsługi reklamacji, dochodzenia roszczeń i obrony przed roszczeniami, a także w celach marketingowych, jeżeli użytkownik wyraził odpowiednią zgodę albo istnieje inna podstawa prawna.

Dane mogą być przekazywane inwestorom, finansującym, partnerom, notariuszom, prawnikom, rzeczoznawcom, dostawcom usług IT, księgowym, dostawcom narzędzi komunikacyjnych, organom publicznym oraz innym podmiotom uczestniczącym w obsłudze sprawy.

Osobie, której dane dotyczą, przysługuje prawo dostępu do danych, sprostowania danych, usunięcia danych, ograniczenia przetwarzania, przenoszenia danych, wniesienia sprzeciwu, cofnięcia zgody oraz wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych.

Podanie danych jest dobrowolne, ale może być konieczne do złożenia wniosku, analizy sprawy, kontaktu, przedstawienia sprawy finansującym albo zorganizowania finansowania.
',
  2, true
where not exists (
  select 1 from public.consent_documents
   where kind = 'privacy'::public.consent_kind and version = 2
);

update public.consent_documents
   set is_active = false
 where kind = 'privacy'::public.consent_kind and version < 2 and is_active;
