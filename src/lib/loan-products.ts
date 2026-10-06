// Katalog produktów pożyczkowych — podstrony SEO pod menu „Klient”.
// Jedno źródło prawdy dla: rozwijanego menu w nagłówku, tras /pozyczka-*,
// sitemapy i okrojonego wniosku (zabezpieczenie jest już wybrane).
import type { SecurityType } from "@/lib/loan-math";

export type LoanProductStep = { t: string; d: string };
export type LoanProductFaq = { q: string; a: string };

export type LoanProduct = {
  /** Ścieżka bez wiodącego „/” — jednocześnie slug SEO. */
  slug: string;
  /** Etykieta w menu i okruszkach. */
  menuLabel: string;
  group: "zastaw" | "segment";
  metaTitle: string;
  metaDescription: string;
  h1: string;
  /** Wyróżniona końcówka nagłówka (gradient). */
  h1Accent: string;
  lead: string;
  /** Zabezpieczenie wybrane z góry we wniosku. */
  securityType: SecurityType;
  /** Inne zabezpieczenia, na które klient może się przełączyć bez pełnego pickera. */
  altSecurityTypes?: SecurityType[];
  /** Treść oświadczenia o celu (domyślnie: działalność gospodarcza). */
  purposeLabel?: string;
  intro: string[];
  forWhom: { t: string; d: string }[];
  /** Kroki specyficzne dla produktu, wstawiane przed wizytą u notariusza. */
  extraNotes: string[];
  faq: LoanProductFaq[];
};

/**
 * Procedura od wniosku do wypłaty — wspólna dla wszystkich produktów
 * (różni się tylko dokumentami nieruchomości, które opisuje `docsHint`).
 */
export function procedureSteps(docsHint: string): LoanProductStep[] {
  return [
    {
      t: "Wniosek online",
      d: `Wypełniasz krótki wniosek (ok. 5 minut): miejscowość, zdjęcia, numer księgi wieczystej i dane kontaktowe. ${docsHint} Zgłoszenie jest bezpłatne i bez zobowiązań.`,
    },
    {
      t: "Weryfikacja księgi wieczystej i nieruchomości",
      d: "Sprawdzamy dział II (właściciel) i dział IV (hipoteki) księgi wieczystej, szacujemy wartość nieruchomości na podstawie danych rynkowych i liczymy LTV — relację kwoty pożyczki do wartości zabezpieczenia.",
    },
    {
      t: "Propozycje od inwestorów",
      d: "Uporządkowana sprawa trafia do prywatnych inwestorów i partnerów finansowych. Wstępną decyzję zwykle przekazujemy w ciągu 24 godzin od kompletu danych. Otrzymujesz propozycję: kwota, okres, oprocentowanie i harmonogram.",
    },
    {
      t: "Akceptacja warunków i dokumenty",
      d: "Akceptujesz wybraną propozycję w panelu klienta. Weryfikujemy tożsamość (KYC), zbieramy dokumenty firmy i nieruchomości, a projekt umowy dostajesz do przeczytania przed wizytą u notariusza.",
    },
    {
      t: "Umowa u notariusza",
      d: "Rezerwujemy termin w kancelarii notarialnej — najczęściej w Twojej okolicy. Podpisujesz umowę pożyczki, oświadczenie o ustanowieniu hipoteki na rzecz pożyczkodawcy oraz oświadczenie o poddaniu się egzekucji (art. 777 KPC). Koszty notarialne i sądowe pokrywa pożyczkobiorca zgodnie z taksą.",
    },
    {
      t: "Wniosek o wpis hipoteki",
      d: "Notariusz elektronicznie składa w sądzie wniosek o wpis hipoteki do działu IV księgi wieczystej. Wzmianka o wniosku pojawia się w księdze zwykle w ciągu 1–2 dni roboczych.",
    },
    {
      t: "Wypłata pożyczki",
      d: "Po spełnieniu warunków z umowy (zwykle podpis aktu i wzmianka w KW) inwestor przelewa środki na Twój rachunek. Prowizja Finance You (5% kwoty, min. 5 000 zł) jest potrącana z wypłaty — nie płacisz nic z góry.",
    },
  ];
}

const B2B_FAQ: LoanProductFaq[] = [
  {
    q: "Ile kosztuje złożenie wniosku?",
    a: "Nic. Wniosek jest bezpłatny i niezobowiązujący. Jedyną opłatą dla Finance You jest prowizja 5% kwoty udzielonej pożyczki (nie mniej niż 5 000 zł, bez VAT), potrącana z wypłaty — dopiero po podpisaniu umowy.",
  },
  {
    q: "Ile trwa cały proces — od wniosku do wypłaty?",
    a: "Wstępna decyzja zwykle zapada w 24 godziny od kompletu danych. Cały proces — weryfikacja, akceptacja warunków, notariusz i wypłata — przy sprawnej kompletacji dokumentów trwa najczęściej od kilku dni do dwóch tygodni.",
  },
  {
    q: "Dlaczego umowa jest podpisywana u notariusza?",
    a: "Ustanowienie hipoteki wymaga oświadczenia w formie aktu notarialnego. Notariusz sprawdza tożsamość stron i stan prawny nieruchomości, odczytuje umowę i od razu składa elektronicznie wniosek o wpis hipoteki do księgi wieczystej. To chroni obie strony transakcji.",
  },
  {
    q: "Na jaki cel mogę przeznaczyć pożyczkę?",
    a: "Wyłącznie na cel związany z działalnością gospodarczą (B2B) — np. kapitał obrotowy, inwestycję, zakup maszyn, spłatę zobowiązań firmy. Nie finansujemy celów konsumpcyjnych ani prywatnych potrzeb mieszkaniowych.",
  },
  {
    q: "Czy Finance You gwarantuje udzielenie pożyczki?",
    a: "Nie. Finance You porządkuje sprawę i przedstawia ją inwestorom oraz partnerom finansowym — decyzja o finansowaniu należy do nich.",
  },
];

export const LOAN_PRODUCTS: LoanProduct[] = [
  {
    slug: "pozyczka-pod-zastaw-mieszkania",
    menuLabel: "Pożyczka pod zastaw mieszkania",
    group: "zastaw",
    metaTitle: "Pożyczka pod zastaw mieszkania dla firm — decyzja w 24 h | Finance You",
    metaDescription:
      "Pożyczka pod zastaw mieszkania dla przedsiębiorców — do 1 000 000 zł, bez BIK-owego scoringu, decyzja zwykle w 24 h. Sprawdź procedurę od wniosku przez notariusza do wypłaty.",
    h1: "Pożyczka pod zastaw mieszkania",
    h1Accent: "dla Twojej firmy",
    lead: "Mieszkanie z księgą wieczystą to jedno z najpewniejszych zabezpieczeń. Złóż wniosek online — typ nieruchomości jest już wybrany, potrzebujemy tylko miejscowości, zdjęć i numeru KW.",
    securityType: "mieszkanie",
    intro: [
      "Pożyczka pod zastaw mieszkania to finansowanie, w którym zabezpieczeniem jest hipoteka ustanowiona na lokalu mieszkalnym. Dla inwestora liczy się przede wszystkim wartość i płynność mieszkania, a nie wyłącznie historia kredytowa — dlatego jest to rozwiązanie dla firm, którym bank odmówił lub które potrzebują środków szybciej, niż pozwala procedura bankowa.",
      "Zabezpieczeniem może być mieszkanie z odrębną księgą wieczystą, a także spółdzielcze własnościowe prawo do lokalu z założoną księgą. Mieszkanie może należeć do Ciebie, wspólnika lub osoby trzeciej, która zgodzi się na ustanowienie hipoteki.",
    ],
    forWhom: [
      {
        t: "Przedsiębiorcy po odmowie banku",
        d: "Decyduje wartość mieszkania, a nie sam scoring bankowy.",
      },
      {
        t: "Firmy potrzebujące kapitału obrotowego",
        d: "Na zatowarowanie, kontrakt, zaliczki dla podwykonawców.",
      },
      { t: "Spłata zobowiązań firmy", d: "Konsolidacja długów, zaległości w US lub ZUS." },
    ],
    extraNotes: [
      "Do wniosku przydadzą się zdjęcia każdego pomieszczenia i budynku z zewnątrz.",
      "Jeżeli w mieszkaniu ktoś jest zameldowany, notariusz może poprosić o dodatkowe oświadczenia.",
    ],
    faq: [
      {
        q: "Ile mogę pożyczyć pod zastaw mieszkania?",
        a: "Kwota zależy od wartości mieszkania i jego obciążeń. Zwykle inwestorzy finansują do ok. 50–60% wartości rynkowej (LTV), w kwotach do 1 000 000 zł.",
      },
      {
        q: "Czy mieszkanie może mieć już hipotekę bankową?",
        a: "Tak, o ile po odjęciu obecnego zadłużenia zostaje wystarczająca wartość. Część pożyczki może też posłużyć do spłaty wcześniejszego zobowiązania.",
      },
      {
        q: "Czy mogę dalej mieszkać w mieszkaniu?",
        a: "Tak. Hipoteka nie przenosi własności — mieszkanie pozostaje Twoje, a po spłacie pożyczki hipoteka zostaje wykreślona z księgi wieczystej.",
      },
      ...B2B_FAQ,
    ],
  },
  {
    slug: "pozyczka-pod-zastaw-domu",
    menuLabel: "Pożyczka pod zastaw domu",
    group: "zastaw",
    metaTitle: "Pożyczka pod zastaw domu dla firm — do 1 mln zł | Finance You",
    metaDescription:
      "Pożyczka pod zastaw domu jednorodzinnego, bliźniaka lub domu w budowie — dla przedsiębiorców. Decyzja zwykle w 24 h, umowa u notariusza, prowizja potrącana z wypłaty.",
    h1: "Pożyczka pod zastaw domu",
    h1Accent: "szybko i bez bankowej biurokracji",
    lead: "Dom to zabezpieczenie o wysokiej wartości, które pozwala sięgnąć po większe kwoty. Wniosek ma już wybrany typ nieruchomości — podajesz miejscowość, zdjęcia i numer księgi wieczystej.",
    securityType: "dom",
    intro: [
      "Pożyczka pod zastaw domu to prywatne finansowanie zabezpieczone hipoteką na domu jednorodzinnym, bliźniaku, segmencie lub domu w stanie surowym. Wartość domu wraz z działką często pozwala uzyskać wyższą kwotę niż przy mieszkaniu.",
      "Analizujemy księgę wieczystą, powierzchnię użytkową, stan wykończenia i lokalizację. Dom nie musi być wykończony — dom w budowie też może stanowić zabezpieczenie, choć jego wycena jest ostrożniejsza.",
    ],
    forWhom: [
      { t: "Właściciele firm z domem", d: "Większa kwota dzięki wartości budynku i działki." },
      {
        t: "Inwestycje w rozwój firmy",
        d: "Zakup maszyn, środków trwałych, rozbudowa działalności.",
      },
      { t: "Finansowanie pomostowe", d: "Środki na czas, zanim domkniesz sprzedaż lub kontrakt." },
    ],
    extraNotes: [
      "Przygotuj zdjęcia całego budynku z zewnątrz i każdego pomieszczenia (bez piwnicy i strychu) oraz powierzchnię użytkową.",
      "Przy domu w budowie przydatny jest dziennik budowy lub pozwolenie na budowę.",
    ],
    faq: [
      {
        q: "Czy dom w budowie może być zabezpieczeniem?",
        a: "Tak. Inwestorzy finansują również domy w stanie surowym otwartym lub zamkniętym — wycena uwzględnia stopień zaawansowania budowy.",
      },
      {
        q: "Co jeśli dom ma kilku współwłaścicieli?",
        a: "Wszyscy współwłaściciele muszą wyrazić zgodę na ustanowienie hipoteki i stawić się u notariusza (osobiście lub przez pełnomocnika).",
      },
      ...B2B_FAQ,
    ],
  },
  {
    slug: "pozyczka-pod-zastaw-lokalu-uzytkowego",
    menuLabel: "Pożyczka pod zastaw lokalu użytkowego",
    group: "zastaw",
    metaTitle: "Pożyczka pod zastaw lokalu użytkowego i usługowego | Finance You",
    metaDescription:
      "Pożyczka pod zastaw lokalu użytkowego, usługowego lub biurowego dla firm. Wniosek online, weryfikacja KW, umowa u notariusza i wypłata — zobacz pełną procedurę.",
    h1: "Pożyczka pod zastaw lokalu użytkowego",
    h1Accent: "sklep, biuro, lokal usługowy",
    lead: "Lokal, w którym prowadzisz biznes albo który wynajmujesz, może zabezpieczyć finansowanie firmy. Typ nieruchomości jest już wybrany we wniosku.",
    securityType: "lokal_uslugowy",
    intro: [
      "Pożyczka pod zastaw lokalu użytkowego to finansowanie zabezpieczone hipoteką na lokalu usługowym, handlowym, biurowym lub magazynowym. Wynajęty lokal generujący przychód jest dla inwestorów dodatkowym argumentem — pokazuje źródło spłaty.",
      "Lokal może być wyodrębniony w budynku wielolokalowym albo stanowić osobny budynek. W drugim przypadku istotna jest też powierzchnia użytkowa i działka.",
    ],
    forWhom: [
      { t: "Firmy z własnym lokalem", d: "Odblokuj kapitał zamrożony w nieruchomości firmowej." },
      { t: "Właściciele lokali na wynajem", d: "Przychód z najmu wzmacnia ocenę sprawy." },
      { t: "Pilne potrzeby płynnościowe", d: "Zatowarowanie przed sezonem, kontrakty, zaliczki." },
    ],
    extraNotes: [
      "Przygotuj zdjęcia wnętrza i budynku z zewnątrz oraz umowy najmu, jeśli lokal jest wynajmowany.",
    ],
    faq: [
      {
        q: "Czy lokal może być wynajęty?",
        a: "Tak. Umowy najmu warto dołączyć — stabilny przychód z najmu jest pozytywnie oceniany przez inwestorów.",
      },
      {
        q: "Czy lokal w budynku bez wyodrębnionej księgi się nada?",
        a: "Potrzebna jest księga wieczysta obejmująca nieruchomość. Jeśli lokal nie jest wyodrębniony, zabezpieczeniem może być udział w nieruchomości — sprawę oceniamy indywidualnie.",
      },
      ...B2B_FAQ,
    ],
  },
  {
    slug: "pozyczka-pod-zastaw-dzialki",
    menuLabel: "Pożyczka pod zastaw działki budowlanej",
    group: "zastaw",
    metaTitle: "Pożyczka pod zastaw działki budowlanej dla firm | Finance You",
    metaDescription:
      "Pożyczka pod zastaw działki budowlanej — finansowanie dla firm zabezpieczone hipoteką na gruncie z MPZP lub warunkami zabudowy. Procedura: wniosek, notariusz, wypłata.",
    h1: "Pożyczka pod zastaw działki budowlanej",
    h1Accent: "kapitał z niezabudowanego gruntu",
    lead: "Niezabudowana działka to kapitał, który możesz wykorzystać w firmie. Wniosek ma już wybraną działkę budowlaną — podajesz lokalizację, zdjęcia i numer KW.",
    securityType: "dzialka_budowlana",
    intro: [
      "Pożyczka pod zastaw działki budowlanej to finansowanie zabezpieczone hipoteką na gruncie przeznaczonym pod zabudowę. Kluczowe są: przeznaczenie w miejscowym planie (MPZP) lub decyzja o warunkach zabudowy, dostęp do drogi publicznej i mediów oraz lokalizacja.",
      "Działki są wyceniane ostrożniej niż mieszkania, dlatego LTV bywa niższe — ale dobrze położony grunt z MPZP jest dla inwestorów atrakcyjnym zabezpieczeniem.",
    ],
    forWhom: [
      {
        t: "Deweloperzy i inwestorzy",
        d: "Finansowanie startu inwestycji lub zakupu kolejnych gruntów.",
      },
      { t: "Firmy z gruntem w majątku", d: "Uwolnij wartość działki bez jej sprzedaży." },
      {
        t: "Finansowanie pomostowe",
        d: "Środki do czasu sprzedaży działki lub uzyskania kredytu.",
      },
    ],
    extraNotes: [
      "Przygotuj wypis z MPZP albo decyzję o warunkach zabudowy oraz zdjęcia działki i dojazdu.",
    ],
    faq: [
      {
        q: "Czy działka musi mieć MPZP?",
        a: "Nie musi, ale MPZP lub decyzja o warunkach zabudowy wyraźnie podnoszą wartość i ułatwiają decyzję inwestora.",
      },
      {
        q: "Czy liczy się dostęp do mediów i drogi?",
        a: "Tak. Dostęp do drogi publicznej i uzbrojenie terenu mają duży wpływ na wycenę i maksymalną kwotę pożyczki.",
      },
      ...B2B_FAQ,
    ],
  },
  {
    slug: "pozyczka-pod-zastaw-ziemi-rolnej",
    menuLabel: "Pożyczka pod zastaw ziemi rolnej",
    group: "zastaw",
    metaTitle: "Pożyczka pod zastaw ziemi rolnej i gruntu rolnego | Finance You",
    metaDescription:
      "Pożyczka pod zastaw gruntu rolnego — hipoteka na ziemi rolnej z księgą wieczystą. Wniosek online, weryfikacja KW i rejestru gruntów, umowa u notariusza, wypłata.",
    h1: "Pożyczka pod zastaw ziemi rolnej",
    h1Accent: "grunt rolny jako zabezpieczenie",
    lead: "Grunty rolne mogą zabezpieczyć finansowanie działalności. Wniosek ma już wybrany grunt rolny — wystarczy lokalizacja, zdjęcia i numer KW lub wypis z rejestru gruntów.",
    securityType: "grunt_rolny",
    intro: [
      "Pożyczka pod zastaw ziemi rolnej to finansowanie zabezpieczone hipoteką na gruncie rolnym. Wycena uwzględnia powierzchnię, klasę bonitacyjną gleby, lokalizację i dostęp do drogi, a także ewentualne plany odrolnienia.",
      "Ustanowienie hipoteki na gruncie rolnym nie wymaga zgody KOWR — ograniczenia ustawy o kształtowaniu ustroju rolnego dotyczą zbycia ziemi, a nie jej obciążenia. Inwestor bierze je jednak pod uwagę przy ocenie zabezpieczenia.",
    ],
    forWhom: [
      { t: "Właściciele gruntów rolnych", d: "Finansowanie działalności bez sprzedaży ziemi." },
      { t: "Gospodarstwa i firmy rolne", d: "Zobacz też ofertę pożyczek dla rolników." },
      { t: "Inwestorzy gruntowi", d: "Środki pomostowe do czasu odrolnienia lub sprzedaży." },
    ],
    extraNotes: [
      "Przygotuj wypis z rejestru gruntów (z klasami bonitacyjnymi) i numer księgi wieczystej.",
    ],
    faq: [
      {
        q: "Czy KOWR musi zgodzić się na hipotekę?",
        a: "Nie. Ustawa o kształtowaniu ustroju rolnego ogranicza nabywanie i zbywanie nieruchomości rolnych, a nie ich obciążanie hipoteką.",
      },
      {
        q: "Jakie znaczenie ma klasa gleby?",
        a: "Klasa bonitacyjna, powierzchnia i lokalizacja wpływają na wartość gruntu, a przez to na maksymalną kwotę pożyczki.",
      },
      ...B2B_FAQ,
    ],
  },
  {
    slug: "pozyczka-dla-rolnikow",
    menuLabel: "Pożyczki dla rolników",
    group: "segment",
    metaTitle: "Pożyczka dla rolników pod zastaw ziemi lub siedliska | Finance You",
    metaDescription:
      "Pożyczka dla rolników zabezpieczona gruntem rolnym lub siedliskiem — na maszyny, nawozy, budynki inwentarskie i płynność gospodarstwa. Decyzja zwykle w 24 h.",
    h1: "Pożyczka dla rolników",
    h1Accent: "pod zastaw ziemi lub siedliska",
    lead: "Finansowanie gospodarstwa bez czekania na bankową procedurę i nabór dotacji. Wniosek jest przygotowany pod grunt rolny — jeśli zabezpieczeniem ma być dom (siedlisko), przełączysz to jednym kliknięciem.",
    securityType: "grunt_rolny",
    altSecurityTypes: ["dom"],
    purposeLabel:
      "Finansowanie przeznaczam na cel związany z prowadzoną działalnością rolniczą lub gospodarczą (nie na cele konsumpcyjne ani prywatne potrzeby mieszkaniowe).",
    intro: [
      "Pożyczka dla rolników to finansowanie gospodarstwa rolnego zabezpieczone hipoteką na gruncie rolnym lub siedlisku. Środki możesz przeznaczyć na zakup maszyn, nawozów i środków ochrony roślin, budowę lub modernizację budynków inwentarskich, dokupienie ziemi albo utrzymanie płynności do czasu sprzedaży plonów i wypłaty dopłat.",
      "Inwestorzy oceniają przede wszystkim wartość zabezpieczenia, dlatego pożyczka bywa dostępna także wtedy, gdy bank odmówił kredytu z powodu sezonowości przychodów lub braku pełnej księgowości.",
    ],
    forWhom: [
      {
        t: "Zakup maszyn i sprzętu",
        d: "Ciągnik, kombajn, opryskiwacz — bez czekania na leasing.",
      },
      { t: "Płynność do żniw", d: "Środki na sezon do czasu sprzedaży plonów i dopłat." },
      { t: "Wkład własny do dotacji", d: "Prefinansowanie inwestycji przed refundacją z ARiMR." },
    ],
    extraNotes: [
      "Przygotuj wypis z rejestru gruntów i numer księgi wieczystej, a przy siedlisku — zdjęcia budynków.",
      "Przydatne są: numer gospodarstwa (ARiMR) i informacja o dopłatach lub przychodach z produkcji.",
    ],
    faq: [
      {
        q: "Czy rolnik bez działalności gospodarczej może złożyć wniosek?",
        a: "Tak, jeśli finansowanie jest przeznaczone na prowadzenie gospodarstwa rolnego (działalność rolnicza), a nie na cele konsumpcyjne. Każdą sprawę oceniamy indywidualnie.",
      },
      {
        q: "Co może być zabezpieczeniem?",
        a: "Grunt rolny z księgą wieczystą albo siedlisko — dom z zabudowaniami gospodarczymi. Można też łączyć kilka nieruchomości.",
      },
      {
        q: "Czy pożyczka może sfinansować wkład własny do dotacji ARiMR?",
        a: "Tak. Pożyczka może pokryć koszty inwestycji do czasu refundacji, a dopłaty lub refundacja mogą posłużyć do wcześniejszej spłaty.",
      },
      ...B2B_FAQ,
    ],
  },
  {
    slug: "pozyczka-dla-nowych-firm",
    menuLabel: "Pożyczki dla nowych firm",
    group: "segment",
    metaTitle: "Pożyczka dla nowej firmy bez historii — pod zastaw nieruchomości | Finance You",
    metaDescription:
      "Pożyczka dla nowych firm i start-upów bez historii kredytowej — zabezpieczona nieruchomością. Bez wymogu 12 miesięcy działalności, decyzja zwykle w 24 h.",
    h1: "Pożyczka dla nowych firm",
    h1Accent: "bez historii kredytowej",
    lead: "Bank wymaga zwykle 12–24 miesięcy działalności. U nas liczy się nieruchomość, która zabezpiecza pożyczkę — nie staż firmy. Wniosek jest wstępnie ustawiony na mieszkanie; inny typ wybierzesz jednym kliknięciem.",
    securityType: "mieszkanie",
    altSecurityTypes: ["dom", "lokal_uslugowy", "dzialka_budowlana", "grunt_rolny"],
    intro: [
      "Pożyczka dla nowej firmy to finansowanie startu lub pierwszego etapu rozwoju działalności, zabezpieczone hipoteką na nieruchomości. Dla nowych przedsiębiorstw bez historii kredytowej i sprawozdań finansowych to często jedyna realna alternatywa dla kredytu bankowego.",
      "Nieruchomość może należeć do właściciela firmy, wspólnika lub członka rodziny, który zgodzi się na ustanowienie hipoteki. Firma może działać od kilku dni — ważne, by cel pożyczki był związany z działalnością gospodarczą.",
    ],
    forWhom: [
      { t: "Start działalności", d: "Wyposażenie, pierwszy towar, adaptacja lokalu." },
      { t: "Spółki celowe i start-upy", d: "Finansowanie bez wymogu historii i bilansu." },
      { t: "Franczyza", d: "Opłata wstępna i wyposażenie punktu franczyzowego." },
    ],
    extraNotes: [
      "Przygotuj dokumenty rejestrowe firmy (CEIDG lub KRS) i krótki opis celu finansowania.",
      "Jeżeli nieruchomość należy do osoby trzeciej, musi ona stawić się u notariusza jako dłużnik rzeczowy.",
    ],
    faq: [
      {
        q: "Czy firma musi działać 12 miesięcy?",
        a: "Nie. Nie wymagamy stażu działalności — decyzja opiera się głównie na wartości nieruchomości stanowiącej zabezpieczenie.",
      },
      {
        q: "Czy zabezpieczeniem może być nieruchomość rodziców?",
        a: "Tak, jeśli właściciel zgodzi się na ustanowienie hipoteki. U notariusza podpisuje oświadczenie jako dłużnik rzeczowy.",
      },
      {
        q: "Czy potrzebny jest biznesplan?",
        a: "Nie jest wymagany, ale krótki opis celu i źródła spłaty przyspiesza decyzję inwestora.",
      },
      ...B2B_FAQ,
    ],
  },
];

export function getLoanProduct(slug: string): LoanProduct {
  const p = LOAN_PRODUCTS.find((x) => x.slug === slug);
  if (!p) throw new Error(`Nieznany produkt pożyczkowy: ${slug}`);
  return p;
}
