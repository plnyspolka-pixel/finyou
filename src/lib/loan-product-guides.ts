// Rozszerzona treść podstron produktów (/pozyczka-*): przykład LTV, sekcje
// poradnikowe, dodatkowe FAQ i linki do poradników z bloga.
//
// Dlaczego: w Search Console strony produktów stały na pozycjach 60–90
// z ok. 750 słowami treści, a blog („jak to działa”) wyprzedzał je na te same
// frazy. Strona produktu ma odpowiadać na pytania z wyszukiwarki w całości:
// ile, za ile, jakie dokumenty, czym różni się od kredytu, dla jakich firm.
import {
  FY_COMMISSION_MIN_PLN,
  FY_COMMISSION_PCT,
  LTV_MAX,
  kwotaNaReke,
} from "@/lib/contract-engine/fees";
import { B2B_FAQ, type LoanProduct, type LoanProductFaq } from "@/lib/loan-products";

export type GuideSection = { h: string; p: string[]; list?: string[] };
export type RelatedPost = { slug: string; title: string };

export type ProductGuide = {
  /** Przykład wyliczenia kwoty z LTV (orientacyjny). */
  ltvExample: { propertyValue: number; ltvPct: number; existingDebt?: number; label: string };
  sections: GuideSection[];
  faq: LoanProductFaq[];
  related: RelatedPost[];
};

const P = {
  jakDziala: {
    slug: "pozyczka-pod-zastaw-mieszkania-jak-to-dziala-i-dla-kogo",
    title: "Pożyczka pod zastaw mieszkania – jak to działa i dla kogo?",
  },
  kosztyMieszkania: {
    slug: "ile-kosztuje-pozyczka-pod-zastaw-mieszkania-analiza-kosztow-i-oplat",
    title: "Ile kosztuje pożyczka pod zastaw mieszkania? Analiza kosztów i opłat",
  },
  kosztyNieruchomosci: {
    slug: "ile-kosztuje-pozyczka-pod-zastaw-nieruchomosci-przeglad-oplat-i-prowiz",
    title: "Ile kosztuje pożyczka pod zastaw nieruchomości? Przegląd opłat i prowizji",
  },
  drugaHipoteka: {
    slug: "pozyczka-pod-druga-hipoteke",
    title: "Pożyczka pod II hipotekę — jak działa i ile można dostać",
  },
  art777: {
    slug: "art-777-kpc-wyjasnione",
    title: "Art. 777 k.p.c. — co to znaczy i dlaczego jest w umowie pożyczki",
  },
  ryzyka: {
    slug: "ryzyka-zwiazane-z-pozyczka-pod-zastaw-nieruchomosci-czego-sie-obawiac",
    title: "Ryzyka związane z pożyczką pod zastaw nieruchomości – czego się obawiać?",
  },
  prywatnaVsBankowa: {
    slug: "prywatna-vs-bankowa-pozyczka-pod-zastaw-nieruchomosci",
    title: "Pożyczka pod zastaw nieruchomości: prywatna vs bankowa — co wybrać?",
  },
  zdolnosc: {
    slug: "jak-banki-i-firmy-pozyczkowe-oceniaja-zdolnosc-kredytowa-przy-pozyczce",
    title: "Jak banki i firmy pożyczkowe oceniają zdolność kredytową przy pożyczce hipotecznej?",
  },
  dzialka: {
    slug: "pozyczka-pod-zastaw-dzialki-budowlanej-przewodnik-dla-wlascicieli-grun",
    title: "Pożyczka pod zastaw działki budowlanej – przewodnik dla właścicieli gruntów",
  },
  alternatywy: {
    slug: "alternatywy-dla-pozyczki-hipotecznej-co-zamiast-zastawu-nieruchomosci",
    title: "Alternatywy dla pożyczki hipotecznej — co zamiast zastawu nieruchomości?",
  },
  refinansowanie: {
    slug: "refinansowanie-pozyczki-hipotecznej-kiedy-warto-i-jak-wybrac-oferte",
    title: "Refinansowanie pożyczki hipotecznej – kiedy warto i jak wybrać ofertę?",
  },
  splataDlugow: {
    slug: "pozyczka-na-splate-dlugow-z-obciazeniem-hipotecznym-oddluzanie-z-finan",
    title: "Pożyczka na spłatę długów z obciążeniem hipotecznym",
  },
} satisfies Record<string, RelatedPost>;

export const PRODUCT_GUIDES: Record<string, ProductGuide> = {
  "pozyczka-pod-zastaw-mieszkania": {
    ltvExample: {
      propertyValue: 600_000,
      ltvPct: 50,
      existingDebt: 80_000,
      label: "mieszkanie 55 m² w dużym mieście, z kredytem hipotecznym do spłaty",
    },
    sections: [
      {
        h: "Jakie mieszkanie nadaje się na zabezpieczenie?",
        p: [
          "Najłatwiej o finansowanie pod lokal z odrębną księgą wieczystą, w budynku wielorodzinnym w mieście lub w jego okolicy. Spółdzielcze własnościowe prawo do lokalu też się nada, o ile ma założoną księgę wieczystą — bez niej nie da się wpisać hipoteki.",
          "Inwestor patrzy na to, jak szybko dałoby się mieszkanie sprzedać: lokalizację, metraż, piętro, stan budynku i obciążenia w dziale III i IV księgi. Mieszkanie nie musi być wolne od kredytu — liczy się wartość, która zostaje po odjęciu obecnych zobowiązań.",
        ],
        list: [
          "odrębna własność lokalu lub spółdzielcze prawo z księgą wieczystą,",
          "brak służebności dożywocia i zajęć komorniczych (albo plan ich spłaty z pożyczki),",
          "zgoda wszystkich współwłaścicieli na ustanowienie hipoteki,",
          "mieszkanie może należeć do osoby trzeciej — wtedy podpisuje ona akt jako dłużnik rzeczowy.",
        ],
      },
      {
        h: "Pożyczka pod zastaw mieszkania dla firmy — na jakie cele?",
        p: [
          "Finansujemy cele związane z działalnością — także firm od pierwszego dnia. Najczęściej przedsiębiorcy sięgają po nią, gdy potrzebują pieniędzy szybciej, niż pozwala procedura bankowa, albo gdy bank odmówił z powodu krótkiego stażu firmy, sezonowości przychodów lub chwilowej straty w bilansie.",
        ],
        list: [
          "kapitał obrotowy: zatowarowanie, zaliczki dla podwykonawców, finansowanie kontraktu,",
          "spłata zobowiązań firmy — zaległości w US i ZUS, droższych pożyczek, faktur,",
          "zakup maszyn, pojazdów i wyposażenia bez czekania na leasing,",
          "finansowanie pomostowe do czasu sprzedaży nieruchomości lub uzyskania kredytu.",
        ],
      },
    ],
    faq: [
      {
        q: "Czy pożyczka pod zastaw mieszkania wymaga zaświadczenia o dochodach?",
        a: "Nie w takiej formie jak w banku. Decyzja opiera się przede wszystkim na wartości mieszkania i jego stanie prawnym. Informacja o źródle spłaty (przychody firmy, kontrakt, planowana sprzedaż) przyspiesza jednak decyzję inwestora.",
      },
      {
        q: "Czy mieszkanie spółdzielcze może być zabezpieczeniem?",
        a: "Tak, jeśli to spółdzielcze własnościowe prawo do lokalu z założoną księgą wieczystą. Spółdzielcze lokatorskie prawo do lokalu nie nadaje się na zabezpieczenie hipoteką.",
      },
    ],
    related: [P.jakDziala, P.kosztyMieszkania, P.drugaHipoteka, P.art777],
  },
  "pozyczka-pod-zastaw-domu": {
    ltvExample: {
      propertyValue: 900_000,
      ltvPct: 50,
      label: "dom jednorodzinny 140 m² z działką pod dużym miastem, bez obciążeń",
    },
    sections: [
      {
        h: "Jak wycenia się dom pod zastaw?",
        p: [
          "Wartość domu to suma budynku i działki. Wycena uwzględnia powierzchnię użytkową, standard i stan techniczny, rok budowy, wielkość działki, dojazd oraz lokalizację — dom pod dużym miastem jest wyceniany wyżej i szybciej znajduje finansującego niż dom w małej miejscowości.",
          "Dom w budowie też może być zabezpieczeniem. Wycena odpowiada wtedy stanowi zaawansowania (surowy otwarty, surowy zamknięty, deweloperski), więc kwota jest niższa niż po zakończeniu budowy.",
        ],
        list: [
          "dom jednorodzinny, bliźniak, segment, dom z budynkami gospodarczymi,",
          "dom w budowie z pozwoleniem na budowę i dziennikiem budowy,",
          "siedlisko rolne — zobacz też pożyczkę dla rolników,",
          "dom należący do kilku osób — potrzebna zgoda wszystkich współwłaścicieli.",
        ],
      },
      {
        h: "Pożyczka pod zastaw domu dla firmy — kiedy ma sens?",
        p: [
          "Dom zwykle ma wyższą wartość niż mieszkanie, więc pozwala sięgnąć po większą kwotę. To rozwiązanie dla przedsiębiorców, którzy potrzebują kapitału na rozwój albo muszą szybko uporządkować zobowiązania firmy, a bank odmówił lub wymaga miesięcy na decyzję.",
          "Hipoteka nie przenosi własności: w domu dalej mieszkasz, a po spłacie pożyczki hipoteka zostaje wykreślona z księgi wieczystej.",
        ],
      },
    ],
    faq: [
      {
        q: "Czy można dostać pożyczkę pod zastaw domu z kredytem hipotecznym?",
        a: "Tak, jeśli po odjęciu salda kredytu zostaje wystarczająca wartość. Pożyczka jest wtedy zabezpieczona kolejną hipoteką albo częściowo spłaca dotychczasowy kredyt.",
      },
      {
        q: "Czy dom na wsi nada się na zabezpieczenie?",
        a: "Tak, choć wycena jest ostrożniejsza niż w mieście, a znalezienie finansującego może potrwać dłużej. Pomaga dobry dojazd, uregulowany stan prawny i działka z księgą wieczystą.",
      },
    ],
    related: [P.kosztyNieruchomosci, P.prywatnaVsBankowa, P.drugaHipoteka, P.ryzyka],
  },
  "pozyczka-pod-zastaw-lokalu-uzytkowego": {
    ltvExample: {
      propertyValue: 800_000,
      ltvPct: 45,
      label: "lokal usługowy 90 m² na parterze, wynajęty na długi okres",
    },
    sections: [
      {
        h: "Jakie lokale użytkowe przyjmują inwestorzy?",
        p: [
          "Zabezpieczeniem może być lokal handlowy, usługowy, biurowy, gabinet, magazyn lub hala — wyodrębniony w budynku albo jako osobna nieruchomość z działką. Najlepiej oceniane są lokale w dobrych lokalizacjach handlowych i takie, które mają najemcę.",
          "Wynajęty lokal to dla inwestora dwie informacje naraz: wartość zabezpieczenia i realne źródło spłaty. Dlatego do wniosku warto dołączyć umowy najmu i potwierdzenia wpływów czynszu.",
        ],
        list: [
          "lokale usługowe i handlowe (parter, witryna, ruch pieszy),",
          "biura i gabinety w budynkach biurowych lub mieszanych,",
          "magazyny, hale i budynki produkcyjne z działką,",
          "lokale gastronomiczne — także gdy prowadzisz w nich własną restaurację.",
        ],
      },
      {
        h: "Nieruchomość komercyjna jako zabezpieczenie finansowania firmy",
        p: [
          "Firmy, które mają własny lokal, często trzymają w nim kapitał, którego nie widać w bieżącej płynności. Pożyczka pod zastaw lokalu użytkowego pozwala ten kapitał uwolnić bez sprzedaży i bez przerywania działalności w lokalu.",
          "Typowe cele to sfinansowanie sezonu, dużego zamówienia, modernizacji lokalu albo spłata droższego finansowania. Wycena lokalu komercyjnego jest ostrożniejsza niż mieszkania, dlatego LTV bywa niższe.",
        ],
      },
    ],
    faq: [
      {
        q: "Czy mogę dalej prowadzić działalność w lokalu pod hipoteką?",
        a: "Tak. Hipoteka nie ogranicza korzystania z lokalu ani jego najmu — zmienia się tylko wpis w dziale IV księgi wieczystej.",
      },
      {
        q: "Czy hala lub magazyn może być zabezpieczeniem?",
        a: "Tak, razem z działką, na której stoi. Wycena uwzględnia stan techniczny, dostęp do drogi i możliwość wynajmu lub sprzedaży obiektu.",
      },
    ],
    related: [P.prywatnaVsBankowa, P.kosztyNieruchomosci, P.zdolnosc, P.ryzyka],
  },
  "pozyczka-pod-zastaw-dzialki": {
    ltvExample: {
      propertyValue: 400_000,
      ltvPct: 40,
      label: "działka budowlana 1 200 m² z MPZP i dostępem do mediów",
    },
    sections: [
      {
        h: "Od czego zależy wartość działki pod zastaw?",
        p: [
          "Działka bez zabudowy jest wyceniana ostrożniej niż mieszkanie, bo trudniej ją szybko sprzedać. Największy wpływ na wycenę i maksymalną kwotę mają: przeznaczenie w planie miejscowym albo decyzja o warunkach zabudowy, dostęp do drogi publicznej, uzbrojenie terenu, kształt i wielkość działki oraz lokalizacja.",
        ],
        list: [
          "wypis i wyrys z MPZP albo decyzja WZ — najsilniejszy argument przy wycenie,",
          "dostęp do drogi publicznej (bezpośredni lub przez służebność wpisaną w KW),",
          "media przy działce: prąd, woda, kanalizacja, gaz,",
          "brak roszczeń i obciążeń w dziale III księgi wieczystej.",
        ],
      },
      {
        h: "Pożyczka pod działkę dla dewelopera i inwestora",
        p: [
          "Deweloperzy i inwestorzy gruntowi korzystają z pożyczki pod zastaw działki, gdy potrzebują kapitału na start inwestycji, projekt i pozwolenia albo na zakup kolejnego gruntu, zanim bank uruchomi kredyt inwestycyjny.",
          "Pożyczkę można też zabezpieczyć kilkoma działkami jednocześnie albo działką i innym gruntem — łączna wartość pozwala wtedy uzyskać wyższą kwotę.",
        ],
      },
    ],
    faq: [
      {
        q: "Ile można pożyczyć pod zastaw działki budowlanej?",
        a: "Zwykle mniej niż pod mieszkanie o tej samej wartości — przy działkach LTV bywa na poziomie 30–50% wartości rynkowej. Kwota zależy od planu miejscowego, dojazdu, mediów i lokalizacji.",
      },
      {
        q: "Czy działka rolna z warunkami zabudowy liczy się jak budowlana?",
        a: "Decyzja o warunkach zabudowy podnosi wartość gruntu, ale przy wycenie liczy się też klasa gruntu i to, czy wymaga wyłączenia z produkcji rolnej. Taką sprawę oceniamy indywidualnie — zobacz też pożyczkę pod zastaw ziemi rolnej.",
      },
    ],
    related: [P.dzialka, P.ryzyka, P.kosztyNieruchomosci, P.alternatywy],
  },
  "pozyczka-pod-zastaw-ziemi-rolnej": {
    ltvExample: {
      propertyValue: 500_000,
      ltvPct: 40,
      label: "10 ha gruntów ornych klasy III–IV z dostępem do drogi gminnej",
    },
    sections: [
      {
        h: "Jak wycenia się grunt rolny pod zastaw?",
        p: [
          "Na wartość ziemi rolnej wpływają powierzchnia, klasa bonitacyjna gleby, położenie (ceny ziemi różnią się mocno między województwami), dostęp do drogi, kształt działek i to, czy grunt jest dzierżawiony. Wyżej wyceniane są grunty z perspektywą odrolnienia — położone przy zabudowie lub objęte planem miejscowym.",
        ],
        list: [
          "wypis z rejestru gruntów z klasami bonitacyjnymi,",
          "numer księgi wieczystej każdej działki,",
          "informacja o dzierżawie, dopłatach i ewentualnych planach zmiany przeznaczenia,",
          "mapa lub zrzut z geoportalu pokazujący dojazd.",
        ],
      },
      {
        h: "Pożyczka pod zastaw ziemi a ustawa o kształtowaniu ustroju rolnego",
        p: [
          "Ograniczenia obrotu ziemią rolną dotyczą jej sprzedaży i nabywania, a nie obciążania hipoteką — na wpis hipoteki nie potrzeba zgody KOWR. Inwestor bierze jednak pod uwagę, że ewentualna sprzedaż gruntu podlega tym ograniczeniom, dlatego wycena ziemi rolnej jest ostrożniejsza.",
          "Grunt może zabezpieczać finansowanie działalności rolniczej albo gospodarczej. Jeśli prowadzisz gospodarstwo, zobacz też pożyczkę dla rolników — tam zabezpieczeniem może być również siedlisko.",
        ],
      },
    ],
    faq: [
      {
        q: "Czy można dostać pożyczkę pod zastaw dzierżawionej ziemi?",
        a: "Tak, hipotekę ustanawia właściciel gruntu. Umowa dzierżawy nie wyklucza zabezpieczenia, ale inwestor uwzględnia ją przy wycenie — warto dołączyć jej kopię.",
      },
      {
        q: "Ile hektarów potrzeba, żeby dostać pożyczkę?",
        a: "Nie ma minimum w hektarach — liczy się łączna wartość gruntu w stosunku do kwoty pożyczki. Kilka mniejszych działek można połączyć w jedno zabezpieczenie.",
      },
    ],
    related: [P.dzialka, P.alternatywy, P.art777, P.kosztyNieruchomosci],
  },
  "pozyczka-dla-rolnikow": {
    ltvExample: {
      propertyValue: 700_000,
      ltvPct: 40,
      label: "siedlisko z domem i 6 ha ziemi w jednym gospodarstwie",
    },
    sections: [
      {
        h: "Pożyczka dla rolnika a kredyt rolniczy w banku",
        p: [
          "Kredyt w banku spółdzielczym bywa tańszy, ale wymaga udokumentowania dochodów gospodarstwa, historii kredytowej i czasu — a decyzja często zapada po sezonie, w którym pieniądze były potrzebne. Pożyczka pod zastaw ziemi lub siedliska opiera się przede wszystkim na wartości zabezpieczenia, więc jest szybsza i dostępna także wtedy, gdy przychody są sezonowe.",
          "To dobre rozwiązanie na konkretny, krótszy cel: zakup maszyny przed sezonem, środki do żniw, prefinansowanie inwestycji do czasu refundacji z ARiMR. Po wpływie dopłat lub sprzedaży plonów pożyczkę można spłacić wcześniej.",
        ],
      },
      {
        h: "Co może zabezpieczyć pożyczkę dla gospodarstwa?",
        p: [
          "Zabezpieczeniem może być grunt rolny z księgą wieczystą, siedlisko (dom z zabudowaniami gospodarczymi) albo kilka nieruchomości razem. Łączenie gruntów pozwala uzyskać wyższą kwotę bez obciążania domu.",
        ],
        list: [
          "grunty orne, łąki i pastwiska z księgą wieczystą,",
          "siedlisko — dom, budynki inwentarskie, magazyny,",
          "kilka działek w jednym lub kilku obrębach,",
          "nieruchomość członka rodziny, który zgodzi się na hipotekę.",
        ],
      },
    ],
    faq: [
      {
        q: "Na co rolnik może przeznaczyć pożyczkę?",
        a: "Na cele związane z gospodarstwem: maszyny i sprzęt, nawozy, pasze i środki ochrony roślin, budowę lub modernizację budynków, dokupienie ziemi, płynność do sprzedaży plonów albo wkład własny do dotacji.",
      },
      {
        q: "Czy można spłacić pożyczkę wcześniej z dopłat lub dotacji?",
        a: "Tak — warunki wcześniejszej spłaty określa umowa, a dopłaty, refundacja z ARiMR lub sprzedaż plonów mogą posłużyć do jej spłaty przed terminem.",
      },
    ],
    related: [P.alternatywy, P.art777, P.dzialka, P.kosztyNieruchomosci],
  },
  "pozyczka-dla-nowych-firm": {
    ltvExample: {
      propertyValue: 500_000,
      ltvPct: 50,
      label: "mieszkanie rodziców wspólnika w średnim mieście, bez obciążeń",
    },
    sections: [
      {
        h: "Dlaczego bank odmawia nowej firmie — i czym różni się pożyczka pod zastaw?",
        p: [
          "Bank ocenia firmę na podstawie historii: zwykle wymaga 12–24 miesięcy działalności, sprawozdań i historii w BIK. Nowa firma tych danych nie ma, więc nawet z dobrym pomysłem i zamówieniami dostaje odmowę albo propozycję drogiego finansowania bez zabezpieczenia.",
          "Przy pożyczce pod zastaw nieruchomości punkt ciężkości jest gdzie indziej: inwestor patrzy przede wszystkim na wartość i stan prawny nieruchomości. Staż firmy ma mniejsze znaczenie, a krótki opis celu i źródła spłaty zastępuje rozbudowany biznesplan.",
        ],
      },
      {
        h: "Jak przygotować wniosek nowej firmy, żeby szybciej dostać decyzję?",
        p: [
          "Najszybciej rozpatrywane są wnioski, w których od razu widać trzy rzeczy: co zabezpiecza pożyczkę, na co pójdą pieniądze i z czego firma ją spłaci.",
        ],
        list: [
          "dokumenty rejestrowe — wpis w CEIDG albo KRS spółki,",
          "numer księgi wieczystej i zdjęcia nieruchomości,",
          "krótki opis celu: wyposażenie, towar, franczyza, adaptacja lokalu,",
          "źródło spłaty: zamówienia, umowy z klientami, planowana sprzedaż.",
        ],
      },
    ],
    faq: [
      {
        q: "Czy jednoosobowa działalność założona w tym miesiącu może dostać pożyczkę?",
        a: "Tak. Nie wymagamy stażu — ważne, żeby cel był związany z działalnością gospodarczą, a nieruchomość miała wystarczającą wartość.",
      },
      {
        q: "Czy pożyczką pod zastaw można sfinansować franczyzę?",
        a: "Tak — opłatę wstępną, wyposażenie punktu i pierwszy towar. Umowa franczyzowa pomaga inwestorowi ocenić źródło spłaty.",
      },
    ],
    related: [P.zdolnosc, P.prywatnaVsBankowa, P.alternatywy, P.splataDlugow],
  },
};

/** Kwota orientacyjna: wartość × LTV − obecne zadłużenie (zaokrąglona do 1 000 zł). */
export function exampleLoanAmount(ex: ProductGuide["ltvExample"]): number {
  const raw = (ex.propertyValue * Math.min(ex.ltvPct, LTV_MAX)) / 100 - (ex.existingDebt ?? 0);
  return Math.max(0, Math.floor(raw / 1000) * 1000);
}

/** Wspólna sekcja kosztów — liczby z tych samych stałych, co kalkulator i umowy. */
export const COST_ITEMS: { t: string; d: string }[] = [
  {
    t: "Odsetki",
    d: "Ustalane z inwestorem dla konkretnej sprawy — zależą od kwoty, okresu, LTV i rodzaju nieruchomości, zawsze w granicach odsetek maksymalnych z Kodeksu cywilnego. Widzisz je w propozycji przed akceptacją.",
  },
  {
    t: "Prowizja inwestora",
    d: "Stała kwota zapisana w umowie, rozłożona równo na raty. Jest podana w propozycji razem z odsetkami.",
  },
  {
    t: `Prowizja Finance You — ${FY_COMMISSION_PCT}% (min. ${FY_COMMISSION_MIN_PLN.toLocaleString("pl-PL")} zł, bez VAT)`,
    d: `Potrącana z wypłaty, więc nie płacisz jej z góry — przy pożyczce 100 000 zł na konto trafia ${kwotaNaReke(100_000).toLocaleString("pl-PL")} zł. Złożenie wniosku i przygotowanie propozycji są bezpłatne.`,
  },
  {
    t: "Notariusz i wpis hipoteki",
    d: "Taksa notarialna zależy od kwoty (rozporządzenie w sprawie maksymalnych stawek), do tego opłata sądowa za wpis hipoteki do księgi wieczystej — 200 zł.",
  },
];

/** Porównanie z kredytem firmowym w banku (bez liczb — tylko różnice procedury). */
export const BANK_COMPARISON: { k: string; bank: string; fy: string }[] = [
  {
    k: "Co decyduje",
    bank: "historia firmy, BIK, zdolność",
    fy: "wartość i stan prawny nieruchomości",
  },
  { k: "Staż firmy", bank: "zwykle 12–24 miesiące", fy: "nie jest wymagany" },
  {
    k: "Dokumenty finansowe",
    bank: "sprawozdania, PIT/CIT, zaświadczenia",
    fy: "opis celu i źródła spłaty",
  },
  { k: "Czas do decyzji", bank: "od kilku tygodni", fy: "zwykle 24 godziny od kompletu danych" },
  { k: "Koszt", bank: "zwykle niższy", fy: "wyższy — płacisz za szybkość i dostępność" },
  { k: "Zabezpieczenie", bank: "różne, często hipoteka i poręczenia", fy: "hipoteka u notariusza" },
];

/** Branże, z których najczęściej przychodzą wnioski (frazy z Search Console). */
export const INDUSTRIES: { t: string; d: string }[] = [
  {
    t: "Transport i logistyka",
    d: "Zakup lub naprawa floty, paliwo i opłaty przy długich terminach płatności.",
  },
  { t: "Budownictwo", d: "Materiały i zaliczki dla podwykonawców przed płatnością od inwestora." },
  { t: "Gastronomia", d: "Wyposażenie lokalu, remont, przetrwanie słabszego sezonu." },
  { t: "Handel", d: "Zatowarowanie przed sezonem, większe zamówienie z rabatem." },
  { t: "Produkcja", d: "Maszyny, surowce, finansowanie dużego kontraktu." },
  { t: "Usługi i medycyna", d: "Sprzęt, adaptacja gabinetu lub biura, nowa lokalizacja." },
];

export function productGuide(p: LoanProduct): ProductGuide | null {
  return PRODUCT_GUIDES[p.slug] ?? null;
}

/** FAQ produktu z pytaniami poradnikowymi (strona + FAQPage JSON-LD). */
export function productFaq(p: LoanProduct): LoanProductFaq[] {
  const extra = PRODUCT_GUIDES[p.slug]?.faq ?? [];
  // pytania produktu → poradnikowe → wspólne B2B
  const specific = p.faq.filter((f) => !B2B_FAQ.includes(f));
  const common = p.faq.filter((f) => B2B_FAQ.includes(f));
  return [...specific, ...extra, ...common];
}
