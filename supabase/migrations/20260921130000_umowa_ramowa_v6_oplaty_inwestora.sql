-- =====================================================================
-- UMOWA RAMOWA v6 — model rozliczenia dopasowany do cennika Podstawowy/PRO.
--
-- Zmiana wobec v5 (FY-LEGAL-2026-09-04.v5): usługa pośrednictwa przestaje być
-- bezwarunkowo nieodpłatna dla Inwestora. Wprowadzone zostają:
--   • Pakiet Podstawowy — bez opłat stałych, Opłata za Udostępnienie Okazji
--     (1 500,00 zł) należna przed Ujawnieniem Identyfikującym Projektu,
--   • Pakiet PRO — Opłata Abonamentowa 3 000,00 zł / 180 dni oraz Opłata
--     Sukcesu 5% Kwoty Udzielonej, wymagalna w 7 dni od zawarcia umowy
--     Finansowania,
--   • Załącznik nr 8 — Cennik Pakietów (łączna cena Opłat, zasady zwrotu,
--     tryb zmiany cennika z 14-dniowym wyprzedzeniem).
-- Bez zmian: Prowizja Klientowska 7% / min 5 000 zł obciążająca KLIENTA,
-- Mechanizm Zabezpieczenia Prowizji, Kara Obejściowa 5% Sumy Hipotecznej
-- i pięcioletni Okres Ochronny.
--
-- Dokument wchodzi do rejestru jako nowa wersja tego samego kodu
-- (`umowa_ramowa`), więc akceptacje v5 NIE są dziedziczone: pakiet jest
-- kompletny dopiero po akceptacji v6 (porównanie wersji + SHA-256 w
-- `investor_legal_pack_complete`). Flaga `active` nie jest tu zmieniana —
-- aktywacją steruje administrator po przeglądzie kancelarii.
--
-- `allows_investor_fees = true` odblokowuje naliczanie Opłaty Sukcesu:
-- rekordy w `investor_success_fees` przestają powstawać ze statusem
-- `wstrzymana`. Do czasu aktywacji v6 obowiązuje v5 i opłata jest tylko
-- rejestrowana.
-- =====================================================================

insert into public.legal_documents
  (code, package_id, version, title, sort_order, sha256, content_text, docx_base64, docx_filename, allows_investor_fees, active)
values (
  'umowa_ramowa',
  'FY-LEGAL-2026-09-21',
  'v6',
  'Ramowa umowa pośrednictwa finansowego świadczonego na odległość',
  1,
    '5470620c34a97dafabeb8715654a728173cc1ac40220765df6612108241c64e1',
  'PAKIET UMOWNY
Ramowa umowa pośrednictwa finansowego świadczonego na odległość
Przedstawianie projektów finansowania gospodarczego zabezpieczonego hipoteką
Wersja
FY-LEGAL-2026-09-04.v6 • 21 września 2026 r.
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
Usługa pośrednictwa transakcyjnego na podstawie niniejszej Umowy jest odpłatna według Pakietu wybranego przez Inwestora: w Pakiecie Podstawowym Inwestor nie ponosi opłat stałych i płaci wyłącznie Opłatę za Udostępnienie Okazji za każdy Projekt, którego dane identyfikujące są mu udostępniane; w Pakiecie PRO Inwestor płaci Opłatę Abonamentową oraz Opłatę Sukcesu. Niezależnie od Pakietu Prowizja Klientowska jest należna Finance You od Klienta na podstawie odrębnej umowy i ma zostać zabezpieczona oraz przekazana z kwoty Finansowania zgodnie z dyspozycją Klienta; Opłaty Inwestora nie zastępują Prowizji Klientowskiej i nie zwalniają z Mechanizmu Zabezpieczenia Prowizji.
Strony chcą jednoznacznie ustalić zakres pięcioletniej ochrony relacji oraz Karę Obejściową równą 5% Sumy Hipotecznej za zawarcie lub wykonanie Transakcji Chronionej z naruszeniem niepieniężnego obowiązku zabezpieczenia Prowizji Klientowskiej i zakazu obchodzenia Finance You.
Strony wyłączają z zakresu Umowy finansowanie przeznaczone w całości lub części na cele konsumpcyjne oraz kredyt hipoteczny udzielany konsumentowi.
Finance You nie prowadzi publicznie dostępnego katalogu Projektów. Projekt jest przedstawiany wyłącznie jako wynik indywidualnego Zlecenia i wyłącznie Inwestorowi, który je złożył; w czasie rezerwacji nie jest przedstawiany innym inwestorom działającym na podstawie Zlecenia.
Model rozliczenia.  Inwestor płaci Finance You wyłącznie Opłaty wynikające z wybranego Pakietu i aktualnego Cennika zaakceptowanego przed zakupem: Opłatę za Udostępnienie Okazji (Pakiet Podstawowy) albo Opłatę Abonamentową i Opłatę Sukcesu (Pakiet PRO). Klient niezależnie płaci Prowizję Klientowską według odrębnej umowy, a Inwestor zabezpiecza jej bezpośredni przelew z kwoty Finansowania. Zawarcie lub wykonanie Transakcji Chronionej bez tego mechanizmu stanowi Naruszenie Obejściowe i uruchamia Karę Obejściową równą 5% Sumy Hipotecznej, niezależnie od zapłaconych Opłat.
§ 1. Definicje
Klient oznacza osobę fizyczną działającą w związku z działalnością gospodarczą, przedsiębiorcę, osobę prawną albo jednostkę organizacyjną poszukującą Finansowania na Cel Gospodarczy, a także właściciela nieruchomości, dłużnika, poręczyciela, spółkę operacyjną lub celową i inne osoby uczestniczące w Projekcie.
Cel Gospodarczy oznacza cel pozostający w bezpośrednim związku z działalnością gospodarczą lub zawodową finansowanego podmiotu, potwierdzony w Karcie Leada i dokumentacji Finansowania. Nie obejmuje celu konsumpcyjnego, zaspokajania prywatnych potrzeb mieszkaniowych ani kredytu hipotecznego w rozumieniu przepisów o kredycie hipotecznym.
Projekt oznacza zidentyfikowaną przez Finance You możliwość Finansowania, oznaczoną unikalnym numerem i opisaną w Karcie Leada.
Karta Leada oznacza załącznik transakcyjny dla konkretnego Projektu, zawierający co najmniej identyfikator, moment Ujawnienia Identyfikującego, okres ochronny, regułę Sumy Hipotecznej, wskazanie Pakietu Inwestora oraz Opłat należnych od niego za ten Projekt, rzeczywiste warunki Prowizji Klientowskiej, Mechanizm Zabezpieczenia Prowizji, Karę Obejściową wraz z przykładem kwotowym, zakres Grupy Inwestora, wynagrodzenie własne Inwestora od Klienta, konflikt interesów oraz sposób akceptacji.
Ujawnienie Identyfikujące oznacza pierwsze ujawnienie Inwestorowi danych, które samodzielnie albo łącznie pozwalają rozsądnie ustalić Klienta lub konkretną nieruchomość. Moment ten wynika z rejestru systemowego, potwierdzenia wiadomości albo Karty Leada.
Klient Chroniony oznacza Klienta poznanego dzięki Ujawnieniu Identyfikującemu oraz każdy podmiot przez niego kontrolowany, kontrolujący go, z nim powiązany lub użyty do zawarcia Transakcji Chronionej, jeżeli istnieje związek gospodarczy z Projektem lub relacją przedstawioną przez Finance You.
Grupa Inwestora oznacza Inwestora oraz każdą osobę działającą bezpośrednio lub pośrednio na jego rzecz, na jego zlecenie, w jego interesie albo z jego udziałem, w tym jego obecną lub przyszłą spółkę, SPV, wspólnika, członka organu, pełnomocnika, beneficjenta rzeczywistego, osobę bliską, współinwestora, fundusz, cesjonariusza, nabywcę wierzytelności, powiernika, administratora hipoteki albo zabezpieczeń oraz podmiot powiązany kapitałowo, osobowo, rodzinnie lub kontraktowo.
Finansowanie oznacza przekazanie pieniędzy, limitu, rzeczy, praw, odroczenia, gwarancji lub innej korzyści ekonomicznej, w szczególności na podstawie pożyczki, kredytu, refinansowania, faktoringu, wykupu lub cesji wierzytelności, subrogacji, obligacji, umowy inwestycyjnej, sprzedaży z prawem odkupu, leasingu zwrotnego albo konstrukcji o równoważnym skutku gospodarczym.
Transakcja Chroniona oznacza każde Finansowanie zawarte, udzielone, nabyte, refinansowane, odnowione, przedłużone, zwiększone lub ekonomicznie zrealizowane w Okresie Ochronnym między Klientem Chronionym a Inwestorem lub Grupą Inwestora, jeżeli jest zabezpieczone hipoteką na nieruchomości przedstawionej w Projekcie albo na jakiejkolwiek innej nieruchomości Klienta Chronionego lub osoby udostępniającej mu zabezpieczenie. Obejmuje także nabycie zabezpieczonej wierzytelności i finansowanie przez pośredni podmiot.
Suma Hipoteczna oznacza najwyższą kwotę pieniężną, do której hipoteka zabezpiecza lub ma zabezpieczać wierzytelności przypisane Inwestorowi lub Grupie Inwestora, wskazaną w oświadczeniu o ustanowieniu hipoteki, umowie Finansowania, wniosku wieczystoksięgowym, wzmiance albo wpisie. Jeżeli takiej kwoty nie da się ustalić, podstawą jest kwota Finansowania lub wartość korzyści ekonomicznej przypisana Inwestorowi. Jednej ekonomicznej ekspozycji zabezpieczonej łącznie na kilku nieruchomościach nie liczy się wielokrotnie, chyba że dokumenty ustanawiają odrębne lub dodatkowe limity zabezpieczenia.
Kwota Wypłacona Klientowi oznacza kwotę środków faktycznie przekazaną do swobodnej dyspozycji Klienta („na rękę”), bez części zatrzymanej lub potrąconej na prowizje, koszty i inne świadczenia, chyba że odrębna umowa z Klientem wyraźnie określa inną podstawę.
Prowizja Klientowska oznacza odrębne wynagrodzenie Finance You wynikające wyłącznie z umowy z Klientem i ekonomicznie obciążające Klienta, a nie cenę usługi świadczonej Inwestorowi. Standardowo wynosi 7% Kwoty Wypłaconej Klientowi, nie mniej niż 5 000,00 zł, chyba że odrębna umowa z Klientem przewiduje inną stawkę, minimum albo podstawę; w takim przypadku Karta Leada musi odzwierciedlać rzeczywiste warunki tej umowy.
Pakiet oznacza wariant odpłatności usługi wybrany przez Inwestora przed złożeniem Zlecenia: Pakiet Podstawowy albo Pakiet PRO, zgodnie z Cennikiem.
Cennik oznacza aktualny cennik Pakietów udostępniany Inwestorowi na trwałym nośniku przed zakupem i przed każdą Opłatą; stanowi Załącznik nr 8 do Umowy.
Pakiet Podstawowy oznacza wariant bez opłat stałych, w którym Inwestor może składać Zlecenia i otrzymywać teasery, a za udostępnienie danych identyfikujących konkretnego Projektu płaci Opłatę za Udostępnienie Okazji.
Pakiet PRO oznacza wariant odpłatny, w którym Inwestor płaci Opłatę Abonamentową za oznaczony okres i Opłatę Sukcesu, a Opłaty za Udostępnienie Okazji nie są pobierane.
Opłata za Udostępnienie Okazji oznacza jednorazowe wynagrodzenie Finance You należne od Inwestora w Pakiecie Podstawowym za udostępnienie danych identyfikujących jednego Projektu wraz z raportem o inwestycji, harmonogramem zaakceptowanym przez Klienta i danymi kontaktowymi, w wysokości wskazanej w Cenniku. Opłata jest należna przed Ujawnieniem Identyfikującym i nie podlega zwrotowi po jego dokonaniu, z zastrzeżeniem § 15.
Opłata Abonamentowa oznacza wynagrodzenie Finance You należne od Inwestora w Pakiecie PRO za dostęp do narzędzi systemu przez oznaczony okres, w wysokości wskazanej w Cenniku; standardowo 3 000,00 zł brutto za 180 dni.
Kwota Udzielona oznacza kwotę Finansowania wynikającą z zawartej umowy pożyczki albo innego dokumentu Finansowania, przed potrąceniami, prowizjami i kosztami.
Opłata Sukcesu oznacza wynagrodzenie Finance You należne od Inwestora w Pakiecie PRO w wysokości 5% Kwoty Udzielonej za każdą Transakcję Chronioną doprowadzoną do zawarcia w wykonaniu Zlecenia. Opłata Sukcesu jest wynagrodzeniem za rezultat usługi pośrednictwa, jest odrębna od Prowizji Klientowskiej obciążającej Klienta i nie jest karą umowną.
Mechanizm Zabezpieczenia Prowizji oznacza łączne spełnienie następujących warunków przed zawarciem lub najpóźniej w treści dokumentu Finansowania: potwierdzenie ważnej umowy prowizyjnej Klienta z Finance You; utrwalenie dyspozycji Klienta; zastrzeżenie w umowie Finansowania bezpośredniego świadczenia na rzecz Finance You; wskazanie kwoty albo jednoznacznej formuły Prowizji Klientowskiej i rachunku Finance You; oraz obowiązek przekazania Prowizji Klientowskiej nie później niż równocześnie z pierwszą wypłatą środków Klientowi.
Naruszenie Obejściowe oznacza zawarcie, doprowadzenie do zawarcia lub wykonanie Transakcji Chronionej przez Inwestora albo Grupę Inwestora bez skutecznego Mechanizmu Zabezpieczenia Prowizji, z przyczyn, za które Inwestor odpowiada, w szczególności podpisanie dokumentu bez wymaganej klauzuli, wypłatę choćby części środków bez równoczesnego przekazania Prowizji Klientowskiej albo użycie innego podmiotu lub konstrukcji w celu pominięcia Finance You. Zamiar obejścia nie jest konieczny; działania i zaniechania Grupy Inwestora przy realizacji Transakcji traktuje się jak działania i zaniechania Inwestora.
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
Usługa przedstawienia i wsparcia transakcyjnego na podstawie niniejszej Umowy jest odpłatna według Pakietu wybranego przez Inwestora i Cennika doręczonego mu na trwałym nośniku przed zakupem. Wysokość, moment wymagalności i sposób obliczenia każdej Opłaty określa § 7 i Cennik; poza tymi Opłatami Finance You nie pobiera od Inwestora innych opłat za usługę.
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
Akceptacja Karty Leada następuje oddzielnie dla każdego Projektu przed Ujawnieniem Identyfikującym. Brak akceptacji oznacza brak prawa dostępu do danych. Jeżeli jednak Inwestor niebędący Konsumentem ani osobą objętą ochroną właściwą konsumentowi, związany już niniejszą Umową i NDA, otrzyma z kanału przypisanego Finance You Ujawnienie Identyfikujące bez uprzedniej Karty Leada, a następnie świadomie wykorzysta dane, podejmie kontakt z Klientem, przekaże dane Grupie Inwestora albo doprowadzi do Transakcji Chronionej, zastosowanie mają domyślne warunki: Opłaty według Pakietu, w którym Inwestor działa, i Cennika obowiązującego w dniu Ujawnienia, standardowy Mechanizm Zabezpieczenia Prowizji, Kara Obejściowa 5% Sumy Hipotecznej oraz pięcioletni Okres Ochronny liczony od tego Ujawnienia. Odbiorca twierdzący, że ujawnienie było przypadkowe, zawiadamia Finance You w ciągu 1 Dnia Roboczego, nie wykorzystuje danych i potwierdza ich usunięcie. Wobec Konsumenta lub osoby chronionej jak konsument zawsze jest wymagana uprzednia, wyraźna i indywidualna akceptacja Karty Leada oraz Kary Obejściowej.
Dane z rejestrów systemowych, potwierdzenia doręczenia, znaki wodne, historia wersji, logi wyświetlenia i pobrania oraz wiadomości Stron mogą służyć jako dowody złożenia oświadczeń i wykonania usługi, z prawem Inwestora do wykazania błędu lub nieuprawnionego użycia konta.
W razie rozbieżności pierwszeństwo ma indywidualna Karta Leada przed Umową wyłącznie w zakresie danych Projektu, rzeczywistych warunków Prowizji Klientowskiej i szczególnych warunków, a Umowa przed ogólnym regulaminem. Karta Leada nie może ustanawiać Opłat wyższych niż wynikające z Cennika zaakceptowanego przez Inwestora przed zakupem ani wprowadzać Opłat w Cenniku nieprzewidzianych. Kara Obejściowa wynosi dokładnie 5% Sumy Hipotecznej; jej zmiana wymaga odrębnego uzgodnienia Stron w formie dokumentowej i uprzedniego przeglądu prawnego.
§ 5. Przedstawienie i rezerwacja Projektu
Inwestor składa Zlecenie w systemie. Finance You w terminie 2 Dni Roboczych przyjmuje Zlecenie albo odmawia jego przyjęcia, jeżeli parametry nie pozwalają na selekcję, w szczególności gdy odpowiadałaby im przeważająca część Projektów; przyjęcie jest potwierdzane w systemie wraz z datą. Inwestor może mieć jednocześnie nie więcej niż trzy przyjęte Zlecenia. Zlecenie bezterminowe albo obejmujące każde Finansowanie nie jest przyjmowane. Jedno Zlecenie odpowiada jednemu Finansowaniu; zmiana parametrów wymaga nowego Zlecenia. Zlecenie wygasa z upływem terminu ważności, po cofnięciu przez Inwestora, po zawarciu Transakcji Chronionej albo po odrzuceniu przez Inwestora trzech kolejnych Projektów. Cofnięcie lub wygaśnięcie Zlecenia nie wpływa na Okres Ochronny Projektów już ujawnionych.
Finance You może udostępnić anonimowy teaser Projektu wykazującego Dopasowanie wyłącznie Inwestorowi, którego Zlecenie zostało przyjęte, przed ujawnieniem danych identyfikujących. Teaser ma charakter informacyjny i może opierać się na danych niezweryfikowanych lub przybliżonych. Teaser nie jest publikowany ani rozsyłany do inwestorów bez przyjętego Zlecenia.
Po przyjęciu Projektu Inwestor otrzymuje rezerwację na 24 godziny. Finance You może jednokrotnie przedłużyć ją o 12 godzin, jeżeli Inwestor wykaże rzeczywisty postęp, w szczególności złoży pytania, potwierdzi środki albo rozpocznie analizę dokumentów.
W czasie aktywnej rezerwacji Finance You nie przedstawia Projektu ani nie udostępnia jego danych innemu inwestorowi działającemu na podstawie Zlecenia. Po odrzuceniu Projektu lub wygaśnięciu rezerwacji Projekt może zostać przedstawiony innemu inwestorowi. Inwestor może mieć jednocześnie więcej niż jedną rezerwację w ramach jednego lub kilku Zleceń. Finance You może cofnąć rezerwację w przypadku bezczynności, braku dokumentów, naruszenia bezpieczeństwa, nieprawdziwych oświadczeń, ryzyka prawnego albo interesu Klienta.
Ujawnienie następuje etapowo: teaser anonimowy, pakiet zanonimizowany lub spseudonimizowany, a następnie — po akceptacji wszystkich dokumentów — zakres danych niezbędny do oceny i realizacji Projektu. Finance You nie zobowiązuje się do przekazywania „wszystkich danych”; przekazuje dane adekwatne i niezbędne.
Odrzucenie Projektu powinno nastąpić w systemie albo w formie dokumentowej. Inwestor po odrzuceniu usuwa pełne dane zgodnie z umową dotyczącą danych osobowych, lecz obowiązki poufności i pięcioletnia ochrona relacji pozostają w mocy.
Składanie Zleceń jest możliwe w obu Pakietach i nie wymaga Opłaty Abonamentowej. Żaden Pakiet ani Opłata nie dają dostępu do Projektów nieprzypisanych do Zleceń Inwestora ani do ich zestawienia. W Pakiecie Podstawowym Ujawnienie Identyfikujące następuje po zapłacie Opłaty za Udostępnienie Okazji dla danego Projektu; w Pakiecie PRO Opłata ta nie jest pobierana. Opłaty Inwestora są niezależne od Prowizji Klientowskiej i Kary Obejściowej i nie zwalniają z Mechanizmu Zabezpieczenia Prowizji.
§ 6. Oświadczenia i obowiązki Inwestora
Inwestor oświadcza i zobowiązuje się, że:
podane dane, umocowanie i informacje o Grupie Inwestora są prawdziwe, aktualne i kompletne;
dysponuje lub będzie dysponował środkami pochodzącymi z legalnego źródła oraz wymaganymi zgodami i kompetencjami;
samodzielnie zbada Projekt i uzyska profesjonalne opinie w zakresie odpowiednim do ryzyka;
nie będzie wywierał niedozwolonej presji na Klienta, wprowadzał go w błąd ani uzależniał transakcji od niedozwolonych świadczeń;
nie użyje danych do innego celu ani nie udostępni ich osobie spoza prawidłowo zgłoszonej Grupy Inwestora;
nie zawrze Finansowania na cel konsumpcyjny na podstawie danych otrzymanych w tym procesie; oraz
nie zawrze ani nie wykona Transakcji Chronionej bez uprzedniego wdrożenia Mechanizmu Zabezpieczenia Prowizji i nie wypłaci żadnej transzy bez równoczesnego przekazania Prowizji Klientowskiej zgodnie z dyspozycją Klienta;
niezwłocznie zgłosi konflikt interesów, utratę zdolności do Finansowania, postępowanie sankcyjne, upadłościowe lub inne zdarzenie istotne dla Projektu; oraz
przed zawarciem Transakcji Chronionej samodzielnie zweryfikuje, czy Klient jest przedsiębiorcą oraz czy Finansowanie jest zaciągane na Cel Gospodarczy, w szczególności czy umowa nie stanowi umowy o kredyt konsumencki ani umowy o kredyt hipoteczny udzielany konsumentowi; weryfikacja obejmuje co najmniej sprawdzenie wpisu Klienta w CEIDG albo KRS, uzyskanie od Klienta pisemnego oświadczenia o Celu Gospodarczym oraz ocenę sposobu wykorzystania nieruchomości stanowiącej zabezpieczenie. Potwierdzenie Celu Gospodarczego przez Finance You na podstawie § 3 ust. 1 opiera się na oświadczeniach Klienta i nie zastępuje weryfikacji Inwestora; skutki zawarcia Transakcji Chronionej z naruszeniem tego obowiązku obciążają Inwestora.
Inwestor nie może składać Klientowi oświadczeń w imieniu Finance You ani przedstawiać się jako jej pracownik, agent uprawniony do reprezentacji lub wspólnik, chyba że odrębne pełnomocnictwo wyraźnie to dopuszcza.
Inwestor ponosi koszty własnego badania, obsługi prawnej, wyceny, notariusza, wpisów i ustanowienia zabezpieczeń, chyba że Karta Leada albo umowa z Klientem stanowi inaczej.
§ 7. Opłaty Inwestora i zabezpieczenie Prowizji Klientowskiej
Finance You pobiera od Inwestora wyłącznie Opłaty wynikające z wybranego Pakietu i Cennika: w Pakiecie Podstawowym Opłatę za Udostępnienie Okazji, należną przed Ujawnieniem Identyfikującym danego Projektu; w Pakiecie PRO Opłatę Abonamentową, płatną z góry za oznaczony okres, oraz Opłatę Sukcesu w wysokości 5% Kwoty Udzielonej, wymagalną w terminie 7 dni od zawarcia umowy Finansowania. Przyjęcie Zlecenia, udostępnienie teasera oraz odrzucenie Projektu przed Ujawnieniem Identyfikującym pozostają nieodpłatne. Podstawę Opłaty Sukcesu, jej kwotę i sposób obliczenia Finance You wskazuje w rozliczeniu doręczanym Inwestorowi wraz z fakturą; Inwestor może je zakwestionować w terminie 7 dni. Opłaty Inwestora nie pomniejszają Prowizji Klientowskiej ani jej nie zastępują.
Ekonomiczny ciężar Prowizji Klientowskiej ponosi Klient na podstawie odrębnej umowy z Finance You; nie jest ona opłatą za usługę świadczoną Inwestorowi. Standardem operacyjnym jest 7% Kwoty Wypłaconej Klientowi, nie mniej niż 5 000,00 zł, chyba że umowa Klienta przewiduje inną stawkę, minimum, podstawę albo moment należności. Karta Leada musi odzwierciedlać rzeczywiste, a nie przykładowe warunki. Odrębny obowiązek Inwestora wykonania dyspozycji Klienta i świadczenia na rzecz Finance You powstaje z dokumentu Finansowania zawierającego Mechanizm Zabezpieczenia Prowizji.
Przed zawarciem Transakcji Chronionej Inwestor zapewni włączenie do umowy Finansowania klauzuli zgodnej z Załącznikiem nr 6 albo równoważnej, która utrwala dyspozycję Klienta i zastrzega bezpośrednie świadczenie na rzecz Finance You. Finance You może złożyć oświadczenie, że chce skorzystać z zastrzeżenia na rzecz osoby trzeciej.
Inwestor wypłaci kwotę Finansowania w dwóch częściach: Prowizję Klientowską przekaże bezpośrednio na rachunek Finance You wskazany w Karcie Leada, a pozostałą kwotę na rachunek Klienta albo zgodnie z jego pozostałymi dyspozycjami. Przelew Prowizji następuje nie później niż równocześnie z pierwszą wypłatą środków lub przekazaniem Klientowi korzyści ekonomicznej, chyba że Finance You wyraźnie zatwierdzi inny harmonogram.
Przekazanie Prowizji Klientowskiej przez Inwestora jest wykonaniem części zobowiązania do wypłaty Finansowania wobec Klienta oraz wykonaniem zobowiązania Klienta wobec Finance You. Nie stanowi kosztu, prowizji ani wynagrodzenia należnego od Inwestora.
Inwestor nie wypłaci żadnej części Finansowania, jeżeli przed wypłatą nie otrzyma potwierdzonej kwoty albo jednoznacznej formuły Prowizji Klientowskiej, numeru rachunku Finance You i dokumentu zawierającego Mechanizm Zabezpieczenia Prowizji. Brak któregokolwiek elementu oznacza obowiązek wstrzymania wypłaty i niezwłocznego zawiadomienia Finance You.
W terminie 1 Dnia Roboczego od przelewu Inwestor przekaże Finance You potwierdzenie zapłaty zawierające identyfikator Projektu, kwotę, datę, rachunek nadawcy i tytuł płatności. Finance You potwierdzi zaliczenie kwoty na Prowizję Klientowską.
Własne odsetki, prowizje, opłaty, korzyści lub inne świadczenia Inwestora od Klienta muszą zostać opisane w Karcie Leada oddzielnie od Prowizji Klientowskiej. Karta wskazuje także istotny konflikt interesów i środki jego ograniczenia; brak wymaganych informacji blokuje Ujawnienie Identyfikujące.
Jeżeli Inwestor prawidłowo zastosuje Mechanizm Zabezpieczenia Prowizji i przekaże Prowizję Klientowską zgodnie z dyspozycją Klienta, zawarcie Transakcji Chronionej nie rodzi po stronie Inwestora żadnego wynagrodzenia transakcyjnego ani Kary Obejściowej na rzecz Finance You.
§ 8. Transakcja Chroniona, zdarzenia dowodowe i Naruszenie Obejściowe
Dla ustalenia, czy w Okresie Ochronnym doszło do Transakcji Chronionej, uwzględnia się najwcześniejsze z następujących zdarzeń:
zawarcia umowy Finansowania, umowy cesji, refinansowania, nabycia wierzytelności lub innego wiążącego dokumentu;
wypłaty choćby części środków albo udostępnienia Klientowi innej korzyści ekonomicznej;
złożenia oświadczenia o ustanowieniu hipoteki, podpisania aktu notarialnego lub złożenia wniosku wieczystoksięgowego;
pojawienia się wzmianki albo wpisu w księdze wieczystej wskazującego Inwestora lub Grupę Inwestora jako wierzyciela, administratora, powiernika, cesjonariusza lub osobę korzystającą z zabezpieczenia; albo
uzyskania przez Inwestora lub Grupę Inwestora ekonomicznego skutku równoważnego Finansowaniu, niezależnie od nazwy i liczby umów.
Jeżeli w Okresie Ochronnym w dziale IV księgi wieczystej nieruchomości przedstawionej w Projekcie albo innej nieruchomości Klienta Chronionego pojawi się wpis lub wzmianka wskazująca imię i nazwisko, firmę, identyfikator albo podmiot z Grupy Inwestora jako wierzyciela, administratora, powiernika, cesjonariusza lub beneficjenta zabezpieczenia, domniemywa się, że doszło do Transakcji Chronionej. Inwestor może wykazać dokumentami, że zdarzenie było całkowicie niezależne od relacji i danych przedstawionych przez Finance You albo że zastosowano Mechanizm Zabezpieczenia Prowizji.
Dla zachowania Okresu Ochronnego wystarczy, że w ciągu pięciu lat nastąpi którekolwiek zdarzenie z ust. 1. Późniejszy wpis lub wzmianka, także po upływie pięciu lat, może potwierdzać wcześniejszą Transakcję Chronioną lub Naruszenie Obejściowe. Sam wpis dokonany dopiero po upływie pięciu lat nie uruchamia Kary Obejściowej, jeżeli przed końcem Okresu Ochronnego nie nastąpiło żadne wcześniejsze zdarzenie Transakcji Chronionej.
Samo wystąpienie Transakcji Chronionej nie rodzi obowiązku zapłaty Kary Obejściowej. Jeżeli przed jej zawarciem skutecznie zabezpieczono Prowizję Klientowską i przekazano ją zgodnie z § 7, Inwestor płaci wyłącznie Opłaty wynikające z wybranego Pakietu, a Kara Obejściowa nie powstaje.
Naruszenie Obejściowe następuje najpóźniej z chwilą zawarcia wiążącego dokumentu Transakcji Chronionej bez Mechanizmu Zabezpieczenia Prowizji albo z chwilą pierwszej wypłaty lub korzyści przekazanej bez równoczesnego przelewu Prowizji Klientowskiej — zależnie od tego, które zdarzenie nastąpi wcześniej.
Jeżeli w chwili Naruszenia Obejściowego Suma Hipoteczna nie jest jeszcze ostateczna, Karę Obejściową ustala się tymczasowo od kwoty Finansowania lub znanej części zabezpieczenia, a po ustaleniu wyższej Sumy Hipotecznej Inwestor dopłaca różnicę. Nadpłata podlega zwrotowi, jeżeli ostateczna podstawa okaże się niższa.
Kara Obejściowa jest płatna w terminie 7 dni od doręczenia wezwania zawierającego opis naruszenia i kalkulację. Za opóźnienie należą się właściwe odsetki ustawowe; brak faktury VAT nie wstrzymuje wymagalności kary, która nie stanowi wynagrodzenia za usługę.
Późniejsza spłata, rozwiązanie, odstąpienie, bezskuteczność zabezpieczenia albo nieosiągnięcie zakładanego wyniku nie usuwa Naruszenia Obejściowego. Niewykonany projekt dokumentu nie wystarcza jednak do naliczenia kary, jeżeli nie zawarto wiążącej transakcji, nie przekazano korzyści i nie wystąpiło inne zdarzenie z ust. 1.
§ 9. Pięcioletnia ochrona i zakaz obchodzenia
Okres Ochronny biegnie przez pięć lat od Ujawnienia Identyfikującego i obowiązuje niezależnie od odrzucenia Projektu, wygaśnięcia rezerwacji, zawieszenia konta, wypowiedzenia Umowy albo zmiany osoby Inwestora na spółkę.
Inwestor nie może projektować, inicjować ani akceptować konstrukcji, której celem lub skutkiem jest uniknięcie Mechanizmu Zabezpieczenia Prowizji albo zapłaty Prowizji Klientowskiej, w szczególności przez użycie Grupy Inwestora, podział jednej transakcji, finansowanie przez pośrednika, cesję przed lub po wypłacie, administratora hipoteki, zmianę zabezpieczenia, rozliczenie poza systemem albo zawarcie kolejnej umowy bez informacji dla Finance You.
Ochrona obejmuje każdą Transakcję Chronioną z Klientem Chronionym w Okresie Ochronnym, także gdy ostatecznie zabezpieczona zostanie inna nieruchomość niż wskazana pierwotnie, zmieni się kwota, harmonogram, dłużnik formalny, wierzyciel formalny, produkt albo sposób przekazania korzyści.
Ochrona nie oznacza obowiązku zawarcia transakcji. Jeżeli Inwestor nie zawrze ani nie zrealizuje Transakcji Chronionej i nie użyje relacji w inny sposób, nie powstaje ani Kara Obejściowa, ani Opłata Sukcesu; jeżeli zawrze ją prawidłowo z Mechanizmem Zabezpieczenia Prowizji, należne są wyłącznie Opłaty z wybranego Pakietu.
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
Na żądanie Finance You Inwestor przekaże w terminie 3 Dni Roboczych kopie lub wyciągi dokumentów niezbędnych do potwierdzenia zdarzenia, zastosowania Mechanizmu Zabezpieczenia Prowizji, zapłaty Prowizji Klientowskiej i — w razie naruszenia — obliczenia Kary Obejściowej. Może zanonimizować informacje niezwiązane z Projektem, o ile nie uniemożliwia to weryfikacji.
Finance You może monitorować jawne rejestry, w tym księgi wieczyste i rejestry przedsiębiorców, przez Okres Ochronny oraz czas niezbędny do dochodzenia roszczeń. Monitoring ogranicza się do danych koniecznych do ochrony relacji, Prowizji Klientowskiej i Kary Obejściowej.
W razie uzasadnionego sporu Finance You może zlecić niezależnemu adwokatowi, radcy prawnemu, biegłemu rewidentowi lub doradcy podatkowemu poufną weryfikację dokumentów. Jeżeli wykaże ona niezgłoszoną Transakcję Chronioną, brak Mechanizmu Zabezpieczenia Prowizji albo brak należnego przelewu Prowizji Klientowskiej, uzasadnione koszty weryfikacji ponosi Inwestor; w przeciwnym razie ponosi je Finance You.
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
Kara Obejściowa z niniejszej Umowy i Kara Obejściowa z NDA stanowią jedną karę za ten sam czyn i nie podlegają podwójnemu naliczeniu. Prowizja Klientowska należna od Klienta pozostaje odrębnym roszczeniem. Finance You może dochodzić odszkodowania przewyższającego karę, jeżeli szkoda jest wyższa.
Stała kara za naruszenie raportowania nie ma zastosowania do Konsumenta. Kara Obejściowa może zostać zastosowana wobec Konsumenta wyłącznie po jej rzeczywistym, indywidualnym uzgodnieniu przed Ujawnieniem Identyfikującym, w osobnym oświadczeniu zawierającym sposób obliczenia, kwotowy przykład oraz jednoznaczne rozróżnienie Kary Obejściowej od Opłat należnych z Pakietu. Wobec Konsumenta Opłata Sukcesu wymaga uprzedniego, wyraźnego uzgodnienia z podaniem kwoty albo formuły i przykładu kwotowego; bez takiego uzgodnienia nie jest należna. W pozostałym zakresie odpowiedzialność Konsumenta podlega zasadom ogólnym.
§ 15. Postanowienia dla Konsumenta i umowa na odległość
Przed zawarciem Umowy Konsument otrzymuje na trwałym nośniku informacje z Załącznika nr 3, aktualną Umowę, wzór odstąpienia oraz Cennik Pakietów (Załącznik nr 8) z łączną ceną wszystkich Opłat. Przed każdym Ujawnieniem Identyfikującym otrzymuje także indywidualną Kartę Leada wskazującą Pakiet, Opłaty należne za ten Projekt wraz z przykładem kwotowym, warunki Prowizji Klientowskiej, Mechanizm Zabezpieczenia Prowizji oraz sposób obliczenia i przykład Kary Obejściowej.
Konsument może odstąpić od Umowy zawartej na odległość bez podania przyczyny w terminie 14 dni od jej zawarcia, a jeżeli wymagane warunki umowne lub informacje otrzyma później — od ich doręczenia, w zakresie wynikającym z prawa. Wystarczy jednoznaczne oświadczenie, w tym formularz z Załącznika nr 4; termin jest zachowany, jeżeli oświadczenie zostanie wysłane przed jego upływem.
Dla każdego Zlecenia Konsument wybiera: (a) rozpoczęcie usługi po upływie 14 dni albo (b) wyraźne żądanie rozpoczęcia przed upływem tego terminu. Pełne Ujawnienie Identyfikujące przed upływem terminu następuje tylko po odrębnej zgodzie na rozpoczęcie i odrębnym potwierdzeniu przyjęcia do wiadomości, że po pełnym wykonaniu usługi przedstawienia prawo odstąpienia od tej usługi wygaśnie.
Skuteczne odstąpienie Konsumenta po rozpoczęciu, lecz przed pełnym wykonaniem usługi, rodzi obowiązek zapłaty kwoty proporcjonalnej do świadczeń spełnionych do chwili odstąpienia — wyłącznie wtedy, gdy Konsument wyraźnie zażądał rozpoczęcia wykonywania przed upływem terminu odstąpienia i potwierdził, że utraci prawo odstąpienia po pełnym wykonaniu usługi. Jeżeli Ujawnienie Identyfikujące jeszcze nie nastąpiło, Opłata za Udostępnienie Okazji podlega zwrotowi w całości. Opłata Abonamentowa podlega zwrotowi proporcjonalnie do niewykorzystanego okresu. Opłata Sukcesu nie jest należna, jeżeli Transakcja Chroniona nie została zawarta.
Po pełnym wykonaniu konkretnej usługi przedstawienia za uprzednią wyraźną zgodą i przyjęciu informacji o utracie prawa odstąpienia, odstąpienie od Umowy ramowej nie usuwa skutków tej wykonanej usługi ani Okresu Ochronnego dotyczącego poznanego Klienta. Nie ogranicza to bezwzględnych praw Konsumenta.
Finance You udziela Konsumentowi przed zawarciem Umowy bezpłatnych, zrozumiałych wyjaśnień pozwalających ocenić, czy usługa i jej skutki odpowiadają jego potrzebom. Konsument może uzyskać kontakt z człowiekiem przed związaniem się Umową oraz w toku obsługi; istotna decyzja, reklamacja lub spór o Karę Obejściową nie mogą być rozstrzygane wyłącznie automatycznie bez dostępnej interwencji człowieka.
Interfejs nie może wykorzystywać domyślnie zaznaczonych pól, ukrytych kosztów, wymuszonej ścieżki, mylącej hierarchii przycisków ani innego rozwiązania utrudniającego świadomą decyzję lub odstąpienie. Jeżeli obowiązujące przepisy wymagają internetowej funkcji odstąpienia, Finance You udostępnia ją w sposób stale widoczny i łatwo dostępny oraz niezwłocznie potwierdza złożenie oświadczenia na trwałym nośniku.
Jeżeli informacje przedumowne zostały przekazane później niż jeden dzień przed związaniem Konsumenta Umową, Finance You wysyła na trwałym nośniku przypomnienie o prawie odstąpienia w terminie i zakresie wymaganym przez obowiązujące przepisy, bez materiału marketingowego i bez zmiany wcześniej przekazanych warunków.
Postanowienie sprzeczne z prawem konsumenckim nie wiąże Konsumenta, a pozostała część Umowy pozostaje w mocy. W razie wątpliwości pierwszeństwo ma interpretacja zgodna z obowiązkowymi informacjami przekazanymi przed zawarciem umowy.
§ 16. Czas trwania, wypowiedzenie i zawieszenie
Umowa zostaje zawarta na czas nieoznaczony. Każda Strona może ją wypowiedzieć w formie dokumentowej z 30-dniowym okresem wypowiedzenia; Konsument może wypowiedzieć ją ze skutkiem natychmiastowym, jeżeli prawo lub korzystniejsza informacja przedumowna tak stanowi.
Finance You może natychmiast zawiesić dostęp do danych i Projektów w przypadku zagrożenia bezpieczeństwa, naruszenia Umowy, braku wymaganej Opłaty wynikającej z Pakietu, braku dokumentów AML, utraty umocowania albo ryzyka regulacyjnego. Przed rozwiązaniem z przyczyny usuwalnej wyznaczy rozsądny termin naprawczy, chyba że niezwłoczne działanie jest konieczne.
Rozwiązanie Umowy nie wpływa na Prowizję Klientowską, obowiązki związane z Mechanizmem Zabezpieczenia Prowizji, już powstałą Karę Obejściową, poufność, ochronę danych, dowody, kontrolę, zakaz obchodzenia ani Okres Ochronny Projektów ujawnionych przed rozwiązaniem.
Strony przyjmują, że pięcioletni Okres Ochronny określa czas, w którym Transakcja Chroniona może prowadzić do Naruszenia Obejściowego; nie zmienia on ustawowych terminów przedawnienia roszczenia o już wymagalną Karę Obejściową lub Prowizję Klientowską.
§ 17. Reklamacje i komunikacja
Oświadczenia dotyczące Projektu składa się przez konto w systemie lub na adres e-mail wskazany w Karcie Leada. Oświadczenia o wypowiedzeniu, odstąpieniu, zmianie strony, sporze o Prowizję Klientowską lub Karę Obejściową i naruszeniu danych wymagają formy dokumentowej umożliwiającej utrwalenie treści.
Reklamację można złożyć na adres Finance You, ul. Nowogrodzka 31, 00-511 Warszawa, albo e-mail: plnyspolka@gmail.com. Powinna opisywać zdarzenie, Projekt, żądanie i dane kontaktowe. Finance You potwierdzi wpływ i udzieli odpowiedzi na trwałym nośniku co do zasady w terminie 14 dni, a gdy sprawa jest szczególnie złożona — po uprzednim wyjaśnieniu przyczyny i wskazaniu terminu zgodnego z prawem.
Konsument może skorzystać z bezpłatnej pomocy miejskiego lub powiatowego rzecznika konsumentów, organizacji konsumenckiej albo właściwego pozasądowego trybu, jeżeli jest dostępny dla danego rodzaju sporu. Umowa nie wprowadza obowiązkowego arbitrażu.
Zmiana adresu lub e-maila wymaga niezwłocznego zgłoszenia. Wiadomość wysłana na ostatni prawidłowo zgłoszony adres jest dowodem podjęcia próby doręczenia, z zastrzeżeniem szczególnych zasad doręczeń konsumenckich.
§ 18. Postanowienia końcowe
Umowa podlega prawu polskiemu. Spory z przedsiębiorcą będą rozpoznawane przez sąd właściwy dla siedziby Finance You, o ile uzgodnienie właściwości zostało utrwalone w formie wymaganej przez prawo procesowe; w przeciwnym razie właściwość wynika z przepisów ogólnych. Wobec Konsumenta i osoby korzystającej z ochrony konsumenckiej właściwość sądu wynika wyłącznie z przepisów bezwzględnie obowiązujących.
Inwestor nie może przenieść Umowy ani wierzytelności związanych z Projektem bez uprzedniej zgody Finance You, z wyjątkiem cesji w ramach ujawnionej i zaakceptowanej struktury, która zachowuje Mechanizm Zabezpieczenia Prowizji i odpowiedzialność za Karę Obejściową. Finance You może przenieść wymagalną wierzytelność, informując Inwestora w zakresie wymaganym prawem.
Zmiana Umowy wymaga formy dokumentowej, chyba że prawo wymaga formy surowszej. Cennik i regulamin mogą zmieniać się na przyszłość po uprzednim powiadomieniu; nie zmieniają stawki ani zasad Projektu już objętego Ujawnieniem Identyfikującym.
Nieważność albo bezskuteczność części postanowienia nie narusza pozostałej części. Strony zastąpią wadliwe postanowienie zgodnym z prawem rozwiązaniem możliwie najbliższym celowi gospodarczemu, bez ograniczania praw Konsumenta.
Załączniki nr 1–7 stanowią integralną część Umowy. Inwestor potwierdza otrzymanie kompletu dokumentów na trwałym nośniku przed Ujawnieniem Identyfikującym.
________________________________
________________________________
FINANCE YOUimię, nazwisko, funkcja / podpis / data
INWESTOR / ODBIORCAimię, nazwisko, funkcja / podpis / data
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
zgodnie z Pakietem Inwestora i Cennikiem (Załącznik nr 8): Pakiet Podstawowy — Opłata za Udostępnienie Okazji: ____________ zł brutto; Pakiet PRO — Opłata Abonamentowa według Cennika oraz Opłata Sukcesu 5% Kwoty Udzielonej (przykład: przy Kwocie Udzielonej 200 000,00 zł Opłata Sukcesu wynosi 10 000,00 zł)
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
Prowizja Klientowska
Rzeczywiste warunki z odrębnej umowy Klienta: ______ % Kwoty Wypłaconej Klientowi; minimum: __________ zł; kwota / formuła: __________________; moment należności: __________________Standard operacyjny, jeżeli umowa Klienta nie stanowi inaczej: 7%, minimum 5 000,00 zł.
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
Ujawnienie Identyfikujące jest niedopuszczalne, dopóki nie potwierdzono Pakietu i Opłat należnych od Inwestora za ten Projekt (a w Pakiecie Podstawowym — zapłaty Opłaty za Udostępnienie Okazji), rzeczywistych warunków Prowizji Klientowskiej, Mechanizmu Zabezpieczenia Prowizji, Kary Obejściowej, konfliktu interesów, Karty Transferu i wersji dokumentów.
Oświadczenie o relacji istniejącej przed przedstawieniem
☐ Nie zgłaszam wcześniejszej relacji z Klientem / Projektem.
☐ Zgłaszam wcześniejszą aktywną relację i załączam dowody datowane przed ujawnieniem:
________________________________________________________________________________________
Wybór Konsumenta — wypełniać tylko, gdy Inwestor jest Konsumentem
☐ Proszę rozpocząć usługę przedstawienia dopiero po upływie 14 dni.
albo
☐ Wyraźnie żądam rozpoczęcia usługi przedstawienia tego Projektu przed upływem 14 dni od zawarcia właściwej umowy na odległość.
☐ Przyjmuję do wiadomości, że po pełnym wykonaniu usługi, polegającym na Ujawnieniu Identyfikującym zgodnie z Kartą Leada, utracę prawo odstąpienia od tej konkretnie wykonanej usługi.
Opłata proporcjonalna za rozpoczętą usługę pośrednictwa: obliczana zgodnie z § 15 ust. 5 Umowy — Opłata za Udostępnienie Okazji podlega zwrotowi w całości, jeżeli nie doszło do Ujawnienia Identyfikującego, a Opłata Abonamentowa podlega zwrotowi proporcjonalnie do niewykorzystanego okresu.
☐ Jako Konsument potwierdzam, że po rzeczywistych negocjacjach opisanych wyżej indywidualnie uzgodniłem Karę Obejściową równą 5% Sumy Hipotecznej wyłącznie za Naruszenie Obejściowe, za które odpowiadam; otrzymałem wyjaśnienie i przykład kwotowy oraz miałem realną możliwość wpływu na treść postanowienia przed ujawnieniem danych.
Akceptacja
Potwierdzam, że znam Pakiet, w którym działam, oraz wysokość i sposób obliczenia należnych ode mnie Opłat wskazanych w Cenniku. Akceptuję obowiązek zastosowania Mechanizmu Zabezpieczenia Prowizji, ujawnioną Prowizję Klientowską, własne wynagrodzenie od Klienta, konflikt i środki zarządzania, Karę Obejściową 5% Sumy Hipotecznej, jej przykład kwotowy, pięcioletni Okres Ochronny oraz wersje dokumentów wskazane w Protokole Akceptacji.
________________________________
________________________________
FINANCE YOUimię, nazwisko, funkcja / podpis / data
INWESTOR / ODBIORCAimię, nazwisko, funkcja / podpis / data
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
PODMIOT PRZYSTĘPUJĄCYimię, nazwisko, funkcja / podpis / data
PIERWOTNY INWESTORimię, nazwisko, funkcja / podpis / data
Akceptacja Finance You: ____________________________________   data: ____________________
ZAŁĄCZNIK NR 3
Informacja przedumowna dla Konsumenta
Przekazać na trwałym nośniku przed zawarciem umowy na odległość. Uzupełnić pola cenowe i techniczne zgodnie z aktualnym systemem.
Obszar
Informacja
Usługodawca
Finance You spółka z ograniczoną odpowiedzialnością z siedzibą w Warszawie, ul. Nowogrodzka 31, 00-511 Warszawa, wpisana do rejestru przedsiębiorców KRS pod numerem 0000635207, NIP 7010611803, REGON 365350668, kapitał zakładowy 389 600,00 zł, reprezentowana przez Filipa Roberta Bielaka – Prezesa Zarządu uprawnionego do samodzielnej reprezentacji. Kontakt: plnyspolka@gmail.com, tel. 889 888 700.
Rejestr
Rejestr przedsiębiorców KRS 0000635207; sąd rejestrowy i aktualną reprezentację należy sprawdzić w odpisie aktualnym przed zawarciem.
Nadzór / zezwolenie
Niniejsza informacja nie oznacza, że Finance You posiada zezwolenie KNF. Jeżeli dla konkretnego modelu wymagane jest zezwolenie, rejestracja lub udział uprawnionego podmiotu, Projekt nie zostanie uruchomiony przed spełnieniem wymogów.
Usługa
Przedstawienie i wsparcie procesu Projektu Finansowania na Cel Gospodarczy. Każda Karta Leada stanowi odrębną usługę przedstawienia w ramach Umowy ramowej.
Istotne cechy i ryzyko
Finance You nie gwarantuje zawarcia ani wyniku Finansowania. Inwestor samodzielnie ocenia ryzyko kredytowe, prawne, techniczne i wartość zabezpieczenia. Inwestowanie może prowadzić do utraty części lub całości środków i kosztów egzekucji.
Cena dla Inwestora
Usługa przedstawienia i wsparcia Transakcji Chronionej jest odpłatna zgodnie z wybranym Pakietem: Pakiet Podstawowy — Opłata za Udostępnienie Okazji za każdy udostępniony Projekt; Pakiet PRO — Opłata Abonamentowa 3 000,00 zł brutto za 180 dni oraz Opłata Sukcesu 5% Kwoty Udzielonej. Łączną cenę wszystkich Opłat wskazuje Cennik (Załącznik nr 8) doręczony przed zakupem.
Prowizja od Klienta
Finance You otrzymuje od Klienta Prowizję Klientowską według odrębnej umowy. Standardowo: 7% Kwoty Wypłaconej Klientowi, minimum 5 000,00 zł. Inwestor przekazuje ją z kwoty Finansowania bezpośrednio Finance You zgodnie z dyspozycją Klienta; nie jest to opłata Inwestora.
Kara Obejściowa
Wyłącznie za zawarcie lub wykonanie Transakcji Chronionej bez Mechanizmu Zabezpieczenia Prowizji z przyczyn, za które Inwestor odpowiada: 5% Sumy Hipotecznej. Przykład: 1 000 000,00 zł × 5% = 50 000,00 zł. Kara nie jest ceną usługi; wobec Konsumenta wymaga indywidualnego uzgodnienia.
Wynagrodzenie Inwestora / konflikt
Karta Leada wskazuje również własne wynagrodzenie Inwestora od Klienta oraz konflikt wynikający z wielostronnych płatności i środki jego opanowania. Brak kompletu informacji blokuje ujawnienie danych.
Podatki i koszty obce
Podatki, opłaty sądowe, notarialne, wycena, doradcy, finansowanie przelewu i koszty zabezpieczeń nie są wliczone, chyba że Karta Leada wyraźnie stanowi inaczej.
Płatność
Konsument nie płaci wynagrodzenia transakcyjnego. Prowizję Klientowską przekazuje z kwoty Finansowania zgodnie z dyspozycją Klienta. Ewentualna indywidualnie uzgodniona Kara Obejściowa jest płatna w terminie 7 dni od wezwania opisującego naruszenie i kalkulację.
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
Pisemnie na adres siedziby lub e-mail plnyspolka@gmail.com. Odpowiedź co do zasady w 14 dni na trwałym nośniku.
Pozasądowe rozwiązanie
Dostępna jest pomoc miejskiego lub powiatowego rzecznika konsumentów i organizacji konsumenckich oraz procedury pozasądowe właściwe dla rodzaju sporu, o ile spełnione są ich warunki.
Fundusz gwarancyjny
Usługa pośrednictwa Finance You nie jest objęta umownym funduszem gwarancyjnym ani systemem rekompensat. Ewentualne zabezpieczenie Finansowania wynika wyłącznie z dokumentów danej transakcji.
Potwierdzam otrzymanie informacji przedumownej, Umowy, Cennika Pakietów (Załącznik nr 8), Karty Leada i formularza odstąpienia na trwałym nośniku przed złożeniem oświadczenia.
________________________________
________________________________
KONSUMENTimię, nazwisko, funkcja / podpis / data
FINANCE YOUimię, nazwisko, funkcja / podpis / data
ZAŁĄCZNIK NR 4
Wzór oświadczenia o odstąpieniu
Formularz fakultatywny — wystarczy każde jednoznaczne oświadczenie.
DANE OŚWIADCZENIA
Adresat
Finance You sp. z o.o., ul. Nowogrodzka 31, 00-511 Warszawa; e-mail: plnyspolka@gmail.com
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
Usługa Inwestora: 0,00 zł  Prowizja Klientowska: __________________  Mechanizm zabezpieczenia: ☐ tak ☐ nieKara Obejściowa 5% i przykład zaakceptowane: ☐ tak ☐ nie  Inwestor→Klient: __________________  konflikt i środki: ☐ tak ☐ nie
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
Dyspozycja Klienta i klauzula zabezpieczająca Prowizję Klientowską
Włączyć do umowy Finansowania albo podpisać jako jej integralny załącznik przed wypłatą jakiejkolwiek części środków.
PARAMETRY ROZLICZENIA
Klient / Pożyczkobiorca
________________________________________________________________
Inwestor / Pożyczkodawca
________________________________________________________________
ID Projektu / Karty Leada
________________________________________________________________
Całkowita kwota Finansowania
__________________ zł / waluta: __________
Kwota Wypłacona Klientowi
__________________ zł
Prowizja Klientowska
__________________ zł; podstawa / formuła: __________________________________________
Rachunek Finance You
________________________________________________________________
Tytuł przelewu
Prowizja Finance You — ID Projektu: ______________________________
Termin
nie później niż równocześnie z pierwszą wypłatą środków Klientowi
Klauzula do dokumentu Finansowania
§ A. Dyspozycja, przyjęcie obowiązku i świadczenie na rzecz Finance You
Klient potwierdza, że na podstawie odrębnej umowy z Finance You jest zobowiązany do zapłaty Prowizji Klientowskiej wskazanej powyżej. Klient poleca Inwestorowi, aby część należnej Klientowi wypłaty Finansowania w kwocie Prowizji Klientowskiej przekazał bezpośrednio na rachunek Finance You, a pozostałą część wypłacił zgodnie z pozostałymi dyspozycjami Klienta.
Inwestor przyjmuje tę dyspozycję i zobowiązuje się wobec Klienta przekazać Prowizję Klientowską na rachunek Finance You nie później niż równocześnie z pierwszą wypłatą jakiejkolwiek części Finansowania. Jeżeli Strony przewidują transze, cała Prowizja Klientowska jest przekazywana przy pierwszej transzy, chyba że Finance You uprzednio zatwierdzi inny harmonogram w formie dokumentowej.
Strony zastrzegają spełnienie opisanego świadczenia na rzecz Finance You jako osoby trzeciej. Finance You może żądać bezpośrednio od Inwestora wykonania tego postanowienia. Gdy Finance You oświadczy którejkolwiek ze Stron, że chce skorzystać z zastrzeżenia, postanowienie nie może zostać odwołane ani zmienione bez zgody Finance You.
Przelew Prowizji Klientowskiej do Finance You stanowi wypłatę odpowiedniej części Finansowania Klientowi oraz równoczesne spełnienie jego zobowiązania prowizyjnego wobec Finance You. Nie stanowi prowizji, opłaty ani kosztu ponoszonego przez Inwestora na rzecz Finance You.
Inwestor nie jest uprawniony do wypłaty Klientowi ani osobie przez niego wskazanej żadnej części Finansowania wcześniej niż równocześnie ze zleceniem przelewu Prowizji Klientowskiej na rachunek Finance You. Zmiana kwoty, rachunku lub terminu wymaga potwierdzenia Finance You w formie dokumentowej.
Finance You oświadcza, że chce skorzystać z powyższego zastrzeżenia świadczenia na jej rzecz i przyjmuje uprawnienie do bezpośredniego żądania zapłaty wskazanej Prowizji Klientowskiej.
________________________
________________________
________________________
KLIENTimię, nazwisko, funkcja / podpis / data
INWESTORimię, nazwisko, funkcja / podpis / data
FINANCE YOUimię, nazwisko, funkcja / podpis / data
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
☐ Zlecenie składam na podstawie Ramowej umowy pośrednictwa (wersja: ________). Znam Pakiet, w którym działam, i wysokość należnych ode mnie Opłat zgodnie z Cennikiem; Prowizja Klientowska obciąża Klienta i podlega Mechanizmowi Zabezpieczenia Prowizji. ☐ Zobowiązuję się przed zawarciem Transakcji Chronionej samodzielnie zweryfikować status przedsiębiorcy Klienta i Cel Gospodarczy (§ 6 ust. 1 pkt 9). ☐ Przyjmuję do wiadomości, że Projekty są przedstawiane wyłącznie w wykonaniu przyjętego Zlecenia i nie mam dostępu do Projektów nieprzypisanych do moich Zleceń.
Konsument
☐ nie dotyczy ☐ Żądam rozpoczęcia wykonywania usługi przed upływem 14-dniowego terminu odstąpienia i przyjmuję do wiadomości, że po pełnym wykonaniu usługi przedstawienia prawo odstąpienia od tej usługi wygaśnie.
Potwierdzenie
kanał / log / OTP: ____________________  data i czas: ____________________
Decyzja Finance You
☐ Zlecenie przyjęte, data: __________ ☐ odmowa przyjęcia, powód: ______________________
Załącznik nr 8 — Cennik Pakietów Inwestora
Obowiązuje od 21 września 2026 r. Wszystkie kwoty są kwotami brutto w złotych polskich.
Pakiet Podstawowy
Opłata stała: 0,00 zł. Inwestor zakłada konto, przechodzi weryfikację, akceptuje pakiet dokumentów i składa Zlecenia bez opłat.
Opłata za Udostępnienie Okazji: 1 500,00 zł za jeden Projekt. W cenie: wyłączność na Projekt w okresie rezerwacji, raport o inwestycji, harmonogram spłaty zaakceptowany przez Klienta oraz dane kontaktowe. Opłata jest należna przed Ujawnieniem Identyfikującym i podlega zwrotowi w całości, jeżeli do Ujawnienia nie doszło.
Pakiet PRO
Opłata Abonamentowa: 3 000,00 zł za 180 dni dostępu. Obejmuje pełny zakres Pakietu Podstawowego bez Opłat za Udostępnienie Okazji, Akademię inwestora, kalkulator compliance, moduł AML, moduł windykacji, nielimitowaną liczbę pełnych raportów oraz pierwszeństwo wyboru Projektów w ramach przyjętych Zleceń.
Opłata Sukcesu: 5% Kwoty Udzielonej za każdą Transakcję Chronioną zawartą w wykonaniu Zlecenia. Wymagalna w terminie 7 dni od zawarcia umowy Finansowania, na podstawie rozliczenia i faktury doręczonych Inwestorowi. Przykład: przy Kwocie Udzielonej 200 000,00 zł Opłata Sukcesu wynosi 10 000,00 zł.
Opłaty niezależne od Pakietu
Prowizja Klientowska obciąża Klienta, a nie Inwestora: standardowo 7% Kwoty Wypłaconej Klientowi, nie mniej niż 5 000,00 zł. Inwestor ma obowiązek zastosować Mechanizm Zabezpieczenia Prowizji, niezależnie od zapłaconych Opłat.
Kara Obejściowa 5% Sumy Hipotecznej nie jest Opłatą ani ceną usługi — zabezpiecza niepieniężny obowiązek Inwestora i powstaje wyłącznie w razie Naruszenia Obejściowego.
Zmiana Cennika
Zmiana Cennika wymaga doręczenia Inwestorowi nowej wersji na trwałym nośniku z wyprzedzeniem co najmniej 14 dni i nie dotyczy Opłat już zapłaconych ani Projektów udostępnionych przed zmianą. Wobec Konsumenta zmiana wymaga jego wyraźnej akceptacji.
',
  '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',
  '02_Ramowa_umowa_posrednictwa_na_odleglosc_Finance_You_v6.docx',
  true,
  false
)
on conflict (code) do update set
  package_id = excluded.package_id,
  version = excluded.version,
  title = excluded.title,
  sort_order = excluded.sort_order,
  sha256 = excluded.sha256,
  content_text = excluded.content_text,
  docx_base64 = excluded.docx_base64,
  docx_filename = excluded.docx_filename,
  allows_investor_fees = excluded.allows_investor_fees,
  updated_at = now();

-- Opłaty sukcesu zarejestrowane, gdy obowiązywała jeszcze v5, pozostają
-- wstrzymane — o ich odmrożeniu decyduje człowiek w panelu administratora,
-- nie migracja.
comment on table public.investor_success_fees is
  'Opłata Sukcesu PRO (5% Kwoty Udzielonej) wg § 7 Umowy ramowej v6. Status wstrzymana = aktywna wersja umowy nie dopuszcza opłat od Inwestora.';
