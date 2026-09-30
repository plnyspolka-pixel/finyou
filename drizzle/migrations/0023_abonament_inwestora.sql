-- =====================================================================
-- ABONAMENT INWESTORA (2026-09-30)
--
-- Decyzja właściciela: Inwestor płaci Opłatę Abonamentową za dostęp do
-- systemu — 1 500 zł brutto za 30 dni albo 7 000 zł brutto za 365 dni
-- (netto = brutto, dopóki Finance You nie dolicza VAT), jednorazowo z góry
-- przez Tpay (przelew, BLIK), bez automatycznego odnowienia. Ceny w kodzie:
-- src/lib/investor-plan/plans.ts (SUBSCRIPTION_*).
--
-- 1–3: katalog produktów i płatny dostęp (investor_has_full_access).
-- 4:   treść Umowy ramowej v7 z Opłatą Abonamentową. Wiersz v7 wgrała
--      migracja 20260929155000 z treścią „nieodpłatną” (nikt jej nie
--      zaakceptował) — tej migracji nie zmieniamy, treść podmienia UPDATE
--      poniżej (generowany: npx tsx scripts/legal/build-pakiet-v7.ts).
--
-- Kody produktów zostają (investor_access_30d / investor_access_365d) —
-- przed tą migracją nie było ani jednej płatności inwestora, więc zmiana
-- etykiety i ceny nie przekłamuje historii. Pakiet PRO i opłata za okazję
-- pozostają nieaktywne. Migracja jest idempotentna.
-- =====================================================================

-- 1. Produkty abonamentu — aktywne, nowe ceny i etykiety.
insert into public.access_products
  (code, audience, label, duration_days, amount_grosz, currency, active, sort_order, kind, tier, success_fee_bps)
values
  ('investor_access_30d', 'investor', 'Abonament inwestora — 30 dni', 30, 150000, 'PLN', true, 10, 'access', 'podstawowy', 0),
  ('investor_access_365d', 'investor', 'Abonament inwestora — 365 dni', 365, 700000, 'PLN', true, 20, 'access', 'podstawowy', 0)
on conflict (code) do update set
  audience = excluded.audience,
  label = excluded.label,
  duration_days = excluded.duration_days,
  amount_grosz = excluded.amount_grosz,
  currency = excluded.currency,
  active = true,
  sort_order = excluded.sort_order,
  kind = excluded.kind,
  tier = excluded.tier,
  success_fee_bps = 0,
  updated_at = now();

-- 2. Pakiet PRO i opłata za pojedynczą okazję — nieaktywne (rekordy zostają).
update public.access_products
   set active = false, updated_at = now()
 where code in ('investor_pro_180d', 'investor_okazja_unlock')
   and active = true;

-- 3. investor_has_full_access(): personel ALBO inwestor z aktywnym
--    abonamentem (access_entitlements) ALBO z aktywnym dostępem do
--    zamkniętego modułu projektów nadanym przez zespół. Ta sama funkcja
--    stoi za politykami RLS danych inwestycyjnych (20260719106000) i za
--    bramkami serwerowymi (src/lib/access/guards.server.ts).
create or replace function public.investor_has_full_access(_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_internal_staff(_user_id)
      or (public.has_role(_user_id, 'inwestor')
          and (public.has_active_paid_access(_user_id, 'investor')
               or public.investor_module_access_active(_user_id)));
$$;

comment on function public.investor_has_full_access(uuid) is
  'Od 2026-09-30: personel albo inwestor z aktywnym abonamentem (1 500 zł / 30 dni albo 7 000 zł / 365 dni) albo z dostępem modułowym nadanym przez zespół.';

comment on function public.investor_tier(uuid) is
  'Jeden poziom dostępu inwestora (podstawowy). Płatny dostęp określa investor_has_full_access() — abonament od 2026-09-30.';

comment on table public.investor_opportunity_unlocks is
  'HISTORYCZNA. Wykupy pojedynczych okazji (1 500 zł) zniesione od 2026-09 — dane Projektu po akceptacji Karty Leada są dostępne w ramach abonamentu.';

-- 4. Umowa ramowa v7 — treść z Opłatą Abonamentową.
-- >>> UMOWA RAMOWA v7 — treść z Opłatą Abonamentową (generowane: npx tsx scripts/legal/build-pakiet-v7.ts)
-- umowa_ramowa v7: content sha256 0d098f1b568f65eb31a4fe9b177e8bdfae417cf347e4e269ad699ed16a782aa0
--   docx sha256 d3ef9138d069ee31e43ebfde0d63fda79aa71a2994c4642b3a52e20fdc70cf51
--   poprzednia treść (model nieodpłatny): 272d93b85cbac50822fab2f6ed984a94a67c65706177b999e7a444abe9020668
update public.legal_documents
   set sha256 = '0d098f1b568f65eb31a4fe9b177e8bdfae417cf347e4e269ad699ed16a782aa0',
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
Za dostęp do systemu Finance You Inwestor płaci wyłącznie Opłatę Abonamentową (§ 7); za przedstawienie Projektu i wsparcie transakcyjne Finance You nie pobiera od Inwestora odrębnego wynagrodzenia. Prowizja Klientowska jest należna Finance You od Klienta na podstawie odrębnej umowy i jest potrącana z kwoty Finansowania zgodnie z dyspozycją Klienta (Załącznik nr 6): Inwestor przekazuje ją bezpośrednio na rachunek Finance You, a pozostałą część wypłaca Klientowi. Opłata Abonamentowa nie zwalnia z Mechanizmu Zabezpieczenia Prowizji.
Strony chcą jednoznacznie ustalić zakres pięcioletniej ochrony relacji oraz Karę Obejściową równą 5% Sumy Hipotecznej za zawarcie lub wykonanie Transakcji Chronionej z naruszeniem niepieniężnego obowiązku zabezpieczenia Prowizji Klientowskiej i zakazu obchodzenia Finance You.
Strony wyłączają z zakresu Umowy finansowanie przeznaczone w całości lub części na cele konsumpcyjne oraz kredyt hipoteczny udzielany konsumentowi.
Finance You nie prowadzi publicznie dostępnego katalogu Projektów. Projekt jest przedstawiany wyłącznie jako wynik indywidualnego Zlecenia i wyłącznie Inwestorowi, który je złożył; w czasie rezerwacji nie jest przedstawiany innym inwestorom działającym na podstawie Zlecenia.
Model rozliczenia.  Inwestor płaci Finance You wyłącznie Opłatę Abonamentową za dostęp do systemu: 1 500,00 zł brutto za 30 dni albo 7 000,00 zł brutto za 365 dni, z góry za wybrany okres. Klient płaci Prowizję Klientowską według odrębnej umowy (7% Kwoty Udzielonej, nie mniej niż 5 000,00 zł, bez VAT), a Inwestor zabezpiecza jej bezpośredni przelew z kwoty Finansowania i potrąca ją z wypłaty. Zawarcie lub wykonanie Transakcji Chronionej bez tego mechanizmu stanowi Naruszenie Obejściowe i uruchamia Karę Obejściową równą 5% Sumy Hipotecznej.
§ 1. Definicje
Klient oznacza osobę fizyczną działającą w związku z działalnością gospodarczą, przedsiębiorcę, osobę prawną albo jednostkę organizacyjną poszukującą Finansowania na Cel Gospodarczy, a także właściciela nieruchomości, dłużnika, poręczyciela, spółkę operacyjną lub celową i inne osoby uczestniczące w Projekcie.
Cel Gospodarczy oznacza cel pozostający w bezpośrednim związku z działalnością gospodarczą lub zawodową finansowanego podmiotu, potwierdzony w Karcie Leada i dokumentacji Finansowania. Nie obejmuje celu konsumpcyjnego, zaspokajania prywatnych potrzeb mieszkaniowych ani kredytu hipotecznego w rozumieniu przepisów o kredycie hipotecznym.
Projekt oznacza zidentyfikowaną przez Finance You możliwość Finansowania, oznaczoną unikalnym numerem i opisaną w Karcie Leada.
Karta Leada oznacza załącznik transakcyjny dla konkretnego Projektu, zawierający co najmniej identyfikator, moment Ujawnienia Identyfikującego, okres ochronny, regułę Sumy Hipotecznej, potwierdzenie, że za Projekt nie są należne od Inwestora opłaty poza Opłatą Abonamentową, rzeczywiste warunki Prowizji Klientowskiej, Mechanizm Zabezpieczenia Prowizji, Karę Obejściową wraz z przykładem kwotowym, zakres Grupy Inwestora, wynagrodzenie własne Inwestora od Klienta, konflikt interesów oraz sposób akceptacji.
Ujawnienie Identyfikujące oznacza pierwsze ujawnienie Inwestorowi danych, które samodzielnie albo łącznie pozwalają rozsądnie ustalić Klienta lub konkretną nieruchomość. Moment ten wynika z rejestru systemowego, potwierdzenia wiadomości albo Karty Leada.
Klient Chroniony oznacza Klienta poznanego dzięki Ujawnieniu Identyfikującemu oraz każdy podmiot przez niego kontrolowany, kontrolujący go, z nim powiązany lub użyty do zawarcia Transakcji Chronionej, jeżeli istnieje związek gospodarczy z Projektem lub relacją przedstawioną przez Finance You.
Grupa Inwestora oznacza Inwestora oraz każdą osobę działającą bezpośrednio lub pośrednio na jego rzecz, na jego zlecenie, w jego interesie albo z jego udziałem, w tym jego obecną lub przyszłą spółkę, SPV, wspólnika, członka organu, pełnomocnika, beneficjenta rzeczywistego, osobę bliską, współinwestora, fundusz, cesjonariusza, nabywcę wierzytelności, powiernika, administratora hipoteki albo zabezpieczeń oraz podmiot powiązany kapitałowo, osobowo, rodzinnie lub kontraktowo.
Finansowanie oznacza przekazanie pieniędzy, limitu, rzeczy, praw, odroczenia, gwarancji lub innej korzyści ekonomicznej, w szczególności na podstawie pożyczki, kredytu, refinansowania, faktoringu, wykupu lub cesji wierzytelności, subrogacji, obligacji, umowy inwestycyjnej, sprzedaży z prawem odkupu, leasingu zwrotnego albo konstrukcji o równoważnym skutku gospodarczym.
Transakcja Chroniona oznacza każde Finansowanie zawarte, udzielone, nabyte, refinansowane, odnowione, przedłużone, zwiększone lub ekonomicznie zrealizowane w Okresie Ochronnym między Klientem Chronionym a Inwestorem lub Grupą Inwestora, jeżeli jest zabezpieczone hipoteką na nieruchomości przedstawionej w Projekcie albo na jakiejkolwiek innej nieruchomości Klienta Chronionego lub osoby udostępniającej mu zabezpieczenie. Obejmuje także nabycie zabezpieczonej wierzytelności i finansowanie przez pośredni podmiot.
Suma Hipoteczna oznacza najwyższą kwotę pieniężną, do której hipoteka zabezpiecza lub ma zabezpieczać wierzytelności przypisane Inwestorowi lub Grupie Inwestora, wskazaną w oświadczeniu o ustanowieniu hipoteki, umowie Finansowania, wniosku wieczystoksięgowym, wzmiance albo wpisie. Jeżeli takiej kwoty nie da się ustalić, podstawą jest kwota Finansowania lub wartość korzyści ekonomicznej przypisana Inwestorowi. Jednej ekonomicznej ekspozycji zabezpieczonej łącznie na kilku nieruchomościach nie liczy się wielokrotnie, chyba że dokumenty ustanawiają odrębne lub dodatkowe limity zabezpieczenia.
Prowizja Klientowska oznacza odrębne wynagrodzenie Finance You wynikające wyłącznie z umowy z Klientem i ekonomicznie obciążające Klienta, a nie cenę usługi świadczonej Inwestorowi. Wynosi 7% Kwoty Udzielonej, nie mniej niż 5 000,00 zł, bez VAT, i jest potrącana z wypłaty Finansowania zgodnie z dyspozycją Klienta (Załącznik nr 6): Inwestor przekazuje ją bezpośrednio na rachunek Finance You, a pozostałą część Kwoty Udzielonej wypłaca Klientowi; jeżeli odrębna umowa z Klientem przewiduje inną stawkę, minimum albo podstawę, Karta Leada musi odzwierciedlać rzeczywiste warunki tej umowy.
Opłata Abonamentowa oznacza jedyne wynagrodzenie Finance You należne od Inwestora — za dostęp do systemu Finance You (panelu Inwestora) przez Okres Abonamentowy: 1 500,00 zł brutto za 30 dni albo 7 000,00 zł brutto za 365 dni, według wyboru Inwestora.
Okres Abonamentowy oznacza opłacony okres dostępu do systemu (30 albo 365 dni), liczony od zaksięgowania Opłaty Abonamentowej, a jeżeli poprzedni opłacony okres jeszcze trwa — od jego końca.
Kwota Udzielona oznacza kwotę Finansowania wynikającą z zawartej umowy pożyczki albo innego dokumentu Finansowania, przed potrąceniami, prowizjami i kosztami.
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
W razie rozbieżności pierwszeństwo ma indywidualna Karta Leada przed Umową wyłącznie w zakresie danych Projektu, rzeczywistych warunków Prowizji Klientowskiej i szczególnych warunków, a Umowa przed ogólnym regulaminem. Karta Leada nie może ustanawiać żadnych opłat należnych od Inwestora; jedynym wynagrodzeniem Finance You od Inwestora jest Opłata Abonamentowa (§ 7). Kara Obejściowa wynosi dokładnie 5% Sumy Hipotecznej; jej zmiana wymaga odrębnego uzgodnienia Stron w formie dokumentowej i uprzedniego przeglądu prawnego.
§ 5. Przedstawienie i rezerwacja Projektu
Inwestor składa Zlecenie w systemie. Finance You w terminie 2 Dni Roboczych przyjmuje Zlecenie albo odmawia jego przyjęcia, jeżeli parametry nie pozwalają na selekcję, w szczególności gdy odpowiadałaby im przeważająca część Projektów; przyjęcie jest potwierdzane w systemie wraz z datą. Inwestor może mieć jednocześnie nie więcej niż pięć przyjętych Zleceń. Zlecenie bezterminowe albo obejmujące każde Finansowanie nie jest przyjmowane. Jedno Zlecenie odpowiada jednemu Finansowaniu; zmiana parametrów wymaga nowego Zlecenia. Zlecenie wygasa z upływem terminu ważności, po cofnięciu przez Inwestora, po zawarciu Transakcji Chronionej albo po odrzuceniu przez Inwestora pięciu kolejnych Projektów. Cofnięcie lub wygaśnięcie Zlecenia nie wpływa na Okres Ochronny Projektów już ujawnionych.
Finance You może udostępnić anonimowy teaser Projektu wykazującego Dopasowanie wyłącznie Inwestorowi, którego Zlecenie zostało przyjęte, przed ujawnieniem danych identyfikujących. Teaser ma charakter informacyjny i może opierać się na danych niezweryfikowanych lub przybliżonych. Teaser nie jest publikowany ani rozsyłany do inwestorów bez przyjętego Zlecenia.
Po przyjęciu Projektu Inwestor otrzymuje rezerwację na 24 godziny. Finance You może jednokrotnie przedłużyć ją o 12 godzin, jeżeli Inwestor wykaże rzeczywisty postęp, w szczególności złoży pytania, potwierdzi środki albo rozpocznie analizę dokumentów.
W czasie aktywnej rezerwacji Finance You nie przedstawia Projektu ani nie udostępnia jego danych innemu inwestorowi działającemu na podstawie Zlecenia. Po odrzuceniu Projektu lub wygaśnięciu rezerwacji Projekt może zostać przedstawiony innemu inwestorowi. Inwestor może mieć jednocześnie nie więcej niż pięć aktywnych rezerwacji w ramach jednego lub kilku Zleceń, w tym nie więcej niż dwie rezerwacje przedłużone. Finance You może cofnąć rezerwację w przypadku bezczynności, braku dokumentów, naruszenia bezpieczeństwa, nieprawdziwych oświadczeń, ryzyka prawnego albo interesu Klienta.
Ujawnienie następuje etapowo: teaser anonimowy, pakiet zanonimizowany lub spseudonimizowany, a następnie — po akceptacji wszystkich dokumentów — zakres danych niezbędny do oceny i realizacji Projektu. Finance You nie zobowiązuje się do przekazywania „wszystkich danych”; przekazuje dane adekwatne i niezbędne.
Odrzucenie Projektu powinno nastąpić w systemie albo w formie dokumentowej. Inwestor po odrzuceniu usuwa pełne dane zgodnie z umową dotyczącą danych osobowych, lecz obowiązki poufności i pięcioletnia ochrona relacji pozostają w mocy.
Składanie Zleceń, udostępnienie teasera, Karta Leada, Ujawnienie Identyfikujące i rezerwacja są dostępne w aktywnym Okresie Abonamentowym i nie wymagają dodatkowych opłat. Inwestor nie ma dostępu do Projektów nieprzypisanych do jego Zleceń ani do ich zestawienia. Opłata Abonamentowa jest niezależna od Prowizji Klientowskiej i Kary Obejściowej i nie zwalnia z Mechanizmu Zabezpieczenia Prowizji.
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
§ 7. Opłata Abonamentowa i zabezpieczenie Prowizji Klientowskiej
Finance You pobiera od Inwestora wyłącznie Opłatę Abonamentową za dostęp do systemu: 1 500,00 zł brutto za 30 dni albo 7 000,00 zł brutto za 365 dni, według wyboru Inwestora. Opłata jest płatna z góry, jednorazowo za wybrany Okres Abonamentowy, za pośrednictwem operatora płatności (w szczególności przelewem albo BLIK), bez konieczności podawania danych karty płatniczej i bez automatycznego odnowienia; Finance You wystawia za nią fakturę. Przyjęcie Zlecenia, udostępnienie teasera, Karta Leada, Ujawnienie Identyfikujące, rezerwacja, wsparcie transakcyjne oraz zawarcie Transakcji Chronionej nie wymagają dodatkowych opłat. Po upływie Okresu Abonamentowego Finance You wstrzymuje przyjmowanie nowych Zleceń i dostęp do funkcji systemu do czasu opłacenia kolejnego okresu; dane i dokumenty Inwestora nie są usuwane, a poufność, Mechanizm Zabezpieczenia Prowizji i Okres Ochronny pozostają w mocy.
Ekonomiczny ciężar Prowizji Klientowskiej ponosi Klient na podstawie odrębnej umowy z Finance You; nie jest ona opłatą za usługę świadczoną Inwestorowi. Prowizja Klientowska wynosi 7% Kwoty Udzielonej, nie mniej niż 5 000,00 zł, bez VAT, i jest potrącana z wypłaty, chyba że umowa Klienta przewiduje inną stawkę, minimum, podstawę albo moment należności. Karta Leada musi odzwierciedlać rzeczywiste, a nie przykładowe warunki. Odrębny obowiązek Inwestora wykonania dyspozycji Klienta i świadczenia na rzecz Finance You powstaje z dokumentu Finansowania zawierającego Mechanizm Zabezpieczenia Prowizji.
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
Samo wystąpienie Transakcji Chronionej nie rodzi obowiązku zapłaty Kary Obejściowej. Jeżeli przed jej zawarciem skutecznie zabezpieczono Prowizję Klientowską i przekazano ją zgodnie z § 7, Kara Obejściowa nie powstaje, a Inwestor nie płaci Finance You od tej Transakcji żadnego wynagrodzenia.
Naruszenie Obejściowe następuje najpóźniej z chwilą zawarcia wiążącego dokumentu Transakcji Chronionej bez Mechanizmu Zabezpieczenia Prowizji albo z chwilą pierwszej wypłaty lub korzyści przekazanej bez równoczesnego przelewu Prowizji Klientowskiej — zależnie od tego, które zdarzenie nastąpi wcześniej.
Jeżeli w chwili Naruszenia Obejściowego Suma Hipoteczna nie jest jeszcze ostateczna, Karę Obejściową ustala się tymczasowo od kwoty Finansowania lub znanej części zabezpieczenia, a po ustaleniu wyższej Sumy Hipotecznej Inwestor dopłaca różnicę. Nadpłata podlega zwrotowi, jeżeli ostateczna podstawa okaże się niższa.
Kara Obejściowa jest płatna w terminie 7 dni od doręczenia wezwania zawierającego opis naruszenia i kalkulację. Za opóźnienie należą się właściwe odsetki ustawowe; brak faktury VAT nie wstrzymuje wymagalności kary, która nie stanowi wynagrodzenia za usługę.
Późniejsza spłata, rozwiązanie, odstąpienie, bezskuteczność zabezpieczenia albo nieosiągnięcie zakładanego wyniku nie usuwa Naruszenia Obejściowego. Niewykonany projekt dokumentu nie wystarcza jednak do naliczenia kary, jeżeli nie zawarto wiążącej transakcji, nie przekazano korzyści i nie wystąpiło inne zdarzenie z ust. 1.
§ 9. Pięcioletnia ochrona i zakaz obchodzenia
Okres Ochronny biegnie przez pięć lat od Ujawnienia Identyfikującego i obowiązuje niezależnie od odrzucenia Projektu, wygaśnięcia rezerwacji, zawieszenia konta, wypowiedzenia Umowy albo zmiany osoby Inwestora na spółkę.
Inwestor nie może projektować, inicjować ani akceptować konstrukcji, której celem lub skutkiem jest uniknięcie Mechanizmu Zabezpieczenia Prowizji albo zapłaty Prowizji Klientowskiej, w szczególności przez użycie Grupy Inwestora, podział jednej transakcji, finansowanie przez pośrednika, cesję przed lub po wypłacie, administratora hipoteki, zmianę zabezpieczenia, rozliczenie poza systemem albo zawarcie kolejnej umowy bez informacji dla Finance You.
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
Stała kara za naruszenie raportowania nie ma zastosowania do Konsumenta. Kara Obejściowa może zostać zastosowana wobec Konsumenta wyłącznie po jej rzeczywistym, indywidualnym uzgodnieniu przed Ujawnieniem Identyfikującym, w osobnym oświadczeniu zawierającym sposób obliczenia, kwotowy przykład oraz jednoznaczne wskazanie, że poza Opłatą Abonamentową i Karą Obejściową Inwestor nie płaci Finance You żadnego wynagrodzenia. W pozostałym zakresie odpowiedzialność Konsumenta podlega zasadom ogólnym.
§ 15. Postanowienia dla Konsumenta i umowa na odległość
Przed zawarciem Umowy Konsument otrzymuje na trwałym nośniku informacje z Załącznika nr 3, aktualną Umowę, wzór odstąpienia oraz informację o wysokości Opłaty Abonamentowej i sposobie jej zapłaty. Przed każdym Ujawnieniem Identyfikującym otrzymuje także indywidualną Kartę Leada wskazującą, że za Projekt nie są należne opłaty poza Opłatą Abonamentową, warunki Prowizji Klientowskiej, Mechanizm Zabezpieczenia Prowizji oraz sposób obliczenia i przykład Kary Obejściowej.
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
Rozwiązanie Umowy nie wpływa na Prowizję Klientowską, obowiązki związane z Mechanizmem Zabezpieczenia Prowizji, już powstałą Karę Obejściową, poufność, ochronę danych, dowody, kontrolę, zakaz obchodzenia ani Okres Ochronny Projektów ujawnionych przed rozwiązaniem.
Strony przyjmują, że pięcioletni Okres Ochronny określa czas, w którym Transakcja Chroniona może prowadzić do Naruszenia Obejściowego; nie zmienia on ustawowych terminów przedawnienia roszczenia o już wymagalną Karę Obejściową lub Prowizję Klientowską.
§ 17. Reklamacje i komunikacja
Oświadczenia dotyczące Projektu składa się przez konto w systemie lub na adres e-mail wskazany w Karcie Leada. Oświadczenia o wypowiedzeniu, odstąpieniu, zmianie strony, sporze o Prowizję Klientowską lub Karę Obejściową i naruszeniu danych wymagają formy dokumentowej umożliwiającej utrwalenie treści.
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
Prowizja Klientowska
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
Ujawnienie Identyfikujące jest niedopuszczalne, dopóki nie potwierdzono rzeczywistych warunków Prowizji Klientowskiej, Mechanizmu Zabezpieczenia Prowizji, Kary Obejściowej, konfliktu interesów, Karty Transferu i wersji dokumentów.
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
Potwierdzam, że za ten Projekt nie płacę Finance You żadnej opłaty poza Opłatą Abonamentową. Akceptuję obowiązek zastosowania Mechanizmu Zabezpieczenia Prowizji, ujawnioną Prowizję Klientowską, własne wynagrodzenie od Klienta, konflikt i środki zarządzania, Karę Obejściową 5% Sumy Hipotecznej, jej przykład kwotowy, pięcioletni Okres Ochronny oraz wersje dokumentów wskazane w Protokole Akceptacji.
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
Finance You otrzymuje od Klienta Prowizję Klientowską według odrębnej umowy. Standardowo: 7% Kwoty Udzielonej, nie mniej niż 5 000,00 zł, bez VAT — potrącana z wypłaty. Inwestor przekazuje ją z kwoty Finansowania bezpośrednio Finance You zgodnie z dyspozycją Klienta; nie jest to opłata Inwestora.
Kara Obejściowa
Wyłącznie za zawarcie lub wykonanie Transakcji Chronionej bez Mechanizmu Zabezpieczenia Prowizji z przyczyn, za które Inwestor odpowiada: 5% Sumy Hipotecznej. Przykład: 1 000 000,00 zł × 5% = 50 000,00 zł. Kara nie jest ceną usługi; wobec Konsumenta wymaga indywidualnego uzgodnienia.
Wynagrodzenie Inwestora / konflikt
Karta Leada wskazuje również własne wynagrodzenie Inwestora od Klienta oraz konflikt wynikający z wielostronnych płatności i środki jego opanowania. Brak kompletu informacji blokuje ujawnienie danych.
Podatki i koszty obce
Podatki, opłaty sądowe, notarialne, wycena, doradcy, finansowanie przelewu i koszty zabezpieczeń nie są wliczone, chyba że Karta Leada wyraźnie stanowi inaczej.
Płatność
Inwestor płaci wyłącznie Opłatę Abonamentową, z góry za wybrany Okres Abonamentowy. Prowizję Klientowską przekazuje z kwoty Finansowania zgodnie z dyspozycją Klienta. Ewentualna indywidualnie uzgodniona Kara Obejściowa jest płatna w terminie 7 dni od wezwania opisującego naruszenie i kalkulację.
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
Opłata Inwestora za Projekt: brak (dostęp w ramach Opłaty Abonamentowej)  Prowizja Klientowska: __________________  Mechanizm zabezpieczenia: ☐ tak ☐ nieKara Obejściowa 5% i przykład zaakceptowane: ☐ tak ☐ nie  Inwestor→Klient: __________________  konflikt i środki: ☐ tak ☐ nie
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
Kwota Udzielona (kwota Finansowania z umowy)
__________________ zł / waluta: __________
Kwota wypłacana Klientowi (Kwota Udzielona pomniejszona o Prowizję Klientowską)
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
☐ Zlecenie składam na podstawie Ramowej umowy pośrednictwa (wersja: ________). Znam wysokość Opłaty Abonamentowej (1 500,00 zł brutto za 30 dni albo 7 000,00 zł brutto za 365 dni) i wiem, że poza nią nie płacę Finance You za Projekty ani od rezultatu; Prowizja Klientowska (7% Kwoty Udzielonej, nie mniej niż 5 000,00 zł, bez VAT) obciąża Klienta, jest potrącana z wypłaty i podlega Mechanizmowi Zabezpieczenia Prowizji. ☐ Zobowiązuję się przed zawarciem Transakcji Chronionej samodzielnie zweryfikować status przedsiębiorcy Klienta i Cel Gospodarczy (§ 6 ust. 1 pkt 9). ☐ Przyjmuję do wiadomości, że Projekty są przedstawiane wyłącznie w wykonaniu przyjętego Zlecenia i nie mam dostępu do Projektów nieprzypisanych do moich Zleceń.
Konsument
☐ nie dotyczy ☐ Żądam rozpoczęcia wykonywania usługi przed upływem 14-dniowego terminu odstąpienia i przyjmuję do wiadomości, że po pełnym wykonaniu usługi przedstawienia prawo odstąpienia od tej usługi wygaśnie.
Potwierdzenie
kanał / log / OTP: ____________________  data i czas: ____________________
Decyzja Finance You
☐ Zlecenie przyjęte, data: __________ ☐ odmowa przyjęcia, powód: ______________________
',
       docx_base64 = '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',
       docx_filename = '02_Ramowa_umowa_posrednictwa_na_odleglosc_Finance_You_v7.docx',
       allows_investor_fees = true,
       updated_at = now()
 where code = 'umowa_ramowa'
   and version = 'v7'
   and package_id = 'FY-LEGAL-2026-09-29';
-- <<< UMOWA RAMOWA v7

notify pgrst, 'reload schema';
