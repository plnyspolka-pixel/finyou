import type { Icon3DName } from "./icon-3d";

/**
 * Szkolenie i moduły partnera Finance You — dane podstron /dla-inwestora/<slug>,
 * kart na landingu inwestora i pozycji w sub-menu "Inwestor" (shell.tsx).
 *
 * Funkcje piszemy w formule cecha → zaleta → korzyść: pierwsze zdanie mówi,
 * czym jest funkcja, środkowe — czym się wyróżnia, ostatnie — co zyskuje
 * inwestor. Na stronie te trzy pola czytają się jak jeden opis zakończony
 * zdaniem o korzyści; słów „cecha / zaleta / korzyść” nigdy nie pokazujemy.
 * Tytuł ≤ 6 słów, opis ≤ ok. 55 słów, bez żargonu (numery artykułów, SHA-256,
 * nazwy systemów), tylko fakty potwierdzone w kodzie.
 *
 * Treść opisuje WYŁĄCZNIE to, co robi kod panelu inwestora — przy zmianie
 * modułu zaktualizuj też ten opis:
 *  - Szkolenie        → /inwestor/szkolenia (tabela training_videos); program
 *                       7 modułów = AKADEMIA w routes/dla-inwestora.tsx
 *  - Sieć sprzedaży   → Zlecenia i Projekty (lib/order-cycle-*, lead-source.ts, affiliate)
 *  - Analityk AI      → /inwestor/analityka (lib/analysis-pipeline, kw-analysis,
 *                       risk-assessment, property-analysis)
 *  - Kancelaria AI    → /inwestor/dokumenty, /inwestor/podpisy (document-generator,
 *                       contract-engine, esign); 30 wzorów = tabela document_templates
 *  - AML/compliance   → /inwestor/aml (lib/aml, crbr.server.ts)
 *  - Windykator AI    → /inwestor/windykacja (lib/windykacja-*, debt-collection-math)
 * Kolejność tablicy (menu, karty na landingu, „Pozostałe moduły”): Szkolenie
 * jako produkt główny, potem narzędzia w cyklu pożyczki, a sieć sprzedaży na
 * końcu jako BONUS (`bonus: true` — złota plakietka na karcie).
 * Nie podawaj tu cen abonamentu (są w plans.ts) ani obietnic, których kod nie
 * realizuje (np. automatycznych wysyłek windykacyjnych bez kliknięcia inwestora,
 * „15 minut przy każdym Projekcie” — zawsze „ok. 15 minut”).
 */

export type FabRow = {
  /** Krótka nazwa funkcji — nagłówek karty. */
  title: string;
  icon: Icon3DName;
  /** Pierwsze zdanie opisu: czym jest funkcja. */
  cecha: string;
  /** Środkowe zdanie opisu: czym się wyróżnia. */
  zaleta: string;
  /** Ostatnie zdanie — co zyskuje inwestor (wyróżnione na karcie). */
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
  /**
   * Dodatkowe slajdy karty (1536×1024, webp) — karta przewija `image` + `slides`.
   * Prompty do grafik: docs/marketing/prompty-grafik-modulow.md.
   */
  slides?: string[];
  /** Dodatek do abonamentu — karta i podstrona z plakietką „BONUS”. */
  bonus?: boolean;
  imageAlt: string;
  metaTitle: string;
  metaDescription: string;
  lead: string;
  highlights: [string, string, string];
  /** Nagłówek H2 sekcji „Co zyskujesz”. */
  featuresTitle: string;
  fab: FabRow[];
  steps: { t: string; d: string }[];
  note: string;
  /** Sekcja „Skala A–E” (klasy z lib/risk-assessment/grade-bands.ts). */
  gradeScale?: {
    /** Składowe oceny inwestycyjnej z wagami w % (risk-scoring.ts, WEIGHTS). */
    components: { label: string; weight: number }[];
    /** Twarde ograniczenia klasy (risk-scoring.ts, hardCaps). */
    caps: string;
  };
};

export const INVESTOR_MODULES: InvestorModule[] = [
  {
    slug: "szkolenie",
    name: "Szkolenie inwestora",
    nameLead: "Szkolenie",
    nameAccent: "inwestora",
    menuLabel: "Szkolenie inwestora",
    tagline: "7 modułów: od strategii i prawa po analizę, umowę i windykację",
    image: "/marketing/akademia/modul-1.png",
    imageAlt:
      "Szkolenie inwestora — program siedmiu modułów o pożyczkach zabezpieczonych na nieruchomościach",
    metaTitle: "Szkolenie inwestora — pożyczki zabezpieczone hipoteką od podstaw | Finance You",
    metaDescription:
      "Szkolenie w 7 modułach: strategia, prawo, operacje, analiza nieruchomości i klienta, case study i windykacja. Uczysz się na narzędziach, z których korzystasz.",
    lead: "Szkolenie jest sercem abonamentu partnera Finance You. Prowadzi Cię od zasad rynku prywatnych pożyczek zabezpieczonych na nieruchomościach, przez prawo i analizę, po umowę i windykację — a każdy temat od razu przećwiczysz na narzędziach z tego samego abonamentu.",
    highlights: [
      "Program w 7 modułach, od podstaw",
      "Lekcje wideo w panelu, w Twoim tempie",
      "Teoria połączona z narzędziami do pracy",
    ],
    featuresTitle: "Wiesz, co robisz, zanim wyłożysz pierwszą złotówkę",
    fab: [
      {
        title: "Od podstaw do własnej strategii",
        icon: "academy",
        cecha:
          "Pierwszy moduł pokazuje, jak działa rynek prywatnych pożyczek zabezpieczonych na nieruchomościach i jak inwestorzy wybierają Projekty.",
        zaleta:
          "Model działania dobierasz do swojego kapitału i doświadczenia, a nie do cudzych obietnic.",
        korzysc: "Startujesz z planem, nawet jeśli to Twoja pierwsza pożyczka.",
      },
      {
        title: "Prawo bez pułapek",
        icon: "complianceDocs",
        cecha:
          "Moduł prawny omawia regulacje, które decydują o legalności i bezpieczeństwie prywatnej pożyczki, oraz relacje między stronami.",
        zaleta:
          "Uczysz się rozpoznawać rozwiązania, które rodzą ryzyko prawne, zanim trafią do umowy.",
        korzysc: "Działasz zgodnie z przepisami i nie narażasz się na odpowiedzialność.",
      },
      {
        title: "Nieruchomość oczami inwestora",
        icon: "house",
        cecha:
          "Uczysz się sprawdzać stan prawny, realną wartość, lokalizację i płynność nieruchomości.",
        zaleta:
          "Patrzysz na zabezpieczenie jak na kapitał do odzyskania, a nie jak kupujący mieszkanie.",
        korzysc: "Odróżniasz dobre zabezpieczenie od takiego, które tylko dobrze wygląda.",
      },
      {
        title: "Klient, nie tylko hipoteka",
        icon: "chat",
        cecha:
          "Moduł o kliencie uczy analizy sytuacji finansowej, historii zobowiązań, źródła spłaty i motywacji pożyczkobiorcy.",
        zaleta: "Decyzję opierasz na faktach i dokumentach, a nie na deklaracjach.",
        korzysc: "Wybierasz klientów, którzy realnie mogą spłacić pożyczkę.",
      },
      {
        title: "Prawdziwe przypadki krok po kroku",
        icon: "dossier",
        cecha:
          "Case study przeprowadzają przez pożyczki zabezpieczone na różnych typach nieruchomości — od dokumentów po decyzję.",
        zaleta:
          "Każdy przykład pokazuje, jak wyceniać ryzyko i wyłapywać problemy, zanim staną się kosztowne.",
        korzysc: "Uczysz się na cudzych transakcjach, a nie na własnych błędach.",
      },
      {
        title: "Plan na sytuację, gdy klient nie płaci",
        icon: "procedures",
        cecha:
          "Ostatni moduł porządkuje windykację: kontakt i negocjacje, ugodę, wezwania, a potem działania prawne i egzekucję z zabezpieczeń.",
        zaleta: "Te same kroki prowadzisz potem w module windykacji w panelu.",
        korzysc: "Wiesz, co robić, zanim opóźnienie zamieni się w stratę.",
      },
    ],
    steps: [
      {
        t: "Zostajesz partnerem",
        d: "Wybierasz abonament miesięczny albo roczny — także w ratach.",
      },
      { t: "Otwierasz szkolenie", d: "Lekcje wideo czekają w panelu od pierwszego dnia." },
      {
        t: "Ćwiczysz na narzędziach",
        d: "Analizę, umowę i windykację przerabiasz na narzędziach z abonamentu.",
      },
      {
        t: "Decydujesz o pierwszej pożyczce",
        d: "Z wiedzą i kompletem narzędzi — samodzielnie i we własnym tempie.",
      },
    ],
    note: "Szkolenie ma charakter edukacyjny i nie stanowi porady inwestycyjnej, prawnej ani podatkowej. Udział w szkoleniu nie gwarantuje zysku ani przedstawienia Projektu. Inwestowanie wiąże się z ryzykiem utraty części lub całości kapitału, a decyzje podejmujesz samodzielnie.",
  },
  {
    slug: "analityk-ai",
    name: "Analityk AI",
    nameLead: "Analityk",
    nameAccent: "AI",
    menuLabel: "Analityk AI",
    tagline: "Ocena ryzyka A–E i wycena w ok. 15 minut",
    image: "/marketing/moduly/analityk-ai.webp",
    imageAlt:
      "Analityk AI — karty analizy nieruchomości: LTV, wartość rynkowa i ocena ryzyka na ekranie laptopa",
    metaTitle: "Analityk AI — analiza zabezpieczenia i ryzyka dla inwestora | Finance You",
    metaDescription:
      "Ocena ryzyka i wycena w ok. 15 minut: ponad 400 punktów danych, księga wieczysta, LTV, płynność, klasa A–E i raport PDF. Poznaj Analityka AI.",
    lead: "Zanim wyłożysz kapitał, Analityk AI czyta księgę wieczystą, sprawdza właścicieli w rejestrach i wycenia nieruchomość na danych z rynku. Dostajesz pełny obraz zabezpieczenia, a decyzja zawsze zostaje po Twojej stronie.",
    highlights: [
      "Ponad 400 punktów danych w jednej analizie",
      "Wycena w widełkach i bezpieczny pułap LTV",
      "Raport PDF do pobrania jednym kliknięciem",
    ],
    featuresTitle: "Wiesz, co zabezpiecza Twój kapitał, zanim go wyłożysz",
    fab: [
      {
        title: "Decyzja tego samego dnia",
        icon: "updates",
        cecha: "Ocena ryzyka i wycena są gotowe w ok. 15 minut od uruchomienia analizy.",
        zaleta:
          "W tym czasie sprawdzamy ponad 400 punktów danych: księgę wieczystą, rejestry, ceny transakcyjne, dane GUS i ryzyko powodzi.",
        korzysc: "Decydujesz tego samego dnia, a nie po tygodniu czekania.",
      },
      {
        title: "Stan prawny sprawdzony za Ciebie",
        icon: "documents",
        cecha:
          "System sam pobiera księgę wieczystą, ocenia każdy wpis i pokazuje, na którym miejscu stanie Twoja hipoteka.",
        zaleta:
          "Każdą uwagę tłumaczy prostym językiem, a właścicieli zestawia z danymi z CEIDG i KRS, oznaczając firmy w likwidacji albo upadłości.",
        korzysc:
          "Ryzyka w księdze i po stronie właściciela widzisz, zanim zapłacisz za opinię prawną.",
      },
      {
        title: "Zapas bezpieczeństwa nawet na licytacji",
        icon: "growth",
        cecha:
          "Wycenę dostajesz w widełkach — minimum, średnia i maksimum — liczoną wprost z cen transakcyjnych i ofert z okolicy.",
        zaleta:
          "System podpowiada bezpieczny pułap LTV, niższy przy egzekucji, dożywociu albo słabej płynności, i pokazuje, od jakiej kwoty ruszy licytacja komornicza.",
        korzysc: "Wiesz, jaki zapas daje zabezpieczenie także w najgorszym scenariuszu.",
      },
      {
        title: "Nieruchomość, którą da się sprzedać",
        icon: "house",
        cecha: "Wskaźnik płynności od 0 do 100 szacuje, jak szybko nieruchomość znajdzie kupca.",
        zaleta:
          "Bierze pod uwagę liczbę ludności i jej trend, odległość do dużego miasta, ceny za m² i infrastrukturę w promieniu 1,5 km — na danych GUS i z lokalnych ofert, a nie na słowo klienta.",
        korzysc:
          "Zabezpieczenie trudne do sprzedania rozpoznajesz, zanim stanie się Twoim problemem.",
      },
      {
        title: "Projekty porównasz jednym spojrzeniem",
        icon: "status",
        cecha:
          "Karta zabezpieczenia ocenia Projekt w pięciu obszarach — od stanu prawnego i LTV po płynność i ryzyko powodzi — i wskazuje trzy największe atuty oraz trzy główne ryzyka.",
        zaleta:
          "Całość uzupełnia klasa od A do E, a twarde reguły nie pozwalają jej zawyżyć: egzekucja w toku zawsze oznacza klasę E.",
        korzysc:
          "Porównujesz Projekty według tych samych kryteriów i od razu widzisz, które wymagają ostrożności.",
      },
      {
        title: "Analiza także Twoich transakcji",
        icon: "dossier",
        cecha:
          "Wystarczy numer księgi wieczystej, by sprawdzić dowolną nieruchomość — także spoza Finance You.",
        zaleta: "Wynik z klasą A–E widzisz tylko Ty i pobierasz go w PDF.",
        korzysc: "Analityk pracuje dla Ciebie także przy transakcjach, które znajdziesz sam.",
      },
    ],
    steps: [
      {
        t: "Wskazujesz Projekt albo numer KW",
        d: "Projekt z Twojego Zlecenia albo własną transakcję spoza Finance You.",
      },
      { t: "Uruchamiasz analizę", d: "Jednym kliknięciem w panelu inwestora." },
      {
        t: "Wynik w ok. 15 minut",
        d: "Wycena, klasa A–E i ponad 400 sprawdzonych punktów danych.",
      },
      {
        t: "Pobierasz PDF i decydujesz",
        d: "Z pełnym obrazem zabezpieczenia — decyzja zawsze należy do Ciebie.",
      },
    ],
    note: "Analityk AI to narzędzie szkoleniowe w ramach Abonamentu inwestora, a nie odrębna usługa. Raport ma charakter informacyjny i nie jest poradą inwestycyjną, a wycena nie jest operatem szacunkowym. Decyzję podejmujesz samodzielnie — zalecamy weryfikację u rzeczoznawcy majątkowego i radcy prawnego.",
    gradeScale: {
      components: [
        { label: "Łatwość sprzedaży", weight: 30 },
        { label: "Stan prawny (księga wieczysta)", weight: 20 },
        { label: "Zabezpieczenie", weight: 18 },
        { label: "Pewność wyceny", weight: 10 },
        { label: "Wiek właścicieli (ryzyko sukcesji)", weight: 9 },
        { label: "Sygnały z korespondencji z klientem", weight: 7 },
        { label: "Dokumenty", weight: 6 },
      ],
      caps: "Egzekucja w toku albo bardzo wysokie ryzyko powodzi ogranicza ocenę do klasy E, niezgodność właściciela z księgą wieczystą — do klasy D, a liczne sygnały ostrzegawcze w korespondencji — do klasy C.",
    },
  },
  {
    slug: "kancelaria-ai",
    name: "Kancelaria AI",
    nameLead: "Kancelaria",
    nameAccent: "AI",
    menuLabel: "Kancelaria AI",
    tagline: "Umowa pożyczki i 30 wzorów — od aneksu po wniosek do komornika",
    image: "/marketing/moduly/kancelaria-ai.webp",
    imageAlt:
      "Kancelaria AI — umowa, wezwanie i inne dokumenty generowane na ekranie laptopa obok wagi Temidy",
    metaTitle: "Kancelaria AI — 30 wzorów dokumentów i umowa pożyczki dla inwestora | Finance You",
    metaDescription:
      "Umowa pożyczki z biblioteki klauzul i 30 wzorów — od aneksu i wezwania po wniosek do komornika — z danymi z GUS i KRS oraz e-podpisem. Poznaj Kancelarię AI.",
    lead: "Agent AI przeprowadzi Cię przez umowę pożyczki, a pozostałe dokumenty przygotujesz z gotowych wzorów, z danymi z rejestrów i kalkulatora. Gotowy plik wysyłasz do podpisu elektronicznego bez wychodzenia z panelu.",
    highlights: [
      "Umowa pożyczki ze 113 sprawdzonych klauzul",
      "Dane firm z GUS, KRS i Białej Listy",
      "E-podpis z weryfikacją tożsamości",
    ],
    featuresTitle: "Właściwy dokument na każdym etapie pożyczki",
    fab: [
      {
        title: "Umowa pożyczki z agentem AI",
        icon: "dossier",
        cecha:
          "Agent AI zbiera w rozmowie dane do umowy, a jej treść składa się ze 113 sprawdzonych klauzul.",
        zaleta:
          "AI niczego nie dopisuje od siebie i nie zgaduje danych, takich jak PESEL, NIP czy numer księgi wieczystej.",
        korzysc:
          "Dostajesz spójną umowę z wnioskiem i załącznikami w jednym edytowalnym pliku Word — bez pisania od zera.",
      },
      {
        title: "30 wzorów na cały cykl pożyczki",
        icon: "documents",
        cecha:
          "Wzory obejmują umowy i aneksy, windykację miękką i sądową oraz oświadczenia i załączniki — od aneksu wydłużającego termin, przez ostateczne wezwanie, po pozew, wniosek egzekucyjny i zgodę na wykreślenie hipoteki.",
        zaleta:
          "W module windykacji wypełniają się danymi konkretnej sprawy, a każdy plik poprawisz w Wordzie przed wysłaniem.",
        korzysc: "Na każdym etapie pożyczki masz pod ręką właściwy dokument.",
      },
      {
        title: "Dane stron bez przepisywania",
        icon: "crmfolder",
        cecha:
          "Wpisujesz NIP, REGON albo KRS, a dane kontrahenta pobieramy z GUS, KRS i Białej Listy.",
        zaleta: "Twoje dane jako pożyczkodawcy i wierzyciela uzupełniają się z profilu.",
        korzysc: "Mniej pomyłek w oznaczeniu stron to mniej problemów przy egzekucji.",
      },
      {
        title: "Liczby zgodne z kalkulacją",
        icon: "kalkulator",
        cecha:
          "Kwoty — także słownie — i harmonogram spłat w tabeli trafiają do dokumentu prosto z kalkulatora, również z zapisanego PDF-u.",
        zaleta: "Umowa pokazuje dokładnie te liczby, które widział klient.",
        korzysc: "Nie przeliczasz niczego ręcznie i nie ryzykujesz rozbieżności.",
      },
      {
        title: "Podpis na odległość, z dowodem",
        icon: "shieldcheck",
        cecha: "Dowolny PDF wysyłasz do podpisu — wszystkim naraz albo po kolei.",
        zaleta:
          "Podpisujący potwierdza tożsamość dokumentem, selfie i jednorazowym kodem, a system zapisuje czas, adres IP, przeglądarkę i cyfrowy odcisk pliku, więc dokument można później zweryfikować po kodzie.",
        korzysc: "W razie sporu wiesz, kto, kiedy i co podpisał.",
      },
    ],
    steps: [
      {
        t: "Wybierasz wzór",
        d: "Albo uruchamiasz agenta, który przeprowadzi Cię przez umowę pożyczki.",
      },
      {
        t: "Uzupełniasz dane",
        d: "Firmy z rejestrów, liczby z kalkulatora — resztę tylko sprawdzasz.",
      },
      { t: "Generujesz dokument", d: "Edytowalny plik Word gotowy od ręki." },
      { t: "Wysyłasz do podpisu", d: "E-podpis z weryfikacją tożsamości i kartą podpisów." },
    ],
    note: "Kancelaria AI to narzędzie szkoleniowe w ramach Abonamentu inwestora, a nie odrębna usługa; wzory i kreator nie stanowią porady prawnej. Podpis dokumentowy nie jest kwalifikowanym podpisem elektronicznym i nie zastępuje formy pisemnej ani aktu notarialnego tam, gdzie wymaga ich prawo (np. przy ustanowieniu hipoteki czy poddaniu się egzekucji).",
  },
  {
    slug: "aml-compliance",
    name: "Moduł AML/compliance",
    nameLead: "Moduł",
    nameAccent: "AML/compliance",
    menuLabel: "Moduł AML/compliance",
    tagline: "Obowiązki AML w jednym miejscu — od weryfikacji klienta po GIIF",
    image: "/marketing/moduly/aml-compliance.webp",
    imageAlt:
      "Moduł AML/compliance — tarcza ze znakiem zatwierdzenia, lista kontrolna oraz ekrany KYC i list sankcyjnych PEP",
    metaTitle: "Moduł AML/compliance — GIIF, sankcje i rejestr ponadprogowy | Finance You",
    metaDescription:
      "Wsparcie raportowania do GIIF, screening list sankcyjnych i PEP oraz rejestr transakcji powyżej 15 000 EUR — w jednym miejscu. Poznaj moduł AML/compliance.",
    lead: "Jeżeli udzielasz pożyczek w ramach działalności gospodarczej, możesz być instytucją obowiązaną w rozumieniu ustawy o przeciwdziałaniu praniu pieniędzy. Moduł AML prowadzi Cię przez te obowiązki krok po kroku i dokumentuje każdą Twoją decyzję.",
    highlights: [
      "Wsparcie raportowania do GIIF",
      "Screening list sankcyjnych i PEP",
      "Rejestr transakcji powyżej 15 000 EUR",
    ],
    featuresTitle: "Obowiązki AML pod kontrolą, bez osobnego systemu",
    fab: [
      {
        title: "Zgłoszenie do GIIF na gotowych danych",
        icon: "complianceDocs",
        cecha:
          "Zgłoszenie transakcji ponadprogowej albo zawiadomienie o transakcji podejrzanej przygotowujesz z danych, które już są w module — sprawdzonych pod kątem kompletności, w plikach XML i PDF.",
        zaleta:
          "Wysyłasz je w systemie GIIF własnym podpisem kwalifikowanym, a potwierdzenie UPO dołączasz do akt.",
        korzysc: "Zgłaszasz w terminie i bez przepisywania danych.",
      },
      {
        title: "Sankcje i PEP sprawdzone przed umową",
        icon: "shieldcheck",
        cecha:
          "Klienta, a przy firmie także reprezentantów i beneficjentów rzeczywistych, sprawdzamy u wyspecjalizowanego dostawcy na listach sankcyjnych, PEP i listach ostrzegawczych.",
        zaleta:
          "Każde trafienie rozstrzygasz jednym wyborem, a potwierdzona sankcja albo nierozstrzygnięte trafienie blokuje klienta.",
        korzysc: "Osobę z listy sankcyjnej wychwytujesz, zanim podpiszesz z nią umowę.",
      },
      {
        title: "Próg 15 000 EUR pod kontrolą",
        icon: "complianceRegistry",
        cecha:
          "Po potwierdzeniu transakcji system przelicza ją na euro po średnim kursie NBP z dnia transakcji i zapisuje kurs, numer tabeli i datę.",
        zaleta:
          "Gdy kwota przekracza 15 000 EUR, wpis w rejestrze z 7-dniowym terminem zakłada się sam.",
        korzysc: "Terminy i statusy wszystkich transakcji ponadprogowych widzisz w jednym miejscu.",
      },
      {
        title: "Wiesz, z kim zawierasz umowę",
        icon: "access",
        cecha:
          "Klient potwierdza tożsamość sam, na telefonie — dokumentem i selfie z porównaniem twarzy — a firma przechodzi osobną weryfikację.",
        zaleta:
          "Beneficjentów rzeczywistych i reprezentantów pobierasz z Centralnego Rejestru Beneficjentów Rzeczywistych, a system oznacza każdą niezgodność z danymi klienta.",
        korzysc: "Weryfikujesz klienta bez spotkania i bez kserowania dowodu.",
      },
      {
        title: "Kontrola bez stresu",
        icon: "complianceAml",
        cecha:
          "System proponuje poziom ryzyka klienta i pokazuje, z czego on wynika — od sankcji i PEP po transakcje gotówkowe czy brak źródła spłaty.",
        zaleta:
          "Zmiana propozycji wymaga uzasadnienia, a screeningi, decyzje i zgłoszenia trafiają z datą do dziennika, którego wpisów nie można zmienić ani usunąć.",
        korzysc: "Przy kontroli pokazujesz kompletną historię swoich decyzji.",
      },
      {
        title: "Procedura AML bez pustej kartki",
        icon: "complianceProc",
        cecha:
          "W kreatorze dokumentów czeka wzór procedury wewnętrznej AML dla firmy pożyczkowej B2B, w edytowalnym pliku Word.",
        zaleta: "Dostosowujesz go do własnej oceny ryzyka i przyjmujesz uchwałą.",
        korzysc: "Nie zaczynasz dokumentacji AML od zera.",
      },
    ],
    steps: [
      {
        t: "Weryfikujesz klienta",
        d: "Tożsamość, dane z CRBR i screening list sankcyjnych oraz PEP.",
      },
      {
        t: "Zatwierdzasz ocenę ryzyka",
        d: "System proponuje poziom ryzyka, a Ty go przyjmujesz albo zmieniasz z uzasadnieniem.",
      },
      {
        t: "Rejestrujesz transakcje",
        d: "Transakcja powyżej 15 000 EUR sama trafia do rejestru, z terminem.",
      },
      {
        t: "Raportujesz do GIIF",
        d: "Gotowy plik XML i PDF, Twój podpis kwalifikowany, UPO w aktach.",
      },
    ],
    note: "Moduł AML/compliance to narzędzie szkoleniowe w ramach Abonamentu inwestora, a nie odrębna usługa ani porada prawna. Zgłoszenia do GIIF wysyłasz samodzielnie w SI GIIF, jako instytucja obowiązana, własnym podpisem kwalifikowanym — Finance You ich nie podpisuje i nie przechowuje Twojego podpisu. Wzór procedury trzeba dostosować do własnej oceny ryzyka i przyjąć.",
  },
  {
    slug: "windykator-ai",
    name: "Windykator AI",
    nameLead: "Windykator",
    nameAccent: "AI",
    menuLabel: "Windykator AI",
    tagline: "Od pierwszego upomnienia aż na biurko komornika — jednym kliknięciem",
    image: "/marketing/moduly/windykator-ai.webp",
    imageAlt:
      "Windykator AI — robot AI z wezwaniem do zapłaty, kalendarzem terminów i segregatorami spraw windykacyjnych",
    metaTitle: "Windykator AI — windykacja pożyczek jednym kliknięciem dla inwestora | Finance You",
    metaDescription:
      "Wszystkie procedury windykacyjne jednym kliknięciem: pisma w Twoim imieniu, SMS, e-mail, telefon AI i sprawa aż na biurko komornika. Poznaj Windykatora AI.",
    lead: "Windykator AI podpowiada następny krok, liczy dług z odsetkami co do dnia i przygotowuje pisma, SMS-y i e-maile w Twoim imieniu, z danymi z Twojego profilu. Każdy krok zatwierdzasz Ty.",
    highlights: [
      "Ścieżka dobrana do dni opóźnienia",
      "Telefon do dłużnika prowadzi agent AI",
      "Teczka dowodowa dla sądu i komornika",
    ],
    featuresTitle: "Nie zostajesz sam z niespłaconą pożyczką",
    fab: [
      {
        title: "Wiesz, co zrobić dziś",
        icon: "automation",
        cecha:
          "Windykator proponuje ścieżkę — miękką, standardową, twardą albo karną — według liczby dni opóźnienia i opisuje następny krok prostym językiem.",
        zaleta:
          "Upomnienie, wezwanie do zapłaty, wypowiedzenie umowy, wniosek o klauzulę wykonalności czy wniosek do komornika uruchamiasz jednym kliknięciem z karty sprawy, a każda czynność trafia do akt.",
        korzysc: "Działasz pewnie, nawet jeśli to Twoja pierwsza windykacja.",
      },
      {
        title: "Pisma w Twoim imieniu",
        icon: "documents",
        cecha:
          "System przygotowuje pisma w Twoim imieniu jako wierzyciela, z danymi z Twojego profilu: od wezwania do zapłaty i wypowiedzenia, przez porozumienie ratalne i ugodę, po wnioski do sądu i komornika oraz zawiadomienie o przestępstwie.",
        zaleta: "Dane dłużnika, kwoty i terminy wstawiają się same.",
        korzysc: "Pismo masz od ręki — bez szukania wzorów i przepisywania danych.",
      },
      {
        title: "Dług policzony co do dnia",
        icon: "kalkulator",
        cecha:
          "Kalkulator zadłużenia liczy odsetki dzień po dniu i pilnuje limitu odsetek maksymalnych za opóźnienie.",
        zaleta:
          "Rozróżnia okres przed wypowiedzeniem umowy i po nim, zalicza wpłaty zgodnie z przepisami i dolicza koszty windykacji przewidziane w umowie.",
        korzysc:
          "Znasz kwotę, której możesz żądać — bez arkuszy i z mniejszym ryzykiem zawyżenia roszczenia.",
      },
      {
        title: "Trudne rozmowy prowadzi AI",
        icon: "chat",
        cecha: "SMS-y i e-maile do dłużnika wysyłasz z karty sprawy w swoim imieniu.",
        zaleta:
          "Na Twoje zlecenie dzwoni do niego agent głosowy AI: przedstawia się jako asystent, podaje kwotę zaległości i pyta o termin spłaty — bez gróźb, tylko w godzinach 8:00–22:00, nie w niedziele i najwyżej raz na dobę.",
        korzysc: "Nie musisz sam prowadzić trudnych rozmów.",
      },
      {
        title: "Terminy pilnowane za Ciebie",
        icon: "updates",
        cecha:
          "Rejestr doręczeń liczy 7-dniowy termin od skutecznego doręczenia — także przy awizo i zwrocie przesyłki.",
        zaleta:
          "Potwierdzenie nadania, zwrotkę czy awizo AI odczyta ze zdjęcia, a pulpit pokazuje sprawy, które wymagają działania dziś.",
        korzysc: "Nie przeglądasz codziennie stosu papierów, żeby dotrzymać terminu.",
      },
      {
        title: "Teczka gotowa dla komornika",
        icon: "crmfolder",
        cecha:
          "Oś czasu sprawy, rejestr czynności i opłat oraz dowody nadania i doręczeń składają się w jeden raport dowodowy do druku albo PDF.",
        zaleta:
          "Zdarzenia tylko się dopisują, każde z datą, więc historii nie da się później zmienić.",
        korzysc:
          "Gotową teczkę przekazujesz sądowi, komornikowi albo prawnikowi — bez zbierania dokumentów od zera.",
      },
    ],
    steps: [
      {
        t: "Zakładasz sprawę",
        d: "Ze zdjęcia lub PDF-u umowy — AI odczyta dane, a system policzy zaległość.",
      },
      {
        t: "Uruchamiasz pierwszy krok",
        d: "Upomnienie, SMS, e-mail, telefon AI albo pismo — jednym kliknięciem.",
      },
      {
        t: "Prowadzisz sprawę etap po etapie",
        d: "System podpowiada kolejny krok, od wezwania do zapłaty po wniosek o klauzulę wykonalności.",
      },
      {
        t: "Sprawa trafia na biurko komornika",
        d: "Z kompletem pism, dowodów doręczeń i raportem dowodowym.",
      },
    ],
    note: "Windykator AI to narzędzie szkoleniowe w ramach Abonamentu inwestora, a nie odrębna usługa. Każdą czynność zatwierdzasz Ty — system liczy, podpowiada i przygotowuje dokumenty. Odzyskanie należności zależy od sytuacji dłużnika i zabezpieczenia, a w sporze sądowym może być potrzebny prawnik.",
  },
  {
    slug: "siec-sprzedazy",
    bonus: true,
    name: "Ogólnopolska sieć sprzedaży",
    nameLead: "Ogólnopolska",
    nameAccent: "sieć sprzedaży",
    menuLabel: "BONUS: ogólnopolska sieć sprzedaży",
    tagline: "Projekty z całej Polski dopasowane do Twojej kwoty",
    image: "/marketing/moduly/siec-sprzedazy.webp",
    imageAlt:
      "Ogólnopolska sieć sprzedaży — mapa Polski z połączonymi punktami partnerów, dom, klucze i uścisk dłoni",
    metaTitle: "Ogólnopolska sieć sprzedaży — pośrednictwo finansowe | Finance You",
    metaDescription:
      "Na zlecenie naszych klientów świadczymy usługi pośrednictwa finansowego. Projekty z całej Polski dopasowane do Twojego Zlecenia — bez opłat za Projekt.",
    lead: "Na zlecenie naszych klientów świadczymy usługi pośrednictwa finansowego, dostarczając rozwiązań dopasowanych do potrzeb i możliwości. Ty podajesz w Zleceniu maksymalną kwotę, a my przedstawiamy Ci Projekty przedsiębiorców z całej Polski, które się w niej mieszczą.",
    highlights: [
      "Wnioski z całej Polski i z wielu kanałów",
      "Rezerwacja Projektu na 24 h (+12 h)",
      "Bez opłat za Projekt i za pozyskanie klienta",
    ],
    featuresTitle: "Nie szukasz klientów — Projekty trafiają do Ciebie",
    fab: [
      {
        title: "Klienci zgłaszają się sami",
        icon: "growth",
        cecha:
          "Przedsiębiorcy z całej Polski zgłaszają się do nas przez reklamy, czat, telefon do asystenta AI i formularze, a pośrednicy wnoszą wnioski swoich klientów.",
        zaleta:
          "Wszystkie wnioski trafiają do jednej puli, bez podziału na województwa, a koszt reklamy i wynagrodzenie pośredników pokrywa Finance You.",
        korzysc: "Nie szukasz klientów i nie płacisz za ich pozyskanie.",
      },
      {
        title: "Jedna kwota zamiast ogłoszeń",
        icon: "access",
        cecha: "W Zleceniu podajesz tylko jeden parametr: maksymalną kwotę finansowania.",
        zaleta:
          "System sam dopasowuje nowe wnioski, które się w niej mieszczą, i przedstawia je jako Projekty.",
        korzysc: "Nie tracisz godzin na przeglądanie ogłoszeń.",
      },
      {
        title: "Najpierw raport, potem kontakt",
        icon: "knowledge",
        cecha:
          "Przed rezerwacją widzisz zapowiedź Projektu i raport analityczny, bez danych osobowych klienta i z zamaskowanym numerem księgi wieczystej.",
        zaleta: "Zabezpieczenie oceniasz, zanim poświęcisz czas na rozmowę.",
        korzysc: "Angażujesz się tylko w Projekty, które naprawdę Ci odpowiadają.",
      },
      {
        title: "24 godziny na spokojną decyzję",
        icon: "procedures",
        cecha:
          "Gdy Projekt Ci odpowiada, akceptujesz Kartę Leada i jednym przyciskiem pobierasz dane kontaktowe klienta oraz rezerwujesz Projekt na 24 godziny.",
        zaleta:
          "Rezerwację możesz raz przedłużyć o 12 godzin, a w tym czasie Projekt nie trafia do innych inwestorów.",
        korzysc: "Rozmawiasz z klientem bezpośrednio i analizujesz bez wyścigu z konkurencją.",
      },
      {
        title: "Od Projektu do umowy w jednym panelu",
        icon: "dossier",
        cecha:
          "Ofertę składasz prosto z karty Projektu w kalkulatorze compliance, a klient albo pośrednik dostaje powiadomienie.",
        zaleta:
          "Po rezerwacji jednym kliknięciem przechodzisz do kreatora umowy z danymi Projektu.",
        korzysc: "Nie przepisujesz danych między narzędziami.",
      },
      {
        title: "Pozyskanie klienta na nasz koszt",
        icon: "loan",
        cecha: "Płacisz stały abonament, bez opłaty za Projekt i bez opłaty sukcesu.",
        zaleta:
          "Prowizję Finance You płaci klient z wypłacanej kwoty pożyczki, a koszt pozyskania klienta ponosi Finance You.",
        korzysc: "Odsetki i Twoja prowizja w całości zostają u Ciebie.",
      },
    ],
    steps: [
      {
        t: "Zostajesz partnerem",
        d: "Abonament, zdalna weryfikacja tożsamości i bezpłatne umowy z Finance You.",
      },
      { t: "Składasz Zlecenie", d: "Podajesz tylko maksymalną kwotę finansowania." },
      { t: "Dostajesz Projekty", d: "Wnioski z całej Polski, które mieszczą się w Twojej kwocie." },
      {
        t: "Rezerwujesz i rozmawiasz",
        d: "Akceptujesz Kartę Leada, rezerwujesz Projekt i rozmawiasz z klientem bezpośrednio.",
      },
    ],
    note: "Finance You świadczy usługę pośrednictwa finansowego na podstawie ramowej umowy pośrednictwa i nie jest stroną pożyczki. Nie gwarantujemy przedstawienia Projektu ani zawarcia transakcji — Projekty przedstawiamy inwestorowi z przyjętym Zleceniem, po zawarciu bezpłatnych Umów o dostęp do Klientów. Działasz we własnym imieniu, a nie w imieniu Finance You, a pośrednicy nie mogą gwarantować finansowania. Inwestowanie wiąże się z ryzykiem utraty części lub całości kapitału.",
  },
];

export const investorModulePath = (slug: string) => `/dla-inwestora/${slug}`;

export function investorModuleBySlug(slug: string): InvestorModule | undefined {
  return INVESTOR_MODULES.find((m) => m.slug === slug);
}
