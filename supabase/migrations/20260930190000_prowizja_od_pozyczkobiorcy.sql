-- =====================================================================
-- PROWIZJA OD POŻYCZKOBIORCY (2026-09-30)
--
-- Decyzja właściciela: prowizja Finance You płacona przez Klienta
-- (pożyczkobiorcę) nazywa się „Prowizja od Pożyczkobiorcy”, a nie
-- „Prowizja Klientowska”. Stawka i zasady bez zmian: 7% Kwoty Udzielonej,
-- nie mniej niż 5 000,00 zł, bez VAT, potrącana z wypłaty.
--
-- 1. Pakiet inwestora v7: nowa treść umowy ramowej v7 i NDA v6 (UPDATE
--    istniejących wierszy — żaden nie był jeszcze zaakceptowany; migracji
--    20260929155000 i 20260930140000 nie zmieniamy). RODO v5 bez zmian.
--    Generowane: npx tsx scripts/legal/build-pakiet-v7.ts
-- 2. Regulamin klienta v3 (consent_documents, kind = terms): v2 była już
--    zaakceptowana, więc zostaje jako wersja historyczna, a klienci
--    akceptują v3 przy następnym wejściu do panelu.
--    Generowane: npx tsx scripts/legal/build-zgody-v3.ts
-- =====================================================================

-- 1. Pakiet inwestora v7.
-- >>> PAKIET v7 — Prowizja od Pożyczkobiorcy (generowane: npx tsx scripts/legal/build-pakiet-v7.ts)
-- umowa_ramowa v7: content sha256 4e68aa3bb26e2b2d7b8e6f30985ff624c76d07d90e036b77b7cd2467d34e34e9
--   docx sha256 448c980f7969b32a51e8d01625bc59ceb80f085e7c2f56a9a7c98df2ecbe428a
--   poprzednia treść: 0d098f1b568f65eb31a4fe9b177e8bdfae417cf347e4e269ad699ed16a782aa0
update public.legal_documents
   set sha256 = '4e68aa3bb26e2b2d7b8e6f30985ff624c76d07d90e036b77b7cd2467d34e34e9',
       content_text = 'PAKIET UMOWNY
Ramowa umowa pośrednictwa finansowego świadczonego na odległość
Przedstawianie projektów finansowania gospodarczego zabezpieczonego hipoteką
Wersja
FY-LEGAL-2026-09-29.v7 • 29 września 2026 r.
Zakres
Finansowanie zabezpieczone hipoteką wyłącznie na cel związany z działalnością gospodarczą
Forma
papierowa, kwalifikowany podpis elektroniczny albo forma dokumentowa w systemie z pełnym śladem audytowym
zawarta w formie dokumentowej na odległość albo podpisana w dniu wskazanym przy podpisach, pomiędzy:
FINANCE YOU
Finance You spółka z ograniczoną odpowiedzialnością z siedzibą w Warszawie, ul. Nowogrodzka 31, 00-511 Warszawa, wpisana do rejestru przedsiębiorców KRS pod numerem 0000635207, NIP 7010611803, REGON 365350668, kapitał zakładowy 389 600,00 zł, reprezentowana przez Filipa Roberta Bielaka – Prezesa Zarządu uprawnionego do samodzielnej reprezentacji, dalej: „Finance You” lub „Ujawniający”;
a
INWESTOR
Wariant strony
☐ osoba fizyczna  ☐ osoba fizyczna prowadząca działalność  ☐ osoba prawna / jednostka organizacyjna
Imię i nazwisko / firma
________________________________________________________________
Adres / siedziba
________________________________________________________________
PESEL albo KRS
________________________________________________________________
NIP / REGON
________________________________________________________________
E-mail i telefon
________________________________________________________________
Reprezentacja
________________________________________________________________
dalej: „Inwestor” lub „Odbiorca”; Finance You i Inwestor dalej łącznie: „Strony”, a każdy z osobna: „Strona”.
Preambuła
Finance You pozyskuje i kwalifikuje projekty klientów poszukujących finansowania na cel związany z działalnością gospodarczą, które może zostać zabezpieczone hipoteką.
Inwestor zleca Finance You poszukiwanie projektów odpowiadających parametrom wskazanym przez niego w Zleceniu, samodzielnie ocenia przedstawione projekty i — według własnej decyzji — zawiera transakcje finansowania bezpośrednio albo przez podmiot należący do Grupy Inwestora.
Za dostęp do systemu Finance You Inwestor płaci wyłącznie Opłatę Abonamentową (§ 7); za przedstawienie Projektu i wsparcie transakcyjne Finance You nie pobiera od Inwestora odrębnego wynagrodzenia. Prowizja od Pożyczkobiorcy jest należna Finance You od Klienta na podstawie odrębnej umowy i jest potrącana z kwoty Finansowania zgodnie z dyspozycją Klienta (Załącznik nr 6): Inwestor przekazuje ją bezpośrednio na rachunek Finance You, a pozostałą część wypłaca Klientowi. Opłata Abonamentowa nie zwalnia z Mechanizmu Zabezpieczenia Prowizji.
Strony chcą jednoznacznie ustalić zakres pięcioletniej ochrony relacji oraz Karę Obejściową równą 5% Sumy Hipotecznej za zawarcie lub wykonanie Transakcji Chronionej z naruszeniem niepieniężnego obowiązku zabezpieczenia Prowizji od Pożyczkobiorcy i zakazu obchodzenia Finance You.
Strony wyłączają z zakresu Umowy finansowanie przeznaczone w całości lub części na cele konsumpcyjne oraz kredyt hipoteczny udzielany konsumentowi.
Finance You nie prowadzi publicznie dostępnego katalogu Projektów. Projekt jest przedstawiany wyłącznie jako wynik indywidualnego Zlecenia i wyłącznie Inwestorowi, który je złożył; w czasie rezerwacji nie jest przedstawiany innym inwestorom działającym na podstawie Zlecenia.
Model rozliczenia.  Inwestor płaci Finance You wyłącznie Opłatę Abonamentową za dostęp do systemu: 1 500,00 zł brutto za 30 dni albo 7 000,00 zł brutto za 365 dni, z góry za wybrany okres. Klient płaci Prowizję od Pożyczkobiorcy według odrębnej umowy (7% Kwoty Udzielonej, nie mniej niż 5 000,00 zł, bez VAT), a Inwestor zabezpiecza jej bezpośredni przelew z kwoty Finansowania i potrąca ją z wypłaty. Zawarcie lub wykonanie Transakcji Chronionej bez tego mechanizmu stanowi Naruszenie Obejściowe i uruchamia Karę Obejściową równą 5% Sumy Hipotecznej.
§ 1. Definicje
Klient oznacza osobę fizyczną działającą w związku z działalnością gospodarczą, przedsiębiorcę, osobę prawną albo jednostkę organizacyjną poszukującą Finansowania na Cel Gospodarczy, a także właściciela nieruchomości, dłużnika, poręczyciela, spółkę operacyjną lub celową i inne osoby uczestniczące w Projekcie.
Cel Gospodarczy oznacza cel pozostający w bezpośrednim związku z działalnością gospodarczą lub zawodową finansowanego podmiotu, potwierdzony w Karcie Leada i dokumentacji Finansowania. Nie obejmuje celu konsumpcyjnego, zaspokajania prywatnych potrzeb mieszkaniowych ani kredytu hipotecznego w rozumieniu przepisów o kredycie hipotecznym.
Projekt oznacza zidentyfikowaną przez Finance You możliwość Finansowania, oznaczoną unikalnym numerem i opisaną w Karcie Leada.
Karta Leada oznacza załącznik transakcyjny dla konkretnego Projektu, zawierający co najmniej identyfikator, moment Ujawnienia Identyfikującego, okres ochronny, regułę Sumy Hipotecznej, potwierdzenie, że za Projekt nie są należne od Inwestora opłaty poza Opłatą Abonamentową, rzeczywiste warunki Prowizji od Pożyczkobiorcy, Mechanizm Zabezpieczenia Prowizji, Karę Obejściową wraz z przykładem kwotowym, zakres Grupy Inwestora, wynagrodzenie własne Inwestora od Klienta, konflikt interesów oraz sposób akceptacji.
Ujawnienie Identyfikujące oznacza pierwsze ujawnienie Inwestorowi danych, które samodzielnie albo łącznie pozwalają rozsądnie ustalić Klienta lub konkretną nieruchomość. Moment ten wynika z rejestru systemowego, potwierdzenia wiadomości albo Karty Leada.
Klient Chroniony oznacza Klienta poznanego dzięki Ujawnieniu Identyfikującemu oraz każdy podmiot przez niego kontrolowany, kontrolujący go, z nim powiązany lub użyty do zawarcia Transakcji Chronionej, jeżeli istnieje związek gospodarczy z Projektem lub relacją przedstawioną przez Finance You.
Grupa Inwestora oznacza Inwestora oraz każdą osobę działającą bezpośrednio lub pośrednio na jego rzecz, na jego zlecenie, w jego interesie albo z jego udziałem, w tym jego obecną lub przyszłą spółkę, SPV, wspólnika, członka organu, pełnomocnika, beneficjenta rzeczywistego, osobę bliską, współinwestora, fundusz, cesjonariusza, nabywcę wierzytelności, powiernika, administratora hipoteki albo zabezpieczeń oraz podmiot powiązany kapitałowo, osobowo, rodzinnie lub kontraktowo.
Finansowanie oznacza przekazanie pieniędzy, limitu, rzeczy, praw, odroczenia, gwarancji lub innej korzyści ekonomicznej, w szczególności na podstawie pożyczki, kredytu, refinansowania, faktoringu, wykupu lub cesji wierzytelności, subrogacji, obligacji, umowy inwestycyjnej, sprzedaży z prawem odkupu, leasingu zwrotnego albo konstrukcji o równoważnym skutku gospodarczym.
Transakcja Chroniona oznacza każde Finansowanie zawarte, udzielone, nabyte, refinansowane, odnowione, przedłużone, zwiększone lub ekonomicznie zrealizowane w Okresie Ochronnym między Klientem Chronionym a Inwestorem lub Grupą Inwestora, jeżeli jest zabezpieczone hipoteką na nieruchomości przedstawionej w Projekcie albo na jakiejkolwiek innej nieruchomości Klienta Chronionego lub osoby udostępniającej mu zabezpieczenie. Obejmuje także nabycie zabezpieczonej wierzytelności i finansowanie przez pośredni podmiot.
Suma Hipoteczna oznacza najwyższą kwotę pieniężną, do której hipoteka zabezpiecza lub ma zabezpieczać wierzytelności przypisane Inwestorowi lub Grupie Inwestora, wskazaną w oświadczeniu o ustanowieniu hipoteki, umowie Finansowania, wniosku wieczystoksięgowym, wzmiance albo wpisie. Jeżeli takiej kwoty nie da się ustalić, podstawą jest kwota Finansowania lub wartość korzyści ekonomicznej przypisana Inwestorowi. Jednej ekonomicznej ekspozycji zabezpieczonej łącznie na kilku nieruchomościach nie liczy się wielokrotnie, chyba że dokumenty ustanawiają odrębne lub dodatkowe limity zabezpieczenia.
Prowizja od Pożyczkobiorcy oznacza odrębne wynagrodzenie Finance You wynikające wyłącznie z umowy z Klientem i ekonomicznie obciążające Klienta, a nie cenę usługi świadczonej Inwestorowi. Wynosi 7% Kwoty Udzielonej, nie mniej niż 5 000,00 zł, bez VAT, i jest potrącana z wypłaty Finansowania zgodnie z dyspozycją Klienta (Załącznik nr 6): Inwestor przekazuje ją bezpośrednio na rachunek Finance You, a pozostałą część Kwoty Udzielonej wypłaca Klientowi; jeżeli odrębna umowa z Klientem przewiduje inną stawkę, minimum albo podstawę, Karta Leada musi odzwierciedlać rzeczywiste warunki tej umowy.
Opłata Abonamentowa oznacza jedyne wynagrodzenie Finance You należne od Inwestora — za dostęp do systemu Finance You (panelu Inwestora) przez Okres Abonamentowy: 1 500,00 zł brutto za 30 dni albo 7 000,00 zł brutto za 365 dni, według wyboru Inwestora.
Okres Abonamentowy oznacza opłacony okres dostępu do systemu (30 albo 365 dni), liczony od zaksięgowania Opłaty Abonamentowej, a jeżeli poprzedni opłacony okres jeszcze trwa — od jego końca.
Kwota Udzielona oznacza kwotę Finansowania wynikającą z zawartej umowy pożyczki albo innego dokumentu Finansowania, przed potrąceniami, prowizjami i kosztami.
Mechanizm Zabezpieczenia Prowizji oznacza łączne spełnienie następujących warunków przed zawarciem lub najpóźniej w treści dokumentu Finansowania: potwierdzenie ważnej umowy prowizyjnej Klienta z Finance You; utrwalenie dyspozycji Klienta; zastrzeżenie w umowie Finansowania bezpośredniego świadczenia na rzecz Finance You; wskazanie kwoty albo jednoznacznej formuły Prowizji od Pożyczkobiorcy i rachunku Finance You; oraz obowiązek przekazania Prowizji od Pożyczkobiorcy nie później niż równocześnie z pierwszą wypłatą środków Klientowi.
Naruszenie Obejściowe oznacza zawarcie, doprowadzenie do zawarcia lub wykonanie Transakcji Chronionej przez Inwestora albo Grupę Inwestora bez skutecznego Mechanizmu Zabezpieczenia Prowizji, z przyczyn, za które Inwestor odpowiada, w szczególności podpisanie dokumentu bez wymaganej klauzuli, wypłatę choćby części środków bez równoczesnego przekazania Prowizji od Pożyczkobiorcy albo użycie innego podmiotu lub konstrukcji w celu pominięcia Finance You. Zamiar obejścia nie jest konieczny; działania i zaniechania Grupy Inwestora przy realizacji Transakcji traktuje się jak działania i zaniechania Inwestora.
Kara Obejściowa oznacza karę umowną równą 5% Sumy Hipotecznej, należną za Naruszenie Obejściowe. Zabezpiecza obowiązki niepieniężne Inwestora, nie stanowi ceny usługi ani prowizji od Transakcji i nie jest zwiększana o VAT, o ile bezwzględnie obowiązujące przepisy nie wymagają innej kwalifikacji.
Okres Ochronny oznacza pięć lat od Ujawnienia Identyfikującego wskazanego w Karcie Leada. Korekta techniczna danych lub ponowne otwarcie tego samego Projektu nie rozpoczyna okresu od nowa, chyba że Strony indywidualnie uzgodnią inaczej.
Konsument oznacza osobę fizyczną zawierającą Umowę bez bezpośredniego związku z jej działalnością gospodarczą lub zawodową. Postanowienia konsumenckie stosuje się także do osoby fizycznej prowadzącej działalność, gdy przepisy przyznają jej w tej relacji ochronę właściwą konsumentowi.
Dzień Roboczy oznacza dzień od poniedziałku do piątku z wyłączeniem dni ustawowo wolnych od pracy w Polsce.
Zlecenie oznacza indywidualną, terminową dyspozycję Inwestora poszukiwania jednego Finansowania, określającą: kwotę Finansowania z dopuszczalnym odchyleniem do 15%, maksymalny okres Finansowania, minimalny oczekiwany zysk roczny oraz termin ważności wynoszący 30, 60 albo 90 dni. Zlecenie ma status: złożone, przyjęte, wykonane, wygasłe albo cofnięte.
Dopasowanie oznacza zgodność Projektu ze Zleceniem: kwota Finansowania mieści się w kwocie Zlecenia z uwzględnieniem odchylenia, okres Finansowania nie przekracza okresu Zlecenia, a wynagrodzenie oferowane przez Klienta nie jest niższe niż zysk wskazany w Zleceniu. Pozostałe kryteria selekcji, w szczególności zabezpieczenie, stosunek kwoty do wartości, lokalizację i wynik kwalifikacji, stosuje Finance You według własnej oceny.
§ 2. Zakres usługi Finance You
W ramach Umowy Finance You może, zależnie od Projektu:
pozyskać i wstępnie zakwalifikować Projekt;
przygotować anonimowy opis i Kartę Leada;
na podstawie przyjętego Zlecenia przedstawić Inwestorowi Projekt wykazujący Dopasowanie, a następnie Klienta i nieruchomość w sposób etapowy;
koordynować wymianę dokumentów, zapytania, oględziny, wycenę, negocjacje i czynności zamknięcia;
monitorować status Finansowania, dokumenty zabezpieczeń i publiczne rejestry; oraz
wykonywać inne czynności wskazane w Karcie Leada, bez uprawnienia do zaciągania zobowiązań za Inwestora lub Klienta, chyba że odrębne pełnomocnictwo stanowi inaczej.
Finance You wykonuje usługę skojarzenia i wsparcia transakcyjnego z należytą starannością profesjonalną, lecz nie jest stroną Finansowania, nie przyjmuje depozytów, nie gwarantuje wypłacalności Klienta, wartości nieruchomości, pierwszeństwa hipoteki, wpisu w księdze wieczystej ani ekonomicznego wyniku inwestycji.
Umowa nie stanowi rekomendacji inwestycyjnej, doradztwa prawnego, podatkowego ani wyceny. Inwestor podejmuje niezależną decyzję i odpowiada za własne badanie prawne, finansowe, techniczne, podatkowe oraz AML.
Każde przedstawienie Projektu jest odrębną usługą przedstawienia w ramach Umowy ramowej. Finance You nie ma obowiązku przedstawienia minimalnej liczby Projektów, a Inwestor nie ma obowiązku zawarcia Transakcji Chronionej.
Usługa przedstawienia i wsparcia transakcyjnego na podstawie niniejszej Umowy jest świadczona w ramach Opłaty Abonamentowej (§ 7): Finance You nie pobiera od Inwestora opłaty za udostępnienie Projektu ani wynagrodzenia od rezultatu. Zmiana wysokości Opłaty Abonamentowej obowiązuje wyłącznie na przyszłość, dla Okresów Abonamentowych opłaconych po jej wejściu w życie, i wymaga uprzedniego powiadomienia Inwestora na trwałym nośniku; opłacony Okres Abonamentowy nie podlega zmianie.
Finance You przedstawia Projekty wyłącznie w wykonaniu przyjętego Zlecenia. Inwestor nie ma dostępu do Projektów nieprzypisanych do jego Zleceń, do ich liczby ani do informacji o innych inwestorach. Finance You może przedstawiać Projekty również innym podmiotom na podstawie odrębnych umów; o tym, komu i w jakiej kolejności Projekt jest przedstawiany, decyduje Finance You.
§ 3. Warunki regulacyjne i wyłączenie finansowania konsumenckiego
Finance You aktywuje Projekt tylko po potwierdzeniu, że deklarowany cel Finansowania jest Celem Gospodarczym. Inwestor nie może wykorzystać Umowy do udzielenia kredytu konsumenckiego, kredytu hipotecznego konsumentowi ani finansowania prywatnych potrzeb mieszkaniowych.
Jeżeli w toku procesu ujawni się choćby częściowy cel konsumpcyjny, Finance You może natychmiast wstrzymać ujawnianie danych i obsługę Projektu do czasu odrębnej kwalifikacji prawnej. Inwestor nie może obchodzić tego ograniczenia przez zmianę nazwy produktu, podstawienie spółki ani późniejsze przeznaczenie środków sprzeczne z dokumentacją.
Umowa nie jest zapewnieniem, że działalność którejkolwiek Strony nie podlega zezwoleniu, rejestracji lub nadzorowi. Jeżeli model danego Projektu mieści się w zakresie działalności regulowanej, w tym usług finansowania społecznościowego, kredytu konsumenckiego, kredytu hipotecznego, usług płatniczych lub innej usługi finansowej, Projekt może być realizowany wyłącznie po spełnieniu właściwych wymogów albo z udziałem uprawnionego podmiotu.
Finance You może odmówić albo zawiesić Projekt bez odpowiedzialności za utracone korzyści, jeżeli wymaga tego ocena regulacyjna, AML, sankcyjna, ochrona danych, ryzyko oszustwa, interes Klienta lub bezpieczeństwo systemu.
Inwestor na żądanie przedstawi dane identyfikacyjne, informacje o beneficjentach rzeczywistych, źródle środków, strukturze Grupy Inwestora oraz dokumenty wymagane do oceny zgodności. Brak dokumentów w terminie wskazanym w wezwaniu może zakończyć rezerwację.
§ 4. Zawarcie Umowy i dowody elektroniczne
Umowa może zostać zawarta własnoręcznie, kwalifikowanym podpisem elektronicznym albo w formie dokumentowej na odległość przez imienne konto, jednorazowy kod, potwierdzenie e-mail lub inną metodę pozwalającą ustalić osobę składającą oświadczenie.
Przed złożeniem oświadczenia Inwestor otrzymuje treść Umowy i wymagane informacje na trwałym nośniku, w szczególności jako plik PDF. Finance You utrwala co najmniej wersję i skrót dokumentu, identyfikator konta, datę i czas, metodę uwierzytelnienia, treść oświadczeń, identyfikator Karty Leada oraz — w granicach prawa — adres IP i dane urządzenia.
Akceptacja Karty Leada następuje oddzielnie dla każdego Projektu przed Ujawnieniem Identyfikującym. Brak akceptacji oznacza brak prawa dostępu do danych. Jeżeli jednak Inwestor niebędący Konsumentem ani osobą objętą ochroną właściwą konsumentowi, związany już niniejszą Umową i NDA, otrzyma z kanału przypisanego Finance You Ujawnienie Identyfikujące bez uprzedniej Karty Leada, a następnie świadomie wykorzysta dane, podejmie kontakt z Klientem, przekaże dane Grupie Inwestora albo doprowadzi do Transakcji Chronionej, zastosowanie mają domyślne warunki: standardowy Mechanizm Zabezpieczenia Prowizji, Kara Obejściowa 5% Sumy Hipotecznej oraz pięcioletni Okres Ochronny liczony od tego Ujawnienia. Odbiorca twierdzący, że ujawnienie było przypadkowe, zawiadamia Finance You w ciągu 1 Dnia Roboczego, nie wykorzystuje danych i potwierdza ich usunięcie. Wobec Konsumenta lub osoby chronionej jak konsument zawsze jest wymagana uprzednia, wyraźna i indywidualna akceptacja Karty Leada oraz Kary Obejściowej.
Dane z rejestrów systemowych, potwierdzenia doręczenia, znaki wodne, historia wersji, logi wyświetlenia i pobrania oraz wiadomości Stron mogą służyć jako dowody złożenia oświadczeń i wykonania usługi, z prawem Inwestora do wykazania błędu lub nieuprawnionego użycia konta.
W razie rozbieżności pierwszeństwo ma indywidualna Karta Leada przed Umową wyłącznie w zakresie danych Projektu, rzeczywistych warunków Prowizji od Pożyczkobiorcy i szczególnych warunków, a Umowa przed ogólnym regulaminem. Karta Leada nie może ustanawiać żadnych opłat należnych od Inwestora; jedynym wynagrodzeniem Finance You od Inwestora jest Opłata Abonamentowa (§ 7). Kara Obejściowa wynosi dokładnie 5% Sumy Hipotecznej; jej zmiana wymaga odrębnego uzgodnienia Stron w formie dokumentowej i uprzedniego przeglądu prawnego.
§ 5. Przedstawienie i rezerwacja Projektu
Inwestor składa Zlecenie w systemie. Finance You w terminie 2 Dni Roboczych przyjmuje Zlecenie albo odmawia jego przyjęcia, jeżeli parametry nie pozwalają na selekcję, w szczególności gdy odpowiadałaby im przeważająca część Projektów; przyjęcie jest potwierdzane w systemie wraz z datą. Inwestor może mieć jednocześnie nie więcej niż pięć przyjętych Zleceń. Zlecenie bezterminowe albo obejmujące każde Finansowanie nie jest przyjmowane. Jedno Zlecenie odpowiada jednemu Finansowaniu; zmiana parametrów wymaga nowego Zlecenia. Zlecenie wygasa z upływem terminu ważności, po cofnięciu przez Inwestora, po zawarciu Transakcji Chronionej albo po odrzuceniu przez Inwestora pięciu kolejnych Projektów. Cofnięcie lub wygaśnięcie Zlecenia nie wpływa na Okres Ochronny Projektów już ujawnionych.
Finance You może udostępnić anonimowy teaser Projektu wykazującego Dopasowanie wyłącznie Inwestorowi, którego Zlecenie zostało przyjęte, przed ujawnieniem danych identyfikujących. Teaser ma charakter informacyjny i może opierać się na danych niezweryfikowanych lub przybliżonych. Teaser nie jest publikowany ani rozsyłany do inwestorów bez przyjętego Zlecenia.
Po przyjęciu Projektu Inwestor otrzymuje rezerwację na 24 godziny. Finance You może jednokrotnie przedłużyć ją o 12 godzin, jeżeli Inwestor wykaże rzeczywisty postęp, w szczególności złoży pytania, potwierdzi środki albo rozpocznie analizę dokumentów.
W czasie aktywnej rezerwacji Finance You nie przedstawia Projektu ani nie udostępnia jego danych innemu inwestorowi działającemu na podstawie Zlecenia. Po odrzuceniu Projektu lub wygaśnięciu rezerwacji Projekt może zostać przedstawiony innemu inwestorowi. Inwestor może mieć jednocześnie nie więcej niż pięć aktywnych rezerwacji w ramach jednego lub kilku Zleceń, w tym nie więcej niż dwie rezerwacje przedłużone. Finance You może cofnąć rezerwację w przypadku bezczynności, braku dokumentów, naruszenia bezpieczeństwa, nieprawdziwych oświadczeń, ryzyka prawnego albo interesu Klienta.
Ujawnienie następuje etapowo: teaser anonimowy, pakiet zanonimizowany lub spseudonimizowany, a następnie — po akceptacji wszystkich dokumentów — zakres danych niezbędny do oceny i realizacji Projektu. Finance You nie zobowiązuje się do przekazywania „wszystkich danych”; przekazuje dane adekwatne i niezbędne.
Odrzucenie Projektu powinno nastąpić w systemie albo w formie dokumentowej. Inwestor po odrzuceniu usuwa pełne dane zgodnie z umową dotyczącą danych osobowych, lecz obowiązki poufności i pięcioletnia ochrona relacji pozostają w mocy.
Składanie Zleceń, udostępnienie teasera, Karta Leada, Ujawnienie Identyfikujące i rezerwacja są dostępne w aktywnym Okresie Abonamentowym i nie wymagają dodatkowych opłat. Inwestor nie ma dostępu do Projektów nieprzypisanych do jego Zleceń ani do ich zestawienia. Opłata Abonamentowa jest niezależna od Prowizji od Pożyczkobiorcy i Kary Obejściowej i nie zwalnia z Mechanizmu Zabezpieczenia Prowizji.
§ 6. Oświadczenia i obowiązki Inwestora
Inwestor oświadcza i zobowiązuje się, że:
podane dane, umocowanie i informacje o Grupie Inwestora są prawdziwe, aktualne i kompletne;
dysponuje lub będzie dysponował środkami pochodzącymi z legalnego źródła oraz wymaganymi zgodami i kompetencjami;
samodzielnie zbada Projekt i uzyska profesjonalne opinie w zakresie odpowiednim do ryzyka;
nie będzie wywierał niedozwolonej presji na Klienta, wprowadzał go w błąd ani uzależniał transakcji od niedozwolonych świadczeń;
nie użyje danych do innego celu ani nie udostępni ich osobie spoza prawidłowo zgłoszonej Grupy Inwestora;
nie zawrze Finansowania na cel konsumpcyjny na podstawie danych otrzymanych w tym procesie; oraz
nie zawrze ani nie wykona Transakcji Chronionej bez uprzedniego wdrożenia Mechanizmu Zabezpieczenia Prowizji i nie wypłaci żadnej transzy bez równoczesnego przekazania Prowizji od Pożyczkobiorcy zgodnie z dyspozycją Klienta;
niezwłocznie zgłosi konflikt interesów, utratę zdolności do Finansowania, postępowanie sankcyjne, upadłościowe lub inne zdarzenie istotne dla Projektu; oraz
przed zawarciem Transakcji Chronionej samodzielnie zweryfikuje, czy Klient jest przedsiębiorcą oraz czy Finansowanie jest zaciągane na Cel Gospodarczy, w szczególności czy umowa nie stanowi umowy o kredyt konsumencki ani umowy o kredyt hipoteczny udzielany konsumentowi; weryfikacja obejmuje co najmniej sprawdzenie wpisu Klienta w CEIDG albo KRS, uzyskanie od Klienta pisemnego oświadczenia o Celu Gospodarczym oraz ocenę sposobu wykorzystania nieruchomości stanowiącej zabezpieczenie. Potwierdzenie Celu Gospodarczego przez Finance You na podstawie § 3 ust. 1 opiera się na oświadczeniach Klienta i nie zastępuje weryfikacji Inwestora; skutki zawarcia Transakcji Chronionej z naruszeniem tego obowiązku obciążają Inwestora.
Inwestor nie może składać Klientowi oświadczeń w imieniu Finance You ani przedstawiać się jako jej pracownik, agent uprawniony do reprezentacji lub wspólnik, chyba że odrębne pełnomocnictwo wyraźnie to dopuszcza.
Inwestor ponosi koszty własnego badania, obsługi prawnej, wyceny, notariusza, wpisów i ustanowienia zabezpieczeń, chyba że Karta Leada albo umowa z Klientem stanowi inaczej.
§ 7. Opłata Abonamentowa i zabezpieczenie Prowizji od Pożyczkobiorcy
Finance You pobiera od Inwestora wyłącznie Opłatę Abonamentową za dostęp do systemu: 1 500,00 zł brutto za 30 dni albo 7 000,00 zł brutto za 365 dni, według wyboru Inwestora. Opłata jest płatna z góry, jednorazowo za wybrany Okres Abonamentowy, za pośrednictwem operatora płatności (w szczególności przelewem albo BLIK), bez konieczności podawania danych karty płatniczej i bez automatycznego odnowienia; Finance You wystawia za nią fakturę. Przyjęcie Zlecenia, udostępnienie teasera, Karta Leada, Ujawnienie Identyfikujące, rezerwacja, wsparcie transakcyjne oraz zawarcie Transakcji Chronionej nie wymagają dodatkowych opłat. Po upływie Okresu Abonamentowego Finance You wstrzymuje przyjmowanie nowych Zleceń i dostęp do funkcji systemu do czasu opłacenia kolejnego okresu; dane i dokumenty Inwestora nie są usuwane, a poufność, Mechanizm Zabezpieczenia Prowizji i Okres Ochronny pozostają w mocy.
Ekonomiczny ciężar Prowizji od Pożyczkobiorcy ponosi Klient na podstawie odrębnej umowy z Finance You; nie jest ona opłatą za usługę świadczoną Inwestorowi. Prowizja od Pożyczkobiorcy wynosi 7% Kwoty Udzielonej, nie mniej niż 5 000,00 zł, bez VAT, i jest potrącana z wypłaty, chyba że umowa Klienta przewiduje inną stawkę, minimum, podstawę albo moment należności. Karta Leada musi odzwierciedlać rzeczywiste, a nie przykładowe warunki. Odrębny obowiązek Inwestora wykonania dyspozycji Klienta i świadczenia na rzecz Finance You powstaje z dokumentu Finansowania zawierającego Mechanizm Zabezpieczenia Prowizji.
Przed zawarciem Transakcji Chronionej Inwestor zapewni włączenie do umowy Finansowania klauzuli zgodnej z Załącznikiem nr 6 albo równoważnej, która utrwala dyspozycję Klienta i zastrzega bezpośrednie świadczenie na rzecz Finance You. Finance You może złożyć oświadczenie, że chce skorzystać z zastrzeżenia na rzecz osoby trzeciej.
Inwestor wypłaci kwotę Finansowania w dwóch częściach: Prowizję od Pożyczkobiorcy przekaże bezpośrednio na rachunek Finance You wskazany w Karcie Leada, a pozostałą kwotę na rachunek Klienta albo zgodnie z jego pozostałymi dyspozycjami. Przelew Prowizji następuje nie później niż równocześnie z pierwszą wypłatą środków lub przekazaniem Klientowi korzyści ekonomicznej, chyba że Finance You wyraźnie zatwierdzi inny harmonogram.
Przekazanie Prowizji od Pożyczkobiorcy przez Inwestora jest wykonaniem części zobowiązania do wypłaty Finansowania wobec Klienta oraz wykonaniem zobowiązania Klienta wobec Finance You. Nie stanowi kosztu, prowizji ani wynagrodzenia należnego od Inwestora.
Inwestor nie wypłaci żadnej części Finansowania, jeżeli przed wypłatą nie otrzyma potwierdzonej kwoty albo jednoznacznej formuły Prowizji od Pożyczkobiorcy, numeru rachunku Finance You i dokumentu zawierającego Mechanizm Zabezpieczenia Prowizji. Brak któregokolwiek elementu oznacza obowiązek wstrzymania wypłaty i niezwłocznego zawiadomienia Finance You.
W terminie 1 Dnia Roboczego od przelewu Inwestor przekaże Finance You potwierdzenie zapłaty zawierające identyfikator Projektu, kwotę, datę, rachunek nadawcy i tytuł płatności. Finance You potwierdzi zaliczenie kwoty na Prowizję od Pożyczkobiorcy.
Własne odsetki, prowizje, opłaty, korzyści lub inne świadczenia Inwestora od Klienta muszą zostać opisane w Karcie Leada oddzielnie od Prowizji od Pożyczkobiorcy. Karta wskazuje także istotny konflikt interesów i środki jego ograniczenia; brak wymaganych informacji blokuje Ujawnienie Identyfikujące.
Jeżeli Inwestor prawidłowo zastosuje Mechanizm Zabezpieczenia Prowizji i przekaże Prowizję od Pożyczkobiorcy zgodnie z dyspozycją Klienta, zawarcie Transakcji Chronionej nie rodzi po stronie Inwestora żadnego wynagrodzenia transakcyjnego ani Kary Obejściowej na rzecz Finance You.
§ 8. Transakcja Chroniona, zdarzenia dowodowe i Naruszenie Obejściowe
Dla ustalenia, czy w Okresie Ochronnym doszło do Transakcji Chronionej, uwzględnia się najwcześniejsze z następujących zdarzeń:
zawarcia umowy Finansowania, umowy cesji, refinansowania, nabycia wierzytelności lub innego wiążącego dokumentu;
wypłaty choćby części środków albo udostępnienia Klientowi innej korzyści ekonomicznej;
złożenia oświadczenia o ustanowieniu hipoteki, podpisania aktu notarialnego lub złożenia wniosku wieczystoksięgowego;
pojawienia się wzmianki albo wpisu w księdze wieczystej wskazującego Inwestora lub Grupę Inwestora jako wierzyciela, administratora, powiernika, cesjonariusza lub osobę korzystającą z zabezpieczenia; albo
uzyskania przez Inwestora lub Grupę Inwestora ekonomicznego skutku równoważnego Finansowaniu, niezależnie od nazwy i liczby umów.
Jeżeli w Okresie Ochronnym w dziale IV księgi wieczystej nieruchomości przedstawionej w Projekcie albo innej nieruchomości Klienta Chronionego pojawi się wpis lub wzmianka wskazująca imię i nazwisko, firmę, identyfikator albo podmiot z Grupy Inwestora jako wierzyciela, administratora, powiernika, cesjonariusza lub beneficjenta zabezpieczenia, domniemywa się, że doszło do Transakcji Chronionej. Inwestor może wykazać dokumentami, że zdarzenie było całkowicie niezależne od relacji i danych przedstawionych przez Finance You albo że zastosowano Mechanizm Zabezpieczenia Prowizji.
Dla zachowania Okresu Ochronnego wystarczy, że w ciągu pięciu lat nastąpi którekolwiek zdarzenie z ust. 1. Późniejszy wpis lub wzmianka, także po upływie pięciu lat, może potwierdzać wcześniejszą Transakcję Chronioną lub Naruszenie Obejściowe. Sam wpis dokonany dopiero po upływie pięciu lat nie uruchamia Kary Obejściowej, jeżeli przed końcem Okresu Ochronnego nie nastąpiło żadne wcześniejsze zdarzenie Transakcji Chronionej.
Samo wystąpienie Transakcji Chronionej nie rodzi obowiązku zapłaty Kary Obejściowej. Jeżeli przed jej zawarciem skutecznie zabezpieczono Prowizję od Pożyczkobiorcy i przekazano ją zgodnie z § 7, Kara Obejściowa nie powstaje, a Inwestor nie płaci Finance You od tej Transakcji żadnego wynagrodzenia.
Naruszenie Obejściowe następuje najpóźniej z chwilą zawarcia wiążącego dokumentu Transakcji Chronionej bez Mechanizmu Zabezpieczenia Prowizji albo z chwilą pierwszej wypłaty lub korzyści przekazanej bez równoczesnego przelewu Prowizji od Pożyczkobiorcy — zależnie od tego, które zdarzenie nastąpi wcześniej.
Jeżeli w chwili Naruszenia Obejściowego Suma Hipoteczna nie jest jeszcze ostateczna, Karę Obejściową ustala się tymczasowo od kwoty Finansowania lub znanej części zabezpieczenia, a po ustaleniu wyższej Sumy Hipotecznej Inwestor dopłaca różnicę. Nadpłata podlega zwrotowi, jeżeli ostateczna podstawa okaże się niższa.
Kara Obejściowa jest płatna w terminie 7 dni od doręczenia wezwania zawierającego opis naruszenia i kalkulację. Za opóźnienie należą się właściwe odsetki ustawowe; brak faktury VAT nie wstrzymuje wymagalności kary, która nie stanowi wynagrodzenia za usługę.
Późniejsza spłata, rozwiązanie, odstąpienie, bezskuteczność zabezpieczenia albo nieosiągnięcie zakładanego wyniku nie usuwa Naruszenia Obejściowego. Niewykonany projekt dokumentu nie wystarcza jednak do naliczenia kary, jeżeli nie zawarto wiążącej transakcji, nie przekazano korzyści i nie wystąpiło inne zdarzenie z ust. 1.
§ 9. Pięcioletnia ochrona i zakaz obchodzenia
Okres Ochronny biegnie przez pięć lat od Ujawnienia Identyfikującego i obowiązuje niezależnie od odrzucenia Projektu, wygaśnięcia rezerwacji, zawieszenia konta, wypowiedzenia Umowy albo zmiany osoby Inwestora na spółkę.
Inwestor nie może projektować, inicjować ani akceptować konstrukcji, której celem lub skutkiem jest uniknięcie Mechanizmu Zabezpieczenia Prowizji albo zapłaty Prowizji od Pożyczkobiorcy, w szczególności przez użycie Grupy Inwestora, podział jednej transakcji, finansowanie przez pośrednika, cesję przed lub po wypłacie, administratora hipoteki, zmianę zabezpieczenia, rozliczenie poza systemem albo zawarcie kolejnej umowy bez informacji dla Finance You.
Ochrona obejmuje każdą Transakcję Chronioną z Klientem Chronionym w Okresie Ochronnym, także gdy ostatecznie zabezpieczona zostanie inna nieruchomość niż wskazana pierwotnie, zmieni się kwota, harmonogram, dłużnik formalny, wierzyciel formalny, produkt albo sposób przekazania korzyści.
Ochrona nie oznacza obowiązku zawarcia transakcji. Jeżeli Inwestor nie zawrze ani nie zrealizuje Transakcji Chronionej i nie użyje relacji w inny sposób, nie powstaje Kara Obejściowa; jeżeli zawrze ją prawidłowo z Mechanizmem Zabezpieczenia Prowizji, Inwestor nie płaci Finance You od tej Transakcji żadnego wynagrodzenia.
§ 10. Relacja istniejąca przed przedstawieniem
Inwestor może zgłosić, że znał Klienta przed Ujawnieniem Identyfikującym, wyłącznie w terminie 2 Dni Roboczych od tego ujawnienia, przed podjęciem dalszych czynności w Projekcie.
Zgłoszenie musi wskazywać Klienta i zawierać wiarygodne dokumenty datowane przed ujawnieniem, potwierdzające aktywne, konkretne rozmowy dotyczące zasadniczo tego samego Finansowania albo tej samej możliwości zabezpieczenia. Sam wpis w bazie, wizytówka, wcześniejszy kontakt towarzyski, publiczna wiedza lub nieaktywna relacja nie wystarczają.
Jeżeli Inwestor wykaże wcześniejsze, samodzielne i aktywne źródło tej samej Transakcji oraz brak wykorzystania Informacji Poufnych lub wkładu Finance You, dany zakres nie stanowi Transakcji Chronionej. Jeżeli Finance You ujawniła nową nieruchomość, potrzebę, strukturę, dokumenty albo doprowadziła do wznowienia rozmów, ochrona pozostaje w mocy w zakresie tego wkładu i przedstawionej możliwości Finansowania.
Brak terminowego i udokumentowanego zgłoszenia oznacza przyjęcie, że Klient i Projekt zostały skutecznie przedstawione przez Finance You.
§ 11. Raportowanie i weryfikacja
Inwestor zawiadomi Finance You w terminie 1 Dnia Roboczego o:
bezpośrednim kontakcie, spotkaniu lub wymianie istotnych dokumentów z Klientem Chronionym;
złożeniu lub otrzymaniu term sheetu, oferty, promesy, projektu umowy albo uzgodnieniu istotnych warunków;
zawarciu umowy, cesji, porozumienia, aktu notarialnego albo innego dokumentu;
wypłacie środków lub przekazaniu innej korzyści;
złożeniu wniosku wieczystoksięgowego, pojawieniu się wzmianki lub wpisu;
zmianie kwoty, zabezpieczenia, podmiotu finansującego albo udziału członka Grupy Inwestora.
Na żądanie Finance You Inwestor przekaże w terminie 3 Dni Roboczych kopie lub wyciągi dokumentów niezbędnych do potwierdzenia zdarzenia, zastosowania Mechanizmu Zabezpieczenia Prowizji, zapłaty Prowizji od Pożyczkobiorcy i — w razie naruszenia — obliczenia Kary Obejściowej. Może zanonimizować informacje niezwiązane z Projektem, o ile nie uniemożliwia to weryfikacji.
Finance You może monitorować jawne rejestry, w tym księgi wieczyste i rejestry przedsiębiorców, przez Okres Ochronny oraz czas niezbędny do dochodzenia roszczeń. Monitoring ogranicza się do danych koniecznych do ochrony relacji, Prowizji od Pożyczkobiorcy i Kary Obejściowej.
W razie uzasadnionego sporu Finance You może zlecić niezależnemu adwokatowi, radcy prawnemu, biegłemu rewidentowi lub doradcy podatkowemu poufną weryfikację dokumentów. Jeżeli wykaże ona niezgłoszoną Transakcję Chronioną, brak Mechanizmu Zabezpieczenia Prowizji albo brak należnego przelewu Prowizji od Pożyczkobiorcy, uzasadnione koszty weryfikacji ponosi Inwestor; w przeciwnym razie ponosi je Finance You.
§ 12. Zmiana osoby fizycznej na spółkę i Grupa Inwestora
Osoba fizyczna może wskazać spółkę lub inny podmiot jako przyszłego finansującego, składając formularz przystąpienia z Załącznika nr 2. Dostęp tej spółki do danych i możliwość działania w Projekcie powstają dopiero po akceptacji Finance You, weryfikacji reprezentacji i beneficjenta rzeczywistego oraz przyjęciu przez spółkę wskazanych wersji Umowy, NDA, Karty Leada i dokumentów dotyczących danych.
Podmiot przystępujący wstępuje kumulatywnie do obowiązków wdrożenia Mechanizmu Zabezpieczenia Prowizji, raportowania, poufności i zakazu obchodzenia dotyczących wskazanych Projektów oraz do odpowiedzialności za Karę Obejściową. Odpowiada solidarnie z pierwotnym Inwestorem w zakresie dopuszczalnym prawem. Nie dochodzi do nowacji ani zwolnienia pierwotnego Inwestora, chyba że Finance You wyraźnie oświadczy inaczej w formie dokumentowej.
Jeżeli transakcję zawiera członek Grupy Inwestora, który nie podpisał przystąpienia, Inwestor pozostaje odpowiedzialny za wykonanie obowiązków informacyjnych, zastosowanie Mechanizmu Zabezpieczenia Prowizji i — w razie Naruszenia Obejściowego — zapłatę Kary Obejściowej, a działanie tego podmiotu uważa się za działanie w ramach Transakcji Chronionej.
Zmiana statusu z Konsumenta na przedsiębiorcę albo spółkę działa na przyszłość i nie pozbawia osoby fizycznej ochrony bezwzględnie przysługującej jej w odniesieniu do wcześniejszych oświadczeń. Do spółki stosuje się postanowienia B2B od chwili jej skutecznego przystąpienia. Przystąpienie nie resetuje Ujawnienia Identyfikującego, Okresu Ochronnego, Kary Obejściowej ani historii dowodowej.
Inwestor zgłosi każdą zmianę nazwy, formy prawnej, siedziby, reprezentacji, beneficjenta rzeczywistego i danych kontaktowych w terminie 2 Dni Roboczych. Doręczenie na ostatni zgłoszony adres jest skuteczne w zakresie dopuszczalnym prawem.
§ 13. Poufność i dane osobowe
Przed Ujawnieniem Identyfikującym Inwestor zawiera Umowę o zachowaniu poufności i zakazie obchodzenia oraz Umowę udostępniania i — warunkowo — powierzenia danych osobowych. Dokumenty te mają zastosowanie równolegle.
Co do zasady Finance You i Inwestor są odrębnymi administratorami danych w zakresie, w jakim każdy samodzielnie decyduje o celu i sposobie oceny lub realizacji Finansowania. Powierzenie występuje tylko dla ściśle opisanych czynności wykonywanych przez jedną Stronę wyłącznie na udokumentowane polecenie drugiej.
Inwestor nie może wykorzystywać danych do marketingu, tworzenia własnej bazy klientów, automatycznego wzbogacania profili, innego finansowania poza zakresem Transakcji Chronionej ani ujawniać ich Grupie Inwestora bez spełnienia właściwych przesłanek prawnych i obowiązków informacyjnych.
Naruszenie danych nie uchyla obowiązku zastosowania Mechanizmu Zabezpieczenia Prowizji ani odpowiedzialności za odrębne Naruszenie Obejściowe, ale może prowadzić do dodatkowej odpowiedzialności na zasadach właściwych dla ochrony danych.
§ 14. Odpowiedzialność i kary umowne
Strona odpowiada za rzeczywistą szkodę spowodowaną zawinionym niewykonaniem Umowy na zasadach ogólnych. Finance You nie odpowiada za decyzje gospodarcze Inwestora, wypłacalność Klienta, wahanie wartości zabezpieczenia, działanie sądu wieczystoksięgowego ani utracone korzyści wynikające z odmowy lub niepowodzenia Finansowania, chyba że bezwzględnie obowiązujące prawo stanowi inaczej.
Za Naruszenie Obejściowe, za które Inwestor odpowiada, zapłaci on Finance You Karę Obejściową równą 5% Sumy Hipotecznej. Zamiar obejścia nie jest wymagany, a działania i zaniechania Grupy Inwestora przy realizacji Transakcji traktuje się jak działania i zaniechania Inwestora. Kara dotyczy naruszenia niepieniężnego obowiązku powstrzymania się od zawarcia lub wykonania Transakcji Chronionej bez Mechanizmu Zabezpieczenia Prowizji; nie jest karą za niewykonanie własnego zobowiązania pieniężnego Inwestora ani ceną usługi.
Jeżeli kilka hipotek zabezpiecza tę samą ekspozycję albo ustanowiono hipotekę łączną, Karę Obejściową liczy się jeden raz od najwyższego łącznego limitu tej ekspozycji. Odrębne dodatkowe limity i ekonomicznie odrębne ekspozycje sumuje się. Przy kilku inwestorach podstawę przypisuje się według rzeczywistego udziału lub ryzyka; brak danych obciąża Inwestora obowiązkiem ich przedstawienia.
Jeżeli po Naruszeniu Obejściowym Finansowanie zostanie zwiększone, odnowione albo refinansowane w Okresie Ochronnym bez naprawienia Mechanizmu Zabezpieczenia Prowizji, dodatkowa Kara Obejściowa wynosi 5% dodatniego przyrostu Sumy Hipotecznej. Tej samej ekspozycji nie liczy się drugi raz wyłącznie wskutek technicznego przeniesienia zabezpieczenia.
Jeżeli Inwestor nie jest Konsumentem ani osobą objętą ochroną właściwą konsumentowi, za zawinione naruszenie obowiązku raportowego z § 11 zapłaci 5 000,00 zł za każde niezgłoszone zdarzenie, nie więcej niż 25 000,00 zł dla jednego Projektu, o ile wcześniej otrzymał wezwanie do uzupełnienia i nie wykonał go w ciągu 2 Dni Roboczych.
Kara Obejściowa z niniejszej Umowy i Kara Obejściowa z NDA stanowią jedną karę za ten sam czyn i nie podlegają podwójnemu naliczeniu. Prowizja od Pożyczkobiorcy należna od Klienta pozostaje odrębnym roszczeniem. Finance You może dochodzić odszkodowania przewyższającego karę, jeżeli szkoda jest wyższa.
Stała kara za naruszenie raportowania nie ma zastosowania do Konsumenta. Kara Obejściowa może zostać zastosowana wobec Konsumenta wyłącznie po jej rzeczywistym, indywidualnym uzgodnieniu przed Ujawnieniem Identyfikującym, w osobnym oświadczeniu zawierającym sposób obliczenia, kwotowy przykład oraz jednoznaczne wskazanie, że poza Opłatą Abonamentową i Karą Obejściową Inwestor nie płaci Finance You żadnego wynagrodzenia. W pozostałym zakresie odpowiedzialność Konsumenta podlega zasadom ogólnym.
§ 15. Postanowienia dla Konsumenta i umowa na odległość
Przed zawarciem Umowy Konsument otrzymuje na trwałym nośniku informacje z Załącznika nr 3, aktualną Umowę, wzór odstąpienia oraz informację o wysokości Opłaty Abonamentowej i sposobie jej zapłaty. Przed każdym Ujawnieniem Identyfikującym otrzymuje także indywidualną Kartę Leada wskazującą, że za Projekt nie są należne opłaty poza Opłatą Abonamentową, warunki Prowizji od Pożyczkobiorcy, Mechanizm Zabezpieczenia Prowizji oraz sposób obliczenia i przykład Kary Obejściowej.
Konsument może odstąpić od Umowy zawartej na odległość bez podania przyczyny w terminie 14 dni od jej zawarcia, a jeżeli wymagane warunki umowne lub informacje otrzyma później — od ich doręczenia, w zakresie wynikającym z prawa. Wystarczy jednoznaczne oświadczenie, w tym formularz z Załącznika nr 4; termin jest zachowany, jeżeli oświadczenie zostanie wysłane przed jego upływem.
Dla każdego Zlecenia Konsument wybiera: (a) rozpoczęcie usługi po upływie 14 dni albo (b) wyraźne żądanie rozpoczęcia przed upływem tego terminu. Pełne Ujawnienie Identyfikujące przed upływem terminu następuje tylko po odrębnej zgodzie na rozpoczęcie i odrębnym potwierdzeniu przyjęcia do wiadomości, że po pełnym wykonaniu usługi przedstawienia prawo odstąpienia od tej usługi wygaśnie.
Skuteczne odstąpienie Konsumenta po rozpoczęciu, lecz przed pełnym wykonaniem usługi, rodzi obowiązek zapłaty kwoty proporcjonalnej do świadczeń spełnionych do chwili odstąpienia — wyłącznie wtedy, gdy Konsument wyraźnie zażądał rozpoczęcia wykonywania przed upływem terminu odstąpienia i potwierdził, że utraci prawo odstąpienia po pełnym wykonaniu usługi. W takim przypadku Finance You zwraca Opłatę Abonamentową pomniejszoną o kwotę proporcjonalną do wykorzystanej części Okresu Abonamentowego; w pozostałych przypadkach zwraca ją w całości. Za przedstawienie Projektu nie nalicza się odrębnej kwoty.
Po pełnym wykonaniu konkretnej usługi przedstawienia za uprzednią wyraźną zgodą i przyjęciu informacji o utracie prawa odstąpienia, odstąpienie od Umowy ramowej nie usuwa skutków tej wykonanej usługi ani Okresu Ochronnego dotyczącego poznanego Klienta. Nie ogranicza to bezwzględnych praw Konsumenta.
Finance You udziela Konsumentowi przed zawarciem Umowy bezpłatnych, zrozumiałych wyjaśnień pozwalających ocenić, czy usługa i jej skutki odpowiadają jego potrzebom. Konsument może uzyskać kontakt z człowiekiem przed związaniem się Umową oraz w toku obsługi; istotna decyzja, reklamacja lub spór o Karę Obejściową nie mogą być rozstrzygane wyłącznie automatycznie bez dostępnej interwencji człowieka.
Interfejs nie może wykorzystywać domyślnie zaznaczonych pól, ukrytych kosztów, wymuszonej ścieżki, mylącej hierarchii przycisków ani innego rozwiązania utrudniającego świadomą decyzję lub odstąpienie. Jeżeli obowiązujące przepisy wymagają internetowej funkcji odstąpienia, Finance You udostępnia ją w sposób stale widoczny i łatwo dostępny oraz niezwłocznie potwierdza złożenie oświadczenia na trwałym nośniku.
Jeżeli informacje przedumowne zostały przekazane później niż jeden dzień przed związaniem Konsumenta Umową, Finance You wysyła na trwałym nośniku przypomnienie o prawie odstąpienia w terminie i zakresie wymaganym przez obowiązujące przepisy, bez materiału marketingowego i bez zmiany wcześniej przekazanych warunków.
Postanowienie sprzeczne z prawem konsumenckim nie wiąże Konsumenta, a pozostała część Umowy pozostaje w mocy. W razie wątpliwości pierwszeństwo ma interpretacja zgodna z obowiązkowymi informacjami przekazanymi przed zawarciem umowy.
§ 16. Czas trwania, wypowiedzenie i zawieszenie
Umowa zostaje zawarta na czas nieoznaczony. Każda Strona może ją wypowiedzieć w formie dokumentowej z 30-dniowym okresem wypowiedzenia; Konsument może wypowiedzieć ją ze skutkiem natychmiastowym, jeżeli prawo lub korzystniejsza informacja przedumowna tak stanowi.
Finance You może natychmiast zawiesić dostęp do danych i Projektów w przypadku zagrożenia bezpieczeństwa, naruszenia Umowy, braku dokumentów AML, utraty umocowania albo ryzyka regulacyjnego. Przed rozwiązaniem z przyczyny usuwalnej wyznaczy rozsądny termin naprawczy, chyba że niezwłoczne działanie jest konieczne.
Rozwiązanie Umowy nie wpływa na Prowizję od Pożyczkobiorcy, obowiązki związane z Mechanizmem Zabezpieczenia Prowizji, już powstałą Karę Obejściową, poufność, ochronę danych, dowody, kontrolę, zakaz obchodzenia ani Okres Ochronny Projektów ujawnionych przed rozwiązaniem.
Strony przyjmują, że pięcioletni Okres Ochronny określa czas, w którym Transakcja Chroniona może prowadzić do Naruszenia Obejściowego; nie zmienia on ustawowych terminów przedawnienia roszczenia o już wymagalną Karę Obejściową lub Prowizję od Pożyczkobiorcy.
§ 17. Reklamacje i komunikacja
Oświadczenia dotyczące Projektu składa się przez konto w systemie lub na adres e-mail wskazany w Karcie Leada. Oświadczenia o wypowiedzeniu, odstąpieniu, zmianie strony, sporze o Prowizję od Pożyczkobiorcy lub Karę Obejściową i naruszeniu danych wymagają formy dokumentowej umożliwiającej utrwalenie treści.
Reklamację można złożyć na adres Finance You, ul. Nowogrodzka 31, 00-511 Warszawa, albo e-mail: kontakt@financeyou.pl. Powinna opisywać zdarzenie, Projekt, żądanie i dane kontaktowe. Finance You potwierdzi wpływ i udzieli odpowiedzi na trwałym nośniku co do zasady w terminie 14 dni, a gdy sprawa jest szczególnie złożona — po uprzednim wyjaśnieniu przyczyny i wskazaniu terminu zgodnego z prawem.
Konsument może skorzystać z bezpłatnej pomocy miejskiego lub powiatowego rzecznika konsumentów, organizacji konsumenckiej albo właściwego pozasądowego trybu, jeżeli jest dostępny dla danego rodzaju sporu. Umowa nie wprowadza obowiązkowego arbitrażu.
Zmiana adresu lub e-maila wymaga niezwłocznego zgłoszenia. Wiadomość wysłana na ostatni prawidłowo zgłoszony adres jest dowodem podjęcia próby doręczenia, z zastrzeżeniem szczególnych zasad doręczeń konsumenckich.
§ 18. Postanowienia końcowe
Umowa podlega prawu polskiemu. Spory z przedsiębiorcą będą rozpoznawane przez sąd właściwy dla siedziby Finance You, o ile uzgodnienie właściwości zostało utrwalone w formie wymaganej przez prawo procesowe; w przeciwnym razie właściwość wynika z przepisów ogólnych. Wobec Konsumenta i osoby korzystającej z ochrony konsumenckiej właściwość sądu wynika wyłącznie z przepisów bezwzględnie obowiązujących.
Inwestor nie może przenieść Umowy ani wierzytelności związanych z Projektem bez uprzedniej zgody Finance You, z wyjątkiem cesji w ramach ujawnionej i zaakceptowanej struktury, która zachowuje Mechanizm Zabezpieczenia Prowizji i odpowiedzialność za Karę Obejściową. Finance You może przenieść wymagalną wierzytelność, informując Inwestora w zakresie wymaganym prawem.
Zmiana Umowy wymaga formy dokumentowej, chyba że prawo wymaga formy surowszej. Regulamin może zmieniać się na przyszłość po uprzednim powiadomieniu; nie zmieniają stawki ani zasad Projektu już objętego Ujawnieniem Identyfikującym.
Nieważność albo bezskuteczność części postanowienia nie narusza pozostałej części. Strony zastąpią wadliwe postanowienie zgodnym z prawem rozwiązaniem możliwie najbliższym celowi gospodarczemu, bez ograniczania praw Konsumenta.
Załączniki nr 1–7 stanowią integralną część Umowy; wysokość Opłaty Abonamentowej określa § 7 ust. 1. Inwestor potwierdza otrzymanie kompletu dokumentów na trwałym nośniku przed Ujawnieniem Identyfikującym.
________________________________
________________________________
FINANCE YOU — imię, nazwisko, funkcja / podpis / data
INWESTOR / ODBIORCA — imię, nazwisko, funkcja / podpis / data
ZAŁĄCZNIK NR 1
Karta Leada / indywidualne warunki Projektu
Wypełnić i zaakceptować przed pierwszym Ujawnieniem Identyfikującym.
DANE TRANSAKCYJNE
ID Projektu
____________________________________________
Nr Zlecenia
____________________________________________
Parametry Zlecenia
kwota: __________ zł ± 15%; maks. okres: ______ mies.; min. zysk roczny: ______ %; ważne do: __________
Przyjęcie Zlecenia / Dopasowanie
data przyjęcia: __________ ☐ Dopasowanie potwierdzone
Wersja Karty
____________  data i czas: ______________________________
Kod Klienta
____________________________________________
Kod nieruchomości
____________________________________________
Cel Gospodarczy
Opis: ________________________________________________________________☐ potwierdzony  ☐ wymaga wyjaśnienia  ☐ projekt wstrzymany
Zakres teasera
________________________________________________________________
Ujawnienie Identyfikujące
data i czas: __________________  kanał / log: ______________________________
Inwestor
________________________________________________________________
Ujawniona Grupa Inwestora
________________________________________________________________
Rezerwacja
od: __________________  do: __________________  przedłużenie maks. 12 h do: __________________
Cena usługi dla Inwestora
za ten Projekt Finance You nie pobiera od Inwestora żadnych opłat — dostęp w ramach Opłaty Abonamentowej (§ 7 Umowy)
Suma Hipoteczna
☐ kwota z wpisu  ☐ kwota z wniosku / oświadczenia  ☐ kwota Finansowania  ☐ udział InwestoraPlanowana kwota / waluta: ________________________________________________
Reguła wspólnego zabezpieczenia
☐ jedna ekspozycja / hipoteka łączna — liczyć jeden raz  ☐ odrębne limity — opis alokacji: ______________________________
Kara Obejściowa
5% Sumy Hipotecznej za Naruszenie Obejściowe; nie jest wynagrodzeniem i nie dolicza się VAT, o ile prawo nie wymaga inaczej
Przykład Kary Obejściowej
Przykład standardowy: 1 000 000,00 zł × 5% = 50 000,00 zł.Przykład dla Projektu: __________________ × 5% = __________________
Okres Ochronny
5 lat od Ujawnienia Identyfikującego, tj. do: ______________________________
Prowizja od Pożyczkobiorcy
Rzeczywiste warunki z odrębnej umowy Klienta: ______ % Kwoty Udzielonej; minimum: __________ zł; bez VAT; kwota / formuła: __________________; potrącana z wypłaty: ☐ tak; moment należności: __________________Standard, jeżeli umowa Klienta nie stanowi inaczej: 7% Kwoty Udzielonej, minimum 5 000,00 zł, bez VAT.
Mechanizm Zabezpieczenia Prowizji
☐ umowa Klienta potwierdzona  ☐ dyspozycja Klienta  ☐ klauzula w Finansowaniu  ☐ świadczenie na rzecz Finance You  ☐ zapłata z pierwszą wypłatąRachunek Finance You: ________________________________________________
Wynagrodzenie Inwestora od Klienta
rodzaj: __________________  stawka / kwota / podstawa: __________________  finansowane lub potrącane z wypłaty: ☐ tak ☐ nie
Inni płatnicy / świadczenia
☐ brak  ☐ płatnik: __________________  charakter i kwota / sposób ustalenia: ______________________________
Konflikt i środki
opis konfliktu: ________________________________________________środki zarządzania: __________________________________  status: ☐ zaakceptowany ☐ projekt wstrzymany
Karta Transferu Danych
ID / wersja: __________________  role i podstawy potwierdzone: ☐ tak ☐ nie
Wersje / skróty dokumentów
Umowa: __________________  NDA: __________________  RODO: __________________  Karta SHA-256: __________________
Konsument — przebieg indywidualnego uzgodnienia kary
☐ nie dotyczydata / kanał / uczestnicy: ________________________________________________propozycja Konsumenta i odpowiedź Finance You: ________________________________________________ostatecznie uzgodniona treść 5% i przykład: ________________________________________________identyfikator zapisu negocjacji: ________________________________________________
Szczególne warunki
________________________________________________________________
Ujawnienie Identyfikujące jest niedopuszczalne, dopóki nie potwierdzono rzeczywistych warunków Prowizji od Pożyczkobiorcy, Mechanizmu Zabezpieczenia Prowizji, Kary Obejściowej, konfliktu interesów, Karty Transferu i wersji dokumentów.
Oświadczenie o relacji istniejącej przed przedstawieniem
☐ Nie zgłaszam wcześniejszej relacji z Klientem / Projektem.
☐ Zgłaszam wcześniejszą aktywną relację i załączam dowody datowane przed ujawnieniem:
________________________________________________________________________________________
Wybór Konsumenta — wypełniać tylko, gdy Inwestor jest Konsumentem
☐ Proszę rozpocząć usługę przedstawienia dopiero po upływie 14 dni.
albo
☐ Wyraźnie żądam rozpoczęcia usługi przedstawienia tego Projektu przed upływem 14 dni od zawarcia właściwej umowy na odległość.
☐ Przyjmuję do wiadomości, że po pełnym wykonaniu usługi, polegającym na Ujawnieniu Identyfikującym zgodnie z Kartą Leada, utracę prawo odstąpienia od tej konkretnie wykonanej usługi.
Opłata proporcjonalna za rozpoczętą usługę pośrednictwa: nie dotyczy tego Projektu — rozliczenie Opłaty Abonamentowej przy odstąpieniu określa § 15 ust. 4 Umowy.
☐ Jako Konsument potwierdzam, że po rzeczywistych negocjacjach opisanych wyżej indywidualnie uzgodniłem Karę Obejściową równą 5% Sumy Hipotecznej wyłącznie za Naruszenie Obejściowe, za które odpowiadam; otrzymałem wyjaśnienie i przykład kwotowy oraz miałem realną możliwość wpływu na treść postanowienia przed ujawnieniem danych.
Akceptacja
Potwierdzam, że za ten Projekt nie płacę Finance You żadnej opłaty poza Opłatą Abonamentową. Akceptuję obowiązek zastosowania Mechanizmu Zabezpieczenia Prowizji, ujawnioną Prowizję od Pożyczkobiorcy, własne wynagrodzenie od Klienta, konflikt i środki zarządzania, Karę Obejściową 5% Sumy Hipotecznej, jej przykład kwotowy, pięcioletni Okres Ochronny oraz wersje dokumentów wskazane w Protokole Akceptacji.
________________________________
________________________________
FINANCE YOU — imię, nazwisko, funkcja / podpis / data
INWESTOR / ODBIORCA — imię, nazwisko, funkcja / podpis / data
ZAŁĄCZNIK NR 2
Przystąpienie spółki / zmiana podmiotu finansującego
Kumulatywne przystąpienie do obowiązków i odpowiedzialności — bez automatycznego zwolnienia pierwotnego Inwestora.
DANE PODMIOTU
Podmiot przystępujący
Firma: ______________________________  KRS / rejestr: ______________________________
Adres, NIP, REGON
________________________________________________________________
Reprezentacja
________________________________________________________________
Beneficjent rzeczywisty
________________________________________________________________
Pierwotny Inwestor
________________________________________________________________
Zakres przystąpienia
☐ Projekty wskazane niżej  ☐ wszystkie Projekty ujawnione pierwotnemu Inwestorowi do daty przystąpieniaID Projektów / Kart Leadów: ________________________________________________________________
Rola
☐ finansujący  ☐ współinwestor  ☐ SPV  ☐ cesjonariusz  ☐ administrator / powiernik  ☐ inna: __________
Wersje i SHA-256
Umowa: __________________  NDA: __________________  RODO: __________________  Karty: __________________
Karta Transferu
ID / wersja: __________________  dostęp od: __________________  zatwierdzony przez: __________________
§ A. Oświadczenie o przystąpieniu
Podmiot przystępujący potwierdza otrzymanie dokładnych wersji Umowy ramowej, właściwych Kart Leadów, NDA i umowy dotyczącej danych wskazanych powyżej oraz przystępuje do nich w zakresie oznaczonych Projektów. Każdy przyszły Projekt wymaga odrębnej Karty Leada i akceptacji przed Ujawnieniem Identyfikującym.
Podmiot przystępuje kumulatywnie do obowiązków zastosowania Mechanizmu Zabezpieczenia Prowizji, raportowania, zakazu obchodzenia, poufności, bezpieczeństwa i usunięcia danych oraz do odpowiedzialności za Karę Obejściową. Odpowiada solidarnie z pierwotnym Inwestorem w zakresie dopuszczalnym prawem.
Przystąpienie nie stanowi odnowienia, cesji Umowy ani zwolnienia pierwotnego Inwestora. Zwolnienie wymaga odrębnego, wyraźnego oświadczenia Finance You w formie dokumentowej.
Podmiot ujawni członków własnej grupy, współinwestorów, administratora zabezpieczeń i źródło środków oraz będzie raportował zdarzenia transakcyjne jak Inwestor.
Dostęp do danych powstaje wyłącznie na przyszłość, od czasu wskazanego w zatwierdzeniu Finance You, po zweryfikowaniu reprezentacji, beneficjenta rzeczywistego, kont imiennych, uprawnień i dokumentów ochrony danych. Do tego czasu pierwotny Inwestor nie może przekazywać podmiotowi pełnych danych. Przystąpienie nie legalizuje wcześniejszego nieuprawnionego ujawnienia.
________________________________
________________________________
PODMIOT PRZYSTĘPUJĄCY — imię, nazwisko, funkcja / podpis / data
PIERWOTNY INWESTOR — imię, nazwisko, funkcja / podpis / data
Akceptacja Finance You: ____________________________________   data: ____________________
ZAŁĄCZNIK NR 3
Informacja przedumowna dla Konsumenta
Przekazać na trwałym nośniku przed zawarciem umowy na odległość. Uzupełnić pola cenowe i techniczne zgodnie z aktualnym systemem.
Obszar
Informacja
Usługodawca
Finance You spółka z ograniczoną odpowiedzialnością z siedzibą w Warszawie, ul. Nowogrodzka 31, 00-511 Warszawa, wpisana do rejestru przedsiębiorców KRS pod numerem 0000635207, NIP 7010611803, REGON 365350668, kapitał zakładowy 389 600,00 zł, reprezentowana przez Filipa Roberta Bielaka – Prezesa Zarządu uprawnionego do samodzielnej reprezentacji. Kontakt: kontakt@financeyou.pl, tel. 889 888 700.
Rejestr
Rejestr przedsiębiorców KRS 0000635207; sąd rejestrowy i aktualną reprezentację należy sprawdzić w odpisie aktualnym przed zawarciem.
Nadzór / zezwolenie
Niniejsza informacja nie oznacza, że Finance You posiada zezwolenie KNF. Jeżeli dla konkretnego modelu wymagane jest zezwolenie, rejestracja lub udział uprawnionego podmiotu, Projekt nie zostanie uruchomiony przed spełnieniem wymogów.
Usługa
Przedstawienie i wsparcie procesu Projektu Finansowania na Cel Gospodarczy. Każda Karta Leada stanowi odrębną usługę przedstawienia w ramach Umowy ramowej.
Istotne cechy i ryzyko
Finance You nie gwarantuje zawarcia ani wyniku Finansowania. Inwestor samodzielnie ocenia ryzyko kredytowe, prawne, techniczne i wartość zabezpieczenia. Inwestowanie może prowadzić do utraty części lub całości środków i kosztów egzekucji.
Cena dla Inwestora
Opłata Abonamentowa za dostęp do systemu: 1 500,00 zł brutto za 30 dni albo 7 000,00 zł brutto za 365 dni, płatna z góry za wybrany okres przez operatora płatności, bez konieczności podawania danych karty płatniczej i bez automatycznego odnowienia. Finance You nie pobiera od Inwestora opłaty za udostępnienie Projektu ani wynagrodzenia od rezultatu.
Prowizja od Klienta
Finance You otrzymuje od Klienta Prowizję od Pożyczkobiorcy według odrębnej umowy. Standardowo: 7% Kwoty Udzielonej, nie mniej niż 5 000,00 zł, bez VAT — potrącana z wypłaty. Inwestor przekazuje ją z kwoty Finansowania bezpośrednio Finance You zgodnie z dyspozycją Klienta; nie jest to opłata Inwestora.
Kara Obejściowa
Wyłącznie za zawarcie lub wykonanie Transakcji Chronionej bez Mechanizmu Zabezpieczenia Prowizji z przyczyn, za które Inwestor odpowiada: 5% Sumy Hipotecznej. Przykład: 1 000 000,00 zł × 5% = 50 000,00 zł. Kara nie jest ceną usługi; wobec Konsumenta wymaga indywidualnego uzgodnienia.
Wynagrodzenie Inwestora / konflikt
Karta Leada wskazuje również własne wynagrodzenie Inwestora od Klienta oraz konflikt wynikający z wielostronnych płatności i środki jego opanowania. Brak kompletu informacji blokuje ujawnienie danych.
Podatki i koszty obce
Podatki, opłaty sądowe, notarialne, wycena, doradcy, finansowanie przelewu i koszty zabezpieczeń nie są wliczone, chyba że Karta Leada wyraźnie stanowi inaczej.
Płatność
Inwestor płaci wyłącznie Opłatę Abonamentową, z góry za wybrany Okres Abonamentowy. Prowizję od Pożyczkobiorcy przekazuje z kwoty Finansowania zgodnie z dyspozycją Klienta. Ewentualna indywidualnie uzgodniona Kara Obejściowa jest płatna w terminie 7 dni od wezwania opisującego naruszenie i kalkulację.
Ważność informacji
Warunki Karty Leada obowiązują dla wskazanego Projektu. Rezerwacja standardowo trwa 24 godziny i może zostać przedłużona o 12 godzin.
Komunikacja
System internetowy i e-mail; podstawowa opłata odpowiada taryfie operatora Internetu lub telefonu Konsumenta. Wymagane są aktualna przeglądarka, dostęp do PDF, e-mail, imienne konto i — jeśli uruchomione — drugi składnik uwierzytelnienia.
Język i prawo
Język polski; prawo polskie. Sąd właściwy według przepisów bezwzględnie obowiązujących wobec Konsumenta.
Odstąpienie
14 dni od zawarcia umowy na odległość, a gdy wymagane warunki lub informacje doręczono później — od ich doręczenia, w zakresie wynikającym z prawa. Wzór stanowi Załącznik nr 4. Za rozpoczętą usługę pośrednictwa nalicza się kwotę proporcjonalną wyłącznie w przypadku wyraźnego żądania rozpoczęcia przed upływem terminu odstąpienia, na zasadach z § 15 ust. 5 Umowy. Po pełnym wykonaniu usługi za wyraźną zgodą i po potwierdzeniu utraty prawa odstąpienia, prawo to wygasa dla tej usługi.
Wyjaśnienia i kontakt z człowiekiem
Przed zawarciem Finance You udziela bezpłatnych, zrozumiałych wyjaśnień. Konsument może zażądać kontaktu z człowiekiem przed zawarciem i w toku obsługi; interfejs nie może utrudniać decyzji ani odstąpienia.
Przypomnienie / funkcja odstąpienia
Jeżeli informacje przekazano później niż jeden dzień przed związaniem Umową, Finance You przesyła wymagane prawem przypomnienie. Jeżeli prawo wymaga internetowej funkcji odstąpienia, pozostaje ona łatwo dostępna, a złożenie oświadczenia jest niezwłocznie potwierdzane na trwałym nośniku.
Czas trwania i wypowiedzenie
Umowa ramowa jest bezterminowa. Konsument może ją wypowiedzieć w formie dokumentowej; rozwiązanie nie cofa skutków już w pełni wykonanej usługi przedstawienia i prawnie skutecznej Karty Leada.
Reklamacje
Pisemnie na adres siedziby lub e-mail kontakt@financeyou.pl. Odpowiedź co do zasady w 14 dni na trwałym nośniku.
Pozasądowe rozwiązanie
Dostępna jest pomoc miejskiego lub powiatowego rzecznika konsumentów i organizacji konsumenckich oraz procedury pozasądowe właściwe dla rodzaju sporu, o ile spełnione są ich warunki.
Fundusz gwarancyjny
Usługa pośrednictwa Finance You nie jest objęta umownym funduszem gwarancyjnym ani systemem rekompensat. Ewentualne zabezpieczenie Finansowania wynika wyłącznie z dokumentów danej transakcji.
Potwierdzam otrzymanie informacji przedumownej, Umowy, Karty Leada i formularza odstąpienia na trwałym nośniku przed złożeniem oświadczenia.
________________________________
________________________________
KONSUMENT — imię, nazwisko, funkcja / podpis / data
FINANCE YOU — imię, nazwisko, funkcja / podpis / data
ZAŁĄCZNIK NR 4
Wzór oświadczenia o odstąpieniu
Formularz fakultatywny — wystarczy każde jednoznaczne oświadczenie.
DANE OŚWIADCZENIA
Adresat
Finance You sp. z o.o., ul. Nowogrodzka 31, 00-511 Warszawa; e-mail: kontakt@financeyou.pl
Konsument
Imię i nazwisko: ________________________________________________
Adres / e-mail
________________________________________________________________
Umowa
Ramowa umowa z dnia: __________________  / ID konta: __________________
Projekt — jeśli dotyczy
ID Projektu / Karty Leada: ________________________________________________
Niniejszym odstępuję od wskazanej wyżej umowy zawartej na odległość. Proszę o potwierdzenie otrzymania oświadczenia na trwałym nośniku.
Data: ____________________________     podpis (jeżeli formularz papierowy): ____________________________
Jeżeli konkretna usługa przedstawienia została już w pełni wykonana na wyraźne żądanie Konsumenta po przekazaniu informacji o utracie prawa odstąpienia, skutki odstąpienia ocenia się zgodnie z § 15 Umowy i bezwzględnie obowiązującym prawem.
ZAŁĄCZNIK NR 5
Protokół akceptacji elektronicznej
Wypełniany automatycznie przez system; dołączyć do kopii PDF przekazywanej Inwestorowi.
ŚLAD AUDYTOWY
Użytkownik
ID: __________________  imię / firma: ________________________________________________
Uwierzytelnienie
☐ hasło  ☐ OTP  ☐ kwalifikowany podpis  ☐ e-mail  ☐ inne: __________________
Data i czas UTC
________________________________________________________________
IP / urządzenie
________________________________________________________________
Umowa ramowa
wersja: __________________  SHA-256 / identyfikator: ______________________________
NDA
wersja: __________________  SHA-256 / identyfikator: ______________________________
Umowa danych
wersja: __________________  SHA-256 / identyfikator: ______________________________
Karta Leada
ID / wersja: ____________________________________________________________
Karta Transferu Danych
ID / wersja: __________________  role / podstawy potwierdzone: ☐ tak ☐ nie
Rozliczenie i konflikt
Opłata Inwestora za Projekt: brak (dostęp w ramach Opłaty Abonamentowej)  Prowizja od Pożyczkobiorcy: __________________  Mechanizm zabezpieczenia: ☐ tak ☐ nieKara Obejściowa 5% i przykład zaakceptowane: ☐ tak ☐ nie  Inwestor→Klient: __________________  konflikt i środki: ☐ tak ☐ nie
Informacja konsumencka
☐ nie dotyczy  ☐ doręczona PDF: __________________  data: __________________
Zgody konsumenckie
☐ nie dotyczy  ☐ start przed 14 dniami  ☐ potwierdzenie utraty prawa po pełnym wykonaniuindywidualne negocjacje Kary 5%: data / identyfikator / wynik ________________________________________________
Ujawnienie danych
data i czas: __________________  zakres / paczka: ______________________________
Dowód doręczenia
message ID / log / checksum: ________________________________________________
System powinien przechowywać niezmienną kopię dokumentów i zdarzeń, a każda korekta powinna tworzyć nową wersję zamiast nadpisywać poprzednią.
ZAŁĄCZNIK NR 6
Dyspozycja Klienta i klauzula zabezpieczająca Prowizję od Pożyczkobiorcy
Włączyć do umowy Finansowania albo podpisać jako jej integralny załącznik przed wypłatą jakiejkolwiek części środków.
PARAMETRY ROZLICZENIA
Klient / Pożyczkobiorca
________________________________________________________________
Inwestor / Pożyczkodawca
________________________________________________________________
ID Projektu / Karty Leada
________________________________________________________________
Kwota Udzielona (kwota Finansowania z umowy)
__________________ zł / waluta: __________
Kwota wypłacana Klientowi (Kwota Udzielona pomniejszona o Prowizję od Pożyczkobiorcy)
__________________ zł
Prowizja od Pożyczkobiorcy
__________________ zł; podstawa / formuła: __________________________________________
Rachunek Finance You
________________________________________________________________
Tytuł przelewu
Prowizja Finance You — ID Projektu: ______________________________
Termin
nie później niż równocześnie z pierwszą wypłatą środków Klientowi
Klauzula do dokumentu Finansowania
§ A. Dyspozycja, przyjęcie obowiązku i świadczenie na rzecz Finance You
Klient potwierdza, że na podstawie odrębnej umowy z Finance You jest zobowiązany do zapłaty Prowizji od Pożyczkobiorcy wskazanej powyżej. Klient poleca Inwestorowi, aby część należnej Klientowi wypłaty Finansowania w kwocie Prowizji od Pożyczkobiorcy przekazał bezpośrednio na rachunek Finance You, a pozostałą część wypłacił zgodnie z pozostałymi dyspozycjami Klienta.
Inwestor przyjmuje tę dyspozycję i zobowiązuje się wobec Klienta przekazać Prowizję od Pożyczkobiorcy na rachunek Finance You nie później niż równocześnie z pierwszą wypłatą jakiejkolwiek części Finansowania. Jeżeli Strony przewidują transze, cała Prowizja od Pożyczkobiorcy jest przekazywana przy pierwszej transzy, chyba że Finance You uprzednio zatwierdzi inny harmonogram w formie dokumentowej.
Strony zastrzegają spełnienie opisanego świadczenia na rzecz Finance You jako osoby trzeciej. Finance You może żądać bezpośrednio od Inwestora wykonania tego postanowienia. Gdy Finance You oświadczy którejkolwiek ze Stron, że chce skorzystać z zastrzeżenia, postanowienie nie może zostać odwołane ani zmienione bez zgody Finance You.
Przelew Prowizji od Pożyczkobiorcy do Finance You stanowi wypłatę odpowiedniej części Finansowania Klientowi oraz równoczesne spełnienie jego zobowiązania prowizyjnego wobec Finance You. Nie stanowi prowizji, opłaty ani kosztu ponoszonego przez Inwestora na rzecz Finance You.
Inwestor nie jest uprawniony do wypłaty Klientowi ani osobie przez niego wskazanej żadnej części Finansowania wcześniej niż równocześnie ze zleceniem przelewu Prowizji od Pożyczkobiorcy na rachunek Finance You. Zmiana kwoty, rachunku lub terminu wymaga potwierdzenia Finance You w formie dokumentowej.
Finance You oświadcza, że chce skorzystać z powyższego zastrzeżenia świadczenia na jej rzecz i przyjmuje uprawnienie do bezpośredniego żądania zapłaty wskazanej Prowizji od Pożyczkobiorcy.
________________________
________________________
________________________
KLIENT — imię, nazwisko, funkcja / podpis / data
INWESTOR — imię, nazwisko, funkcja / podpis / data
FINANCE YOU — imię, nazwisko, funkcja / podpis / data
ZAŁĄCZNIK NR 7
Formularz Zlecenia
Składany w systemie po zawarciu Umowy, NDA i umowy dotyczącej danych osobowych. Przedstawienie Projektu następuje wyłącznie w wykonaniu przyjętego Zlecenia.
ZLECENIE
Numer Zlecenia
nadawany przez system
Inwestor
____________________________________________
Data złożenia
____________________________________________
Kwota Finansowania
__________ zł (dopuszczalne odchylenie ± 15%)
Maksymalny okres Finansowania
______ miesięcy
Minimalny oczekiwany zysk roczny
______ % w skali roku
Termin ważności
☐ 30 dni ☐ 60 dni ☐ 90 dni
Oświadczenia
☐ Zlecenie składam na podstawie Ramowej umowy pośrednictwa (wersja: ________). Znam wysokość Opłaty Abonamentowej (1 500,00 zł brutto za 30 dni albo 7 000,00 zł brutto za 365 dni) i wiem, że poza nią nie płacę Finance You za Projekty ani od rezultatu; Prowizja od Pożyczkobiorcy (7% Kwoty Udzielonej, nie mniej niż 5 000,00 zł, bez VAT) obciąża Klienta, jest potrącana z wypłaty i podlega Mechanizmowi Zabezpieczenia Prowizji. ☐ Zobowiązuję się przed zawarciem Transakcji Chronionej samodzielnie zweryfikować status przedsiębiorcy Klienta i Cel Gospodarczy (§ 6 ust. 1 pkt 9). ☐ Przyjmuję do wiadomości, że Projekty są przedstawiane wyłącznie w wykonaniu przyjętego Zlecenia i nie mam dostępu do Projektów nieprzypisanych do moich Zleceń.
Konsument
☐ nie dotyczy ☐ Żądam rozpoczęcia wykonywania usługi przed upływem 14-dniowego terminu odstąpienia i przyjmuję do wiadomości, że po pełnym wykonaniu usługi przedstawienia prawo odstąpienia od tej usługi wygaśnie.
Potwierdzenie
kanał / log / OTP: ____________________  data i czas: ____________________
Decyzja Finance You
☐ Zlecenie przyjęte, data: __________ ☐ odmowa przyjęcia, powód: ______________________
',
       docx_base64 = 'UEsDBAoAAAAIAAAAIVDwSsJ/+AAAACwCAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbK2Ru07DMBSGX8U6a5U4MCCEknbgMgJDeYAj+ySx8E0+bmneHqcpHVCBhdH+L98vu90cnBV7SmyC7+CqbkCQV0EbP3Twtn2qbkFwRq/RBk8dTMSwWbfbKRKLkvXcwZhzvJOS1UgOuQ6RfFH6kBzmckyDjKjecSB53TQ3UgWfyecqzx2wbh+ox53N4vFQrpcdiSyDuF+MM6sDjNEahbnocu/1N0p1ItQlefTwaCKvigHkRcKs/Aw45V7KwySjSbxiys/oikt+hKSlDmrnSrL+vebCztD3RtE5P7fFFBQxlxd3tj4rDo1f/bWD82SJ/3/F0vuFl8ffXn8CUEsDBAoAAAAIAAAAIVCb/TfqrQAAACkBAAALAAAAX3JlbHMvLnJlbHONzzsOwjAMBuCrRN5pWgaEUNMuCKkrKgewEjetaB5KwqO3JwMDRQyMtn9/luv2aWZ2pxAnZwVURQmMrHRqslrApT9t9sBiQqtwdpYELBShbeozzZjyShwnH1k2bBQwpuQPnEc5ksFYOE82TwYXDKZcBs09yitq4tuy3PHwacDaZJ0SEDpVAesXT//YbhgmSUcnb4Zs+nHiK5FlDJqSgIcLiqt3u8gs8KbmqxebF1BLAwQKAAAACAAAACFQlL0mVqsAAAAaAQAAHAAAAHdvcmQvX3JlbHMvZG9jdW1lbnQueG1sLnJlbHONz00KwjAQBeCrhNnbtC5EpGk3InQr9QAhnabB/JGJYm9vwI0FFy4fw3xvpu1fzrInJjLBC2iqGhh6FSbjtYDbeNkdgVGWfpI2eBSwIkHftVe0MpcVWkwkVgxPApac44lzUgs6SVWI6MtkDsnJXGLSPEp1lxr5vq4PPH0bsDXZMAlIw9QAG9eI/9hhno3Cc1APhz7/qOCUV1vOZ6NMGrOAT66KA7xr+ean7g1QSwMECgAAAAgAAAAhUFtbnup5AQAAhQMAAA8AAAB3b3JkL3N0eWxlcy54bWx9UmtrwjAU/Ssl3zVVhohYRRyCsMkY7gdc29gG8iI3Wt2vX5K2bvP1qbnnnHvuq9P5SYrkyCxyrTIy6KckYSrXBVdlRr62q96YJOhAFSC0Yhk5MyTz2bSeoDsLholPVzipM1I5ZyaUYl4xCdjXhinP7bWV4HxoS1prWxirc4bo3aWgwzQdUQlckWBY6PyV7eEgHIbQftg2bKP4WWnlMKkngDnnGdly6XvYsDr51BIU8Uy1UHifyfEuzADdAjnckjTO+e01RxAZGQ46ZInXmABVdpgRvY+3ANO2b3o9jbmOoq2BnEcX2DtmMzJOQ3uCh7UPRy9d8HkQHoCD020N09b460pv9hnv5S3c2fh0AxZKC6YKrkUj8+cPURSui4xswu1EvI0CybrxWripHcW39g52gj2x3gb+qX8SJc1y3U40K/KPtSq80P9vcTlNteIEF+GSCfEOjVqbx1LB9q5hB+n4Dr/Tzmn5ON/ysnpiQP83Qy9D/O6se+HsB1BLAwQKAAAACAAAACFQifP5ZvpfAAB4EwIAEQAAAHdvcmQvZG9jdW1lbnQueG1s7b1bjxtXlib6VzYMFGADdOpmybY01XNkSa5RyU4ldCnBehnsJEOpIBkRBMloTsRTHcM6/TqYHuC0pnDm4bzM86De+vipS/lH6pec9a219i0YzItlVdDVNgqlTCYZjNh77XX91rf+w3/8L8Xc/GO2XOVV+duPrh1c/chk5bia5OXJbz96/uzrT7/4yKzWtpzYeVVmv/2oyVYf/cd/+A+b25NqXBdZuTZ0gXJ1e/Pbj16v14vbV66sxq+zwq4OqkVW0t9eVcvCrunX5cmVTbWcLJbVOFut6PrF/Mr1q1dvXSlsXn6ESx5Xkwb/Lvj/jpb4Z5Zli8Psv6yv4JfVwo7pg4bemtF16Xbodje37at1tqSbv371I37bdEwv/qOd//ajMd1gtsSrV/wV5f/k52N+//G9lVy+dZ+7/sVH+sq9VfraFf9ZfnK+JbqPxTJbZct/zD76h6O7jx4+eGaef/v4xeF3ePtaPiS3sCeP91nP4312ocd7YotqY03N/7+oTv+0zCZlPl7Tb6/y0parapOdVOb0T5vcTsYtyQz9VlpTTebZyen39IF3/3Tuqpy9EF9srcNxtX7dswq7dmjZZhOSabrDMs8MCeQ0m63/8ueNfwJ63ZqTarWoJnY5bvEIrT3O2kWeuUd6nS+qdTZ79+Znf5h59mp98Yd5QUd3age+ia+/+/SbB7+7+82n169ev/Xp1S8/vf7lwT9+bv76x//XXP/SbGi9T/+EJcWfzfJg4Lt9aWf088BC+HUQtSwVriBaZtOcfv/uzbjFe+gMjbO5aTf5uzetLRvTmkmb29Pv7bykUzWmlyORHVwuv4baH3iNF5bWdElrPDKzjZ3nr/IZFrwhvTVZ5CuTzencLytSXy29aOfHlWFrZSbVjG0bdNzGrJrVOiuwTWaRnX5fNgWpt7mdZIWx9aShdzXFwE/a2o1drnGzeAC61fAE2bSrfuVJZQ1siQ+RBq/NZjWzEKyCNGLr1siOX4/oxyJ/93bSNrff155d/6zHop1vu861Sl8/PLx7eO+B+e7x83041+PMfFfVZrX4y59Pv59ZEpzqZGkhZ1VJx5RWttrkGY5vOLutWfFLxzj35oVdrmhT82xk6vmBOaw2dIVq0tLFblwbmatXP7157Zp7F8n3RvdyUpllNs1W62WNbSQ7Rzt3nFfLMezboydPsa+mJNlYkvhepf9u3bh5/ernI3P48Mh8fvXa1VvXrn1x9cbIPHnwu8eH5satmzduXr116ws6QnSa1qRvSFvNSOtMSOzNjS++NLeuXh1dvWra0+9H9N20Eq2cHLob3EFrvs7n+cKaJ9VxBhn9Ks/mlp7jr3/8Z3OEd6+seWmXpLImtakXS7spc7Gx9DArcjdoUbJ5SXLsr27H03xkyCXNprfpOv8zWvS//vH/MfP6GK8+n+JSdkoatKGX7wysEc/XhgMdnoeHLx48ffb4ydCejF2SQ7amaINUcjPwzfz1X/6rqVbVMbzatiH7YI3peW0B6zIh0R3bxBqTko3ezjJtzRUzJV+5Wq1J+CkaIn3Q2nEzLYf23h5Cu5uczAQ5F6tZRTf6Kv8Q1vtyt/Wf3/O/gW//7oR+pKVUrf7rar7X7R89ePrgG3FcyIj9va/lQIYALsAVMfx/7yv8YW//waeFzeekUtcUYryqyl9X831u/0nk9v2qRt8rOgku88NyQ1FCtYz85ccTDhQsfGUTxzG5ce8Wn9v4rARf6ik7bPSpkbEUJZz+OEFyAq5PacMbcNnzMz8DaT6KQ2xxXJP7tkfh46Jqm9Wsnma0AS5/gd80YdmY2TynU4HAblGt2pr+iFBn/DrNY142cUSRHl1zmZmiOv0xMy05rJb82R05qp8/mXe5BfOS2c4zcsLT9cOi5JtullfCbzuxbrkWdmmLjIS0SJMgFLvSRykQ3ZiXdPWszOtRFJHSVSu8aDXSRkYZa+P3Jyfh/+9mk01Ov6/p+WnFVwhjJ9m4aafyR47xl9asl7Rhdjam7U02D2vukuyVJm74xmi7irxa0+7Os9Mf8SAIl3+3rBeNP6126M15iYTEav3u7YJjec6j1cke+e1b0OqM8yTj+Riv0YfN3WNSH5LNIln9+N/+l/n8kzu0dNG6Z/jAkSw8FNaG7mU5ptfcwlKclSXfzEJRHfPqV5OwZvTL8t3bY05AbJrSctoFu3yA62/ydsrvP6LDQTHgrGKd2RjkXHQzylQM6c2P+KDyUaR9kxv23zPlYgqkha9B52qJeLJE2mi2qUiOvo4loj2pJpwzNpNmBRUxJjH23/DxS+sWcGbKpbn1ye1ojWm5SLyhQ/CZVLbo+5Z2/Lous1l8+9Dp9C1QAriwIQ3xluPbTcNbZvWraWUOdMdsvGGWF7ol9cU3b77Nxq8R+ZIcvPQahQ+Rrm4+tNCKOTPj12N6XI7YKdIXiaxpFeY5K0OUEMyCAudxXs2zNf11StrgNX90mc2RoaIg37bmkaVtNo+Psyl0LUvwkrQQ8oA3f2Oe1kVj/hMrU/oKugZJNSdzIbuwy5tmRmuJL3/mVERu7uF7oGvo/bRxy3qFJcwKrPUCZ4H26EeW4Oq4Yr0/qyMFnix3nzDneEASFPr4+LWKfywUe7JFTllAkdNCyKbU5jkfp1dxgYV1JnYR+nljxpZT4aRvsMQi0uNcLWVmaMVXdbEQncGbSBeeNGu1elwtqNkGwJzKu/UI7JH7oFYP+ancLOrjeS5CrBqZxWNGp3VendROdZJgHrifVR1FxdImUc9TO2MNSYomLyfNJp/UdMhxVTWW1qT63OkhWif1MaA2kTiG+J1+fwc709oVvRX+/nLDh4i/avtO8hJGOneXLJxPwza9SDWtu5+hd+fbakKO2LJqsRViUrYMYLyDFzCGbZ+FvW2umZs+K2+Ol/V6jQq2uXEVpR5xIz5H9r/nLbdu4j0jOk8nvEP02qY5XmLNK5yvA1X47oZVj9Cd9SgS5/t0bd3Hn//GPGLb9pzPEVTZiLe6YE1a5qc/mpvRHY5grcwf7j77BAYpOH1ep1kSkmli0lhg5tmm34zm3tAa0R5iz9bNAdmlS+hf3NYaQl8Ewwa8DC2KOfSaOdL/8ObrZU1vLug2Lmcd9jZ+Ipfs2oG5n5HSzcmHHficqYCK3bYcidIia9KeVjZSFVxsa72JPC8ySktq796O3MU5xU9v56Pl0vw4E1Gen/4cxWn029edMO0eaYff+e9rIOlrO0MQhtgBNzSGzcE5gQBVBd/kyOCMkb3PZxa1WhIo+jC/c+RKkLiTBXm6ehts9ejUQdxyqNKMn4OsGuml1RqFSrpDWEqxBXSxoXVnZ2385iK0Vf+UVT/dc6wEigtvLi8KuV7VhJcluA843Bpt1VjfNSK2ScsOCM4vNMU3GYWTtJSu7M6WK97eA3MIl5/OeQH3m+66TtyMk4o0rqW7mdmplZCy2dh1yeEpKao2OzZFnq3aGf2VNCi9TD+oX1IHx0SiVTIxdQE/UIrAi3zFca+8HfcbHJli6I113obb0Daf0AI2itXAmdEicrCLSEzM843U2eJVHulVuMpe40DM4SW4cjf5ulwm50Mf79zQa/CIwRsiRH4dokAuCmIpzCcNQKJDe7nm7XZR78glE+QcjBHSTcWc+iW1ZDRHtH4M3JT6ODtqD90bWDWxNLKx15CmbFDaP6npjt5uGaXoTMDUjQxnjax3I2H+VrTkGhxnnWhbrC7OsHVOzpvUyaHvbumryMMk78aQba7LWX5W/DIKUeauIHPUZ3k3cPVbhr8wwoFEBp4D8D0jF/J1MiyjJEeQuSRPkk5wwfkI2/ZqntOa5MBtZnIq8aV08OmXY0N7nC1Yewwtkl44sq5weAkFuGpD/o2po/cGH99MLNSXTycmiTO2k8G7pd3f2DnHcaS7SFomSbjtshtQ0U70IVGRHXz3TwfmW5HrdVZKXIJ8g0fDiG/M6NRUYsm/ze1EjamWGOk8NnuiGsSXcR5nMHxuTRZ4QeAyLTkmdDL81tXdrSPfVMJZSdK7HGKc6qTlpeB6zji5kftNEsuGjZSBUV1UPpuMPSHvo1lzAlJzF7bfWx6Ra0TaYU4+x4pTJpma52wW2WJkqFV50AnE9SWhorbAJVr7TMPQuwXtYOPDr5sVveLXH0AwcR5TfzRNy+Hx0yzdFNvEGnHkf20lwiXlu5EXVMG4k9bKq7V8U1bgfWuyjFPJEWVj5xVC961azvR513Fknh79YYSU6l/+PBcvc4ygvXQ4FrhFAEbSGRrL34+zkmIBigQgoZH2ZsMiD308z1czKPeNfFEeVOqrupxQ4ERfk62mZAiWOf1m8bTHzYa8boOz2zbrTD25EctjtpTvtiTUJX3Z0vKCa6VCT3aUBDv9QTbDn4Ig0w7qVm30fvkHKHnylTUw5KNhZ2QdqqGlLsESe+0syV5Jf0lOcIKYYp4XOZwF2ZURRy4jBOiVmMiROaEjTAdqKtkxRAdTelpacFaQGT14VeRq+jdm1QIgD8moXBItZF4WapiR8BFXFY7Eq8Rle4VFXNLq1DCms3pRa3yyojvY2ulVfbysTgQAWJEM6Y+aQmcZatijniL4gbqgs9awVbcbUifVBN9Ay5BZ9KBQWLBZVuJIsYDAKSdzwYqrklicbpT8Fjotq1m9pkAi0lSDe89ezVqvZoPWYTWTmQ7UHEhhwEpd4kXOFV6KdyaDTCCLwe/gheQok3+F0n47W3E2FXsVZALfsMzIard8EZKPxzPRQ4/VkyyMgonVgtGeeONWRLkdVf3QqKSMIofLmRBOCu5CzpfdKDmt0U3j0FY2HqrUzsgmzao5Sd1MBb9zFWd1vU07ERWt4bPLrQrqlD5edPLu2QG7nBwEamyP1R93mwCmXcmn4GU7o22iZJdosaHlkYIDG4KDIIoUimya0x9XCLThUyNl4gsVsALkO4ifOHW7aJPsHha5SF5CDaqzRrBeHOGljqiTo8g/heMupV4OBivXr8ReU8WeJ4Sff3UWRLRMnnVCTsCVSTPgZkgj0MVnSBCdSNSwaYucnROWMaC0IQK/VxFes8BpepJz89bgw97zHTldyqUokne81aaJI85S0pmWcLhfUYeVsfHK4E4m+HPy3mymdcW8K5NJN8osn8/qzvmw49f8HEhwN/IoG2iZGXQs3JPx6+bYcoToUiWNLDbS+lPGxkummB9rQmp2PUPOlK1W06lhDS3sZ9WDffLRPU8aJ6ZpfjguElvFKf9WrVobNGWeqtrqGGms0x/1wz7OlKIreYQsSsjA53FH3jSVgRdNWa1y85NT8qPe0rXLp+9n9br7pD3l7Dve0ugeuq7HaD9wTyh8AaNTQpXgrLLLDB+0qAvfa8OH+C2nHXyqp6hXuHgLNUYWYDKHTuvLdaxd4WRoie8t8DtRn5KDd6ag92eABAZzHlDk4wVp9XkAjNhP1ASyfxHfUPOzlL88aqc5rpb1/kBqth83qBqW4MoV6tyK1vGSfkxrwM+vD/rJiHU1f2iCHJfaLj6sj/UER98GnWD9wVhU7FWV+dZ3kz5AXGDWy43sMF19KvmF0x/Gg6/iIzaj7vhHHrO4JonKCupZUQbsQLtKpo9wZFnhNHLnkhi3uuMr8HI5PQkTViB4VTNSwMmbVat2TT8OvULnZlD9mqnGzijcQhJA8oClFdlzEDvRZAxV5CVwGBdx8sk7RA7gX9nQbEhoMvZg+lfxdppvNhydhf3g2+MA0JuVJEV0x9QQyjl/1hsh79kDV7ZCvYUknK/e5/Qlxidud8+0ksdKPP1WdTfpSuLuhUqhwIvoftG7WZ9+35yDzRFDN6vT63Muw8F9yAqG+P9srA8HE37x2cpL1DuWrm1ue5VML3ckuxQ9PT3F0txV6AFgA8vsjnp7qKiIzCHYUGCMCEGUtrxIyV/sTjBgvJMcp76NXoVzhISBq8qdD3wbae2BzH+JeoNLnHsPyANX+/Iurp83av6t+SYoDrEnlpM4c1u39RzWrXFwEnLd3/0Tha4eBBX2FR/2orCSOugFhYqXBFlhBLaqE10N1WXPfJplI+VQdBmXDKhLsWa0XBRDLbl4yjFGgATRVXKuYt5xOVSBdvA54+W23YKNNDdLioKrtNEecz4PvhwHLlM7233VvfEHyJ+0kbTHyR/Ut6C8yrNBJSPnlwmcqP8QHURCawOqMO8gDuP4mut+ioQhW9f4SMQyNicIT7QDEdzL5ZgQTVQSZpB5nWcQy017Mn/3diIhkNyK1qa03C1qTSQfwYImMRVEvw/1NfHjXFIsqqm9e0tBwNyusTJnVWidQZGKf1LNNo/odmdk+GiHXzO7gdVinJYTaE/gha8V58T4pRV5eFE1mRdwWZGZgzqy4tYxmLlkQoUQyCsYM8IAonQngR4vPT3YRaBLH/icOJTmblhQVD6n34AiRZmClGDX2keQEoDOLgErOSBNGVJL1mNHxzM+LNXKax9NDpJtktSi3iabH9dz3PlupItOUNZzZwCqjh52yskjdqy4iV7BySx6SNAotgg5pn3Cst4n5/z0B9AGVDHgZyIvV3CjSyFROP1+xkEOHZ43a94Wl0YRVDQCFCSZNtWGzko155OACwAQhUxwNV+NB0c4KUo1+CvRiUKGlL6EDCQDFULuJPY4on4XDsZZNXTgMTO41nOV8du98U4L96iGeyHomWpCZ32uK1mZazd/MzIFBYqkXOc+3ku/hpMf8lfaA76lxqCZyaDKhJfhrMoDif8uPswGmaiWa803ro7MLY1Vv+S4/cD4FSosLMu6Xt1W9LArUjS0IqhkqAvHP51YsjuagB1Xr2Cq1oNv9v1qYbsVO1aZksX1Wrj16OWsuN2X/S1yiZUk14p3jCPEM3KIwVjyFvrttKOevTOutjBbipIUte+uh+A/ze9Ur5hhp3QVCd/q4uw4IgqARDiyYBlwPVZRWxX0ombpKD5aNrTGdC8rEPRweW/b3U2rKiNRnsj+SXRFgqo5cRQN59VM/T0mOhDQeuwNjLzyTRKz3c4ttHtdIAc3HAj3Ovw03lTnbEXP87OL/CX5PShwLVAgkP6MLqAPZUXxQ7k3yh+B8zmHPuxtSxcmMrPoKpPqHop1EaNUOLBDc8xABZ4AsYZ7IjeD1DBnCMF2lXPumQ4AO4k//51eTgGmMAGnuePmkVCwpWeJy3kOWEhK3rYKTYr0KZc/rN8pp5DyDlwMOkVRd9naUmDdDL0ks6paTppSNo9il9zCPXPBPAVwOCGLZq2mnLV6mwOmtWm41kMxF63geGrH3DMMx91ry2KmsfXQT1mQUPJG4inFine8h1AZTNE6oYspc7C+RvJeAz8SexsNPxBj6aOFd0FaJ0ST2pmSXbG0cxIK0cOJOGEurrX04AmADPGEL/SFKMzXGSMk1nhN/q4LwfckDksLn7RuMLpirEjYV7Nqapetax6TJl6bNPEi/tKMRbOWihv91cdeFB29EtSYeM1zJGK9M8LcUp3Oi5HzeRqBZUwyqHw5b/iLwKE4L+SKhM4J8fvgfY2t3gwHkj39YQWO1IAlABaghse2YjhM5vED5GcgQxKV5E+0z672AKfh8xfPC9fb6wRsSXdMx3bC0WUHiTUhyZ20WAAWecXganEf0KsyFyXWHEQF32qiSBn6mtbnqKR9nh05nxDlLjWFXh/T77Kj+KZRoKUdhXxIFn29BCN3v/1m6CV9JHCtXU3tLMB6zNHeIGfmTfp+sDkmbtYSfL107Ld63wsbNwd3LuICOJJFKNzjJmoQTRrwtq90NgJ46DV+zqtmu8+7W9ckfkqZo0hCp3mqq8t7EpAV0er31k6Vu+D2BYkI9BIk2wFYlsqEnJuIpABXWGZtPYdhpWAATgRCtlU1E/3Uf18hi5pCUITDkRHBmmBC9wnnLlEhiMvQSKm4IjA3LUnOSTLIUHRSDRhx/IW8LMxf61Jqco6rQpOdfg1KyyXk0+/RxlOhHjVDrctXm3vK4bKe4DsltVAwx/PQUpewkoQ2ZrePaV/1xheg6l7H+GDr9MWF/nBOOTXvYF/YkkklJXi+0OkPjLnLkROWEw5Zwislc+AK/hVd1vQOj80evz7YDtziRwqhUCM1h5y0tjZrawGoKnp5MPA9dUEfoe0FNh3NBwVTeSguk36fZ1O1vLt71EdsICadWH6fg/YbByByZaAPmqzmVogH8iSLmdLCxHnjk2qPpNvSxm+w9m6D1s18huOdFO1raRKbZLO5XQolM/o4k0QU7+y9bJ4Vcd9n0ZV+FkAcGKgpJioSzTypFOEseXbtk0zXbdTfPxknwflUJEt/bmPm0MrGgUs3Zl2xZce8hVqbtCRP2C36YsGwAVFHKp2j7YNekuUYvyadSluzAUqCFDmtuFxaSs+iakh3HDuf3hsr2hLQO9QRG0Ccg1OHbdq7w0pEglQAK0PHp+wzBa3oevo+0JgyDmRSz6RjN/KmtKlFi5AO9oD8pKcI4feFKjg3EXDM2cbtvcMzXwUPXJHwi0y78Ao9XikhrcKrHbxdy3aJtczaTTWX86kBtnVtICX57x4zLAJWMJ3FxCZdqN2EtLRN5lmnSiaajhPHU9eMJB5tetro4J9+j+WvtBAdn9qLnOaRuyz7PRAZVwaVmrDLk/oogW7H6S4RveMGqEzf05Aaa1JsAfZUh1oaY56aojqBCGkLlu++SlmuHS5iaHnaPu50Y3T7uWOM5/roKg8mnpMY22Tm7LBCdNCS4fHooXFD3T85x+TS2MjsUSxNkRhY1sqZ/i6FSuvbSZdNS+reoNiFkHrket2SLtEob7TiLIjgH4de46DZkLV598ZFqs5/4dMUtWuzJzAKPhntSdJbR1IW8MK8Oqf/Sm4XHeegwVDbWEIV0ju30DAc+4aEm8MKcd2ZQRuuKDWmg//VEpCYkI/kijJqePBaPXEevUx6hN1XZRC0DPps5Rwpsc+7t/vskn0WscA8V3a2SbWpJk0yNGJoohMxAV2eRh0FwekQYQPhrHgyAqNQvBgpo2QKhgLWLzZHQuxujqCNTzq9bSSQRpIqLNqsmnTYAUwm1LiqgN+9MUW2riZoB/It4GPObmjrt6I0VtyQ7/4at+sMHtwdCaCV69BaYk3goAG+xw4Td36hCu9d1Twcu+ig90W+fYVQpuFazPOZObr/dRqdCdDVJlQQG8wL4uTZakaaYh3AgqOUJoL3E9l4hgnm7LqN/G7VofUql8Kwe6bw8Agx00tGffWieZgf04gvB2UGuyh4ccv06Q+PjOrEmgdE7EXbz11H0mCTB/KQZxhOT3TAbB2c2IudJAFBB46FooPvQpzD2jYQQniYwDFel4WKA38xj8E7wzmkN8a+NB2kCVfLPBgKI2yA3scho2N1jFwDfhBs0Jud2KBRRCc7rSnCd5kxB5wCr9Dh/bsjFXrmsrQlSXMdNek5eIqK6xmUE1otkXTRNF72TrVPhA95pCgoZAkaaT45F01FgWrUyDNSZCu7zRC3brugqEWPG+ZMyQ6KA+DHK4ftKBh9RTdEPtC89B09t3Wm3pKnqFyMrSSFefZxR0o7e8RJaToow6jVg72vgC88MI792ai2hqBIHBHRexyT61vJDtrJjHPq8AppH4oUtQtQL4pZtblm7uNRBMbFDnkZbw5XXFzQ6E2F5cRUvaqlaJkdmBdgKQiCa6Ou23GAZgOz6+UUt4bIjsMjVbEh68jULUtLAaBlDiyPtbLh0NltjUUvNDEwdvCM9n3LoanGaxyxKtNJI7ObYqaTifgDorFJn1AgTE4NDsfrHHKO+gEMBGNmTjgDRQcqW88zx5kHJsBc1yLmTeFwklwRVCRW3CkOd4+NkzpO3kLaxEaw+ZN8p3XR2Cj064cTCEhP48Dnx6AimgiWnOQpCagEd27lmA+9PUC9tAKlPUYu1KH147JghSRuIoFxl6DaCtGqaaI4BNdyggIVVBIVRN03Z3eWBN8i+RR0rLiaci+VvKXQuI0CgIzsVXzPIXHjm3tJGk5/tJPSFwo8XbKiMf1O35FOQoQSMdSs6LIqB9HgE97bmygFl4Nt/bmRplfyfuBY4n57NOodrmG0rojCYWtED60gZxZpkf9+vzlPSx3048mcp125Yug+h0I3QQibVCTzEMX5EsbPDy77iYG1BgoBKxrm9x10DJSPXa/DRDmgMXuhDgvgr8Lmv5oUXLaZ6jaiNDPOI0oKRyTv0mqe1Kr0YEagdLadeMC2fTGbHoCsWq7dxVbbu21oXg41njvhNhxLrjehZfzsjtsM3vybKMMqh5TeAGWNyM13ffHawfq6rjBtTXAlKSyUVpIiZC65Lw6n7BZN6C7YjesjJPEJTFl1TgkKL0EVLhsK/YxrLpKOwPqOO6Ju/Tk3Ice1FIBBKJ4FwQAymBGypDga2Bq58zpCJMN+OtDwWNkU27jJZeF7x+od3WLaAA690dZjz8kYN5At9OpS4IoUOdMx33Nf7whpTyx2SF7xaDl+In4QLpp2HL+oKsjuurh0XKkd2kBupx1DsTsBMa4zSx8JMVSA/2GDY0D12aTTkTho1sT5tAoeFyNXR8GZc1DTGA3R1jO5KbLf5MKjfYx+cUE8szXmLpcKi8+Qt5xrFO6agLaQy+X4Ln2PDt3O8TwHsj3+nnBYgITTaaaI4MCa16BTrZEarjy06+LrLSMPnTaJVGgddrUnWxLlDLFw1z8zJ8zE1fTVolmJKd1IRFvEzigiW3Ptun48qG3/nRApXCTyntBVAWHsxaALc7nxmEyvfF0bpXaFax8VG5IShYQU1zn0VrxwtOtcvZVJm55/fZtSfgu/IDgUbvsKBEhiJd3JKVlp5xGKNyK9w5/6CdvJR40Vp/++riKs4ztOyzcuLxrzPzU9N/ReRlEWDk8a3YfHArleHG58ZdYcD8GQytfWZSdYBX+pWJCrMusTe9iod2/SBLvZ+EidO4EDLHXESaQ6xRb7ORK2Uz0RhCR8VdozAfokOT4uyARknyNC4KJM7aoyQ8t4lFyKEnWC/K5uO+PirQ2dZYBOkEPgl1ztD1u4WqwyEvTwaicHhfQlGfwodUeRHvlhs5xBOKF8IswnwtURrAGydKLGpQKTx93K7gRs4/naGMPFRmbi+7UbKab+9Y//M74T/koe9hVR63D2y06yGUAOmaDm5ZYGT7Q/doogAsDBLSShluV/s8gF1++c3t21jARmGquYelUjzkVJVxcjUBbVEoNPKnJ+W6lE6L4JRyQnXBhwHDVIL6r6ladwi5Nz1lc2XUtm4DGnmy6q8eB0P08lmCqdSsZp70AR5eDYhNhodFYqN4keV7ycOo+EHlr1aOFZA2NkX6Ht4aGt2/GDhZzCzwWO82g4+hMo8RUoumPEkTa6OZCy1f6lMzItW2lEfbafd1DScFmDW7RSSRUsj8+ED30GbpcKzqa7V+Z56GpSToP//H1olzuLQMCpSmIiwrEGO3mKDtgqXKwYIi62G71RpDUB7GaqoWIBTZQN3RLE7czcCMLQDW5rUm4eJl/9Xr1pMCSRHw0gGNfIaKsMgEsydUiQD3Q6NTktCX9+F2lwx65ULLJ1Vo7BtjT0YyeE6C3aFrzrmpuauw6TdhYOIjuJX4e+ASk3qStxxYZ+ME4E6S5uGiZVoD2kVycVAGZKosP8vqWNmmi0uIY3M6kFkvxvJqyKa9cbij+uQ6IFfBThulDkkWu6D+uA2DOUuCaeIYwpb7bDJjY48CYYq1i14lbnE+aiJkGmf1dC4dhB8uzDs7Z2A4xRd6xNF1maxnrOg5I6sRQeOCgS4Gqe7UWLX/R4btOkanXGWKg46b+ZLF3x63zD7v0cHbHFdRO6KMt927wPMdOZ/Jt7IEPthiRc6U9Z2PO+oRkjxhcCl9JOKpeNmXTJLjRzo3bSIQphPSkk1gGAzC2rYFC6mPQeZhhPAFJwRm+4WGMv5LDLntcvfall0fQi2VcQ9zve7bh1wg+0eiO2E+9KkvSKMNb+1Kx3WNV2fgyXqbf6BIWnr3IzFSMQr2j69M/njly8Y/T5OKAIE5YizNNK/B/J+nPbpYOKbsy9Bw/v/06nfjx5OlK7KzWHMGMDQDmZp5k4tRVWoU76E5SHT7h30WBeHdcRFEVT9TGluK6L8Pl0ycKPEvBc59vcwU+nIyXaFe0lqMEemGuagvYJ6ORRSOsmjfKMYtEkSVjfPC7SMht+fk6/X2c+6bozkzQmMN4fTrWe/gMtK/pZNBDkBMWwERxknrLW2jImnvfpf4ZFTNkLsuTHl/mMHPMTHEoPZOAE0JJiVAqWdZ4YJz3dEI4L9X4rwAVhehVYffZmeeHer5TytHH9uyQg0sEL6PexovO1NUSZDkjZlNXajwXZ6HyzPKZttyl5QLxcMVBBiAq7tM6X7pkfLtD+fEdKosuQc5ZXsEcVwN5G2EHnoO4kgvbrLoaU20usG5sa46CreIbqdsMqU316fjk6t0AQY1ij1Ib5umIpPu5h/ZQZp5nitr/65uGjT4RcwnFjenZQKw65+tszBrb5phhOQOFjtl5XBdq8pBdOZoDgPN3pcNZrCQizHcC7gCkuNakhRos4REKgjXrPrOEoShqOdgx3Z8PrZ2f3W6Pz04dHleIBIGtCfhW3Sncgq9oEV0+zCL6AEoNc1CUT81g4X9Ul35aj5A5tcezuKy8gkAC8AXwPd7QxJGrViHqkcxmwx6nrMhPOe0k6o2P7fCbnLZzo3iWiH3gyjAa40rfkMSzPjHPUtKir29dv7BmjOzzN3t1lXnDHdtzaQFIS+v0jp4UriGcNhNh80CkLsX0Tc+Z91/NGFIQZI29Fieh4SEXnae/PZeYWuAEUfpAioixFPgNoLP3eMVl1rOsdFnSbm9vk5xNtoyIE0Y3bNVP+8JjnMyFm/ul59r9Jg8k5MV80E5sbQeFP+ebxSaXCniyE44OWrAA769EADnwVZnAohCFMwoLEMpLG+g6TmJAybJYyqZ90+NLjTcx6N7Gvwq1gi6TDpHTjRsevx/DRQxN4m9C4R6IikHH8hdZycPB2hDzRXE/vBAIz2fzlz2RPXL82hWu3zx68HtoZLjQnJeZkTHmq0vkpenfxVdx2S4uoTy8JRtJ9FFl4LyOYbsCYUgxn90o8qsqz7ngvSnqFULkBeEUUte2aZBf0Z+rnuAiqtR7bAzoL89ouC/r8ydIOPgTuKBr1d6ZR7OAOtTFC2e6LwAEf2MeUmqx/mM9GejJUALTq4q+WXsRnXPgzyVk/jJJDHAvWfiZG3sNw46bIsHe6p0mDrdStX9o0RemBw6zigyRz/kk7p6KJ435W2E8cHjGSUdh17wgJEw/cuLSNlHY1B7B0JAOg7+DredLtYPMdgYTMWFH5EryJJoGZ683GxEB7NOr1RcCPd1uchFua9VsEaAwqOXVX4gQf2W7H+RTWv9NEGZo8RBtri+YoqOSSNPeGYQbrZk0yEQeRB/3fDmM9z9Uk6zw6e6aJGXz9le6NfNdsPQtjdDC40vnEQdf7HH9va248pRveLcyKww1WOlAwNYxxi+fZYA/nOrOFjcY+Somh6Z0JHuCj0y7ZyR3p/3TVbcZWesKm43mFNP8ZgfTQu/b7LuQ2KW9ax8J8kZg1nKczPaEzK16jiyQMeO4vM31wm3wMrhD1LvyMkYnqcMjBhm0Dfnod3z3ONH5xYPqmzY582cxKpx+CvXzHGJGBpe/+3AqzgCSlUJ/qG1A7qZjw7owe30Cq7usp043zTplOqN0agSXLdPrD0EAiX7DZjgjdHGWevbw9qVkm1dqtsatOueIccDlHvQbvTgxdWPbuxRnTjqQSEKcpo1mQZ07BHvrpehtrpTy5Y46tnxVlGQ+m1RTFUfHAknDJneNt6b1DP/mimjoGT6Gb4j4w13VxFsOuWmMV1JRdeWuUF5frROjHqEB3Z8yn8+eTofW+TZ0u6NIT0SjB2Lbd4bseeEVd+dtuBYu9K5OSFOt89DhVlE4gqUcRSlY8J2Fryx0JJTNA7ouT0mcbNty4Micn4A8iWCd5LFed2v55Q8cvPGNcJF2lHGz+XAwWcbeRNFuUoZmvBQubr2YVCJCXBeKDNIxwg2nBPUay2CWGel+Zj1mqOoIO4lFkuwv0Knp87blWd6tBR9gAyEX3tHyYpsm5Qg/kEcKKMUYE0e2O85hLOhOyXMHe564wlvQJ6e9phplXToitHNPHLyCLDN+npQjRzXaV2pYKtriwoFJnKA+vriPwcN2pc+7YlzYLDfRdmB/Wu1WwyYE5CuSKzbbIjlwYtIjqbdE3jRy1rG9nRmdH5GGRAvVSQvLuxEQHbu0aYvfUFnIvJDLIUwFlgUxites+BJ6J08kMJ1tefDeFw0xnWdGzvL7ziJYPMimhg+l4jX4h95I9m5ZP5AQPsfs2o6gpIQZXJ2ybQsWTFskiMumCL3e4IZqcHgnj6Kuzw7485H8r7vwMcSBQEz2MOpx11uLRFse5pvM6DBTQ+NEK9EeDQ2/ajqmocb49Hr/bkpO8yecyD08ChX6n/gzk6wUgrsqJ6b7L8aFMQypQxoQ6h9vvpn5FD/6V021n5b+l3y5yPtZCGypjVsPZ81ouHM6hNzG4JLxiUXwdCzFW4mld2MBhEhHEupHcyGvJ3/gQ0PEJF3DMe+pPr5sC0ATkZmi1JC2YVAA4VihtkuHuGnvLulWjblRUeB7YdJu+yh+4iSAhLDYZezUGrOTQThRv4+lqN8tKyMicDg6P5mramGDGOSKJ0nkW2eAnckv1JAiiiJjkc4Yp0dJHvE2OXXOrjs1DnqImXjLSdj4DryrINukg0jv0lIuQ4yAAD5DHQyB9QtVNTMw04ygAnwZQBClxBOiLJCNdNmBmAX/SAnEM/E1zZBGiYuj9iFwVMA6zlI3QtO/KV8gpT4LVY0yGM0tChZkKvWg3eme1gg/lyDpaq/2U0UQX9i+453TXieYCmdbVmNeaO4SCGpZ6k/hu1tH+TVDqnTuCbNkSd0q0lwEjayLVPo3aavxIHGdAgx7O/fc5R6YDnfce4B6nMr8k97S3Exfaa8Zz1LnLDIs3sGx2kFnHeXbi9qa9zLTgPJnx0Y3CfQO0jcpLMcGCjYgNRsoErbIlNKFktoUGml8UYlOx8XD4G8VdJIM9lIt9+PPfg/fWY8ZTysC/TJGsG6qXa2e//B4NMneexBQdT+S4MlcAg+TpF1bxNR15pwwu7CM5t/nMum4/MrT1M9g74T2nAJmAQ8gp0sP/Km79UElzEBIX7YOxl511mSjtK95ZN1EQpR0dQ3/XQyBN62uP3PMm0EgHavUlGkVFOuAe3MCo+IVenT2qDz9WleI7Upj8anfYGsHP3aucbtpKQfnQmUnDnMfTiY6s1C+5l6ks054TklrG1Cjmx4rzzYw5vEeZGxPB42ZHMdJlZISFBPNTeeHnPH7Qp4miF3UAg2yhm7QYt6l5m7IvO8W6sINTiAdahSMSAtZEdXQaBFvh7cDe94dK2vwpHaIuEbUReJGu2CgJS7eC1jveqOt3T7Xb25dUg57JzqCX/dvFusMZ/WtXD8wTXmSL4jv8PU6YihpLp64V+2KRFPsorZAwRfwriJQTgO/ZXNKjDm3oTuJDxwvsuc+sY0MjcyGYfpChzVf87njMZUhsD32aX0qPNBsTBiqzmpPpnDE0daN8bJucnGPGv0bg+oldh6HWCRdcRPKl6BwlzQLapCRdjbZRMmg6hEiZYjhXDJpR0s2yxCtbdMezi6pcS/8m/T/2fp5veuZd2yiTuTHHIJiFFpaplbDQcVax8XzXeCaUoLgEqKNUuZo70aQ9fUCexnHS2DS62IOpN1uK13G2JYnUUdQCCzSC7pHniIiXOVJqDGFUfE3csfkweBlH6KxwLH0bjucSFN2I6wiO1ikOf3cUNdwDJcT9LG+gsig5J5Na75EbPIXKiZvtwTgwL78dtnJcCSjO1jfHQUK5kdpFPq7lI9OOj5hkggXWPetWUSsR01iehxYVRiR6NlKOgerAASVReOu1hfW2P1CqirrVJpJALOdAzXFqOlmU7aLRXhvGa2QY7aJarj2lTNRS/bNv4k+k6PFA0F0svtsozKGRNjH0vlAtzFJFzt16xhNyhMhQplQ6SGCHJa43MBgaeeEBIvIIjr2DfsV+mNXrLEMKoXqVLdcSDBTZSn4Q4rY6ZAgCjXYdLYFnHx/8UR2/by3EgAqOovNStXWhXtI2jMbX9z8sEOpyp8lH6Tt7Jeou1Gnw5Q+SdhYUaWQ8GKjugIH4jAELNPij6DnnQspoKw3iBsFp/sWn7hSZxumamrxuWhCAPjopnaGt7WE80SxW0T0A+Ehr3+iEIDPU41UtMgAhT5Rh6QkyhU0pHW/hkajJFJaLUO6MLpRnI8soE4tkpkNUbMHL1bFPuPeUuL/VWWiBTpSCj3jeE/oepN6AJLr6Ggg4SI3MpSmqRgQi7hbyEVVMzTH0/m937BX0pNwZa3kSCPxvnVLSOOLbLQQV00PKezrcNOytil/VyYkrZY1ddehTJ5VP4pO/y/lRcNV/K7eFlXDAeusJU113vDbPq5SJk9y4HM3osuSOQ++NG0JSaxQqmDLyQpZ1X6flPBvnnCT0SCk6OHayqYAcQ711aSfcToY9LcjMoyqBwZagYd4wzAwBDw7xpNL3aqs93sPN6Wjc88LbocP2MZGL7TQ75+nPdmZRhdj4wrl1fnPUT3YRFMEoXkXPXRJR5GjruVN7d4SGmZaUiU1lI/Q9v5wZ1deu+2HyUsl5lbeNlO3jSg4JP8xS1FkzdG6Xbta6m3WjEiXxDTIef98KYW88IlLG6iEFQPYWspEa5VE8kVB67+Zke+QTrlBs04Zqi3ZqWsf7ygXBKQg3jzjonjyKqAFuFJ506QMO8FFNCTOLhUewRZTTSUoiFs+UUyhPgZpREz8CKJ4nFkj6RfuGRXNNw/DWeWqU1P1GMvktHp2VGnGfFms8DfXQGvJIt133z7VtAOWgICm6fdpipJGkn95XCHjYyGXo/aA/fbTNfl/EEM315zouQKfLFa15xGasY1x3DOPdRvmAhcFNVFlV85z8pqitGhFYmLyVFcmkKccixQOgZEiXtPCquWVRBvx7rN27oObUsrS7eoK5P7/12nc1NI6RaQep957kJteRbdJEs7rt2Wy7EstFYz+IG30Z6NhM9EhUoAl5umSvG+EY0ubrVDjjeSRgKE8GFF6IjTJ2encCzwRd5+iZepCyNugyzSn6iKfmMUfihbXJ+/wQhb0ExKpJRBG2XtVI1YQBhaXtsiu+dcVQp0D1OfWtbGpE6edugNQxkyx1Ta7zR2m/fCOa0K0wokqM1JRxtBvDuZWVBMZIAselgc4sB9imYJJcMybvyqKKudW+uv4VXCPFIuJ7XCrUjcYKwiuMUBFmmNHBtILrpFW1B7Qy2oZRj3oaKaFkdHxh7lsQBxeNkLh0PKZa/3coCO58GbEec740HZIVn+jjZpQa6tFZdjqPwhYUeoR8anedD9vs8IRMwMIoAqhq52A3On+XUSt+a8+1A/vswN44kNqNO2BMqCVzG4ZuSz06t4JrkjQ47AnPg3xrqtDTUfc4EmwKgifBboJ+MhrVI2hRVvKcdAVwQIaYMLIji2jj/KALyJCrNq3dnNvEsghCe56dzAevCd/jriIO25oO5UUYHAjyW6WmKvIOiKnwRywcAeQwKEpAZh8nu0lZdyfZuGHSLaX6zpUMFjvCY10QcUSDXZLCGUmqW3nFWooPum7mmKc6J2eJNvn0T/NM6Qm65Xg4As3GRg1MgHnRE/KYSrjuESAAQ3GTuhhtvJuPNlnWJ3sAf+9B6PkKrZT2A8F6YZezbE33QoHPelOp/Cq76BTV8sbMuKIio01TwsNNe1yd2LG2QFavyL6NXBo/7oYWoJrIwk5OLuYz5mPNyT66v63xDMccUYG3Nff3yUBst3UrOEKZTPzW+PAM727ojYqaTcJII1OThz/vgKoulZ6VKeW9wY0nv+3vc6ENnkegTi6Hc8ugZ3+EP7V9ZSDooC/geiZ7gtPn/K+Lxq4Dmr3PXKgXno7NHyDhXNEqh7Z+rJJsNOKzjf0bNCi0s2oibNrs29lSmpNyxUiWHh4P0ynQ43j7KjfReHtoVvKlUNktadmTQLAdx2laO/NrGOZW2NcSqgBR39sCE8UzKx7821fBEm2xBiM0JxYd4p4bBRRr1GIGLZ5P0Tq8Im2gRvJUDSGkTmOEAALn60GpVJenO/7AQZXdeZZpl7RbK4zucVvoSji0ZFWZ7HRPlxM7J/Rvz9BntMqQi75k5C6z7YUeKke7kwSzgidDweA1/9ZtpUY4FJv6yFasMTLUx1iYXr/zqhHxMKNAJSvUxEUoCASsCPhRyw7TOucLPd8Wf13lSSWtFtwc9eb7dPZFDKqkY4Q6NT6hEc93yhCX3npYPhwL0Om/cdPhh5ZPl+bBKEcPb4/OvDVIgJA3SLeczQIxptRx9bChgVU/CkpZccZQwOgRVpQVGxWRjCIDwyMGJkw6I910GH8kl2AGj7zI1zXnl/33B+LVLFg+eSdKVoHIIY/45P2nSUDrwsmpBPQ6ydJN0ISiDTyyOlrNS7Yj0U7jVl/TZl9YRhdJTcZFG248QMzU5ceIkbLPk4b9fei29Z3MVVBidbSdTZFO1vAwfRR/3854uM9IabdhB4R8NSLiyXppKXA2S8vI7wtnoZ0Y2O1eaCUrJu3Ibyrd4PpmSbdb96jMZx5OGSSOFUEkuxxLGGGJjODInF4AUG/8usxDBilzWasufcS+7HASk7C+88k/dK7AYQXvC0WVx5i9jB94u1D5dA4lKFWjWSZs4JxnE+ELsliTu+IBa1DD+L1g+WLqaLaWMnE9Lp5GzXqj7cmz15MrwNl102tDY5gAEkIi0cG/6APanCqMw20dBTbx0CQ34EsZJrrpqYE3eOs00NHKFVg8Vf8y3z4zLcpeYZqLi7hnrM9hFEhx0xHhON0neLmTmZs2KnD8TkuZhaxAkvpsSvEyGjfpuwGi+oAmMxz4Ae5xH7OyK9yA7HDCzrYLcUEdzgbGNxnz04RWUn63J5Ldi+bqp2tOqc+wPXA9whmKq25uOmgSh5LMhvz9wfYOpwOlw0c9E25I/scabiGzXqKh4gVSCpMGtOySP40hkBfq52Ddgk/GjF8JbSv9zXVdBWCScIZCgD03uyQFYy5ZV2N0+GfOdDx21LTp3A0+B/Rv4q+c1020o3fIvIgJo7dnHEbxa7TSng0A4V5VuGhvv5PRN5HiiwsqULTRQ+VubhbO9hzgGn7uvchTB2YWUYX+ttUMCKOIATM87yO2jFvdI7DbNi7ihh9NSgIkKWoS85Zivbj1XlPY/kqcAd80q2omgfdjxfDFIzumce5VqGXkXUJCPtH0bXF2Aj48m+NvDQcYfKIU+9PNCNoh0HHBoRfYn28e0CSAhx05ttqzjtnITU84G5h0Pmsqr962WpCmDtUHe4deCwImCtjJA9srFULhMxA0Unxi2DHm0blizxAyM8t9aBv4zJFsRLRDTFsy9Sg0Dvr9CAtNmylmKMzedXzdnkqHQaETI2PfPYHHKC6jheQONB7nY6AIHRVXqpc7gw8EQhmwR9uH6rM7+px+gN9rHVjvGVOSWQw+GNk0knb2hEwnjh7rIlW+D09kJm6tG9fNiFsvJJuGR0jdNh/bT9DntKhATTNmng2dJhZxfen2c5j18fEnDnWSRWDm6Bqu29KthcAYZI3hrMnY+DOmn299nD8ZkzFJjUeG0uucGjgHgjdOnyePfLwYCF0H0Jb0fXHjDGtIZ9FlVBwazDUvU4fVSeJpTRGmOli6gd0HHE/E4GW+p75QHbO1pM5CvIIUysxBwKwtrp0Voe3RJxx1yMw426NaW0iRFsuKfMuxzmmeYtHj4YBa4KlciUpxE8micvk1jovX2YQOKpr8Y9kO4yhEQCmUSuTTl/76ZFWELfnaPOKAx7QhHiCEJHTet/NnCQ78tzXXQzn7Yyed8QLtZglOpx0D3BZMCTlVdG/lJo0kC8tgx7g1M6ad6h3WxeBb71NKsohvDekqvSGZcgWKSCXIf2nTM5D50FdJ/OYBMh4OKQvC0CfgqG9/fF/ydNcZBxeTDivmgSosZMqZx05+BAKNGDcqlRSpI9hEVFLGpGCol7YQ9nPPe8QUKahkMi+v3HV0q0ikbLMphs5qGTNTSjunRsECSAzo/nUVl0FEDuwmDvb2qHlCx9yGu0Nppjv397ljQBHWMMH1SUOaSvqmmYpWJv1DC4QxTY6JHAAEJhPgAb28ztYEGNcsD0WVKScyeI255bgqDkzXHxPOYOHC4T7zVtCOoAbFveq9ezKtQo4OO/k6cJg2v+JxsLLpd7QP0NXkwBGTzeYAAk6lVgGQGkUGfdlygQic0E/HmBZFi8KFD/HgIgUbFf5zLpO5IX1MzYFhDJushJj7hxlcTB7irl6RljwDB1EVzemfZPCzZcdRaWwpKh6ZerZs1oIUW7WCfyDvttaR8lhC8gtBD1A0c8EQvoYvtRy/zkUJjPOVsKWXuUNFRDxpPBCsBiu+yxeJFaxQCpGtVKx9rBxCv8dWdbLNFvmqiUY28r6UmcR1bpJiqnfSs+RBTqrnXfDDfITkGU0qHiqYG5yjTeVlQNuKymQkeaB+CAzpqVtue0PfoeXGrW8UrfCh1EDG97MHks3u/C2pO0EzQZ1sHejIxZJjPepAuVeN4ly30wJsktn682IKfU2W+h1RvJbHwZNUYwvFOO0QHxmhSEc9W0q5ySOEHC0A/q48ZVFW269G0o489F7GeaMMo81bcXlbBWHGA9ULl99/wzwGfpOSsW5WfShSHmJVulQQcOwE+00bu154rgfH2Xr6wwonh0JfPp10q2vW05zTRF7cFy9Q/oqkELC6sMjFtpXjjuu9TuTdOjD30HkIsZbYPuLByxzRjCSgBxac5zLlWrdWEiZ8JF3rZOXMBVLfFF9bo9AcMTRTmbWnqdgM1Dl9TRi03zeufor2ONQ6K8XHJfSAd7ZciPS6DCXNAndeCSv9ms7nCqnrIubcRoTiiYKF1AkknkHEIkVnEZ64As3Qx3i7DBM9pUqNANX84GDfHxY1/myiYKtFLl27kKLR53Q4eXaLh4lokxYK7XXSl3X3229G7NKvGRo2jmmJpDxPbtgJGGVlsJFLoMZMqZLFcnk29vA5It40LF0N+2MUuJaNS01J2Zp55wNqKbK7WQyfElyJducOnnB4Ej24A55BTXLEbc+boDaKsAwm7v2+EGXbtCazLF2APJpz2xMOnWXw9bX4/FbFaCSdEjwkraRjPke+fYv8NERfod06kj7BtoY5CR1RGHp7WH01OpkbToFmvyLq161ecvqV3GdRikixSndW0Tv6qhdWuqs/SnBRrQ4yrErHr4y1k5OAFeVV9B0xvnCLWT684Y5quXfDWRO+38y+AU3p56Dn0yAPlnNWFeBL/SAcRJdsIk4c/IjUzeeFtBlYW6XYGcWxAsZBuEyV04JkRhprsk8Lm893jd09MI87g5xi+1knuZVaeVWZaQzyzvRC4II8Z0IC7qdHhvJgKmrf9ODjL+lWSux97RkptO1MhkKz/7PGaRqe4dPLFT0s7ra00ThpvydJy3Q9PzCHpCG5PE2G78a1kbl69dOb166ZF3a5gvs0EssoW3nbZT/+j1dymaaqDxZzaeUoeZQ8hSIcokfwGxWgUVRt0M4k38qV7ZzYKWaGWc2QMYoB8v2R1jhug9kqgSEoQLZ5Jck8af3ypMK5m8ANvSfNQT5nWIRkkys+iPnPPZSg9tlnmTXO2KWLdo39bcuL6Rhxn2JDQFgxM14BJ3OWu1lpnClTPJYEY6i+eViXsOwtT2DQOWsaxWdoEeFJZZ59X7KZFh6SXHG9bI7r4PHyroQcBWADyicPObXTWlg9Dox4++KNiH2ycRzGePPlcU7O3umPg+cntI2Wj6GgQeVQWdU8W0OBA2sfBaeuuoWIROqWNm5qTOhwexsc2RNColJJThE0/OXPx01atU1HyiOL6Q8Hj3fEsfKfOP0h3uc97xH5ootG4SlGw/dFigw7gA/2EfpvjrNXkIg/JUlvTNvtsn5jQAEEjD/qYhR1eCLXlrsvonYePj+u4zbV/4JxDLisLHxMezwke1KpuasYmKvxsEMMTB17OsepdA7H2YonavRQwsSXZ0lmNdK6LBazPIRGlhddwFmuTeLxkEEOxl2vUqp2Ot+mXSnynXGSPPn+M1pJ9gC22cviz3Y2ym3xOPnO+FIXsfApDsRbnBV0Jk6r8B0hAZKZnl6yFMwLGPgKXGzE+KPW+pkBeMGRtoY5KQLNuOjo4x5E3A6aj+00Q7wmUTSRLIrMPGBkCfPbBPT9pj/7ug92XI2I7LPajW13NU4yyLFM3rqqaZWB80UwglQHMhSK+5TQDadFJv52OBsSh0jKZzK2vk5CP3jRiPxmyo7CZsMHEhzkCWAchu4sSNrQ632YZzzjU55e+LS6Y3F8dT6ljyg9eV6Uh46K+QdGQ/dWJ3FBQO1kjvFEiyT/zfrZQ6eyopOLcqEJzzg7nvP4pwZHdY6iatToxyxmKCG4mrGDvuxRkThCd+VAd1376x//+fMIcI7sO90+H+c0pX/HYyTplX6MpE98YDqeH+IY0c74ypfnekWQUizm2TrNIu4q8pwDav75V/dy1Kj/+Zz/fr29M9PZDw/vHt57YL57/JyjQ55CO4qH0HKt1porSnJEP0zsenB26cMXD54+e/yE7ubx/a8ePn5y7+7Pe/uJV7+wJ9lXy8zOvuJH2eHp9/j58QOO0V+0vJj3T5dv3eeuf/GRvnJvlb52bozw8u7p//nuh3svDx8+ModPzLX3jWU+1BN+1vOEn13oCR9xLUzQ21diaHcWI6/ZRA8ssS8awRJyE3/kVsIBERijVGXPwbPvbTx6/+7hA/Psyd3Dp3cf3fvu94cPhtYQ9/dl58+zAHtkDQ6XHpj966JdGNhhKXLMQHz8wdbucv4mj/+6bcICcUvov/1vc+3mb+6Yws5WB1Lfd+9BZnR1QH/KywMDUCB540BX+b/TxzhkAGIgvvDQK+8HfoR+givmfrWw2qU98P1N7DqaSpJuyV//5b/Gdxoc9eoDELtc0lSBE9YKD+weqQHDnpvJucQbr+Ue6oRHobN3j1ZwzxUpFq2MJiaN81/X7qK3ei+bm9/5tMjPf2wvWXinSOu8E3r+f1CRkVpsDCtNTftFlUsrf3ATlj1fztDK66XMEltnll74JemBPZTv3a15A4v6OTbJmJll3owrZl6d7LnVclnDX0X1/UUVcIsPPVLh39WyPnFzzIcOr6pJ/0FPQ6PwOqd3ePpyJuQliL+uXTevd3xicE8CvLLaxIc6+76MBFEqHsfH0KWEXFTcPg7EXCh7MmMJt85x8YRzxA6Z7Su+/YWVj7mgwmWYTwbekqd1YQNt19B6BL4WpxhQRgdZnLhf/iUd9nal018VvSkZnsuvK6Nc2LmjOapjqAvLR66YjZ3XaVrjF6K2Tmr06mzQ+SgTBlNatD3YTZBV2EAAh9VWikPr6AkFO8ikcGj08GyGvHued1BpCZk/A8UWO694eM2e+z1dwqiBFV0PtylgIv3cqhFtZ8zKBI5FI3xuUdf7H+4+cwgpwVCUHg/iSGT3IKW3g85m4F0Jd4bKPYXZE7IMt8010O7F1Ht/+b9Bv/hbczN+9SB8GibVVSZ6HQZ3gb07JmnLxdCHxMzJnleTcwaRrKcHO9ysPVrYM7gCB17lJ4H31RdU24g8Q6YBa6YzlAvMI2ZXec74dkDpuLaQF3XRLUvcYfQO6aU73tAzfI2OSt+m3WE+A9pcyw2qQu29pmMIM7S2M/qeiiHhytLFWcS+Cz3VMxwQ2kLc5ugYpS0jode+bT7ffrCRe7CEwXPknmpocMy5oMQ98D7ShY8SfuobThrvl7g3iS85t3VbA2seO5TqjSb0WKUS0ycxA79N6YCsm6C2aqVZVsjcnlB0UGOGQ/S5X5wD+iL2CmI+5g9XobicjpEGiP7YmQGXUApOOShVda9yMCZmW5YWD1UWWZ+y4H+HrxI+LNHswL0q+bihZ4zDpj04n0zsLRl2uclZ/+KTpgErfrZED6Bul2PtqJm2o8zPjd+GjgSq8tU8n63BK8KD1n9+BXnJZBPCqJne1U9QPvoUpOiWpNomjI+9yFWMzsa7rWoywOCb/Sy2CBKMu31fZcva3Oe+gIF37+F9JC64nN5/ZpbVPGMqN9ZqTYIC2Dc9xbCADId6tvzLn9dNDB4eeJ254ah/hQ/v3+3/w5PH9x/3/0VE6el/uvvp9Zu39jBDGxofuZ8T9F55dpKgH0H76VugmFR76POpMuzGn3DZ7EoojtVk7lZsAC+v45hrUB3EpLFKu21O//X9HDhuSMykr0pXtWKwvDTjULAe0fBe/vK5i1qtzAnklCq2kB7oArmz7f+Gzlb79kofM/5a+Xov7bablpbzfvSHaKpnBoaQxV/+PHOjCrxFqWIq+5ga64Ls1GeMJOmZGuydFmGXylbcUC3DxYOZzt0E8siYDB00P06CR0xxmcvMdeEpkgZNBW0nfKPFHujYQ26uwqim1hbJ0GCMMtAnaTX0ywpSvb5xcuh1x+2/7L11Csopsmh48pc8w7u3DKOX6gS9W0hxgBCsNoH/ug5I+tu/cB30N9NNl80uHIPQM7K7wocszQ7obmBebOFD9l1p3ak7eyB4R+DsIalypMxv6NalCq7MMBHtLulXUqlVDx/50EcI3Zx7sJgvPN218KMUKdf1DjbjdTytqEuCHej+/ey7wL7hEtGdIQJD74bIlZJYvb00o/uI5/meuCkD6JF2+qzeHnSh7j50O2ZavJGuKOGFG7MM7+KDdzzTfsxTROM8dO/sY83PJnziMmrUSdTaTxjkcfenf1qilXu8RkQYRRwd8YKaokvoJI1sBwiER0DGpE1Jv+21m9Jw+5nARPZB3H5vZ9EwpKj9t/DyljqBPtDgiat+KDWGQjGdso8pQ/Bz+j2YYy81mzPlprjInFDPZF3cCWPKsoSxKEvGn7gBSUz/y2za6CrPpK1a+8mVooN1Sm2iGC5tc99yHi48MPjDbvBdTsLtAQTuqCtWHWxW6eZHkYhsD5CaXmR0zoGRp2XNmQxwuNQA6pHn86AvOJvUUeebpjCKqEwSQpqQHU7yqr0zQHsOw4gZ27ckd3Q2wSHTrUsKLu7aV6IukNjQ462rGTKKXlAGd0j23H3d89v7tTu///b/Hrvzr1/uqf92T/jTu/OPmNLKzxIBAvL0e1KaV4T5kinCirwib0wKtw62M7B1e1RjMBfSDZlQBYVHmESzuaF9tymdxjmLOvAf0aAKhn1uqrnm4xlrUK3Tgdn73dp/9Pj+tw8fP3s+sGo5Eolx+4LRWwh/BpaYr/NlcW5Z1ZhHT56S7C8zpD+We14JvwuaxZE5fHg0Mk8e/O7x4Z5b6j235E8y+rmFG/khvPd/V0v5VVZmr/LxFPFtFMv+uqjvpVfVIoUk7a/r+T63r72/ifsw9LnXNDci9CbEjRgTROGo9FavcLuzMDmvCXSYwWmhaNsJCeCxPOFi3XSeNfDvwE+6wklJTknSr+/fGj60Nq/m+7CZkdfsmuPFx85doYVffHr0B/kBTKdVaZd5vdLOHTsBfHmF0SH07itMf5kty1wBfyBA3yO+F0Ug5Q6bM7DX9/OjjnrBLwMvegdYN/Can4uoc92du7p0WxsRSjDL809a8+FYv++mQyZk8lqkeYfeoR0R2g4m0knFOVCpOQgSJJk3OopYv+ktsRUZ4ZSZXEt/YbrH1E+/WPkpcKTXpKDBadTo1jikLzHpO2JIrqL5i8GI6XStxtMH+5E6roUu9MUIzEV4CXNjfTp2ED7V996/zMx8SqQnCXLplPzSLqrlutLJazy8qI6nF4UBSCiTdkZiYcdXdZnrlGzZX95W3Nd2NmYHwfZjV18yq2qeT+xSWdOdH1x4HwdFpyAbEdJqbxi0O3m2uHepmriq1kiJzgOf+rkJKfPSvSPrijh669zIdfpM2uqdjJDsmzU3+IKpjItzK4NiBQmnRaCpOVnWCxSFUoeK1U7iNNm4nfv0B5SG/pXehrkVWiTiCQCQT4w3wMQAL/6n3/uZMihFyqAqjGgzUzvz+zD0Yt3fmmQn08um6VjeLq86hh0xLU7tY42Tik9SPPA+oeVfIEmaLaEMtZdrGaVNWBX40N9GsT9LIwbvoMKQlTImrcbZlDHKCbrQD1bQmq65Xwk0QO51sRUId+YS0KPIOCBNXvOUZ4ZwYEa8XrPnRALJMc9baNMElXfCXdh6t5VAt31L66/lu1/y7WnO3Bw9efnd02fv/uXo+e/f/XDvu19SKe/o4YMnLx4/O/zO+KLeoHd/OdUVABOX7wAwwjfZ/+bLxQd/JxXKG+8bFe1fhfJh/7xZcDQESOvQzopOWpaRd7tGNHSGL29BIc3ztvYM5IsKkzIzcg2RTVmTy47ZGWUWgQjtbF2LjyuDEIeHhz8+XrV26LR0EJiBb+Q5Ix6rid2MhxbQ2N3XGj9PD9eRLAy92g7MMCvazfBC070bz4jxihca4rhhsCLQ2K6kWndGisHbQ811AWJZOssI5a7Sf7du3Lx+9XMubprPr167euvatS+u3tA6p7lx6+aNm1dv3fqCfEq7yNfspltOU+Bg3fjiS3MrYnrwLqrQVcngsK/zeb6w5kl1nCF79lWezSnKJdP5z+Qa0rtXlqJjRo7VJnH96GFWtqiYX6Lkjo3IAT6AUsJ0yR1DK0d0lGnlvqA7/OKLL+jRrg59Zp/IxgwsoHoXO6QjSMQdmTOn0oTNzp0e5MaTsBU8RwoMIzp2U6YIbwz7PqQ/g/bsaOehN+TQTlo0bFwxJKYU3e/BfPvDvGf6e+nTcFYQpuks1RVnbsIjmEeHXx+Y3yuVC8y3A7XjUNF5yua1n+4n7SfhwyO34/zN4I1wdHTJ0XRgpVECc+UhWAyOFt7q3OWVJyQZbG8lzUdfjjGAgze3id0Y2mQcJX1zPG92IXOUZdhiHYD6CVkgKdgO07VmZa2JR8GE7Bdnq5IGgbTnxJNAJlnnoTfp4WqNZBy5aOPXUELLpm1mQ8PiuoSbJ6TSbLlGQsO35PCYxobd0njfooFkwbrhhMvMBnk8Q+d10qy5D4DPXTaKXdMc/aprNzQxziz7q8skhb7h7miCWTdhrB0O+diybzzOozwdpvyuWk4TZSfkdtd7AKFmQtZ9ImJ1PTkRXp87ciYhUSgxQw16vJuBGu94Wa/X4L80N65yNxcPH/w8Zs+L3nLrpky3FtYZeJSkPzE4FuTvx0swkVQOZIEJgItME7LygVA9gC3IdbYhjzScWNEmms6ccbHGMfC0PPizB78ZUukHFyOfdV0OdMO1G/0s+s4rNz0vvt+Ar0BeRj0H+8rQkhfz0u0HV1S87lJFhPoJt3dmi4fZMA/zSZe/DlMrHaNjtYPljRULj5MFXqaf7E3Hq/fw08UDGSWax21POQSa8XclVg7KzfWxVYmshfjcs6LRRfThIypQOkKVntJL4Is/OJBgn1hWX6Qdac5DZ9PgWjEzwT3YGUq391A2kMHA2PDzC50yhBm9h2Xc2eZFwbe43e7rEpIignKKXJBl1PAaeykg6+pdn/yO2XRnT3vm113EMUOLzC7uuiu+FWtgIYqdTq5y4VxzH2ROsciOlrI+Dj6pEPoGM5noLcCJFjOe5xUi0lLKb8G+RZ1oU7ZRC6HNho36CrxtftKrj63Its2rGe4zNDjuSX/jEVnm9Sx3XlgDTMDQ0ane08hbc6QI2Ectq7Vd5sK4smnorFkwryztBM2EgYkwl7LhPNvU4cHSmjEX7JEDm3O6LItnXScS5tvqO9Skg2+ck8h3/zTwdgU7i/bTPKlQa6Pp27TRdNTnWErzZfS+5uBs1yIy670m/UzDfWAebOjfmlvbe1uuwTfVtZ+i4513vKFYaQlcQkYOtTIlbLJWvh193a65Sgd4a9w9s/NZLYQqQwvRizCUPCiroZ0E5TyO8VwO+4QF5bgsgjc4xx5T6N24kogvvOLyjbn+mTlBEFwittch9UgjuVmwPCwEW15hToi8dejdeVQVNWzS8M3nTzm2FFapMltLmjb7tLD5/I5jUsTxcA6wd7MM6evmFdIOPlR8qBep2e1bk5Z+VZV1PDvevHBZw5WwEMkpxT6dzMFtspyx3veh79H9r0d6OyPFo2Scrq+MtAZOwR+RR/nCTMaSLEGJshI4ZD4zNVAybbPO5vvhi/3+3VtyR5lygdZ3YBnQm1lU89WMPFvhNpHfMgrnkMUPuFEf92HTSBMiu0Pmd9PSBr5lrRwf6TFDRzuu8tCL/zhQkAztEPUQ8fRWnEfGMumTz7o7/nicNK/ggQukYHzM9HSoHf4rB9k8QWRigMvVvwuEMQJiRi5ywZEW3Q2dVq5uOPfopXXWf2bKpfnsgF65CHEMijthagbMOWeOIwoapgkPrsWGI72FnczqGBYp7Eec4oz5jzrURmK464SbB9gaAGtJbdEatDHbzE1lmyEfZDd3kDgzfCPIMpANoX9yphuqYvydJkZ59To3IIeK1NamOaEbYVO3/pDMQJeNDaMBkLkriNJSMZqTHnH2IQj5fkKZI4JmxKmcmrNLkuxhH45Riy0JSs3sNcLCo894+sNBxOqjLoMV8SKvQR++7jz9FjQkh5tIwR8pPJcUYDP6KpuuIpgjCUU9Efa2STZukMqwfOSDeAy9+8iNLKpCw9crHn8W3+PQNkqrkZGu0yjBJrqOE4oyUQkiQfGgbhubJMvVQ5x4hCpJFZTetWp4tpRTsQJHF13kFieUReVA+6SPc5/oFmT18q4CqNgrRYK1xCAou95UztNBsGsNY31lrF2KAHe8pC1Z4UpUZOj/KLNeINPQInWP1C3flSiUTaOIlT2wudxpJsVJXVvSGmI2Kli9rmqYyhQLRdxkDE3ogeHfgVnyUsYKYFy9Iqs3q9dcDpvWSGKJlcm3yeG6xVQRMc5P0BWU+SsKnYbe4SfZbG75JA5tF/JVViho3oJowQGhGvaOJHrox/i4zhWmtR4zYIjdBHK0HEfiPh6uo4ruUjJnidANvBH3nTbTZEpVVGNTAI5C9pMcOBkiQooN5+VEufPgd2JzVr6lgDTn8gTFAM6vuj+NZ7lrTWJUw6ReCuWZW4hAYMnOlQxCAYauWtZuTpuCSCoNQHPP2zy4A/Z1XU7QSCw4APStDE3DotiWji/frdXyTlfHUwoAJHSBA/1KHoaMZ/Q4Bbs9Dv9qlhmy6Vm5susoY5elaIQszftJlJLSHybdKBNWqGtfZhq62yei9ov7NKPyQQBKozDKscio0/DII7zmdtmmDtmZ+GXvShSpLzG0mO95j8me396jx4dPn3/74PDZL6np5YPR7v09doV8drmn/iV0hUgSKY1oEurkn7/H/pIC6vSreWVnjBVqNmWj1OvkjwMYaWbARWY83FeQtGUapWX7TTj3+PR/vHh49/69lw8OH94deL2ZDM0ODTZI+ywO0GJxUB1cqFvijsYUOxoHhjYSzpce+D4eQs9jbrIq+l/c6B2WUzJGstl77pns+VpyzmXgE/9EMj4yIbVFcL+D9eaKeXhfjvYeMgi5domo+Kmc/AMvb+Aoq5WhTEOYPTj4P62HhuIqdlOYdYeBKg6cMHWU/lKs45oAqjlbfaJuEEpaKcpCMGg7ntHfJt10ybzOzs7tcGboP/XeP3YzoH3cahaWR7xsmk/Ovsye1Bhct5ObrWK7qVnO5KNW0JvS5U10dUtftcxirOiiCtWLPIETSneF9O5sVxE5l5xWFlzbBxdXAzBKSpzSh5OfWaC/OO/O32PAdfPvL+CSyQXoHI65srI5aWZgrrmQMPBJe+FGWlGcFTWGKLqz1SzhHbJskulrpPFoVi3yHJigiDsGyjgi0NzbMOz0f3xz9765+/z+d88ev/huaHfs9MdmPas2ZF0G9xr6fTDOEqEUfREy8L+BJbnk+qZws6GHDYN99LVdgUWLmUgfPzuSH2YbO8+VIKpxBpz/olUzR1ya7aEnDLfE5Mw0ZZ4/u/drgPY+t//wCHODZfzOHkjsL3w1Y4jBwAr2LHpXZf6lnU/GJr/3MIWBTOzh/Z8/tbn/i/23kGTpaPp1cX/uVG1oRxrcDTuTCfri/+3FioaJ2Pf3QXDPpdleYszcFdduEbE7V3C84IKt7Yz/Hd4yP4nGfOb70jn6uNueDcS2ZiNvm2P0bn7suko8SUnvkNJPjIkb9Tudaf3b55uXO1QaW1u31XR28zfJ1M3WSsDOU7e3Pm384/31//pv0uzWfz/bkxX3TYgipsCA7xoaqOCW2Y245bXyDRUWeYcdLPk78qMDP8/LEwxxj/BzQ+967wKjwL5W2JJALm2Ry5/SlHnSXNE36TnuvA+TeLnpt6GTdpv3qeshQDMDVfaLyzB0280H1sCTEIzvGhUxk3IqfbKdnetlDJ1bqDZ/+fMkbpcaeH2LbLWyJ5lhX2JendD/j19n4xmd7T3Ijv2knlNAgSHCfPjHr6uNMIGj0YEbPd+94YQvz3qfRehgYXk//QE9EzOhK5vRPc64rrLBlB2z3lRLThqXPDaYfS+UR0i1WPRSWCS6HPE4654yf/fm32cF5PzBP7+4Csh9xwpgPSMIuapzW7f1PB4xwA2PZ9McDXxUXiT1D6k2J5BoJv2SxC2keYqJ9VOeNb/OTpZgzURrm+/bFDurTEp0Muj9eTadVXM0uQVGN8/htrfllKO7T+5+++DZk+/Mk8cvv3m4F8A2kTXSzKkMDe3XXtY67Jkp9iQk0bp+GKLmf1/Luguu8+uyvpcO2FRkbRzZnTUfz/iFlL5GFPkne7fSTIZGAZGd1+sPO6rwksRgvIZitZgMUDQtSAk+7i64tOpOV61Qvpxl2/dzAwa+qTOyX3u5XJ6lBqE9Q85ISC4TEg2dT7Xj13VJzlcESN+7hb7cfwPf/rNmTTLgeeL25TzFDQcA70YGeM+TIc+4N37gm2BwWErzwNSQlRv/5eYNrlrp19cIJ9BRe6MxtIvgAlHMgNPMRsrwva9BlwxMDdH1iGsXU/DwBFTprOa6QzRTtdTxch9UxV3So5BQLdBoyFwE9h8U6NslNjbJ/evYA/fQgE8xeYDWlDxrbR9xsgeRu0GqB8bfzzwb2xjPODL22FGt88wizMlgJgjvAjle5E6vNJiWxkKPvfNWHAgZXOEJTTK2rMcwIeWmRCbIKYT7Ut8sx3QXj0H272yKPDA1Ir3vqBoHloKYR7qZMvs1uKkCqST6l9oAl84EZa18ZppZcmtIq3AmqeWOJTU/VbHtSN2kkwIcpP3peulGaaBEAkoT7pJvQY/KUPYz/D6lcwiQWxlO6e7Kddy3TUy1mrAzaYq1CvMqweRDN/TaLouqxHCjYj+Hm+rCYSovSAqRMYxHkTAZqLBVdts4tlSeJOeqVUUHGhejwzlNye+Fb8YTUaVHMmHDd0UvK9M2F5WStAmh/u8mTXJd32LSKG22F5s2E9EQ9Td+PQbbTMXzNnEHrXtwJhNgFqPwRVlEcuUYN6vJpiJpKjOZiYs8PrNtgOO75XpkdF9D7+2ReIhnashJShnvuPDcMXzrZ3Hx6e09hZGqZvoSf7pBZh3LEpNORyaFye1wa5hii3GvrHfiBTSHEX3xwo+EduzK2APmSMaUn7JCTMzSwhj7IEx9wjr03iTzYln/+PFBvCne6IXFZVa1FWZH6BOWzDoTzO3pj3ZS7tylMEe2XwnT/8g4C6eG56A+S3R2KPwD87LIoUOZ2Hik75k50lRhL1ResbgC/guYBN2rc+xO3SLuj0ztTfTMli5FRUNENI9stRtKrGPUY3WZ8kV6tyzIwhkbt68cKb/e1i/oth598/AXxtOyHyOJf+WW+WCF/s/fN62wf4X+QN3yUmzz0DCdpwzkRDZgo02MTNbpWGNrx/B1eP8umTLJKwgcDvMEpm6IFtwY+tP4Nc+tiYf7+ZpdabUzPetwJwf2Yk3OcITg1mdvC/ovv3lw78HhwwcDa5RDTLb9cNJ0yZyn5eFqTdIVO7SZUMd8T83+HroC3KfoGfmGlqlf0MI92iqd783acaX840m1qFcthThAHFeT8etG5uf+2/82127+Zujy8rd2tqIwcu5HO+7dSoIcFhnVwUvL3+ZlritFQecsZ6VLgerMLEG4PfTt6Wr9Bk7FzM5zuqvZ0HVNKQqajc4ZGg9dVUPDgA5CxY+3wo9f8o8D397jOKWxB0ulHk6mM3Jskda+nsjoZvVQUwrgj7utbJ8cmJclEvjNqprJzKne3irz8XsPsP0EXPJ5VkhOCfTPBshtKaKgAvXubTri07eBNTp1IQyEvXNmzePjnzy59BNM2qObOv3Rw49HjhG7Z5wpDxIBaZQNjWQybqV3DuYBy/TLiMPnrVSluuMp+odtJhOjW9rJRugfaM9WWJSVch3RFXUhAoK6MyzcfPxv/8vckjEq18xitjZffiJ3d6QpOobuG8h9VegEYWyb3xFwcAdqJR5rc4lQBtyC2A6SPO3tq3lklFwdFX/6M09vQImm4ek3pqhA+s2XOP1h6EzfvlA1dhuz8Pvp/4fsaZHO2uENaSRfnowtCPN3rn32KcpVTPC+7pnFE2Vwd4hHX2/XriEJMoUj5cOaxIN1eN4OZ/CH3uyjuJtt4DTFjFQQQz2lk+jxs6N+CJL0Np7R1zV4jHCfR+rYPULPJdbV663RVpcon7JqwvwKHkbDJVa0nu2ChPU+3Cobr+XGFidPkVfb/Paja9e+vHoLj/Wafr71xQ1NIy5OvrVLenVdLfCeG5/hLcv85PU6/EqytK6K8DueP/z2OrMTrNPn13nVXlXVOvr1hAw2fnVpIXdrV3DZScM/TKoxa71/+P8BUEsBAhQACgAAAAgAAAAhUPBKwn/4AAAALAIAABMAAAAAAAAAAAAAAAAAAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwECFAAKAAAACAAAACFQm/036q0AAAApAQAACwAAAAAAAAAAAAAAAAApAQAAX3JlbHMvLnJlbHNQSwECFAAKAAAACAAAACFQlL0mVqsAAAAaAQAAHAAAAAAAAAAAAAAAAAD/AQAAd29yZC9fcmVscy9kb2N1bWVudC54bWwucmVsc1BLAQIUAAoAAAAIAAAAIVBbW57qeQEAAIUDAAAPAAAAAAAAAAAAAAAAAOQCAAB3b3JkL3N0eWxlcy54bWxQSwECFAAKAAAACAAAACFQifP5ZvpfAAB4EwIAEQAAAAAAAAAAAAAAAACKBAAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAUABQBAAQAAs2QAAAAA',
       docx_filename = '02_Ramowa_umowa_posrednictwa_na_odleglosc_Finance_You_v7.docx',
       allows_investor_fees = true,
       updated_at = now()
 where code = 'umowa_ramowa'
   and version = 'v7'
   and package_id = 'FY-LEGAL-2026-09-29';

-- nda v6: content sha256 822131729ad457da06c78c2b514126c50469a03f17944983c02d02969371326d
--   docx sha256 a9f3eea7ded46ab16470f87cdf6debd8e2869a63057e6b9f2f739b162c84eef3
--   poprzednia treść: 0730df56392cd49c28019fd98cb4b00237d811ee04355f7aed0baa046b73f581
update public.legal_documents
   set sha256 = '822131729ad457da06c78c2b514126c50469a03f17944983c02d02969371326d',
       content_text = 'PAKIET UMOWNY
Umowa o zachowaniu poufności i zakazie obchodzenia
Ochrona danych klientów, nieruchomości, modeli finansowania i relacji handlowych
Wersja
FY-LEGAL-2026-09-29.v6 • 29 września 2026 r.
Zakres
Finansowanie zabezpieczone hipoteką wyłącznie na cel związany z działalnością gospodarczą
Forma
papierowa, kwalifikowany podpis elektroniczny albo forma dokumentowa w systemie z pełnym śladem audytowym
zawarta w formie dokumentowej na odległość albo podpisana w dniu wskazanym przy podpisach, pomiędzy:
FINANCE YOU
Finance You spółka z ograniczoną odpowiedzialnością z siedzibą w Warszawie, ul. Nowogrodzka 31, 00-511 Warszawa, wpisana do rejestru przedsiębiorców KRS pod numerem 0000635207, NIP 7010611803, REGON 365350668, kapitał zakładowy 389 600,00 zł, reprezentowana przez Filipa Roberta Bielaka – Prezesa Zarządu uprawnionego do samodzielnej reprezentacji, dalej: „Finance You” lub „Ujawniający”;
a
INWESTOR / ODBIORCA INFORMACJI
Wariant strony
☐ osoba fizyczna  ☐ osoba fizyczna prowadząca działalność  ☐ osoba prawna / jednostka organizacyjna
Imię i nazwisko / firma
________________________________________________________________
Adres / siedziba
________________________________________________________________
PESEL albo KRS
________________________________________________________________
NIP / REGON
________________________________________________________________
E-mail i telefon
________________________________________________________________
Reprezentacja
________________________________________________________________
dalej: „Inwestor” lub „Odbiorca”; Finance You i Inwestor dalej łącznie: „Strony”, a każdy z osobna: „Strona”.
Preambuła
Finance You prezentuje inwestorom, na ich indywidualne zlecenie, projekty finansowania zabezpieczonego hipoteką, przeznaczone wyłącznie na cel związany z działalnością gospodarczą klienta.
W toku oceny projektu Inwestor może uzyskać informacje umożliwiające identyfikację klienta, właściciela nieruchomości, osób z nimi związanych, nieruchomości i planowanej transakcji.
Strony chcą chronić te informacje oraz uniemożliwić wykorzystanie relacji przedstawionej przez Finance You z pominięciem procesu transakcyjnego, zabezpieczenia i zapłaty prowizji należnej Finance You od klienta.
Pełne dane identyfikujące są udostępniane dopiero po skutecznym związaniu Inwestora niniejszą Umową, umową pośrednictwa oraz właściwą umową dotyczącą danych osobowych.
Zasada dostępu.  Samo podpisanie NDA nie uprawnia do danych klienta. Każde ujawnienie identyfikujące wymaga aktywnej umowy pośrednictwa, akceptacji Karty Leada i spełnienia warunków ochrony danych.
§ 1. Definicje
Informacje Poufne oznaczają wszelkie informacje ujawnione Inwestorowi przed zawarciem albo w okresie obowiązywania Umowy, niezależnie od nośnika i oznaczenia, w szczególności dane osobowe, dane kontaktowe, numery ksiąg wieczystych, adresy i dokumentację nieruchomości, operaty i wyceny, dokumenty finansowe i prawne, strukturę transakcji, warunki cenowe, treść negocjacji, dane użytkowników, logi systemowe, algorytmy oceny, procedury, know-how, wzory umów oraz informacje o klientach, inwestorach i partnerach Finance You.
Projekt oznacza możliwe finansowanie zabezpieczone hipoteką, przedstawione przez Finance You pod unikalnym identyfikatorem.
Klient Chroniony oznacza klienta, właściciela nieruchomości, dłużnika, poręczyciela, spółkę celową lub inną osobę powiązaną z Projektem, której tożsamość albo dane pozwalające na jej rozsądne ustalenie Inwestor poznał dzięki Finance You.
Ujawnienie Identyfikujące oznacza pierwsze udostępnienie danych, które samodzielnie albo łącznie z informacjami dostępnymi Inwestorowi pozwalają zidentyfikować Klienta Chronionego lub konkretną nieruchomość. Moment Ujawnienia Identyfikującego wynika w pierwszej kolejności z rejestru systemowego i Karty Leada.
Grupa Inwestora oznacza Inwestora oraz każdą osobę działającą bezpośrednio lub pośrednio na jego rzecz, na jego zlecenie, w jego interesie albo z jego udziałem, w tym spółkę obecną lub przyszłą, SPV, wspólnika, członka organu, pełnomocnika, beneficjenta rzeczywistego, osobę bliską, współinwestora, cesjonariusza, fundusz, powiernika, administratora hipoteki lub zabezpieczeń oraz podmiot powiązany kapitałowo, osobowo, rodzinnie lub kontraktowo.
Osoba Upoważniona oznacza pracownika, członka organu, doradcę prawnego, podatkowego, finansowego, rzeczoznawcę, notariusza lub współinwestora, który musi znać Informacje Poufne dla oceny Projektu, został ujawniony Finance You w zakresie wymaganym Kartą Leada i jest związany obowiązkiem ochrony co najmniej równoważnym z Umową.
Umowa Pośrednictwa oznacza ramową umowę pośrednictwa finansowego świadczonego na odległość zawartą między Stronami wraz z Kartami Leadów.
Prowizja od Pożyczkobiorcy, Transakcja Chroniona, Suma Hipoteczna i Naruszenie Obejściowe mają znaczenie nadane im w Umowie Pośrednictwa. Ekonomiczny ciężar Prowizji od Pożyczkobiorcy ponosi klient, a nie Inwestor; Inwestor wykonuje jedynie obowiązki wynikające z Mechanizmu Zabezpieczenia Prowizji.
Kara Obejściowa oznacza karę umowną równą 5% Sumy Hipotecznej, zastrzeżoną za naruszenie niepieniężnego zakazu obchodzenia Finance You; nie jest ceną ani wynagrodzeniem za usługę dla Inwestora.
Forma dokumentowa obejmuje oświadczenie utrwalone w sposób pozwalający ustalić osobę składającą oświadczenie, w szczególności akceptację w koncie użytkownika, wiadomość e-mail, plik PDF, kwalifikowany podpis elektroniczny albo podpis własnoręczny.
§ 2. Cel i dozwolone wykorzystanie
Finance You ujawnia Informacje Poufne wyłącznie w celu oceny, negocjowania, przygotowania i ewentualnego wykonania konkretnego Projektu zgodnie z Umową Pośrednictwa.
Inwestor może wykorzystać Informacje Poufne tylko w zakresie koniecznym do tego celu. Zabronione jest wykorzystywanie ich do marketingu, profilowania poza Projektem, tworzenia własnej bazy leadów, wzbogacania danych, szkolenia modeli, pozyskiwania innych klientów, działalności konkurencyjnej albo jakiegokolwiek celu sprzecznego z interesem Klienta Chronionego lub Finance You.
Ujawnienie nie stanowi oferty, rekomendacji inwestycyjnej, zapewnienia o zawarciu transakcji, przeniesienia praw własności intelektualnej ani licencji poza ograniczonym prawem do zapoznania się z informacjami na potrzeby Projektu.
Inwestor nie może podejmować zautomatyzowanych prób pobierania danych, scrapingu, omijania kontroli dostępu ani łączenia danych z zewnętrznymi zbiorami w celu ponownej identyfikacji osób lub nieruchomości ujawnionych anonimowo.
§ 3. Obowiązki ochronne Inwestora
Inwestor zobowiązuje się:
zachować Informacje Poufne w ścisłej poufności i stosować co najmniej środki przewidziane w umowie dotyczącej danych osobowych oraz Karcie Leada;
ograniczyć dostęp do Osób Upoważnionych zgodnie z zasadą niezbędnej wiedzy i odpowiadać za ich działania jak za własne;
korzystać wyłącznie z imiennego konta, silnego uwierzytelniania i urządzeń zabezpieczonych przed dostępem osób nieuprawnionych;
nie udostępniać loginów, plików, wydruków, zrzutów ekranu, linków ani kopii osobom nieuprawnionym;
niezwłocznie, nie później niż w ciągu 12 godzin od wykrycia, zgłosić Finance You utratę, ujawnienie, nieuprawniony dostęp albo podejrzenie naruszenia;
na żądanie przedstawić listę kategorii Osób Upoważnionych i potwierdzenie ich zobowiązań do poufności, bez naruszania tajemnicy zawodowej;
nie usuwać znaków wodnych, identyfikatorów, metadanych bezpieczeństwa ani innych oznaczeń źródła dokumentów.
Inwestor odpowiada za dobór i legalność narzędzi, usług chmurowych oraz kanałów komunikacji używanych poza systemem Finance You.
Bez uprzedniej zgody Finance You Inwestor nie może przenosić Informacji Poufnych poza Europejski Obszar Gospodarczy ani udostępniać ich podmiotowi, który przetwarza je w państwie trzecim.
§ 4. Wyjątki i ujawnienie wymagane prawem
Obowiązek poufności nie obejmuje informacji, co do których Inwestor wykaże dokumentami, że:
były publicznie dostępne bez naruszenia Umowy;
znajdowały się legalnie w jego posiadaniu przed ujawnieniem przez Finance You i nie były objęte obowiązkiem poufności;
zostały niezależnie opracowane bez wykorzystania Informacji Poufnych; albo
zostały zgodnie z prawem uzyskane od osoby trzeciej uprawnionej do ich ujawnienia.
Jeżeli ujawnienia wymaga bezwzględnie obowiązujące prawo, prawomocne orzeczenie lub żądanie uprawnionego organu, Inwestor — o ile prawo na to pozwala — zawiadomi Finance You przed ujawnieniem, ograniczy zakres do niezbędnego minimum oraz podejmie rozsądne działania w celu zachowania poufności.
Ciężar wykazania zastosowania wyjątku spoczywa na Inwestorze. Fakt ujawnienia części informacji publicznie nie znosi ochrony niepublicznego zestawienia, kontekstu ani powiązania danych z konkretnym Projektem.
§ 5. Zakaz obchodzenia Finance You
Przez okres ochronny wynikający z Umowy Pośrednictwa, nie krótszy jednak niż pięć lat od Ujawnienia Identyfikującego, Inwestor nie może doprowadzić, pośredniczyć, pomagać ani umożliwić Grupie Inwestora zawarcia z Klientem Chronionym Transakcji Chronionej bez uprzedniego zastosowania Mechanizmu Zabezpieczenia Prowizji określonego w Umowie Pośrednictwa.
Zakaz obejmuje w szczególności bezpośrednie lub pośrednie finansowanie, refinansowanie, przejęcie albo nabycie wierzytelności, ustanowienie hipoteki na rzecz Inwestora lub dowolnego członka Grupy Inwestora, wykorzystanie administratora hipoteki lub zabezpieczeń, powiernika, cesjonariusza, SPV, współinwestora albo ekonomicznie równoważnej konstrukcji.
Kontakt bezpośredni z Klientem Chronionym jest dopuszczalny wyłącznie dla należytej oceny lub realizacji Projektu, z zachowaniem obowiązków raportowych z Umowy Pośrednictwa. Inwestor nie może jednak zawrzeć ani wykonać Transakcji Chronionej, dopóki w jej dokumentacji nie zostanie skutecznie zabezpieczona Prowizja od Pożyczkobiorcy oraz sposób jej bezpośredniego przekazania Finance You z wypłacanej kwoty.
Wpis, wzmianka, wniosek wieczystoksięgowy, oświadczenie o ustanowieniu hipoteki, dokument finansowania, przepływ środków lub uzyskanie korzyści przez Klienta Chronionego mogą stanowić dowód Transakcji Chronionej i naruszenia zakazu obchodzenia; wpis w księdze wieczystej nie jest jedynym warunkiem naliczenia Kary Obejściowej.
Szczegółowe przesłanki Naruszenia Obejściowego, sposób ustalenia Sumy Hipotecznej i termin zapłaty Kary Obejściowej określa Umowa Pośrednictwa i właściwa Karta Leada. Pełne Ujawnienie Identyfikujące nie powinno nastąpić przed związaniem Inwestora wymaganymi dokumentami i przekazaniem mu rzeczywistych warunków Prowizji od Pożyczkobiorcy.
§ 6. Zwrot, usunięcie i zachowanie dowodów
Po odrzuceniu Projektu, wygaśnięciu rezerwacji, żądaniu Finance You albo ustaniu celu przetwarzania Inwestor niezwłocznie zaprzestanie korzystania z Informacji Poufnych i w terminie 14 dni zwróci je lub bezpiecznie usunie ze wszystkich aktywnych systemów i urządzeń, z zastrzeżeniem obowiązków prawnych oraz kopii zapasowych rotacyjnie nadpisywanych.
Na żądanie Inwestor złoży potwierdzenie usunięcia w formie dokumentowej, wskazując zakres danych, datę i osobę odpowiedzialną.
Inwestor może zachować wyłącznie minimalny, odseparowany zestaw dowodowy wymagany prawem lub niezbędny do obrony roszczeń, bez prawa dalszego wykorzystania operacyjnego. Finance You może zachować logi ujawnienia, akceptacje i dane konieczne do wykazania źródła relacji oraz dochodzenia Prowizji od Pożyczkobiorcy, Kary Obejściowej lub odszkodowania.
Usunięcie Informacji Poufnych nie narusza obowiązków, które ze swojej natury obowiązują po zakończeniu Umowy.
§ 7. Odpowiedzialność i kary umowne
Inwestor odpowiada za szkodę wynikającą z naruszenia Umowy na zasadach ogólnych, w tym za uzasadnione koszty zabezpieczenia dowodów, obsługi incydentu, zawiadomień, audytu i dochodzenia roszczeń.
Jeżeli Inwestor nie jest Konsumentem ani osobą objętą ochroną właściwą konsumentowi, za każde zawinione naruszenie obowiązku poufności, ograniczenia celu, zabezpieczenia danych, zakazu nieuprawnionego ujawnienia lub usunięcia znaków wodnych zapłaci Finance You karę umowną w wysokości 50 000,00 zł.
Za Naruszenie Obejściowe, za które Inwestor odpowiada, polegające na zawarciu, doprowadzeniu do zawarcia lub wykonaniu Transakcji Chronionej bez skutecznego Mechanizmu Zabezpieczenia Prowizji, Inwestor zapłaci Finance You Karę Obejściową równą 5% Sumy Hipotecznej. Zamiar obejścia nie jest wymagany. Kara zabezpiecza obowiązek niepieniężny powstrzymania się od obchodzenia Finance You; nie jest wynagrodzeniem za usługę i nie dolicza się do niej VAT, o ile bezwzględnie obowiązujące przepisy nie nakazują innej kwalifikacji.
Późniejsza zapłata Prowizji od Pożyczkobiorcy nie usuwa automatycznie już powstałej Kary Obejściowej, chyba że Finance You wyraźnie zrzeknie się jej w formie dokumentowej. Kara nie zwalnia Klienta z Prowizji od Pożyczkobiorcy ani Inwestora z dalszego wykonania obowiązków niepieniężnych.
Kary są płatne w terminie 7 dni od doręczenia wezwania. Finance You może dochodzić odszkodowania przewyższającego karę, jeżeli szkoda jest wyższa. Zapłata kary nie uprawnia do dalszego naruszania Umowy.
Stałej kary 50 000,00 zł za zwykłe naruszenie poufności nie stosuje się do Konsumenta. Kara Obejściowa może zostać zastosowana wobec Konsumenta wyłącznie po jej rzeczywistym, indywidualnym uzgodnieniu przed Ujawnieniem Identyfikującym, w odrębnym oświadczeniu zawierającym sposób obliczenia i przykład kwotowy; w przeciwnym razie odpowiedzialność Konsumenta ustala się na zasadach ogólnych.
§ 8. Okres obowiązywania
Umowa obowiązuje od chwili jej zawarcia i może być wypowiedziana w formie dokumentowej z 30-dniowym okresem wypowiedzenia. Wypowiedzenie nie uprawnia do dalszego korzystania z wcześniej ujawnionych danych.
Obowiązek ochrony zwykłych Informacji Poufnych trwa przez dziesięć lat od ich ujawnienia. Ochrona tajemnicy przedsiębiorstwa trwa tak długo, jak informacja zachowuje taki charakter, a ochrona danych osobowych — do ich zgodnego z prawem usunięcia lub anonimizacji.
Zakaz obchodzenia i obowiązki dotyczące Projektów ujawnionych przed rozwiązaniem Umowy trwają przez okres ochronny przypisany do właściwej Karty Leada, co do zasady pięć lat od Ujawnienia Identyfikującego.
§ 9. Zmiana osoby fizycznej na spółkę lub inny podmiot
Udostępnienie konta, informacji lub Projektu spółce wskazanej przez osobę fizyczną wymaga uprzedniego podpisania przez tę spółkę oświadczenia o przystąpieniu oraz zaakceptowania wymaganych umów dotyczących pośrednictwa i danych osobowych.
Wskazanie spółki, SPV, funduszu, wspólnika lub innej jednostki nie zwalnia pierwotnego Inwestora z obowiązków powstałych przed ani po takim wskazaniu, chyba że Finance You wyraźnie zwolni go w formie dokumentowej. Do czasu zwolnienia odpowiedzialność podmiotów przystępujących jest solidarna w dopuszczalnym prawem zakresie.
Jeżeli spółka nie przystąpi do Umowy, Inwestor nie może ujawnić jej Informacji Poufnych ani wykorzystać jej do zawarcia Transakcji Chronionej. Działanie takiej spółki przypisuje się Inwestorowi na potrzeby zakazu obchodzenia.
Zmiana danych, formy prawnej, nazwy, siedziby, reprezentacji, beneficjenta rzeczywistego lub podmiotu finansującego wymaga zgłoszenia Finance You w terminie 2 dni roboczych.
§ 10. Postanowienia końcowe
Umowa podlega prawu polskiemu. Postanowienia nie ograniczają dalej idącej ochrony wynikającej z przepisów o tajemnicy przedsiębiorstwa, danych osobowych, prawach autorskich ani czynach nieuczciwej konkurencji.
Zmiana Umowy wymaga formy dokumentowej, chyba że bezwzględnie obowiązujące prawo wymaga formy surowszej. Zmiana Karty Leada nie może być domniemana z milczenia Inwestora.
Bez uprzedniej zgody Finance You Inwestor nie może przenieść praw ani obowiązków z Umowy. Finance You może przenieść wierzytelność pieniężną, informując o tym Inwestora, z poszanowaniem przepisów konsumenckich i o ochronie danych.
Nieważność lub bezskuteczność części postanowienia nie narusza pozostałej części Umowy. Strony zastąpią wadliwe postanowienie rozwiązaniem zgodnym z prawem i możliwie najbliższym jego gospodarczemu celowi.
Spory z przedsiębiorcą będą rozpoznawane przez sąd właściwy dla siedziby Finance You, o ile uzgodnienie właściwości zostało utrwalone w formie wymaganej przez prawo procesowe; w przeciwnym razie właściwość wynika z przepisów ogólnych. Wobec Konsumenta i osoby korzystającej z ochrony konsumenckiej właściwość sądu ustala się wyłącznie według przepisów bezwzględnie obowiązujących.
Załącznik nr 1 stanowi integralną część Umowy. Umowa została udostępniona Stronom na trwałym nośniku.
________________________________
________________________________
FINANCE YOU — imię, nazwisko, funkcja / podpis / data
INWESTOR / ODBIORCA — imię, nazwisko, funkcja / podpis / data
ZAŁĄCZNIK NR 1
Przystąpienie spółki lub innego podmiotu do NDA
Stosować przed udostępnieniem danych podmiotowi innemu niż pierwotny Inwestor.
DANE PRZYSTĘPUJĄCEGO PODMIOTU
Podmiot przystępujący
Firma: ______________________________  KRS / rejestr: ______________________________
Adres i NIP
________________________________________________________________
Reprezentacja
________________________________________________________________
Pierwotny Inwestor
________________________________________________________________
Identyfikatory Projektów
________________________________________________________________
Wersja NDA / SHA-256
FY-LEGAL-2026-09-29.v6 / ____________________________________________________________
Data skutku
________________________________________________________________
§ A. Oświadczenia przystępującego podmiotu
Podmiot przystępujący potwierdza otrzymanie i akceptację Umowy o zachowaniu poufności i zakazie obchodzenia w wersji wskazanej w śladzie audytowym.
Podmiot przystępuje do wszystkich obowiązków Odbiorcy dotyczących Projektów wskazanych powyżej i Informacji Poufnych poznanych bezpośrednio lub pośrednio od pierwotnego Inwestora.
Podmiot przyjmuje do wiadomości, że przystąpienie nie przenosi automatycznie praw do konta ani danych osobowych. Dostęp wymaga odrębnej autoryzacji Finance You i przyjęcia aktualnych dokumentów dotyczących pośrednictwa oraz danych.
Podmiot przystępujący i pierwotny Inwestor odpowiadają solidarnie za obowiązki możliwe do objęcia solidarnością; Finance You nie zwalnia pierwotnego Inwestora, o ile nie uczyni tego wyraźnie w formie dokumentowej.
________________________________
________________________________
PODMIOT PRZYSTĘPUJĄCY — imię, nazwisko, funkcja / podpis / data
PIERWOTNY INWESTOR — imię, nazwisko, funkcja / podpis / data
Akceptacja Finance You: ____________________________________   data: ____________________',
       docx_base64 = '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',
       docx_filename = '01_NDA_i_zakaz_obchodzenia_Finance_You_v6.docx',
       updated_at = now()
 where code = 'nda'
   and version = 'v6'
   and package_id = 'FY-LEGAL-2026-09-29';
-- <<< PAKIET v7

-- 2. Regulamin klienta v3.
-- >>> REGULAMIN KLIENTA v3 (generowane: npx tsx scripts/legal/build-zgody-v3.ts)
insert into public.consent_documents (kind, title, content, version, is_active)
select 'terms'::public.consent_kind, 'Akceptuję regulamin klienta',
'# REGULAMIN PLATFORMY FINANCE YOU

## dla użytkowników składających wniosek o pożyczkę lub poszukujących finansowania

**wersja 3 — obowiązuje od dnia 30 września 2026 r.**

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

15. **Prowizja Finance You** (prowizja od pożyczkobiorcy) – jedyne wynagrodzenie Finance You należne od Klienta, wyłącznie w przypadku skutecznego zorganizowania finansowania: 7% Kwoty Udzielonej, nie mniej niż 5 000,00 zł, bez VAT, potrącane z wypłaty finansowania, określone w § 12 Regulaminu.

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

6. Regulamin w wersji 3 obowiązuje od dnia 30 września 2026 r. Do spraw rozpoczętych przed tym dniem stosuje się § 28 ust. 4.

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
  3, true
where not exists (
  select 1 from public.consent_documents
   where kind = 'terms'::public.consent_kind and version = 3
);

update public.consent_documents
   set is_active = false
 where kind = 'terms'::public.consent_kind and version < 3 and is_active;
-- <<< REGULAMIN KLIENTA v3

notify pgrst, 'reload schema';
