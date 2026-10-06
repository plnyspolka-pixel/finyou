import type { Icon3DName } from "./icon-3d";

/**
 * Moduły Klubu Inwestorów — dane podstron /dla-inwestora/<slug>, kart na
 * landingu inwestora i pozycji w sub-menu "Inwestor" (shell.tsx).
 *
 * Każdy moduł opisany jest w formule cecha → zaleta → korzyść (jak bullety
 * abonamentu w lib/investor-plan/plans.ts). Treść opisuje WYŁĄCZNIE to, co
 * robi kod panelu inwestora — przy zmianie modułu zaktualizuj też ten opis:
 *  - Analityk AI      → /inwestor/analityka (lib/analysis-pipeline, kw-analysis,
 *                       risk-assessment, property-analysis)
 *  - Windykator AI    → /inwestor/windykacja (lib/windykacja-*, debt-collection-math)
 *  - AML/compliance   → /inwestor/aml (lib/aml, crbr.server.ts)
 *  - Kancelaria AI    → /inwestor/dokumenty, /inwestor/podpisy (document-generator,
 *                       contract-engine, esign); 30 wzorów = tabela document_templates
 *  - Sieć sprzedaży   → Zlecenia i Projekty (lib/order-cycle-*, lead-source.ts, affiliate)
 * Nie podawaj tu cen abonamentu (są w plans.ts) ani obietnic, których kod nie
 * realizuje (np. automatycznych wysyłek windykacyjnych bez kliknięcia inwestora).
 */

export type FabRow = {
  /** Krótka nazwa funkcji — nagłówek wiersza. */
  title: string;
  icon: Icon3DName;
  /** Cecha — co to jest. */
  cecha: string;
  /** Zaleta — co to robi / czym się wyróżnia. */
  zaleta: string;
  /** Korzyść — co inwestor z tego ma. */
  korzysc: string;
};

export type InvestorModule = {
  slug: string;
  /** Pełna nazwa (nagłówki, breadcrumb, karty). */
  name: string;
  /** Nazwa w nagłówku H1: część biała + część złota (jak na grafice). */
  nameLead: string;
  nameAccent: string;
  menuLabel: string;
  tagline: string;
  /** Grafika modułu (1536×1024, webp). */
  image: string;
  imageAlt: string;
  metaTitle: string;
  metaDescription: string;
  lead: string;
  highlights: [string, string, string];
  fab: FabRow[];
  steps: { t: string; d: string }[];
  note: string;
};

/** Zastrzeżenie wspólne dla modułów panelu (Regulamin Abonamentu, § 3 ust. 2). */
const TRAINING_TOOL =
  "Moduł jest narzędziem szkoleniowym dostępnym w ramach Abonamentu inwestora i stanowi część szkolenia, a nie odrębną usługę.";

export const INVESTOR_MODULES: InvestorModule[] = [
  {
    slug: "analityk-ai",
    name: "Analityk AI",
    nameLead: "Analityk",
    nameAccent: "AI",
    menuLabel: "Analityk AI",
    tagline: "Analiza zabezpieczenia i ryzyka uruchamiana jednym kliknięciem",
    image: "/marketing/moduly/analityk-ai.webp",
    imageAlt:
      "Analityk AI — karty analizy nieruchomości: LTV, wartość rynkowa i ocena ryzyka na ekranie laptopa",
    metaTitle: "Analityk AI — analiza zabezpieczenia i ryzyka dla inwestora | Finance You",
    metaDescription:
      "Księga wieczysta, właściciele, wartość rynkowa, LTV, płynność i scenariusz licytacji w jednym raporcie. Poznaj Analityka AI w Klubie Inwestorów Hipotecznych.",
    lead: "Zanim wyłożysz kapitał, Analityk AI pobiera księgę wieczystą, sprawdza właścicieli w rejestrach, wycenia nieruchomość na danych z rynku i ocenia, ile realnie odzyskasz w najgorszym scenariuszu. Ty dostajesz czytelny raport — decyzja zostaje po Twojej stronie.",
    highlights: [
      "Księga wieczysta i właściciele",
      "Wartość, LTV i płynność",
      "Ocena zabezpieczenia i ryzyka",
    ],
    fab: [
      {
        title: "Księga wieczysta przeczytana za Ciebie",
        icon: "documents",
        cecha:
          "Automatyczne pobranie księgi wieczystej z systemu EKW — okładki i działów I-O, I-Sp, II, III i IV.",
        zaleta:
          "Silnik reguł ocenia każdy wpis (od „Brak problemu” do „STOP”), przewiduje miejsce Twojej hipoteki, wskazuje wzmianki i alerty, a przy każdej uwadze wyjaśnia, co oznacza ona dla inwestora.",
        korzysc:
          "Wiesz, czy zabezpieczenie jest czyste, zanim zapłacisz za opinię prawną albo podejmiesz decyzję.",
      },
      {
        title: "Właściciele sprawdzeni w rejestrach",
        icon: "shieldcheck",
        cecha: "Właściciele z działu II księgi zestawieni z danymi z CEIDG i KRS.",
        zaleta: "System oznacza firmy w likwidacji lub upadłości, zanim zaczniesz rozmowy.",
        korzysc:
          "Nie finansujesz podmiotu, którego sytuacja prawna przekreśla spłatę — wiesz to od pierwszego dnia.",
      },
      {
        title: "Wartość rynkowa i LTV",
        icon: "growth",
        cecha:
          "Wycena w widełkach — wartość minimalna, średnia i maksymalna — z ofert i danych transakcyjnych oraz trend lokalnego rynku.",
        zaleta:
          "Ceny liczone są wprost z danych, a AI tylko komentuje trend. System sugeruje bezpieczny pułap LTV dla danego typu nieruchomości i obniża go przy egzekucji, dożywociu czy słabej płynności.",
        korzysc:
          "Widzisz realną poduszkę bezpieczeństwa między kwotą pożyczki a wartością zabezpieczenia.",
      },
      {
        title: "Scenariusz licytacji komorniczej",
        icon: "kalkulator",
        cecha:
          "Wartości przy sprzedaży egzekucyjnej: pierwsza licytacja od 3/4, druga od 2/3 wartości oszacowania.",
        zaleta:
          "Oceniasz zabezpieczenie także w najgorszym scenariuszu — gdy sprawa trafi do komornika.",
        korzysc: "Wiesz, ile realnie odzyskasz, zanim podpiszesz umowę.",
      },
      {
        title: "Płynność i lokalizacja",
        icon: "house",
        cecha:
          "Wskaźnik płynności 0–100 z szacowanym czasem sprzedaży, liczbą ludności i jej trendem, odległością do dużego miasta, medianą ceny za m² i infrastrukturą w promieniu 1,5 km.",
        zaleta:
          "Ocena opiera się na danych GUS, OpenStreetMap i lokalnych ofertach, a nie na deklaracjach klienta.",
        korzysc: "Unikasz zabezpieczeń, których w razie problemów nikt nie kupi.",
      },
      {
        title: "Karta zabezpieczenia",
        icon: "aibrain",
        cecha:
          "Ocena zabezpieczenia 0–100 z pięciu obszarów: stan prawny i dokumenty, wartość i LTV, płynność, czynniki techniczne i ryzyko powodziowe oraz jakość danych.",
        zaleta:
          "Na jednej karcie widzisz trzy najmocniejsze strony i trzy główne ryzyka Projektu, z ostrożnym przedziałem wartości i ryzykiem powodzi z map ISOK.",
        korzysc: "Porównujesz Projekty według tych samych kryteriów i decydujesz szybciej.",
      },
      {
        title: "Analiza Twojej własnej transakcji",
        icon: "knowledge",
        cecha:
          "Sprawdzenie dowolnej nieruchomości po numerze księgi wieczystej — także transakcji spoza Finance You — z oceną inwestycyjną w skali A–E.",
        zaleta:
          "Ocena łączy łatwość sprzedaży, stan prawny, zabezpieczenie, pewność wyceny i pozostałe czynniki w jeden wynik, widoczny tylko dla Ciebie.",
        korzysc: "Analityk pracuje dla Ciebie także przy transakcjach, które znajdziesz sam.",
      },
    ],
    steps: [
      {
        t: "Wybierasz Projekt albo numer KW",
        d: "Projekt dopasowany do Twojego Zlecenia albo własną transakcję spoza Finance You.",
      },
      {
        t: "Klikasz „Uruchom analizę”",
        d: "Księga wieczysta, właściciele i analiza wpisów są gotowe od razu.",
      },
      {
        t: "Dostajesz wycenę i ocenę ryzyka",
        d: "Wartość, LTV, płynność i karta zabezpieczenia dochodzą zwykle w ciągu 15–30 minut.",
      },
      {
        t: "Decydujesz na faktach",
        d: "Z pełnym obrazem zabezpieczenia — decyzja o finansowaniu zawsze należy do Ciebie.",
      },
    ],
    note: `${TRAINING_TOOL} Raporty mają charakter informacyjny i nie stanowią rekomendacji ani porady inwestycyjnej, a wycena nie jest operatem szacunkowym. Decyzję podejmujesz samodzielnie — zalecamy weryfikację u rzeczoznawcy majątkowego i radcy prawnego.`,
  },
  {
    slug: "windykator-ai",
    name: "Windykator AI",
    nameLead: "Windykator",
    nameAccent: "AI",
    menuLabel: "Windykator AI",
    tagline: "Monitoring i windykacja krok po kroku — z AI po Twojej stronie",
    image: "/marketing/moduly/windykator-ai.webp",
    imageAlt:
      "Windykator AI — robot AI z wezwaniem do zapłaty, kalendarzem terminów i segregatorami spraw windykacyjnych",
    metaTitle: "Windykator AI — windykacja pożyczek krok po kroku dla inwestora | Finance You",
    metaDescription:
      "Ścieżki windykacji, saldo z odsetkami co do dnia, wezwania i pisma z danymi sprawy, SMS, e-mail i telefon AI oraz raport dowodowy. Poznaj Windykatora AI.",
    lead: "Gdy pożyczkobiorca przestaje płacić, Windykator AI podpowiada ścieżkę i następny krok, liczy zadłużenie z odsetkami, przygotowuje pisma, wysyła SMS-y i e-maile, a nawet dzwoni do dłużnika głosem AI. Każdą czynność uruchamiasz jednym kliknięciem — decyzje zostają po Twojej stronie.",
    highlights: [
      "Wezwania i pisma z danymi sprawy",
      "Terminy doręczeń pod kontrolą",
      "Teczka sprawy i raport dowodowy",
    ],
    fab: [
      {
        title: "Cztery ścieżki postępowania",
        icon: "procedures",
        cecha:
          "Ścieżki miękka, standardowa (z oświadczeniem z art. 777 k.p.c.), twarda i karna — każda z etapami, podstawą prawną i jedną główną czynnością na etap.",
        zaleta:
          "System rekomenduje ścieżkę według liczby dni opóźnienia i podpowiada następny krok, opisany prostym językiem.",
        korzysc: "Wiesz, co zrobić dziś — nawet jeśli to Twoja pierwsza windykacja.",
      },
      {
        title: "Saldo i odsetki co do dnia",
        icon: "kalkulator",
        cecha:
          "Kalkulator zadłużenia liczący odsetki dzień po dniu, z limitem odsetek maksymalnych za opóźnienie i zaliczaniem wpłat zgodnie z art. 451 k.c.",
        zaleta:
          "Rozróżnia okres przed i po wypowiedzeniu umowy oraz dolicza koszty czynności windykacyjnych według umowy pożyczki.",
        korzysc:
          "Znasz kwotę, której możesz żądać — bez arkuszy kalkulacyjnych i ryzyka zawyżenia roszczenia.",
      },
      {
        title: "Wezwania i pisma gotowe do wysłania",
        icon: "documents",
        cecha:
          "Wzory pism: wezwanie do zapłaty, wypowiedzenie umowy, porozumienie ratalne, ugoda, wniosek o klauzulę wykonalności, wniosek do komornika i zawiadomienie o przestępstwie.",
        zaleta:
          "Dane dłużnika, kwoty i terminy wstawiają się same, a do sprawy możesz też podpiąć wzory z Kancelarii AI.",
        korzysc: "Pismo masz od ręki, bez przepisywania danych i bez czekania na kancelarię.",
      },
      {
        title: "SMS, e-mail i telefon AI",
        icon: "chat",
        cecha:
          "Kontakt z dłużnikiem z poziomu sprawy: SMS, e-mail i rozmowa prowadzona przez agenta głosowego AI.",
        zaleta:
          "Agent AI dzwoni w Twoim imieniu, podaje kwotę zaległości i pyta o termin spłaty — bez gróźb, bez negocjowania kwoty długu, tylko w godzinach 8:00–22:00, nie w niedziele i nie częściej niż raz na dobę.",
        korzysc:
          "Nie musisz sam prowadzić trudnych rozmów, a kontakt pozostaje w granicach prawa i dobrych obyczajów.",
      },
      {
        title: "Terminy pod kontrolą",
        icon: "updates",
        cecha:
          "Rejestr doręczeń z 7-dniowym terminem liczonym od skutecznego doręczenia — także przy awizo i zwrocie przesyłki.",
        zaleta:
          "Pulpit pokazuje sprawy „Wymaga działania dziś” i sprawy krytyczne, a AI rozpoznaje ze zdjęcia potwierdzenie nadania, zwrotkę czy awizo.",
        korzysc: "Żaden termin nie przepada, a Ty nie przeglądasz codziennie stosu papierów.",
      },
      {
        title: "Umowa odczytana przez AI",
        icon: "aibrain",
        cecha:
          "Odczyt umowy pożyczki ze zdjęcia lub PDF: dłużnik, kwoty, terminy płatności, numer księgi wieczystej, oprocentowanie i tabela opłat windykacyjnych.",
        zaleta: "Sprawę zakładasz bez ręcznego przepisywania danych z umowy.",
        korzysc: "Zaczynasz działać od razu — w windykacji liczy się każdy dzień.",
      },
      {
        title: "Teczka sprawy i raport dowodowy",
        icon: "crmfolder",
        cecha:
          "Oś czasu sprawy, rejestr czynności i opłat, skany dowodów nadania i doręczeń oraz raport dowodowy do druku lub zapisu w PDF.",
        zaleta:
          "Zdarzenia są tylko dopisywane — każde ma datę, a historii nie da się później zmienić ani usunąć.",
        korzysc:
          "Kompletną dokumentację przekazujesz sądowi, komornikowi albo prawnikowi bez kompletowania jej od zera.",
      },
    ],
    steps: [
      {
        t: "Zakładasz sprawę",
        d: "AI odczytuje dane z umowy, a system liczy zaległość z odsetkami.",
      },
      {
        t: "Wybierasz ścieżkę",
        d: "System rekomenduje ją według dni opóźnienia i podpowiada następny krok.",
      },
      {
        t: "Działasz jednym kliknięciem",
        d: "SMS, e-mail, telefon AI albo pismo z danymi sprawy.",
      },
      {
        t: "Masz komplet dowodów",
        d: "Doręczenia, terminy i raport dowodowy w jednej teczce sprawy.",
      },
    ],
    note: `${TRAINING_TOOL} Każdą czynność uruchamiasz i zatwierdzasz Ty — system liczy, podpowiada i przygotowuje dokumenty. W przypadku sporu sądowego sprawa może wymagać profesjonalnej obsługi prawnej.`,
  },
  {
    slug: "aml-compliance",
    name: "Moduł AML/compliance",
    nameLead: "Moduł",
    nameAccent: "AML/compliance",
    menuLabel: "Moduł AML/compliance",
    tagline: "Weryfikacja klientów i zgodność procesów w jednym miejscu",
    image: "/marketing/moduly/aml-compliance.webp",
    imageAlt:
      "Moduł AML/compliance — tarcza ze znakiem zatwierdzenia, lista kontrolna oraz ekrany KYC i list sankcyjnych PEP",
    metaTitle: "Moduł AML/compliance — KYC, sankcje, PEP i GIIF dla inwestora | Finance You",
    metaDescription:
      "Rejestr klientów z CRBR, screening sankcji i PEP, KYC, ocena ryzyka, rejestr transakcji z progiem 15 000 EUR i zgłoszenia do GIIF. Poznaj moduł AML/compliance.",
    lead: "Udzielając pożyczek, możesz podlegać obowiązkom instytucji obowiązanej z ustawy o przeciwdziałaniu praniu pieniędzy. Moduł AML porządkuje je w jednym miejscu: od rejestru klientów i screeningu, przez ocenę ryzyka i rejestr transakcji, po przygotowanie zgłoszeń do GIIF.",
    highlights: [
      "KYC, sankcje, PEP i CRBR",
      "Ocena ryzyka i rejestr transakcji",
      "Zgłoszenia GIIF w XML i PDF",
    ],
    fab: [
      {
        title: "Rejestr klientów z CRBR",
        icon: "crm",
        cecha:
          "Rejestr klientów — osób fizycznych i firm — z pobieraniem beneficjentów rzeczywistych i reprezentantów z Centralnego Rejestru Beneficjentów Rzeczywistych.",
        zaleta:
          "System porównuje dane z CRBR z danymi klienta i oznacza niezgodności, a każda zmiana danych klienta unieważnia poprzedni screening.",
        korzysc:
          "Wiesz, z kim naprawdę zawierasz umowę, a nieaktualna weryfikacja nie przejdzie niezauważona.",
      },
      {
        title: "Sankcje, PEP i rejestry karne",
        icon: "shieldcheck",
        cecha:
          "Screening klienta — a przy firmie także każdego reprezentanta i beneficjenta — na listach sankcyjnych, PEP i w rejestrach karnych, u wyspecjalizowanego dostawcy.",
        zaleta:
          "Każde trafienie rozstrzygasz jednym wyborem (fałszywy alarm, potwierdzony PEP, sankcja…), a potwierdzona sankcja albo nierozstrzygnięte trafienie oznacza klienta jako zablokowanego.",
        korzysc: "Nie przeoczysz osoby z listy sankcyjnej przed podpisaniem umowy.",
      },
      {
        title: "Zdalna weryfikacja tożsamości",
        icon: "access",
        cecha:
          "Link do weryfikacji KYC dla klienta — dokument tożsamości i selfie z porównaniem twarzy; dla firm weryfikacja KYB.",
        zaleta:
          "Klient przechodzi weryfikację sam, na telefonie, a wynik wraca do jego profilu automatycznie.",
        korzysc: "Potwierdzasz tożsamość klienta bez spotkania i bez kserowania dokumentów.",
      },
      {
        title: "Ocena ryzyka z uzasadnieniem",
        icon: "complianceAml",
        cecha:
          "Punktowa propozycja poziomu ryzyka: sankcje, PEP, kraje wysokiego ryzyka, niezgodności w CRBR, brak beneficjentów, transakcje gotówkowe oraz brak celu finansowania lub źródła spłaty.",
        zaleta:
          "Widzisz, z czego wynika ocena, a zmiana propozycji systemu wymaga uzasadnienia, które zostaje w aktach.",
        korzysc: "Twoja decyzja jest udokumentowana i obroni się podczas kontroli.",
      },
      {
        title: "Rejestr transakcji i próg 15 000 EUR",
        icon: "complianceRegistry",
        cecha:
          "Rejestr transakcji z przeliczeniem na euro po średnim kursie NBP z dnia transakcji — z zapisem kursu, numeru tabeli i daty.",
        zaleta:
          "Po przekroczeniu progu 15 000 EUR system sam zakłada wpis w rejestrze progowym z terminem zgłoszenia.",
        korzysc: "Nie musisz pamiętać o progach i terminach — moduł pilnuje ich za Ciebie.",
      },
      {
        title: "Zgłoszenia do GIIF i sprawy AML",
        icon: "complianceDocs",
        cecha:
          "Zgłoszenia z art. 72, 74, 86 i 89–90 w formatach XML i PDF, z kontrolą kompletności danych i wersjami; sprawy AML z chronologią, decyzjami i załącznikami.",
        zaleta:
          "Dane do zgłoszenia zbierają się z rejestrów modułu, a po wysyłce przez SI GIIF dołączasz UPO do sprawy.",
        korzysc:
          "Zgłoszenie przygotowujesz na gotowych danych, a cała dokumentacja AML leży w jednym miejscu.",
      },
      {
        title: "Ślad audytowy nie do podważenia",
        icon: "complianceProcess",
        cecha:
          "Dziennik zdarzeń AML tylko do dopisywania — baza danych blokuje edycję i usuwanie wpisów; pliki z sumą kontrolną SHA-256.",
        zaleta:
          "Każda czynność — screening, decyzja, zgłoszenie — zostaje zapisana z datą na stałe.",
        korzysc: "W razie kontroli pokazujesz kompletny i wiarygodny ślad swoich działań.",
      },
    ],
    steps: [
      {
        t: "Dodajesz klienta",
        d: "Dane osoby albo firmy; dla firmy pobierasz beneficjentów z CRBR.",
      },
      {
        t: "Weryfikujesz",
        d: "Wysyłasz link KYC i uruchamiasz screening sankcji, PEP i rejestrów karnych.",
      },
      {
        t: "Oceniasz ryzyko",
        d: "System proponuje poziom ryzyka, a Ty go zatwierdzasz albo zmieniasz z uzasadnieniem.",
      },
      {
        t: "Rejestrujesz i zgłaszasz",
        d: "Transakcje, progi, terminy i zgłoszenia do GIIF w jednym module.",
      },
    ],
    note: `${TRAINING_TOOL} Nie zastępuje wewnętrznej procedury AML ani porady prawnej. Zgłoszenia do GIIF wysyłasz samodzielnie, jako instytucja obowiązana, własnym podpisem kwalifikowanym — Finance You nie podpisuje ich za Ciebie i nie przechowuje Twojego podpisu.`,
  },
  {
    slug: "kancelaria-ai",
    name: "Kancelaria AI",
    nameLead: "Kancelaria",
    nameAccent: "AI",
    menuLabel: "Kancelaria AI",
    tagline: "30 wzorów dokumentów na klik",
    image: "/marketing/moduly/kancelaria-ai.webp",
    imageAlt:
      "Kancelaria AI — umowa, wezwanie i inne dokumenty generowane na ekranie laptopa obok wagi Temidy",
    metaTitle: "Kancelaria AI — 30 wzorów dokumentów i umowa pożyczki dla inwestora | Finance You",
    metaDescription:
      "Umowa pożyczki z biblioteki klauzul, 30 wzorów dokumentów — od aneksu i wezwania po wniosek do komornika — dane z GUS i KRS oraz e-podpis ze śladem audytowym.",
    lead: "Umowa pożyczki składana z biblioteki sprawdzonych klauzul, aneksy, wezwania, oświadczenia oraz wnioski do sądu i komornika — gotowe wzory wypełniane danymi z rejestrów i kalkulatora. Na koniec wysyłasz dokument do podpisu elektronicznego z pełnym śladem audytowym.",
    highlights: [
      "Umowy, aneksy i wezwania",
      "Generowanie jednym kliknięciem",
      "E-podpis ze śladem audytowym",
    ],
    fab: [
      {
        title: "Umowa pożyczki z agentem AI",
        icon: "dossier",
        cecha:
          "Agent AI zbiera w rozmowie dane do umowy, a tekst składa silnik z biblioteki 113 klauzul — wniosek, umowa i załączniki w jednym pliku DOCX.",
        zaleta:
          "AI nie pisze treści umowy i nie dopisuje danych, których nie podałeś (PESEL, NIP, numer KW) — wypełnia sprawdzone klauzule.",
        korzysc: "Dostajesz spójną umowę bez pisania od zera i bez ryzyka zmyślonych zapisów.",
      },
      {
        title: "30 wzorów na cały cykl pożyczki",
        icon: "documents",
        cecha:
          "Wzory w kategoriach: umowy i aneksy, windykacja miękka, windykacja sądowa, oświadczenia i załączniki.",
        zaleta:
          "Od aneksu przedłużającego termin i ugody ratalnej, przez monit i ostateczne wezwanie, po pozew, wniosek egzekucyjny i zgodę na wykreślenie hipoteki.",
        korzysc: "Na każdym etapie pożyczki masz pod ręką właściwy dokument.",
      },
      {
        title: "Dane firm z rejestrów",
        icon: "crmfolder",
        cecha:
          "Pobieranie danych kontrahenta po numerze NIP, REGON albo KRS — z GUS, KRS i Białej Listy.",
        zaleta: "Dane rejestrowe trafiają do dokumentu bez przepisywania.",
        korzysc: "Mniej pomyłek w oznaczeniu stron — mniej problemów przy egzekucji.",
      },
      {
        title: "Liczby prosto z kalkulatora",
        icon: "kalkulator",
        cecha:
          "Wartości z kalkulatora inwestora (także z zapisanego PDF), harmonogram spłat jako tabela Word i kwoty słownie.",
        zaleta: "Liczby w dokumentach zgadzają się z kalkulacją, którą widział klient.",
        korzysc: "Nie tracisz czasu na przeliczanie i nie ryzykujesz rozbieżności w umowie.",
      },
      {
        title: "Wzory z danymi sprawy windykacyjnej",
        icon: "procedures",
        cecha: "W module windykacji wzory wypełniają się danymi konkretnej sprawy.",
        zaleta: "Dłużnik, kwoty i terminy trafiają do pisma automatycznie.",
        korzysc: "Wezwanie czy wniosek przygotowujesz w chwili, gdy jest potrzebny.",
      },
      {
        title: "Edytowalne pliki DOCX",
        icon: "status",
        cecha: "Dokumenty generowane w formacie Word (DOCX).",
        zaleta: "Przed wysłaniem albo podpisem możesz dowolnie poprawić treść.",
        korzysc: "Zachowujesz pełną kontrolę nad ostatecznym brzmieniem dokumentu.",
      },
      {
        title: "E-podpis z pełnym śladem audytowym",
        icon: "shieldcheck",
        cecha:
          "Podpis dokumentowy dowolnego PDF: weryfikacja tożsamości (dokument, test żywotności, porównanie twarzy) i jednorazowy kod, podpis równoległy albo kolejny.",
        zaleta:
          "Skrót SHA-256 pliku, adres IP, przeglądarka i czas każdego podpisu, karta podpisów i publiczna weryfikacja dokumentu po kodzie.",
        korzysc: "Podpisujesz zdalnie, a w razie sporu masz dowód, kto, kiedy i co podpisał.",
      },
    ],
    steps: [
      {
        t: "Wybierasz wzór",
        d: "Albo uruchamiasz agenta, który przeprowadzi Cię przez umowę pożyczki.",
      },
      {
        t: "Uzupełniasz dane",
        d: "Firmy z GUS i KRS, liczby z kalkulatora, resztę wpisujesz albo sprawdzasz.",
      },
      {
        t: "Klikasz „Generuj”",
        d: "Pobierasz gotowy dokument w formacie DOCX.",
      },
      {
        t: "Wysyłasz do podpisu",
        d: "E-podpis z weryfikacją tożsamości i kartą podpisów.",
      },
    ],
    note: `${TRAINING_TOOL} Wzory i kreator nie stanowią porady prawnej. Podpis dokumentowy nie jest kwalifikowanym podpisem elektronicznym i nie zastępuje formy pisemnej ani aktu notarialnego tam, gdzie wymaga ich prawo (np. ustanowienie hipoteki, oświadczenie o poddaniu się egzekucji).`,
  },
  {
    slug: "siec-sprzedazy",
    name: "Ogólnopolska sieć sprzedaży",
    nameLead: "Ogólnopolska",
    nameAccent: "sieć sprzedaży",
    menuLabel: "Ogólnopolska sieć sprzedaży",
    tagline: "Projekty z wielu kanałów — bez szukania klientów",
    image: "/marketing/moduly/siec-sprzedazy.webp",
    imageAlt:
      "Ogólnopolska sieć sprzedaży — mapa Polski z połączonymi punktami partnerów, dom, klucze i uścisk dłoni",
    metaTitle: "Ogólnopolska sieć sprzedaży — Projekty bez szukania klientów | Finance You",
    metaDescription:
      "Wnioski z kampanii Finance You, czatu, formularzy i od pośredników trafiają do jednej puli i są dopasowywane do Twojego Zlecenia. Bez opłat za lead i za Projekt.",
    lead: "Nie musisz prowadzić własnego marketingu ani szukać pożyczkobiorców. Wnioski z kampanii Finance You, czatu, formularzy i od pośredników trafiają do jednej puli, a system dopasowuje je do Twojego Zlecenia — z całej Polski.",
    highlights: [
      "Wnioski z całej Polski",
      "Kampanie Finance You i pośrednicy",
      "Projekty dopasowane do Zlecenia",
    ],
    fab: [
      {
        title: "Wiele kanałów pozyskania",
        icon: "growth",
        cecha:
          "Wnioski z reklam w serwisach Meta, Messengera, czatu na stronie, e-maila, formularzy i landingów, panelu klienta oraz od pośredników.",
        zaleta:
          "Wszystkie trafiają do jednej puli, bez ograniczeń regionalnych — Zlecenie nie zawęża Projektów do województwa.",
        korzysc:
          "Nie szukasz klientów i nie płacisz za reklamę — to oni zgłaszają się do Finance You.",
      },
      {
        title: "Program pośredników",
        icon: "community",
        cecha:
          "Partnerzy i pośrednicy składają wnioski swoich klientów tym samym formularzem co klient.",
        zaleta:
          "Pośredników wynagradza Finance You ze swojej prowizji, którą płaci klient — nie Ty.",
        korzysc: "Więcej tematów pożyczek bez dodatkowych kosztów po Twojej stronie.",
      },
      {
        title: "Zlecenie zamiast przeglądania ogłoszeń",
        icon: "access",
        cecha:
          "Zlecenie poszukiwania Projektów z jednym parametrem — maksymalną kwotą finansowania.",
        zaleta:
          "System sam dopasowuje nowe wnioski mieszczące się w tej kwocie i przedstawia je jako Projekty.",
        korzysc: "Projekty trafiają do Ciebie, a Ty nie spędzasz godzin na szukaniu.",
      },
      {
        title: "Projekt tylko dla Ciebie",
        icon: "procedures",
        cecha:
          "Każdy Projekt jest przedstawiany jednemu inwestorowi naraz; po akceptacji Karty Leada rezerwacja trwa 24 h, z możliwością przedłużenia o 12 h.",
        zaleta: "W czasie rezerwacji Projekt nie trafia do innych inwestorów.",
        korzysc: "Analizujesz spokojnie, bez wyścigu z konkurencją.",
      },
      {
        title: "Najpierw raport, potem dane",
        icon: "knowledge",
        cecha:
          "Przed rezerwacją widzisz zapowiedź Projektu i raport analityczny — bez danych osobowych klienta i z zamaskowanym numerem księgi wieczystej.",
        zaleta:
          "Dane kontaktowe dostajesz po akceptacji Karty Leada i rozmawiasz z klientem bezpośrednio.",
        korzysc:
          "Oceniasz Projekt, zanim się zaangażujesz, i negocjujesz bez pośrednika w rozmowie.",
      },
      {
        title: "Bez opłat za lead i za Projekt",
        icon: "loan",
        cecha:
          "Stały abonament — bez opłaty za Projekt i bez opłaty sukcesu. Prowizję Finance You płaci klient, potrącaną z wypłaty pożyczki.",
        zaleta: "Koszt pozyskania klienta i obsługi sieci sprzedaży jest po stronie Finance You.",
        korzysc: "Cały zarobek z odsetek i Twojej prowizji zostaje u Ciebie.",
      },
    ],
    steps: [
      {
        t: "Dołączasz do klubu",
        d: "Abonament, zdalna weryfikacja tożsamości i umowy z Finance You.",
      },
      {
        t: "Składasz Zlecenie",
        d: "Podajesz tylko maksymalną kwotę finansowania.",
      },
      {
        t: "Dostajesz Projekty",
        d: "System dopasowuje wnioski z całej sieci sprzedaży do Twojego Zlecenia.",
      },
      {
        t: "Rezerwujesz i rozmawiasz",
        d: "Akceptujesz Kartę Leada, dostajesz kontakt i rozmawiasz z klientem bezpośrednio.",
      },
    ],
    note: "Finance You nie gwarantuje przedstawienia Projektu ani zawarcia transakcji. Projekty przedstawiamy wyłącznie inwestorowi z przyjętym Zleceniem, po zawarciu Umów o dostęp do Klientów. Pośrednicy nie mogą gwarantować finansowania ani występować w imieniu Finance You bez odrębnego upoważnienia. Inwestowanie wiąże się z ryzykiem utraty części lub całości kapitału.",
  },
];

export const investorModulePath = (slug: string) => `/dla-inwestora/${slug}`;

export function investorModuleBySlug(slug: string): InvestorModule | undefined {
  return INVESTOR_MODULES.find((m) => m.slug === slug);
}
