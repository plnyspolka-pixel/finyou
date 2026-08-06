// WYGENEROWANE AUTOMATYCZNIE — nie edytuj ręcznie.
// Źródło: docs/shorts/pozyczki-prywatne-250-pytan.md
// Regeneracja: bun run scripts/generate-shorts-question-bank.ts

export type ShortsCategory = "klient" | "inwestor";

export type ShortsQuestion = {
  id: number;
  category: ShortsCategory;
  section: string;
  question: string;
  thesis: string;
};

// Obowiązkowe otwarcie każdej rolki (znacznik kategorii mówiony przez lektora).
export const SHORTS_OPENERS: Record<ShortsCategory, string> = {
  klient: "Prywatne pożyczki pod zastaw nieruchomości.",
  inwestor: "Inwestowanie w prywatne pożyczki pod zastaw nieruchomości.",
};

export const SHORTS_CATEGORY_LABELS: Record<ShortsCategory, string> = {
  klient: "Klient / pożyczkobiorca",
  inwestor: "Inwestor / pożyczkodawca",
};

export const SHORTS_SECTIONS: string[] = [
  "A. Podstawy i kwalifikacja pożyczki",
  "B. Co przygotować do wniosku",
  "C. Kwota, LTV, odsetki i harmonogram",
  "D. Podatki, notariusz i koszty uruchomienia",
  "E. Skuteczne zawarcie umowy na odległość",
  "F. Zamknięcie firmy, spłata i problemy",
  "G. Model, wynagrodzenie, podatki i regulacje",
  "H. LTV, wycena i ekonomia transakcji",
  "I. Księga wieczysta — osobna seria",
  "J. Hipoteka i art. 777 — osobna seria",
  "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
];

export const SHORTS_QUESTIONS: ShortsQuestion[] = [
  {
    id: 1,
    category: "klient",
    section: "A. Podstawy i kwalifikacja pożyczki",
    question: "Czym jest pożyczka prywatna?",
    thesis:
      "To pożyczka udzielana poza typowym kredytem bankowym, np. przez osobę fizyczną lub prywatną spółkę. Nadal podlega prawu cywilnemu, podatkowemu i — zależnie od modelu — przepisom konsumenckim lub regulacyjnym.",
  },
  {
    id: 2,
    category: "klient",
    section: "A. Podstawy i kwalifikacja pożyczki",
    question: "Czym pożyczka prywatna różni się od kredytu bankowego?",
    thesis:
      "Warunki mogą być bardziej indywidualne, a decyzja szybsza, ale koszt, dokumenty i ryzyko trzeba oceniać tak samo poważnie jak przy finansowaniu bankowym.",
  },
  {
    id: 3,
    category: "klient",
    section: "A. Podstawy i kwalifikacja pożyczki",
    question: "Czy prywatnej pożyczki może udzielić zwykła osoba fizyczna?",
    thesis:
      "Co do zasady tak, ze swoich pieniędzy. Regularne i zorganizowane udzielanie finansowania, zwłaszcza konsumentom, może jednak stać się działalnością gospodarczą i podlegać dodatkowym wymogom.",
  },
  {
    id: 4,
    category: "klient",
    section: "A. Podstawy i kwalifikacja pożyczki",
    question: "Czy umowa pożyczki musi być na piśmie?",
    thesis:
      "Przy wartości powyżej 1 000 zł Kodeks cywilny wymaga formy dokumentowej. W praktyce dobra umowa powinna być utrwalona tak, by można było odtworzyć treść i ustalić, kto złożył oświadczenie.",
  },
  {
    id: 5,
    category: "klient",
    section: "A. Podstawy i kwalifikacja pożyczki",
    question: "Czy pożyczka i kredyt to prawnie to samo?",
    thesis:
      "Nie. Pożyczkę reguluje przede wszystkim Kodeks cywilny, a kredyt bankowy jest odrębną umową regulowaną Prawem bankowym.",
  },
  {
    id: 6,
    category: "klient",
    section: "A. Podstawy i kwalifikacja pożyczki",
    question: "Co oznacza pożyczka zabezpieczona hipoteką?",
    thesis:
      "Dług pozostaje osobistym obowiązkiem pożyczkobiorcy, a nieruchomość stanowi dodatkowe źródło zaspokojenia wierzyciela, jeżeli zobowiązanie nie zostanie wykonane.",
  },
  {
    id: 7,
    category: "klient",
    section: "A. Podstawy i kwalifikacja pożyczki",
    question: "Co oznacza pożyczka B2B?",
    thesis:
      "To finansowanie bezpośrednio związane z działalnością gospodarczą lub zawodową pożyczkobiorcy. Nie wystarcza sama etykieta „na firmę”.",
  },
  {
    id: 8,
    category: "klient",
    section: "A. Podstawy i kwalifikacja pożyczki",
    question: "Kiedy pożyczkobiorca jest konsumentem?",
    thesis:
      "Gdy jako osoba fizyczna zawiera umowę z przedsiębiorcą w celu niezwiązanym bezpośrednio z własną działalnością gospodarczą lub zawodową.",
  },
  {
    id: 9,
    category: "klient",
    section: "A. Podstawy i kwalifikacja pożyczki",
    question: "Czy wpisanie w umowie „cel firmowy” zawsze przesądza sprawę?",
    thesis:
      "Nie. Liczą się również rzeczywisty cel pieniędzy, sposób ich wykorzystania i całe okoliczności transakcji.",
  },
  {
    id: 10,
    category: "klient",
    section: "A. Podstawy i kwalifikacja pożyczki",
    question: "Czy mogę założyć działalność i następnego dnia dostać pożyczkę firmową?",
    thesis:
      "Prawo nie ustanawia minimalnego stażu JDG, więc inwestor może sfinansować nową firmę. Cel musi jednak być rzeczywiście biznesowy, a inwestor może zastosować własne kryteria ryzyka.",
  },
  {
    id: 11,
    category: "klient",
    section: "A. Podstawy i kwalifikacja pożyczki",
    question: "Czy istnieje minimalny okres prowadzenia firmy wymagany przez ustawę?",
    thesis:
      "Nie ma ogólnego ustawowego wymogu sześciu czy dwunastu miesięcy. Taki warunek może wynikać wyłącznie z polityki danego finansującego.",
  },
  {
    id: 12,
    category: "klient",
    section: "A. Podstawy i kwalifikacja pożyczki",
    question: "Czy jednodniowa firma wystarczy, aby pożyczka nie była konsumencka?",
    thesis:
      "Nie. Data wpisu do CEIDG nie zastępuje oceny faktycznego, bezpośredniego związku pożyczki z działalnością.",
  },
  {
    id: 13,
    category: "klient",
    section: "A. Podstawy i kwalifikacja pożyczki",
    question: "Czy osoba pracująca na etacie może dostać pożyczkę firmową?",
    thesis:
      "Tak, jeśli jednocześnie prowadzi działalność i finansowanie ma rzeczywisty cel biznesowy. Dochód z etatu może być dodatkową informacją o zdolności do spłaty.",
  },
  {
    id: 14,
    category: "klient",
    section: "A. Podstawy i kwalifikacja pożyczki",
    question: "Czy start-up bez historii przychodów ma szansę na finansowanie?",
    thesis:
      "Tak, jeżeli inwestor akceptuje ryzyko i widzi wiarygodny plan spłaty oraz odpowiednie zabezpieczenie. Sam wpis do rejestru nie zastępuje planu finansowego.",
  },
  {
    id: 15,
    category: "klient",
    section: "A. Podstawy i kwalifikacja pożyczki",
    question: "Czy nieruchomość wystarczy, jeśli firma nie ma przychodów?",
    thesis:
      "Niekoniecznie. Dobre finansowanie powinno mieć realne źródło spłaty; hipoteka jest planem awaryjnym, a nie modelem regularnej obsługi rat.",
  },
  {
    id: 16,
    category: "klient",
    section: "A. Podstawy i kwalifikacja pożyczki",
    question: "Czy negatywny BIK automatycznie wyklucza pożyczkę prywatną?",
    thesis:
      "Nie zawsze, bo prywatny inwestor sam ustala kryteria. Zła historia spłat wpływa jednak na ocenę ryzyka, koszt i wymagane zabezpieczenia.",
  },
  {
    id: 17,
    category: "klient",
    section: "A. Podstawy i kwalifikacja pożyczki",
    question: "Czy inwestor prywatny zawsze sprawdza BIK?",
    thesis:
      "Nie ma jednego obowiązkowego modelu dla każdej pożyczki B2B. Może sprawdzać BIK, BIG, KRD, rachunki bankowe, zobowiązania albo oprzeć decyzję na innych danych — zgodnie z prawem i uzyskanymi zgodami.",
  },
  {
    id: 18,
    category: "klient",
    section: "A. Podstawy i kwalifikacja pożyczki",
    question: "Czy mogę dostać finansowanie, mając już komornika?",
    thesis:
      "Jest to prawnie możliwe, ale zajęcia i inni wierzyciele mogą istotnie obniżyć bezpieczeństwo nowego finansowania. Trzeba ujawnić pełne saldo i ustalić, co zostanie spłacone z uruchomienia.",
  },
  {
    id: 19,
    category: "klient",
    section: "A. Podstawy i kwalifikacja pożyczki",
    question: "Czy zaległości w ZUS lub urzędzie skarbowym wykluczają pożyczkę?",
    thesis:
      "Nie automatycznie, ale mogą prowadzić do egzekucji i hipotek przymusowych. Inwestor powinien znać aktualne kwoty i sposób ich uregulowania.",
  },
  {
    id: 20,
    category: "klient",
    section: "A. Podstawy i kwalifikacja pożyczki",
    question: "Czy pożyczka prywatna może służyć spłacie innych długów?",
    thesis:
      "Tak, jeżeli umowa na to pozwala i refinansowanie rzeczywiście poprawia sytuację. Trzeba policzyć pełny koszt oraz sprawdzić, czy nie zamienia się kilku problemów w jeden większy.",
  },
  {
    id: 21,
    category: "klient",
    section: "A. Podstawy i kwalifikacja pożyczki",
    question: "Czy mogę pożyczyć na dowolny cel?",
    thesis:
      "To zależy od oferty i umowy. Jeżeli transakcja ma być B2B, cel powinien pozostawać w bezpośrednim związku z działalnością i dać się wiarygodnie udokumentować.",
  },
  {
    id: 22,
    category: "klient",
    section: "A. Podstawy i kwalifikacja pożyczki",
    question: "Czy inwestor sprawdza, na co wydałem pieniądze?",
    thesis:
      "Może to robić, jeżeli umowa przewiduje kontrolę celu, wypłatę w transzach albo obowiązek przedstawienia dokumentów. Nie ma jednej zasady dla wszystkich inwestorów.",
  },
  {
    id: 23,
    category: "klient",
    section: "A. Podstawy i kwalifikacja pożyczki",
    question: "Czy cel pożyczki można później zmienić?",
    thesis:
      "Tak tylko wtedy, gdy dopuszcza to umowa albo strony zawrą odpowiedni aneks. Samowolna zmiana może stanowić naruszenie umowy.",
  },
  {
    id: 24,
    category: "klient",
    section: "A. Podstawy i kwalifikacja pożyczki",
    question: "Czy pożyczka może być wypłacona bezpośrednio mojemu wierzycielowi?",
    thesis:
      "Tak. Taki mechanizm często ogranicza ryzyko i pozwala jednocześnie spłacić stare obciążenie oraz uzyskać dokumenty do wykreślenia hipoteki.",
  },
  {
    id: 25,
    category: "klient",
    section: "A. Podstawy i kwalifikacja pożyczki",
    question: "Czy zabezpieczenie zastępuje badanie źródła spłaty?",
    thesis:
      "Nie. Wartość nieruchomości odpowiada na pytanie „co w razie awarii”, a źródło spłaty — „z czego umowa będzie wykonywana co miesiąc lub na końcu”.",
  },
  {
    id: 26,
    category: "klient",
    section: "B. Co przygotować do wniosku",
    question: "Jakie dokumenty przygotować na start?",
    thesis:
      "Dokument tożsamości, dane firmy, cel i kwotę finansowania, plan spłaty, wykaz zobowiązań, numer KW oraz dokumenty dotyczące nieruchomości.",
  },
  {
    id: 27,
    category: "klient",
    section: "B. Co przygotować do wniosku",
    question: "Czy wystarczy sam dowód osobisty i numer księgi wieczystej?",
    thesis:
      "Zwykle nie. To wystarcza do wstępnej identyfikacji, ale nie do pełnej oceny prawa własności, zadłużenia, wartości i możliwości spłaty.",
  },
  {
    id: 28,
    category: "klient",
    section: "B. Co przygotować do wniosku",
    question: "Jakie dokumenty przedstawia właściciel JDG?",
    thesis:
      "Aktualne dane CEIDG, dokument tożsamości, informacje podatkowe i finansowe, rachunki firmowe, zobowiązania oraz dokumenty potwierdzające cel finansowania.",
  },
  {
    id: 29,
    category: "klient",
    section: "B. Co przygotować do wniosku",
    question: "Jakie dokumenty przedstawia spółka z o.o.?",
    thesis:
      "Aktualny KRS, umowę spółki, zasady reprezentacji, dane beneficjentów rzeczywistych, wymagane uchwały lub zgody, dokumenty finansowe i informacje o zobowiązaniach.",
  },
  {
    id: 30,
    category: "klient",
    section: "B. Co przygotować do wniosku",
    question: "Kto podpisuje umowę w imieniu spółki?",
    thesis:
      "Osoba lub osoby uprawnione zgodnie z KRS, umową spółki, pełnomocnictwem albo prokurą. Błąd w reprezentacji może podważyć skuteczność dokumentów.",
  },
  {
    id: 31,
    category: "klient",
    section: "B. Co przygotować do wniosku",
    question: "Czy potrzebna jest uchwała wspólników?",
    thesis:
      "Zależy od umowy spółki, wartości i rodzaju czynności oraz przepisów KSH. Trzeba to sprawdzić przed podpisaniem, a nie dopiero przy egzekucji.",
  },
  {
    id: 32,
    category: "klient",
    section: "B. Co przygotować do wniosku",
    question: "Po co inwestor pyta o beneficjenta rzeczywistego?",
    thesis:
      "Chce ustalić, kto faktycznie kontroluje spółkę, ocenić ryzyko i wypełnić ewentualne obowiązki identyfikacyjne lub AML.",
  },
  {
    id: 33,
    category: "klient",
    section: "B. Co przygotować do wniosku",
    question: "Dlaczego trzeba podać wszystkie zobowiązania?",
    thesis:
      "Bo inwestor ocenia realne obciążenie, pierwszeństwo wierzycieli i ryzyko egzekucji. Ukrycie długu może być naruszeniem oświadczeń umownych, a w skrajnych przypadkach mieć poważniejsze skutki prawne.",
  },
  {
    id: 34,
    category: "klient",
    section: "B. Co przygotować do wniosku",
    question: "Czy potrzebne są wyciągi bankowe?",
    thesis:
      "Często tak, bo pokazują przepływy, aktualną obsługę zobowiązań i realne źródło spłaty. Zakres powinien być proporcjonalny i zgodny z zasadami ochrony danych.",
  },
  {
    id: 35,
    category: "klient",
    section: "B. Co przygotować do wniosku",
    question: "Czy potrzebne jest zaświadczenie z ZUS i urzędu skarbowego?",
    thesis:
      "Nie zawsze, ale przy większym finansowaniu może potwierdzić brak zaległości albo dokładnie określić kwotę do spłaty z pożyczki.",
  },
  {
    id: 36,
    category: "klient",
    section: "B. Co przygotować do wniosku",
    question: "Co przygotować w sprawie nieruchomości?",
    thesis:
      "Numer KW, podstawę nabycia, dokumenty ewidencyjne, informacje o zabudowie, dostępie do drogi, najmie, ubezpieczeniu, postępowaniach i wszystkich osobach korzystających z nieruchomości.",
  },
  {
    id: 37,
    category: "klient",
    section: "B. Co przygotować do wniosku",
    question: "Czy numer KW wystarczy do potwierdzenia własności?",
    thesis:
      "Jest podstawowym źródłem, ale trzeba porównać treść księgi z dokumentami, stanem faktycznym i ewentualnymi wzmiankami o nowych wnioskach.",
  },
  {
    id: 38,
    category: "klient",
    section: "B. Co przygotować do wniosku",
    question: "Co jeśli nieruchomość nie ma księgi wieczystej?",
    thesis:
      "Finansowanie nadal może być rozważane, ale ustanowienie hipoteki wymaga odpowiedniego postępowania wieczystoksięgowego i dokumentów wykazujących prawo do nieruchomości.",
  },
  {
    id: 39,
    category: "klient",
    section: "B. Co przygotować do wniosku",
    question: "Czy można zabezpieczyć pożyczkę na udziale w nieruchomości?",
    thesis:
      "Tak, udział współwłaściciela może być obciążony hipoteką. Taki udział bywa jednak trudniejszy do sprzedaży, więc jego wartość nie powinna być liczona jak proporcjonalna część całej nieruchomości bez korekty ryzyka.",
  },
  {
    id: 40,
    category: "klient",
    section: "B. Co przygotować do wniosku",
    question: "Czy potrzebna jest zgoda wszystkich współwłaścicieli?",
    thesis:
      "Do obciążenia całej nieruchomości tak; każdy właściciel musi skutecznie złożyć wymagane oświadczenie. Współwłaściciel może natomiast co do zasady obciążyć własny udział.",
  },
  {
    id: 41,
    category: "klient",
    section: "B. Co przygotować do wniosku",
    question: "Czy można zabezpieczyć mój dług na nieruchomości rodzica?",
    thesis:
      "Tak, właściciel może ustanowić hipotekę za cudzy dług i staje się dłużnikiem rzeczowym. Musi dokładnie rozumieć zakres ryzyka, a dokumenty powinny rozdzielać odpowiedzialność osobistą od rzeczowej.",
  },
  {
    id: 42,
    category: "klient",
    section: "B. Co przygotować do wniosku",
    question:
      "Czy nieruchomość odziedziczona, ale niewpisana jeszcze na mnie, może być zabezpieczeniem?",
    thesis:
      "Najpierw trzeba wykazać następstwo prawne i zwykle uporządkować wpis własności. Samo przekonanie, że „spadek jest mój”, nie wystarcza notariuszowi ani sądowi wieczystoksięgowemu.",
  },
  {
    id: 43,
    category: "klient",
    section: "B. Co przygotować do wniosku",
    question: "Czy potrzebny jest operat szacunkowy?",
    thesis:
      "Nie w każdej transakcji wymaga go ustawa, ale przy większej kwocie niezależna wycena rzeczoznawcy znacząco poprawia jakość oceny zabezpieczenia.",
  },
  {
    id: 44,
    category: "klient",
    section: "B. Co przygotować do wniosku",
    question: "Czy wycena z portalu ogłoszeniowego wystarczy?",
    thesis:
      "Może dać orientację, lecz cena ofertowa nie jest ceną transakcyjną ani dowodem stanu prawnego i technicznego. Do decyzji inwestycyjnej potrzebna jest ostrożniejsza analiza.",
  },
  {
    id: 45,
    category: "klient",
    section: "B. Co przygotować do wniosku",
    question: "Dlaczego inwestor chce zdjęcia i oględziny?",
    thesis:
      "Księga wieczysta nie pokazuje standardu, stanu technicznego, faktycznego sposobu użytkowania ani problemów z dostępem. Oględziny uzupełniają analizę prawną.",
  },
  {
    id: 46,
    category: "klient",
    section: "B. Co przygotować do wniosku",
    question: "Czy trzeba ujawnić najemców?",
    thesis:
      "Tak. Najem wpływa na możliwość korzystania, sprzedaży i wydania nieruchomości, a niektóre prawa ujawnione w KW działają także wobec kolejnych właścicieli.",
  },
  {
    id: 47,
    category: "klient",
    section: "B. Co przygotować do wniosku",
    question: "Czy trzeba ujawnić osoby zameldowane?",
    thesis:
      "Meldunek sam w sobie nie tworzy prawa własności ani prawa do lokalu, ale faktyczni mieszkańcy mogą wpływać na czas i koszt wydania nieruchomości.",
  },
  {
    id: 48,
    category: "klient",
    section: "B. Co przygotować do wniosku",
    question: "Czy samowola budowlana ma znaczenie?",
    thesis:
      "Tak. Niezgodność zabudowy z dokumentacją może obniżyć wartość, utrudnić sprzedaż i generować koszty legalizacji albo rozbiórki.",
  },
  {
    id: 49,
    category: "klient",
    section: "B. Co przygotować do wniosku",
    question: "Dlaczego ważny jest dostęp do drogi publicznej?",
    thesis:
      "Brak prawnie zapewnionego dostępu obniża użyteczność i płynność nieruchomości. Dojazd „od zawsze przez sąsiada” nie musi oznaczać prawnej służebności.",
  },
  {
    id: 50,
    category: "klient",
    section: "B. Co przygotować do wniosku",
    question: "Czy działka rolna jest dobrym zabezpieczeniem?",
    thesis:
      "Może być, ale jej obrót, krąg nabywców, planowanie przestrzenne i czas sprzedaży bywają bardziej złożone. Sam duży areał nie oznacza wysokiej płynności.",
  },
  {
    id: 51,
    category: "klient",
    section: "C. Kwota, LTV, odsetki i harmonogram",
    question: "Od czego zależy maksymalna kwota pożyczki?",
    thesis:
      "Od realnej wartości i płynności zabezpieczenia, istniejących obciążeń, źródła spłaty, okresu oraz polityki ryzyka inwestora.",
  },
  {
    id: 52,
    category: "klient",
    section: "C. Kwota, LTV, odsetki i harmonogram",
    question: "Co to jest LTV?",
    thesis:
      "To relacja kwoty finansowania do przyjętej wartości nieruchomości. Przy 100 000 zł finansowania i wartości 200 000 zł proste LTV wynosi 50%.",
  },
  {
    id: 53,
    category: "klient",
    section: "C. Kwota, LTV, odsetki i harmonogram",
    question: "Dlaczego niskie LTV jest ważne dla klienta?",
    thesis:
      "Zwiększa szansę na finansowanie i zostawia bufor na spadek ceny, czas sprzedaży, koszty postępowania oraz wcześniejsze obciążenia.",
  },
  {
    id: 54,
    category: "klient",
    section: "C. Kwota, LTV, odsetki i harmonogram",
    question: "Czy LTV liczy się od kwoty „na rękę”?",
    thesis:
      "Trzeba jasno pokazać co najmniej dwa wskaźniki: LTV wypłaconego kapitału oraz relację całej ekspozycji do wartości. Ukrywanie prowizji w liczniku zniekształca obraz.",
  },
  {
    id: 55,
    category: "klient",
    section: "C. Kwota, LTV, odsetki i harmonogram",
    question: "Czy suma hipoteki jest tym samym co kwota pożyczki?",
    thesis:
      "Nie. Suma hipoteki wyznacza górny zakres zabezpieczenia rzeczowego i może obejmować także określone odsetki, koszty i roszczenia uboczne.",
  },
  {
    id: 56,
    category: "klient",
    section: "C. Kwota, LTV, odsetki i harmonogram",
    question: "Czym różnią się odsetki od prowizji?",
    thesis:
      "Odsetki są wynagrodzeniem za korzystanie z kapitału w czasie, a prowizja jest odrębnym kosztem za udzielenie, przygotowanie lub obsługę finansowania.",
  },
  {
    id: 57,
    category: "klient",
    section: "C. Kwota, LTV, odsetki i harmonogram",
    question: "Czy prywatny inwestor może ustalić dowolne odsetki?",
    thesis:
      "Nie. Odsetki umowne nie mogą przekraczać odsetek maksymalnych z Kodeksu cywilnego, których wysokość zależy od aktualnej stopy referencyjnej NBP.",
  },
  {
    id: 58,
    category: "klient",
    section: "C. Kwota, LTV, odsetki i harmonogram",
    question: "Ile wynoszą dziś odsetki maksymalne?",
    thesis:
      "Na 4 sierpnia 2026 r., przy stopie referencyjnej NBP 3,75%, odsetki maksymalne wynoszą 14,50% rocznie. Wzór to dwa razy „stopa referencyjna NBP + 3,5 punktu procentowego”; liczbę trzeba sprawdzić ponownie w dniu publikacji.",
  },
  {
    id: 59,
    category: "klient",
    section: "C. Kwota, LTV, odsetki i harmonogram",
    question: "Czym są odsetki za opóźnienie?",
    thesis:
      "To odsetki należne od przeterminowanej płatności. Na 4 sierpnia 2026 r. ich umowny limit wynosi 18,50% rocznie; wzór to dwa razy „stopa referencyjna NBP + 5,5 punktu procentowego”.",
  },
  {
    id: 60,
    category: "klient",
    section: "C. Kwota, LTV, odsetki i harmonogram",
    question: "Czy prowizja też ma limit?",
    thesis:
      "Zależy od reżimu umowy. Dla konsumentów i prywatnych pożyczek osobom fizycznym na cele niezwiązane bezpośrednio z działalnością działają szczególne limity, a w B2B nadal obowiązują m.in. ustawa, natura stosunku, zasady współżycia społecznego i zakaz wyzysku.",
  },
  {
    id: 61,
    category: "klient",
    section: "C. Kwota, LTV, odsetki i harmonogram",
    question: "Co powinno wejść do całkowitego kosztu pożyczki?",
    thesis:
      "Odsetki, prowizje, opłaty za przygotowanie i obsługę, obowiązkowe usługi dodatkowe oraz koszty zabezpieczeń; osobno warto pokazać daniny publiczne i koszty notarialne.",
  },
  {
    id: 62,
    category: "klient",
    section: "C. Kwota, LTV, odsetki i harmonogram",
    question: "Co to jest rata balonowa?",
    thesis:
      "Przez okres umowy klient płaci mniejsze raty lub same odsetki, a znaczną część kapitału zwraca na końcu. Wymaga to konkretnego planu końcowej spłaty.",
  },
  {
    id: 63,
    category: "klient",
    section: "C. Kwota, LTV, odsetki i harmonogram",
    question: "Czy można przez rok płacić tylko odsetki?",
    thesis:
      "Tak, jeżeli harmonogram tak stanowi. Kapitał nadal pozostaje do zwrotu, więc trzeba od początku wiedzieć, skąd pojawi się kwota końcowa.",
  },
  {
    id: 64,
    category: "klient",
    section: "C. Kwota, LTV, odsetki i harmonogram",
    question: "Czy raty muszą być równe?",
    thesis:
      "Nie. Strony mogą ustalić raty równe, malejące, odsetkowe albo płatność jednorazową, o ile konstrukcja jest zgodna z prawem i jasno opisana.",
  },
  {
    id: 65,
    category: "klient",
    section: "C. Kwota, LTV, odsetki i harmonogram",
    question: "Czy można dostać karencję w spłacie?",
    thesis:
      "Tak, jeśli inwestor ją zaakceptuje. Trzeba ustalić, czy w okresie karencji naliczają się odsetki i kiedy dokładnie zaczyna się spłata kapitału.",
  },
  {
    id: 66,
    category: "klient",
    section: "C. Kwota, LTV, odsetki i harmonogram",
    question: "Czy mogę spłacić pożyczkę wcześniej?",
    thesis:
      "Zwykle tak, ale skutki kosztowe zależą od umowy i reżimu prawnego. Przy umowach konsumenckich i określonych prywatnych pożyczkach poza działalnością obowiązują szczególne zasady obniżenia kosztów.",
  },
  {
    id: 67,
    category: "klient",
    section: "C. Kwota, LTV, odsetki i harmonogram",
    question: "Czy przy wcześniejszej spłacie prowizja zawsze jest zwracana?",
    thesis:
      "Nie wolno odpowiadać jednym „tak” dla wszystkich umów. Inaczej wygląda kredyt konsumencki, inaczej prywatna pożyczka osobie fizycznej poza działalnością, a inaczej prawidłowo zawarta umowa B2B.",
  },
  {
    id: 68,
    category: "klient",
    section: "C. Kwota, LTV, odsetki i harmonogram",
    question: "Czy można refinansować pożyczkę przed terminem?",
    thesis:
      "Tak. Nowe finansowanie powinno jednak pokryć pełne aktualne saldo, koszty zamknięcia, wykreślenie lub przeniesienie zabezpieczeń oraz bezpieczną kolejność przelewów.",
  },
  {
    id: 69,
    category: "klient",
    section: "C. Kwota, LTV, odsetki i harmonogram",
    question: "Czy termin pożyczki można przedłużyć?",
    thesis:
      "Tak, za zgodą obu stron i zwykle w formie aneksu. Trzeba ponownie policzyć koszt, termin art. 777 i zakres zabezpieczenia.",
  },
  {
    id: 70,
    category: "klient",
    section: "C. Kwota, LTV, odsetki i harmonogram",
    question: "Czy przedłużenie może być dodatkowo płatne?",
    thesis:
      "Może, ale opłata musi być jasno uzgodniona i zgodna z właściwym reżimem prawnym. Nie może służyć obchodzeniu limitów kosztów lub odsetek.",
  },
  {
    id: 71,
    category: "klient",
    section: "D. Podatki, notariusz i koszty uruchomienia",
    question: "Kto płaci PCC od pożyczki prywatnej?",
    thesis:
      "Jeżeli PCC jest należny, obowiązek ciąży co do zasady na pożyczkobiorcy. Standardowa stawka od umowy pożyczki wynosi 0,5% podstawy opodatkowania.",
  },
  {
    id: 72,
    category: "klient",
    section: "D. Podatki, notariusz i koszty uruchomienia",
    question: "Ile czasu jest na PCC-3?",
    thesis:
      "Co do zasady 14 dni od powstania obowiązku podatkowego, najczęściej od zawarcia umowy. Najpierw trzeba jednak sprawdzić, czy w danej transakcji PCC w ogóle występuje.",
  },
  {
    id: 73,
    category: "klient",
    section: "D. Podatki, notariusz i koszty uruchomienia",
    question: "Czy każda pożyczka podlega PCC?",
    thesis:
      "Nie. Istnieją zwolnienia i wyłączenia, m.in. zależne od stron, VAT i rodzaju transakcji. Nie wolno automatycznie zakładać ani 0 zł, ani 0,5% bez sprawdzenia modelu.",
  },
  {
    id: 74,
    category: "klient",
    section: "D. Podatki, notariusz i koszty uruchomienia",
    question: "Czy pożyczka od firmy zawsze jest bez PCC?",
    thesis:
      "Nie zawsze. Kluczowe jest, czy konkretna czynność podlega VAT albo korzysta ze zwolnienia z VAT po stronie udzielającego; sam fakt posiadania spółki nie rozstrzyga sprawy.",
  },
  {
    id: 75,
    category: "klient",
    section: "D. Podatki, notariusz i koszty uruchomienia",
    question: "Jaki PCC płaci się od ustanowienia hipoteki?",
    thesis:
      "Ustawa rozróżnia 0,1% od zabezpieczonej wierzytelności istniejącej oraz 19 zł przy wierzytelności o wysokości nieustalonej. Kwalifikacja zależy od konstrukcji konkretnego zabezpieczenia.",
  },
  {
    id: 76,
    category: "klient",
    section: "D. Podatki, notariusz i koszty uruchomienia",
    question: "Kto płaci PCC od hipoteki?",
    thesis:
      "Podatnikiem jest osoba składająca oświadczenie o ustanowieniu hipoteki, czyli zazwyczaj właściciel nieruchomości. Gdy oświadczenie znajduje się w akcie notarialnym, podatek co do zasady pobiera i rozlicza notariusz.",
  },
  {
    id: 77,
    category: "klient",
    section: "D. Podatki, notariusz i koszty uruchomienia",
    question: "Ile kosztuje wpis hipoteki do KW?",
    thesis:
      "Opłata sądowa od wpisu jednej hipoteki wynosi obecnie 200 zł. Jest to osobna pozycja od taksy notarialnej, VAT, wypisów i PCC.",
  },
  {
    id: 78,
    category: "klient",
    section: "D. Podatki, notariusz i koszty uruchomienia",
    question: "Ile kosztuje późniejsze wykreślenie hipoteki?",
    thesis:
      "Opłata sądowa od wykreślenia jednej hipoteki wynosi co do zasady 100 zł, do czego może dojść koszt dokumentu lub poświadczenia podpisu wierzyciela.",
  },
  {
    id: 79,
    category: "klient",
    section: "D. Podatki, notariusz i koszty uruchomienia",
    question: "Z czego składa się rachunek u notariusza?",
    thesis:
      "Z taksy notarialnej, 23% VAT od taksy, wypisów, opłat sądowych pobieranych przy wniosku oraz ewentualnego PCC. Każda pozycja powinna być rozpisana osobno.",
  },
  {
    id: 80,
    category: "klient",
    section: "D. Podatki, notariusz i koszty uruchomienia",
    question: "Czy taksa notarialna jest stała?",
    thesis:
      "Przepisy określają stawki maksymalne, często zależne od wartości i rodzaju czynności. Kancelaria może ustalić niższe wynagrodzenie, dlatego warto poprosić o pełną kalkulację przed terminem.",
  },
  {
    id: 81,
    category: "klient",
    section: "D. Podatki, notariusz i koszty uruchomienia",
    question: "Czy koszt art. 777 jest zawsze taki sam?",
    thesis:
      "Nie. Zależy m.in. od kwoty, konstrukcji aktu, liczby oświadczeń i praktyki kancelarii w granicach stawek maksymalnych.",
  },
  {
    id: 82,
    category: "klient",
    section: "D. Podatki, notariusz i koszty uruchomienia",
    question: "Czy notariusz wycenia nieruchomość?",
    thesis:
      "Nie. Notariusz bada legalność i formę czynności, ale nie zastępuje rzeczoznawcy majątkowego ani analizy inwestycyjnej.",
  },
  {
    id: 83,
    category: "klient",
    section: "D. Podatki, notariusz i koszty uruchomienia",
    question: "Czy notariusz gwarantuje, że umowa jest opłacalna?",
    thesis:
      "Nie. Ma czuwać nad zgodnością czynności z prawem i wyjaśnić jej skutki, lecz nie podejmuje za strony decyzji biznesowej.",
  },
  {
    id: 84,
    category: "klient",
    section: "D. Podatki, notariusz i koszty uruchomienia",
    question: "Kto zwykle ponosi koszty zabezpieczeń?",
    thesis:
      "Strony mogą to ustalić w umowie; praktycznie często ponosi je pożyczkobiorca. Wszystkie koszty powinny być znane przed podpisaniem.",
  },
  {
    id: 85,
    category: "klient",
    section: "D. Podatki, notariusz i koszty uruchomienia",
    question: "Czy koszt rzeczoznawcy jest zwracany, gdy nie dostanę pożyczki?",
    thesis:
      "Zależy od uzgodnień z podmiotem zlecającym wycenę. Trzeba przed zapłatą wiedzieć, kto jest zamawiającym i czy opłata zależy od decyzji finansującego.",
  },
  {
    id: 86,
    category: "klient",
    section: "E. Skuteczne zawarcie umowy na odległość",
    question: "Czy umowę pożyczki można zawrzeć całkowicie online?",
    thesis:
      "Samą umowę pożyczki często tak, jeżeli zachowano wymaganą formę i można ustalić tożsamość stron. Hipoteka i art. 777 wymagają jednak odrębnych czynności notarialnych.",
  },
  {
    id: 87,
    category: "klient",
    section: "E. Skuteczne zawarcie umowy na odległość",
    question: "Co to jest forma dokumentowa?",
    thesis:
      "Wystarcza utrwalenie oświadczenia na nośniku pozwalającym odczytać treść oraz ustalić osobę, która je złożyła. Może to być odpowiednio zaprojektowany proces elektroniczny.",
  },
  {
    id: 88,
    category: "klient",
    section: "E. Skuteczne zawarcie umowy na odległość",
    question: "Czy skan podpisanej umowy jest ważny?",
    thesis:
      "Może spełnić formę dokumentową i stanowić dowód, ale nie zawsze zastąpi formę pisemną zastrzeżoną pod rygorem nieważności. Trzeba czytać wymagania konkretnej czynności i umowy.",
  },
  {
    id: 89,
    category: "klient",
    section: "E. Skuteczne zawarcie umowy na odległość",
    question: "Czy kliknięcie „akceptuję” może zawrzeć umowę?",
    thesis:
      "Tak, jeżeli proces jednoznacznie pokazuje treść, osobę, zamiar związania się umową i moment złożenia oświadczenia. Należy zachować pełny ślad audytowy.",
  },
  {
    id: 90,
    category: "klient",
    section: "E. Skuteczne zawarcie umowy na odległość",
    question: "Czy zwykły podpis elektroniczny wystarczy?",
    thesis:
      "Może wystarczyć do formy dokumentowej. Nie jest jednak automatycznie równoważny podpisowi własnoręcznemu tam, gdzie prawo lub umowa wymaga formy pisemnej.",
  },
  {
    id: 91,
    category: "klient",
    section: "E. Skuteczne zawarcie umowy na odległość",
    question: "Jaki e-podpis jest równy podpisowi własnoręcznemu?",
    thesis:
      "Kwalifikowany podpis elektroniczny. Dokument opatrzony takim podpisem spełnia formę elektroniczną równoważną pisemnej.",
  },
  {
    id: 92,
    category: "klient",
    section: "E. Skuteczne zawarcie umowy na odległość",
    question: "Czy Profil Zaufany zastępuje podpis kwalifikowany w prywatnej umowie?",
    thesis:
      "Nie należy tego zakładać. Podpis zaufany służy przede wszystkim relacjom z podmiotami publicznymi; w prywatnej umowie może wspierać identyfikację, lecz nie jest uniwersalnym odpowiednikiem formy pisemnej.",
  },
  {
    id: 93,
    category: "klient",
    section: "E. Skuteczne zawarcie umowy na odległość",
    question: "Jak potwierdzić tożsamość klienta na odległość?",
    thesis:
      "Przez bezpieczny proces KYC, kontrolę dokumentu, liveness lub inne wiarygodne metody oraz zgodność danych rachunku. Samo zdjęcie dowodu wysłane e-mailem jest słabym standardem.",
  },
  {
    id: 94,
    category: "klient",
    section: "E. Skuteczne zawarcie umowy na odległość",
    question: "Czy przelew weryfikacyjny wystarczy do zawarcia umowy?",
    thesis:
      "Może być jednym z dowodów tożsamości i woli, ale nie powinien być jedynym zabezpieczeniem przy dużej kwocie. Potrzebny jest spójny proces i archiwizacja dowodów.",
  },
  {
    id: 95,
    category: "klient",
    section: "E. Skuteczne zawarcie umowy na odległość",
    question: "Czy wideorozmowa zastępuje podpis?",
    thesis:
      "Nie sama w sobie. Może wzmacniać dowód tożsamości i świadomej decyzji, ale wymagana forma czynności musi być zachowana niezależnie.",
  },
  {
    id: 96,
    category: "klient",
    section: "E. Skuteczne zawarcie umowy na odległość",
    question: "Czy hipotekę można ustanowić przez internet bez notariusza?",
    thesis:
      "Nie w zwykłym procesie prywatnym. Oświadczenie właściciela ustanawiającego hipotekę wymaga aktu notarialnego, a sama hipoteka powstaje dopiero po wpisie do KW.",
  },
  {
    id: 97,
    category: "klient",
    section: "E. Skuteczne zawarcie umowy na odległość",
    question: "Czy art. 777 można podpisać online zwykłym e-podpisem?",
    thesis: "Nie. Oświadczenie o poddaniu się egzekucji musi znaleźć się w akcie notarialnym.",
  },
  {
    id: 98,
    category: "klient",
    section: "E. Skuteczne zawarcie umowy na odległość",
    question: "Czy inwestor musi być osobiście u notariusza?",
    thesis:
      "Często nie, bo właściciel może złożyć jednostronne oświadczenia o hipotece i poddaniu się egzekucji, ale dokumentacja i akceptacja wierzyciela muszą być prawidłowo zaprojektowane.",
  },
  {
    id: 99,
    category: "klient",
    section: "E. Skuteczne zawarcie umowy na odległość",
    question: "Czy klient i inwestor mogą być w różnych miastach?",
    thesis:
      "Tak. Umowę można zawrzeć elektronicznie lub przez wymianę dokumentów, a wymagane akty sporządzić w odpowiedniej kancelarii; czasem wykorzystuje się właściwie udzielone pełnomocnictwo.",
  },
  {
    id: 100,
    category: "klient",
    section: "E. Skuteczne zawarcie umowy na odległość",
    question: "Czy pełnomocnik może ustanowić hipotekę za właściciela?",
    thesis:
      "Może, jeśli pełnomocnictwo ma formę wymaganą dla tej czynności i dostatecznie precyzyjny zakres. Notariusz powinien zobaczyć dokument przed terminem.",
  },
  {
    id: 101,
    category: "klient",
    section: "E. Skuteczne zawarcie umowy na odległość",
    question: "Kiedy inwestor powinien przelać pieniądze?",
    thesis:
      "Po spełnieniu wszystkich uzgodnionych warunków uruchomienia, np. podpisaniu umowy i aktów, złożeniu wniosków do KW, dostarczeniu dokumentów spłat oraz potwierdzeniu kolejności zabezpieczeń.",
  },
  {
    id: 102,
    category: "klient",
    section: "E. Skuteczne zawarcie umowy na odległość",
    question: "Czy pieniądze można wypłacić przed wpisem hipoteki?",
    thesis:
      "Można, ale inwestor ponosi okres przejściowy, gdy hipoteka jeszcze nie powstała. Ryzyko ogranicza wzmianka, kontrola kolejności wniosków i właściwe warunki uruchomienia.",
  },
  {
    id: 103,
    category: "klient",
    section: "E. Skuteczne zawarcie umowy na odległość",
    question: "Czy notariusz może przechować pieniądze do spełnienia warunków?",
    thesis:
      "W określonych sytuacjach możliwy jest depozyt notarialny. Trzeba wcześniej uzgodnić z kancelarią warunki przyjęcia i wypłaty środków.",
  },
  {
    id: 104,
    category: "klient",
    section: "E. Skuteczne zawarcie umowy na odległość",
    question: "Jak udowodnić, że pożyczka została wypłacona?",
    thesis:
      "Najlepiej przelewem z jednoznacznym tytułem, zgodnym z umową, na wskazany rachunek albo bezpośrednio do wierzyciela klienta. Potwierdzenie trzeba trwale zarchiwizować.",
  },
  {
    id: 105,
    category: "klient",
    section: "E. Skuteczne zawarcie umowy na odległość",
    question: "Czy aneks do umowy też można podpisać zdalnie?",
    thesis:
      "Zwykle tak, z zachowaniem formy wymaganej przez ustawę i samą umowę. Zmiana hipoteki lub art. 777 może jednak wymagać dodatkowej czynności notarialnej i wpisu.",
  },
  {
    id: 106,
    category: "klient",
    section: "F. Zamknięcie firmy, spłata i problemy",
    question: "Czy mogę zamknąć JDG w czasie trwania pożyczki?",
    thesis:
      "Tak, można wykreślić firmę z CEIDG, ale umowa może wymagać poinformowania inwestora albo łączyć zamknięcie z wypowiedzeniem lub innymi konsekwencjami. Dług pozostaje długiem tej samej osoby fizycznej.",
  },
  {
    id: 107,
    category: "klient",
    section: "F. Zamknięcie firmy, spłata i problemy",
    question: "Czy zamknięcie JDG zmienia pożyczkę firmową w konsumencką?",
    thesis:
      "Co do zasady status i charakter umowy ocenia się według chwili jej zawarcia oraz rzeczywistego celu. Późniejsze zamknięcie firmy nie przepisuje automatycznie historii umowy.",
  },
  {
    id: 108,
    category: "klient",
    section: "F. Zamknięcie firmy, spłata i problemy",
    question: "Czy można zawiesić działalność podczas spłaty?",
    thesis:
      "Tak, lecz zawieszenie może naruszyć obowiązek utrzymania aktywnej firmy lub wymagać zawiadomienia inwestora zgodnie z umową. Samo zawieszenie nie wstrzymuje rat ani odsetek.",
  },
  {
    id: 109,
    category: "klient",
    section: "F. Zamknięcie firmy, spłata i problemy",
    question: "Czy inwestor codziennie sprawdza status CEIDG?",
    thesis:
      "Nie ma ustawowego obowiązku codziennej kontroli. W praktyce inwestorzy często koncentrują się na terminowości spłat, ale mogą sprawdzać publiczne rejestry, a umowa może nakładać obowiązek zgłoszenia zawieszenia lub zamknięcia.",
  },
  {
    id: 110,
    category: "klient",
    section: "F. Zamknięcie firmy, spłata i problemy",
    question: "Czy wystarczy, że raty są płacone, mimo zamknięcia firmy?",
    thesis:
      "Regularna spłata ogranicza praktyczne ryzyko, lecz nie usuwa ewentualnego naruszenia obowiązków informacyjnych lub innych warunków umowy. Najpierw trzeba przeczytać postanowienia o zmianach w działalności.",
  },
  {
    id: 111,
    category: "klient",
    section: "F. Zamknięcie firmy, spłata i problemy",
    question: "Co się dzieje po pierwszej spóźnionej racie?",
    thesis:
      "Powstaje zaległość i mogą naliczać się odsetki za opóźnienie. Dalsze kroki zależą od umowy: wezwania, okresu naprawczego i warunków wypowiedzenia.",
  },
  {
    id: 112,
    category: "klient",
    section: "F. Zamknięcie firmy, spłata i problemy",
    question: "Czy przez jeden dzień opóźnienia mogę od razu stracić nieruchomość?",
    thesis:
      "Nie ma automatycznego przejęcia własności. Nawet przy hipotece i art. 777 wierzyciel musi doprowadzić do wymagalności długu, uzyskać tytuł wykonawczy i działać przez komornika.",
  },
  {
    id: 113,
    category: "klient",
    section: "F. Zamknięcie firmy, spłata i problemy",
    question: "Czy inwestor musi najpierw wysłać wezwanie do zapłaty?",
    thesis:
      "Zależy od terminu wymagalności, treści umowy i przepisów szczególnych. Przy wypowiadaniu całej umowy trzeba ściśle wykonać uzgodnioną procedurę i prawidłowo doręczyć oświadczenia.",
  },
  {
    id: 114,
    category: "klient",
    section: "F. Zamknięcie firmy, spłata i problemy",
    question: "Co oznacza postawienie całej pożyczki w stan natychmiastowej wymagalności?",
    thesis:
      "Po skutecznym wypowiedzeniu lub ziszczeniu się innej podstawy określonej w umowie wierzyciel może żądać od razu całego pozostałego salda, a nie tylko zaległej raty.",
  },
  {
    id: 115,
    category: "klient",
    section: "F. Zamknięcie firmy, spłata i problemy",
    question: "Jak rośnie dług po braku spłaty?",
    thesis:
      "Mogą dojść odsetki za opóźnienie, uzasadnione koszty sądu, prawnika, klauzuli, komornika i wyceny. Każda pozycja musi mieć podstawę prawną lub umowną i podlega odpowiednim limitom.",
  },
  {
    id: 116,
    category: "klient",
    section: "F. Zamknięcie firmy, spłata i problemy",
    question: "Czy inwestor może sprzedać mój dług innej osobie?",
    thesis:
      "Wierzytelność jest co do zasady zbywalna, chyba że sprzeciwia się temu ustawa, umowa albo właściwość zobowiązania. Przeniesienie wierzytelności hipotecznej wymaga także odpowiedniego wpisu w KW.",
  },
  {
    id: 117,
    category: "klient",
    section: "F. Zamknięcie firmy, spłata i problemy",
    question: "Czy inwestor po braku spłaty automatycznie staje się właścicielem domu?",
    thesis:
      "Nie. Hipoteka daje prawo do zaspokojenia z ceny uzyskanej w sądowej egzekucji, a nie automatyczne przeniesienie własności.",
  },
  {
    id: 118,
    category: "klient",
    section: "F. Zamknięcie firmy, spłata i problemy",
    question: "Czy można sprzedać nieruchomość obciążoną hipoteką?",
    thesis:
      "Tak, ale hipoteka co do zasady obciąża nieruchomość także po zmianie właściciela. Bezpieczna sprzedaż zwykle obejmuje spłatę salda i uzyskanie dokumentu do wykreślenia hipoteki.",
  },
  {
    id: 119,
    category: "klient",
    section: "F. Zamknięcie firmy, spłata i problemy",
    question: "Czy dobrowolna sprzedaż jest lepsza niż licytacja komornicza?",
    thesis:
      "Często pozwala uzyskać wyższą cenę i ograniczyć koszty, ale wymaga zgody organizacyjnej wierzycieli, poprawnego rozliczenia ceny i uwolnienia zabezpieczeń.",
  },
  {
    id: 120,
    category: "klient",
    section: "F. Zamknięcie firmy, spłata i problemy",
    question: "Czy można negocjować ugodę po opóźnieniu?",
    thesis:
      "Tak, na każdym etapie strony mogą rozmawiać o ratach, dodatkowym zabezpieczeniu, sprzedaży dobrowolnej lub nowym terminie. Ustalenia powinny być pisemne i skoordynowane z hipoteką oraz art. 777.",
  },
  {
    id: 121,
    category: "klient",
    section: "F. Zamknięcie firmy, spłata i problemy",
    question: "Czy można refinansować pożyczkę już po wypowiedzeniu?",
    thesis:
      "Tak, jeśli nowy finansujący akceptuje sytuację, a dotychczasowy wierzyciel poda pełne saldo i warunki zwolnienia zabezpieczenia. Kolejność dokumentów i przelewów jest wtedy kluczowa.",
  },
  {
    id: 122,
    category: "klient",
    section: "F. Zamknięcie firmy, spłata i problemy",
    question: "Czy komornik może zająć tylko nieruchomość zabezpieczoną hipoteką?",
    thesis:
      "Nie zawsze. Jeżeli pożyczkobiorca odpowiada osobiście, egzekucja może objąć także rachunki, wynagrodzenie, wierzytelności i inne składniki majątku w granicach tytułu wykonawczego.",
  },
  {
    id: 123,
    category: "klient",
    section: "F. Zamknięcie firmy, spłata i problemy",
    question: "Czy komornik może zająć majątek małżonka?",
    thesis:
      "To zależy od tytułu, zgody małżonka, ustroju majątkowego i źródła zobowiązania. Sam ślub nie oznacza automatycznej odpowiedzialności małżonka za każdy dług.",
  },
  {
    id: 124,
    category: "klient",
    section: "F. Zamknięcie firmy, spłata i problemy",
    question: "Czy brak spłaty pożyczki jest przestępstwem?",
    thesis:
      "Zwykła niewypłacalność lub spóźnienie to co do zasady sprawa cywilna. Odpowiedzialność karna może pojawić się przy odrębnych zachowaniach, np. świadomym oszustwie, fałszywych dokumentach lub ukrywaniu majątku w określonych warunkach.",
  },
  {
    id: 125,
    category: "klient",
    section: "F. Zamknięcie firmy, spłata i problemy",
    question: "Kiedy pożyczka może zostać uznana za wyłudzenie?",
    thesis:
      "Nie przez sam fakt późniejszego braku pieniędzy. Znaczenie ma m.in. zamiar i wprowadzenie inwestora w błąd już przy uzyskiwaniu finansowania.",
  },
  {
    id: 126,
    category: "klient",
    section: "F. Zamknięcie firmy, spłata i problemy",
    question: "Czy mogę ogłosić upadłość mimo hipoteki?",
    thesis:
      "Tak, jeżeli spełnione są przesłanki właściwego postępowania. Hipoteka nie znika automatycznie, a sposób zaspokojenia wierzyciela podlega prawu upadłościowemu.",
  },
  {
    id: 127,
    category: "klient",
    section: "F. Zamknięcie firmy, spłata i problemy",
    question: "Co dzieje się z pożyczką po śmierci pożyczkobiorcy?",
    thesis:
      "Zobowiązanie co do zasady wchodzi do spadku, a odpowiedzialność spadkobierców zależy m.in. od sposobu przyjęcia spadku. Hipoteka nadal obciąża nieruchomość.",
  },
  {
    id: 128,
    category: "klient",
    section: "F. Zamknięcie firmy, spłata i problemy",
    question: "Czy po pełnej spłacie hipoteka znika sama z KW?",
    thesis:
      "Wierzytelność i hipoteka co do zasady wygasają, ale wpis nie znika automatycznie. Trzeba uzyskać zgodę wierzyciela i złożyć wniosek o wykreślenie.",
  },
  {
    id: 129,
    category: "klient",
    section: "F. Zamknięcie firmy, spłata i problemy",
    question: "Jaki dokument powinienem dostać po spłacie?",
    thesis:
      "Potwierdzenie całkowitego rozliczenia oraz zgodę na wykreślenie hipoteki w formie odpowiedniej dla sądu wieczystoksięgowego; warto także odzyskać lub rozliczyć weksel i inne zabezpieczenia.",
  },
  {
    id: 130,
    category: "klient",
    section: "F. Zamknięcie firmy, spłata i problemy",
    question: "Co zrobić, gdy wiem, że nie zapłacę następnej raty?",
    thesis:
      "Skontaktować się przed terminem, przedstawić realne liczby i propozycję rozwiązania. Wczesna ugoda zwykle daje więcej możliwości niż rozmowa po wypowiedzeniu i wszczęciu egzekucji.",
  },
  {
    id: 131,
    category: "inwestor",
    section: "G. Model, wynagrodzenie, podatki i regulacje",
    question: "Na czym inwestor zarabia przy pożyczce prywatnej?",
    thesis:
      "Najczęściej na odsetkach oraz ewentualnej, wyraźnie opisanej prowizji. Wynik netto trzeba pomniejszyć o podatki, koszty obsługi, opóźnienia i ryzyko straty kapitału.",
  },
  {
    id: 132,
    category: "inwestor",
    section: "G. Model, wynagrodzenie, podatki i regulacje",
    question: "Czy prowizja inwestora jest tym samym co odsetki?",
    thesis:
      "Formalnie może być odrębnym świadczeniem, ale jej nazwa nie przesądza charakteru. Opłata faktycznie zastępująca odsetki może być oceniana łącznie z całą ekonomią umowy.",
  },
  {
    id: 133,
    category: "inwestor",
    section: "G. Model, wynagrodzenie, podatki i regulacje",
    question: "Jak policzyć prawdziwy zwrot z pożyczki?",
    thesis:
      "Należy uwzględnić realnie wypłacony kapitał, terminy wszystkich przepływów, podatki, koszty oraz faktyczny dzień spłaty. Sama suma odsetek i prowizji nie jest jeszcze roczną stopą zwrotu.",
  },
  {
    id: 134,
    category: "inwestor",
    section: "G. Model, wynagrodzenie, podatki i regulacje",
    question: "Czy prowizję jednorazową można po prostu pomnożyć przez 12 miesięcy?",
    thesis:
      "Nie, jeśli okres jest inny albo przepływy występują w różnych dniach. Do porównania transakcji lepiej użyć rocznej stopy liczonej z przepływów pieniężnych.",
  },
  {
    id: 135,
    category: "inwestor",
    section: "G. Model, wynagrodzenie, podatki i regulacje",
    question: "Jak opodatkowane są odsetki prywatnego inwestora?",
    thesis:
      "Poza działalnością gospodarczą odsetki od pożyczek osoby fizycznej są co do zasady objęte 19% zryczałtowanym PIT. Inaczej może wyglądać rozliczenie w ramach działalności lub spółki.",
  },
  {
    id: 136,
    category: "inwestor",
    section: "G. Model, wynagrodzenie, podatki i regulacje",
    question: "Kto pobiera 19% podatku od odsetek?",
    thesis:
      "Zależy od statusu podmiotu wypłacającego. Gdy płatnik ma ustawowy obowiązek, potrąca podatek; w innych sytuacjach inwestor rozlicza go sam — dlatego procedurę trzeba ustalić przed pierwszą płatnością.",
  },
  {
    id: 137,
    category: "inwestor",
    section: "G. Model, wynagrodzenie, podatki i regulacje",
    question: "Czy zwrot kapitału jest przychodem inwestora?",
    thesis:
      "Sam zwrot pożyczonego kapitału co do zasady nie jest zarobkiem. Przychodem są wynagrodzenia, takie jak odsetki i zależnie od konstrukcji inne opłaty.",
  },
  {
    id: 138,
    category: "inwestor",
    section: "G. Model, wynagrodzenie, podatki i regulacje",
    question: "Czy niespłacony kapitał można zawsze odliczyć od podatku?",
    thesis:
      "Nie. Możliwość rozpoznania straty lub kosztu zależy od źródła przychodu, statusu inwestora i spełnienia ustawowych warunków; przy prywatnym ryczałtowym opodatkowaniu odsetek nie działa prosta zasada „strata obniża podatek”.",
  },
  {
    id: 139,
    category: "inwestor",
    section: "G. Model, wynagrodzenie, podatki i regulacje",
    question: "Czy odsetki i prowizja podlegają VAT?",
    thesis:
      "Usługi udzielania pożyczek mogą korzystać ze zwolnienia z VAT, ale kwalifikacja inwestora i poszczególnych opłat wymaga oceny konkretnego modelu. Nie każda opłata dodatkowa automatycznie dzieli los odsetek.",
  },
  {
    id: 140,
    category: "inwestor",
    section: "G. Model, wynagrodzenie, podatki i regulacje",
    question: "Czy inwestor płaci PCC od udzielonej pożyczki?",
    thesis:
      "Obowiązek PCC od umowy pożyczki, jeżeli występuje, ciąży co do zasady na pożyczkobiorcy. Status VAT pożyczkodawcy może wpływać na to, czy PCC w ogóle powstanie.",
  },
  {
    id: 141,
    category: "inwestor",
    section: "G. Model, wynagrodzenie, podatki i regulacje",
    question: "Czy do jednorazowej pożyczki własnych pieniędzy trzeba zakładać firmę?",
    thesis:
      "Co do zasady pojedyncza prywatna czynność nie wymaga automatycznie rejestracji działalności. Liczą się jednak skala, powtarzalność, zorganizowanie i zamiar zarobkowy.",
  },
  {
    id: 142,
    category: "inwestor",
    section: "G. Model, wynagrodzenie, podatki i regulacje",
    question: "Kiedy regularne pożyczanie staje się działalnością gospodarczą?",
    thesis:
      "Nie rozstrzyga jedna liczba umów. Ocenia się zorganizowanie, ciągłość, samodzielność i zarobkowy charakter całej aktywności.",
  },
  {
    id: 143,
    category: "inwestor",
    section: "G. Model, wynagrodzenie, podatki i regulacje",
    question: "Czy prywatny inwestor potrzebuje licencji na każdą pożyczkę B2B?",
    thesis:
      "Nie ma ogólnej licencji na pojedynczą pożyczkę z własnych środków dla przedsiębiorcy. Model może jednak wejść w regulacje, jeśli obejmuje np. finansowanie konsumentów, pozyskiwanie środków od innych osób lub działalność platformową.",
  },
  {
    id: 144,
    category: "inwestor",
    section: "G. Model, wynagrodzenie, podatki i regulacje",
    question:
      "Czy można prywatnie udzielać pożyczek konsumentom na takich samych zasadach jak firmom?",
    thesis:
      "Nie. Finansowanie konsumenckie podlega odrębnym limitom, informacjom i wymogom wobec kredytodawcy. Prowadzenie działalności polegającej na udzielaniu konsumentom kredytów hipotecznych jest zastrzeżone dla podmiotów wskazanych w ustawie, m.in. banków i SKOK-ów.",
  },
  {
    id: 145,
    category: "inwestor",
    section: "G. Model, wynagrodzenie, podatki i regulacje",
    question: "Czy mogę zebrać pieniądze od znajomych i dalej je pożyczać?",
    thesis:
      "To wymaga osobnej analizy regulacyjnej. Przyjmowanie zwrotnych środków od innych osób i obciążanie ich ryzykiem może wejść w działalność zastrzeżoną albo wymagać odpowiedniej konstrukcji prawnej.",
  },
  {
    id: 146,
    category: "inwestor",
    section: "G. Model, wynagrodzenie, podatki i regulacje",
    question: "Dlaczego trzeba dokumentować źródło kapitału inwestora?",
    thesis:
      "Dla bezpieczeństwa transakcji, rozliczeń podatkowych, banku i ewentualnych obowiązków AML. Przelew powinien pochodzić od właściwej strony umowy albo z jasno udokumentowanego źródła.",
  },
  {
    id: 147,
    category: "inwestor",
    section: "G. Model, wynagrodzenie, podatki i regulacje",
    question: "Czy każdy prywatny inwestor jest instytucją obowiązaną AML?",
    thesis:
      "Nie automatycznie. Status zależy od rodzaju i skali działalności oraz przepisów dotyczących konkretnego podmiotu; niezależnie od tego identyfikacja klienta i źródła środków jest rozsądnym standardem ryzyka.",
  },
  {
    id: 148,
    category: "inwestor",
    section: "G. Model, wynagrodzenie, podatki i regulacje",
    question: "Czy analiza zabezpieczenia jest doradztwem inwestycyjnym?",
    thesis:
      "Sam opis faktów, ryzyk i dokumentów nie musi nim być, ale komunikacja nie powinna przedstawiać wyniku jako gwarancji ani spersonalizowanej rekomendacji bez oceny właściwego reżimu.",
  },
  {
    id: 149,
    category: "inwestor",
    section: "H. LTV, wycena i ekonomia transakcji",
    question: "Jak prawidłowo policzyć LTV?",
    thesis:
      "Podstawowy wzór to kwota finansowania podzielona przez ostrożnie przyjętą wartość nieruchomości razy 100%. Trzeba jawnie zdefiniować obie liczby.",
  },
  {
    id: 150,
    category: "inwestor",
    section: "H. LTV, wycena i ekonomia transakcji",
    question: "Co powinno znaleźć się w liczniku LTV?",
    thesis:
      "Minimum kapitał rzeczywiście wypłacony klientowi lub jego wierzycielom. Dla pełnego obrazu warto osobno pokazać całkowitą ekspozycję wraz z finansowanymi kosztami oraz sumę hipoteki.",
  },
  {
    id: 151,
    category: "inwestor",
    section: "H. LTV, wycena i ekonomia transakcji",
    question: "Jaką wartość nieruchomości przyjąć do LTV?",
    thesis:
      "Nie najwyższą cenę z ogłoszenia, lecz ostrożną wartość opartą na porównywalnych transakcjach, stanie prawnym, technicznym i realnym czasie sprzedaży.",
  },
  {
    id: 152,
    category: "inwestor",
    section: "H. LTV, wycena i ekonomia transakcji",
    question: "Po co bufor przy niskim LTV?",
    thesis:
      "Pokrywa możliwy spadek ceny, koszty sprzedaży i egzekucji, czas bez wpływów, wcześniejsze prawa oraz błędy wyceny.",
  },
  {
    id: 153,
    category: "inwestor",
    section: "H. LTV, wycena i ekonomia transakcji",
    question: "Czy LTV 50% gwarantuje pełną spłatę?",
    thesis:
      "Nie. Niska relacja zmniejsza ryzyko, ale nie usuwa wad prawnych, problemów z pierwszeństwem, niskiej płynności, zniszczenia nieruchomości ani kosztów postępowania.",
  },
  {
    id: 154,
    category: "inwestor",
    section: "H. LTV, wycena i ekonomia transakcji",
    question: "Czy operat rzeczoznawcy gwarantuje cenę sprzedaży?",
    thesis:
      "Nie. Operat jest profesjonalną opinią na określony dzień i cel, a realna cena zależy od rynku, stanu nieruchomości, trybu sprzedaży oraz czasu.",
  },
  {
    id: 155,
    category: "inwestor",
    section: "H. LTV, wycena i ekonomia transakcji",
    question: "Czym wartość rynkowa różni się od ceny szybkiej sprzedaży?",
    thesis:
      "Wartość rynkowa zakłada typowe warunki ekspozycji, a pilna sprzedaż może wymagać istotnego dyskonta. Inwestor powinien przeprowadzić własny scenariusz stresowy.",
  },
  {
    id: 156,
    category: "inwestor",
    section: "H. LTV, wycena i ekonomia transakcji",
    question: "Czy cena zakupu sprzed kilku lat jest dobrą wyceną?",
    thesis:
      "Jest historycznym punktem odniesienia, ale nie uwzględnia aktualnego rynku, zmian stanu technicznego ani obciążeń. Nie powinna być jedyną podstawą LTV.",
  },
  {
    id: 157,
    category: "inwestor",
    section: "H. LTV, wycena i ekonomia transakcji",
    question: "Co oznacza płynność nieruchomości?",
    thesis:
      "To prawdopodobieństwo sprzedaży w rozsądnym czasie bez dużego obniżania ceny. Dwa lokale o tej samej wycenie mogą mieć zupełnie różną płynność.",
  },
  {
    id: 158,
    category: "inwestor",
    section: "H. LTV, wycena i ekonomia transakcji",
    question: "Czy mieszkanie jest zawsze lepszym zabezpieczeniem niż dom?",
    thesis:
      "Nie zawsze, ale standardowe mieszkanie w aktywnym mieście często ma szerszy rynek nabywców. Dom wymaga mocniejszej analizy stanu, działki, lokalizacji i kosztów utrzymania.",
  },
  {
    id: 159,
    category: "inwestor",
    section: "H. LTV, wycena i ekonomia transakcji",
    question: "Dlaczego dom pod miastem bywa trudniejszy do wyceny?",
    thesis:
      "Więcej cech jest unikalnych: działka, standard, dojazd, media, stan budynku i lokalny popyt. Mniej porównywalnych transakcji zwiększa margines błędu.",
  },
  {
    id: 160,
    category: "inwestor",
    section: "H. LTV, wycena i ekonomia transakcji",
    question: "Czy niezabudowana działka jest bezpiecznym zabezpieczeniem?",
    thesis:
      "Zależy od przeznaczenia, dostępu, uzbrojenia, kształtu, ograniczeń i lokalnego popytu. Duża powierzchnia nie oznacza szybkiej sprzedaży.",
  },
  {
    id: 161,
    category: "inwestor",
    section: "H. LTV, wycena i ekonomia transakcji",
    question: "Jak wyceniać udział w nieruchomości?",
    thesis:
      "Nie należy automatycznie mnożyć wartości całości przez procent udziału. Brak wyłącznego władania i wąski rynek zwykle uzasadniają dyskonto.",
  },
  {
    id: 162,
    category: "inwestor",
    section: "H. LTV, wycena i ekonomia transakcji",
    question: "Co sprawdzić przy nieruchomości rolnej?",
    thesis:
      "Status gruntu, plan miejscowy, klasę, zabudowę, dostęp, dzierżawy oraz ograniczenia obrotu. Mogą one zawężać krąg nabywców i wydłużać sprzedaż.",
  },
  {
    id: 163,
    category: "inwestor",
    section: "H. LTV, wycena i ekonomia transakcji",
    question: "Czy budowa w toku może zabezpieczać pożyczkę?",
    thesis:
      "Tak, ale trzeba ocenić grunt, legalność budowy, stopień zaawansowania, koszt dokończenia i popyt na niedokończony obiekt.",
  },
  {
    id: 164,
    category: "inwestor",
    section: "H. LTV, wycena i ekonomia transakcji",
    question: "Dlaczego pierwsze miejsce hipoteczne jest tak ważne?",
    thesis:
      "O kolejności zaspokojenia hipotek co do zasady decyduje pierwszeństwo wpisu. Drugi wierzyciel otrzyma środki dopiero po należnościach o wyższym pierwszeństwie i wcześniejszych kategoriach ustawowych.",
  },
  {
    id: 165,
    category: "inwestor",
    section: "H. LTV, wycena i ekonomia transakcji",
    question: "Czy wystarczy odjąć sumę starej hipoteki z KW od wartości?",
    thesis:
      "Nie. Suma hipoteki nie pokazuje aktualnego salda długu; trzeba uzyskać od wierzyciela dokument z kwotą spłaty i warunkami wykreślenia.",
  },
  {
    id: 166,
    category: "inwestor",
    section: "H. LTV, wycena i ekonomia transakcji",
    question: "Co jest ważniejsze: zabezpieczenie czy źródło spłaty?",
    thesis:
      "Oba elementy odpowiadają na inne pytania. Źródło spłaty decyduje o wykonaniu umowy, a zabezpieczenie ogranicza stratę, gdy plan się nie powiedzie.",
  },
  {
    id: 167,
    category: "inwestor",
    section: "H. LTV, wycena i ekonomia transakcji",
    question: "Jak ocenić plan wyjścia klienta?",
    thesis:
      "Powinien wskazywać konkretny mechanizm, termin i liczby: sprzedaż aktywa, wpływ z kontraktu, refinansowanie albo nadwyżki z działalności. „Jakoś refinansuję” nie jest planem.",
  },
  {
    id: 168,
    category: "inwestor",
    section: "H. LTV, wycena i ekonomia transakcji",
    question: "Jak zrobić prosty stress test transakcji?",
    thesis:
      "Obniżyć zakładaną cenę, wydłużyć sprzedaż, dodać koszty prawne i egzekucyjne oraz sprawdzić, czy wpływy nadal pokrywają saldo o wyższym pierwszeństwie i własną wierzytelność.",
  },
  {
    id: 169,
    category: "inwestor",
    section: "I. Księga wieczysta — osobna seria",
    question: "Po co istnieje księga wieczysta?",
    thesis:
      "Służy ustaleniu stanu prawnego nieruchomości. Jest podstawowym, lecz nie jedynym źródłem due diligence.",
  },
  {
    id: 170,
    category: "inwestor",
    section: "I. Księga wieczysta — osobna seria",
    question: "Gdzie legalnie sprawdzić treść KW?",
    thesis:
      "W oficjalnym systemie Elektronicznych Ksiąg Wieczystych Ministerstwa Sprawiedliwości, znając pełny numer księgi. Samo przeglądanie treści jest bezpłatne.",
  },
  {
    id: 171,
    category: "inwestor",
    section: "I. Księga wieczysta — osobna seria",
    question: "Ile działów ma księga wieczysta?",
    thesis:
      "Cztery główne działy: I, II, III i IV; dział I dzieli się praktycznie na I-O oraz I-Sp.",
  },
  {
    id: 172,
    category: "inwestor",
    section: "I. Księga wieczysta — osobna seria",
    question: "Co pokazuje dział I-O?",
    thesis:
      "Oznaczenie nieruchomości: m.in. położenie, działki, powierzchnię i sposób korzystania. Te dane trzeba porównać z ewidencją i stanem faktycznym.",
  },
  {
    id: 173,
    category: "inwestor",
    section: "I. Księga wieczysta — osobna seria",
    question: "Co pokazuje dział I-Sp?",
    thesis:
      "Prawa związane z własnością, np. udział w nieruchomości wspólnej lub służebność przysługującą nieruchomości. To prawa „na korzyść” danej nieruchomości.",
  },
  {
    id: 174,
    category: "inwestor",
    section: "I. Księga wieczysta — osobna seria",
    question: "Co pokazuje dział II?",
    thesis:
      "Właściciela, współwłaścicieli albo użytkownika wieczystego oraz wielkość udziałów. Dane muszą zgadzać się z osobą ustanawiającą zabezpieczenie.",
  },
  {
    id: 175,
    category: "inwestor",
    section: "I. Księga wieczysta — osobna seria",
    question: "Co można znaleźć w dziale III?",
    thesis:
      "Ograniczone prawa rzeczowe inne niż hipoteki, ograniczenia rozporządzania, roszczenia i prawa osobiste, np. służebności, dożywocie, egzekucję lub roszczenie o przeniesienie własności.",
  },
  {
    id: 176,
    category: "inwestor",
    section: "I. Księga wieczysta — osobna seria",
    question: "Co pokazuje dział IV?",
    thesis:
      "Hipoteki, ich sumy, waluty, wierzycieli, podstawy oraz wierzytelności lub stosunki prawne objęte zabezpieczeniem.",
  },
  {
    id: 177,
    category: "inwestor",
    section: "I. Księga wieczysta — osobna seria",
    question: "Co oznacza wzmianka w KW?",
    thesis:
      "Do sądu wpłynął wniosek lub środek zaskarżenia, który może zmienić treść księgi. Wzmianka wyłącza ochronę rękojmi w zakresie objętym ryzykiem i nie wolno jej ignorować.",
  },
  {
    id: 178,
    category: "inwestor",
    section: "I. Księga wieczysta — osobna seria",
    question: "Czy można podpisać transakcję mimo wzmianki?",
    thesis:
      "Technicznie czasem tak, ale najpierw trzeba ustalić treść i kolejność wniosku. Bez tego nie wiadomo, jakie prawo może zostać wpisane z mocą od chwili złożenia wcześniejszego wniosku.",
  },
  {
    id: 179,
    category: "inwestor",
    section: "I. Księga wieczysta — osobna seria",
    question: "Co to jest rękojmia wiary publicznej ksiąg wieczystych?",
    thesis:
      "W określonych warunkach chroni odpłatnego nabywcę prawa działającego w dobrej wierze, gdy treść KW różni się od rzeczywistego stanu prawnego. Nie jest ogólną gwarancją każdej transakcji.",
  },
  {
    id: 180,
    category: "inwestor",
    section: "I. Księga wieczysta — osobna seria",
    question: "Kiedy rękojmia KW nie chroni?",
    thesis:
      "Między innymi przy złej wierze, czynności nieodpłatnej, wzmiance lub ostrzeżeniu oraz wobec niektórych praw działających niezależnie od wpisu, np. dożywocia czy określonych służebności.",
  },
  {
    id: 181,
    category: "inwestor",
    section: "I. Księga wieczysta — osobna seria",
    question: "Co jeśli sprzedający nie jest wpisany w dziale II?",
    thesis:
      "Musi wykazać nieprzerwany ciąg następstwa prawnego odpowiednimi dokumentami albo najpierw uzyskać wpis. To wymaga dokładnej kontroli podstaw nabycia.",
  },
  {
    id: 182,
    category: "inwestor",
    section: "I. Księga wieczysta — osobna seria",
    question: "Jak rozpoznać majątek wspólny małżonków w KW?",
    thesis:
      "Dział II zwykle wskazuje oboje małżonków i wspólność ustawową lub inny tytuł. Trzeba dodatkowo ustalić aktualny ustrój majątkowy i wymagane zgody.",
  },
  {
    id: 183,
    category: "inwestor",
    section: "I. Księga wieczysta — osobna seria",
    question: "Co oznacza współwłasność w częściach ułamkowych?",
    thesis:
      "Każdy współwłaściciel ma określony udział w prawie, a nie automatycznie konkretny pokój lub fragment działki. Zabezpieczenie całej nieruchomości wymaga działania wszystkich uprawnionych.",
  },
  {
    id: 184,
    category: "inwestor",
    section: "I. Księga wieczysta — osobna seria",
    question: "Czym użytkowanie wieczyste różni się od własności?",
    thesis:
      "To ograniczone w czasie prawo do gruntu należącego zwykle do Skarbu Państwa lub samorządu, powiązane z własnością budynków. Trzeba sprawdzić okres, opłaty i warunki prawa.",
  },
  {
    id: 185,
    category: "inwestor",
    section: "I. Księga wieczysta — osobna seria",
    question: "Co oznacza służebność gruntowa?",
    thesis:
      "Jedna nieruchomość jest obciążona na rzecz innej, np. prawem przejazdu. Może być korzystna lub ograniczać zabudowę i wartość zabezpieczenia.",
  },
  {
    id: 186,
    category: "inwestor",
    section: "I. Księga wieczysta — osobna seria",
    question: "Co oznacza służebność osobista mieszkania?",
    thesis:
      "Konkretna osoba ma prawo korzystać z lokalu lub jego części. Takie prawo może znacząco utrudnić sprzedaż i wydanie nieruchomości.",
  },
  {
    id: 187,
    category: "inwestor",
    section: "I. Księga wieczysta — osobna seria",
    question: "Co oznacza służebność przesyłu?",
    thesis:
      "Przedsiębiorca przesyłowy ma prawo korzystać z części nieruchomości dla urządzeń, np. linii lub rurociągu. Zakres może ograniczać zabudowę i sposób użytkowania.",
  },
  {
    id: 188,
    category: "inwestor",
    section: "I. Księga wieczysta — osobna seria",
    question: "Co oznacza prawo dożywocia?",
    thesis:
      "Nabywca nieruchomości ma obowiązki utrzymania wobec dożywotnika zgodnie z umową. Prawo dożywocia jest szczególnie istotne, bo rękojmia KW nie działa przeciwko niemu.",
  },
  {
    id: 189,
    category: "inwestor",
    section: "I. Księga wieczysta — osobna seria",
    question: "Co oznacza użytkowanie wpisane w dziale III?",
    thesis:
      "Uprawniony może korzystać z cudzej rzeczy i pobierać z niej pożytki w zakresie prawa. Dla inwestora oznacza to ograniczoną kontrolę właściciela nad nieruchomością.",
  },
  {
    id: 190,
    category: "inwestor",
    section: "I. Księga wieczysta — osobna seria",
    question: "Czy najem zawsze jest widoczny w KW?",
    thesis:
      "Nie. Najem może istnieć bez wpisu, a jego skutki wobec nabywcy zależą od przepisów i okoliczności; dlatego trzeba badać umowy i stan faktycznego zajęcia.",
  },
  {
    id: 191,
    category: "inwestor",
    section: "I. Księga wieczysta — osobna seria",
    question: "Co oznacza prawo pierwokupu lub roszczenie o przeniesienie własności?",
    thesis:
      "Osoba trzecia może mieć pierwszeństwo nabycia albo żądać przeniesienia prawa. Taki wpis może zablokować lub podporządkować późniejszą transakcję.",
  },
  {
    id: 192,
    category: "inwestor",
    section: "I. Księga wieczysta — osobna seria",
    question: "Co oznacza wzmianka o wszczęciu egzekucji w dziale III?",
    thesis:
      "Komornik skierował egzekucję do nieruchomości. Późniejszy nabywca co do zasady wchodzi w sytuację objętą skutkami zajęcia, więc nie jest to zwykły „techniczny wpis”.",
  },
  {
    id: 193,
    category: "inwestor",
    section: "I. Księga wieczysta — osobna seria",
    question: "Jak czytać pojedynczy wpis hipoteki?",
    thesis:
      "Trzeba sprawdzić wierzyciela, sumę, walutę, podstawę, wierzytelność, pierwszeństwo i wszystkie wzmianki. Sam napis „hipoteka” nie mówi, ile długu faktycznie pozostało.",
  },
  {
    id: 194,
    category: "inwestor",
    section: "I. Księga wieczysta — osobna seria",
    question: "Czy stara hipoteka oznacza, że dług nadal istnieje?",
    thesis:
      "Nie zawsze; wierzytelność mogła zostać spłacona, lecz wpis nie został wykreślony. Do decyzji potrzebny jest dokument aktualnego wierzyciela, a nie ustne zapewnienie właściciela.",
  },
  {
    id: 195,
    category: "inwestor",
    section: "I. Księga wieczysta — osobna seria",
    question: "Czy czysta KW wystarcza do bezpiecznej pożyczki?",
    thesis:
      "Nie. Poza KW trzeba badać tożsamość, zdolność do rozporządzania, stan faktyczny, budowlany, planistyczny, podatkowy, najem, dostęp i realną wartość.",
  },
  {
    id: 196,
    category: "inwestor",
    section: "J. Hipoteka i art. 777 — osobna seria",
    question: "Czym prawnie jest hipoteka?",
    thesis:
      "To ograniczone prawo rzeczowe, które pozwala wierzycielowi dochodzić zaspokojenia z nieruchomości bez względu na zmianę właściciela i z ustawowym pierwszeństwem przed zwykłymi wierzycielami osobistymi.",
  },
  {
    id: 197,
    category: "inwestor",
    section: "J. Hipoteka i art. 777 — osobna seria",
    question: "Kiedy hipoteka faktycznie powstaje?",
    thesis:
      "Dopiero z chwilą wpisu do księgi wieczystej. Sam akt notarialny i złożenie wniosku jeszcze jej nie tworzą.",
  },
  {
    id: 198,
    category: "inwestor",
    section: "J. Hipoteka i art. 777 — osobna seria",
    question: "Od czego zależy pierwszeństwo hipoteki?",
    thesis:
      "Co do zasady od chwili, od której liczy się skutki wpisu, zwykle związanej z kolejnością złożenia wniosku. Dlatego kontrola wzmianek w dniu uruchomienia jest kluczowa.",
  },
  {
    id: 199,
    category: "inwestor",
    section: "J. Hipoteka i art. 777 — osobna seria",
    question: "Czy druga hipoteka może być bezpieczna?",
    thesis:
      "Może mieć wartość, jeśli po realnym saldzie pierwszej hipoteki i kosztach pozostaje duży bufor. Ryzyko jest jednak większe, bo pierwszy wierzyciel zaspokaja się wcześniej.",
  },
  {
    id: 200,
    category: "inwestor",
    section: "J. Hipoteka i art. 777 — osobna seria",
    question: "Co to jest hipoteka łączna?",
    thesis:
      "Jedna wierzytelność jest zabezpieczona na kilku nieruchomościach. Zakres odpowiedzialności i późniejsze zwalnianie poszczególnych nieruchomości trzeba precyzyjnie ustalić.",
  },
  {
    id: 201,
    category: "inwestor",
    section: "J. Hipoteka i art. 777 — osobna seria",
    question: "Czy hipoteka może zabezpieczać cudzy dług?",
    thesis:
      "Tak. Właściciel nieruchomości staje się dłużnikiem rzeczowym, choć nie musi odpowiadać całym majątkiem jako dłużnik osobisty.",
  },
  {
    id: 202,
    category: "inwestor",
    section: "J. Hipoteka i art. 777 — osobna seria",
    question: "Co robi administrator hipoteki?",
    thesis:
      "Przy finansowaniu jednego przedsięwzięcia przez kilku wierzycieli działa we własnym imieniu, lecz na ich rachunek. Umowa powołująca administratora wymaga formy pisemnej pod rygorem nieważności.",
  },
  {
    id: 203,
    category: "inwestor",
    section: "J. Hipoteka i art. 777 — osobna seria",
    question: "Co dokładnie zabezpiecza suma hipoteki?",
    thesis:
      "Wierzytelność pieniężną oraz — w jej granicach — odsetki, przyznane koszty postępowania i inne świadczenia uboczne wskazane w dokumencie będącym podstawą wpisu.",
  },
  {
    id: 204,
    category: "inwestor",
    section: "J. Hipoteka i art. 777 — osobna seria",
    question: "Czy można ustanowić hipotekę na dowolnie wysoką sumę?",
    thesis:
      "Suma powinna odpowiadać racjonalnemu zakresowi zabezpieczenia, a właściciel może żądać zmniejszenia hipoteki nadmiernej. Szczególny limit zabezpieczeń z art. 720³ KC dla prywatnej pożyczki poza działalnością nie obejmuje hipoteki ani zastawu rejestrowego, choć nadal działają pozostałe reguły prawa.",
  },
  {
    id: 205,
    category: "inwestor",
    section: "J. Hipoteka i art. 777 — osobna seria",
    question: "Czy zakaz sprzedaży obciążonej nieruchomości jest skuteczny?",
    thesis:
      "Nie można skutecznie zastrzec wobec wierzyciela hipotecznego, że właściciel nie sprzeda ani nie obciąży nieruchomości do wygaśnięcia hipoteki. Sama hipoteka podąża jednak za nieruchomością.",
  },
  {
    id: 206,
    category: "inwestor",
    section: "J. Hipoteka i art. 777 — osobna seria",
    question: "Czy częściowa spłata automatycznie obniża sumę hipoteki w KW?",
    thesis:
      "Nie. Saldo długu maleje, ale treść wpisu zmienia się dopiero po odpowiedniej czynności i wpisie sądu.",
  },
  {
    id: 207,
    category: "inwestor",
    section: "J. Hipoteka i art. 777 — osobna seria",
    question: "Kiedy hipoteka wygasa i jak ją wykreślić?",
    thesis:
      "Co do zasady wraz z wygaśnięciem zabezpieczonej wierzytelności, lecz do usunięcia wpisu potrzebny jest wniosek i właściwy dokument wierzyciela.",
  },
  {
    id: 208,
    category: "inwestor",
    section: "J. Hipoteka i art. 777 — osobna seria",
    question: "W jakiej formie prywatny wierzyciel powinien wydać zgodę na wykreślenie?",
    thesis:
      "Dokument musi spełniać wymagania sądu wieczystoksięgowego; przy prywatnym wierzycielu standardem jest oświadczenie z podpisem notarialnie poświadczonym.",
  },
  {
    id: 209,
    category: "inwestor",
    section: "J. Hipoteka i art. 777 — osobna seria",
    question: "Co jest ważniejsze: hipoteka czy art. 777?",
    thesis:
      "Pełnią różne funkcje. Hipoteka wskazuje majątek i pierwszeństwo zaspokojenia, a art. 777 może skrócić drogę do tytułu wykonawczego.",
  },
  {
    id: 210,
    category: "inwestor",
    section: "J. Hipoteka i art. 777 — osobna seria",
    question: "Czym jest oświadczenie z art. 777 KPC?",
    thesis:
      "To akt notarialny, w którym dłużnik z góry poddaje się egzekucji określonego obowiązku. Po spełnieniu warunków wierzyciel nadal musi uzyskać klauzulę wykonalności.",
  },
  {
    id: 211,
    category: "inwestor",
    section: "J. Hipoteka i art. 777 — osobna seria",
    question: "Czy art. 777 całkowicie omija sąd?",
    thesis:
      "Nie. Zwykle eliminuje pełny proces o zapłatę, lecz sąd rozpoznaje wniosek o klauzulę, a dłużnik zachowuje przewidziane prawem środki obrony.",
  },
  {
    id: 212,
    category: "inwestor",
    section: "J. Hipoteka i art. 777 — osobna seria",
    question: "Czym różni się art. 777 §1 pkt 4 od pkt 5?",
    thesis:
      "Punkt 4 dotyczy obowiązku o oznaczonej kwocie lub rzeczy z terminem albo zdarzeniem wykonania; punkt 5 pozwala objąć zapłatę do wskazanego limitu, ale wymaga także zdarzenia uruchamiającego i końcowego terminu wystąpienia o klauzulę.",
  },
  {
    id: 213,
    category: "inwestor",
    section: "J. Hipoteka i art. 777 — osobna seria",
    question: "Co musi być dobrze opisane w akcie 777?",
    thesis:
      "Stosunek prawny, obowiązek, kwota lub limit, zdarzenie uruchamiające, sposób jego wykazania i wymagany termin. Nieprecyzyjny akt może nie otrzymać klauzuli.",
  },
  {
    id: 214,
    category: "inwestor",
    section: "J. Hipoteka i art. 777 — osobna seria",
    question:
      "Czy przy prywatnej pożyczce osobie fizycznej poza działalnością limit 777 może być dowolny?",
    thesis:
      "Nie. KPC ogranicza go obecnie do ustawowo określonej sumy kapitału, odsetek maksymalnych, ograniczonego okresu odsetek za opóźnienie i maksymalnych kosztów pozaodsetkowych.",
  },
  {
    id: 215,
    category: "inwestor",
    section: "J. Hipoteka i art. 777 — osobna seria",
    question: "Czy właściciel zabezpieczający cudzy dług też powinien złożyć 777?",
    thesis:
      "Może poddać się egzekucji z obciążonego przedmiotu jako dłużnik rzeczowy. Zakres trzeba odróżnić od osobistej odpowiedzialności pożyczkobiorcy i praw małżonka.",
  },
  {
    id: 216,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Jaka jest pełna droga od opóźnienia do egzekucji?",
    thesis:
      "Ustalenie zaległości, wymagane wezwania, skuteczne wypowiedzenie lub wymagalność, tytuł egzekucyjny, klauzula wykonalności, wniosek do komornika i wybrany sposób egzekucji.",
  },
  {
    id: 217,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Co powinno zawierać wezwanie do zapłaty?",
    thesis:
      "Strony, umowę, kwotę i skład salda, termin, rachunek oraz konsekwencje braku płatności. Treść musi zgadzać się z umową i rzeczywistym rozliczeniem.",
  },
  {
    id: 218,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Dlaczego dowód doręczenia jest tak ważny?",
    thesis:
      "Wypowiedzenie lub wezwanie wywołuje skutki dopiero zgodnie z właściwymi zasadami doręczeń. Błąd może oznaczać, że cała kwota nie stała się wymagalna.",
  },
  {
    id: 219,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Kiedy można wypowiedzieć całą umowę?",
    thesis:
      "Gdy zachodzi przesłanka z umowy lub ustawy i wykonano wymaganą procedurę. Samo niezadowolenie inwestora nie wystarcza.",
  },
  {
    id: 220,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Co robi wierzyciel mający prawidłowy art. 777?",
    thesis:
      "Składa do sądu wniosek o nadanie aktowi klauzuli wykonalności wraz z dokumentami potwierdzającymi warunki wskazane w akcie.",
  },
  {
    id: 221,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Czy przy pożyczce osobie fizycznej poza działalnością trzeba wykazać wypłatę?",
    thesis:
      "Tak. Do wniosku o klauzulę dla art. 777 dotyczącego takiej pożyczki trzeba obecnie dołączyć dokument potwierdzający wydanie pieniędzy pożyczkobiorcy lub wskazanej osobie.",
  },
  {
    id: 222,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Co jeśli art. 777 jest wadliwy albo go nie ma?",
    thesis:
      "Wierzyciel zwykle musi uzyskać sądowy tytuł egzekucyjny w procesie o zapłatę. Hipoteka sama w sobie nie zastępuje tytułu wykonawczego.",
  },
  {
    id: 223,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Jak zaczyna się sprawa o zapłatę?",
    thesis:
      "Od pozwu wskazującego żądanie, podstawę faktyczną i prawną oraz dowody: umowę, wypłatę, harmonogram, rozliczenie, wezwania i doręczenia.",
  },
  {
    id: 224,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Co to jest nakaz zapłaty?",
    thesis:
      "Sąd może wydać orzeczenie na posiedzeniu niejawnym na podstawie dokumentów. Pozwany ma prawo zaskarżyć nakaz w ustawowym terminie, a wtedy sprawa może przejść do zwykłego rozpoznania.",
  },
  {
    id: 225,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Co się dzieje po sprzeciwie lub zarzutach dłużnika?",
    thesis:
      "Sąd bada twierdzenia i dowody obu stron, w tym ważność umowy, wypłatę, saldo, wymagalność, koszty oraz prawidłowość wypowiedzenia.",
  },
  {
    id: 226,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Jakie dowody są najważniejsze w procesie o pożyczkę?",
    thesis:
      "Podpisana umowa, przelew kapitału, harmonogram, historia wpłat, czytelne rozliczenie salda, aneksy, korespondencja i dowody doręczeń.",
  },
  {
    id: 227,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Kiedy wyrok pozwala iść do komornika?",
    thesis:
      "Gdy jest wykonalny i zostanie opatrzony klauzulą wykonalności, chyba że ustawa przewiduje inny tryb. Prawomocność i wykonalność to nie zawsze dokładnie ten sam moment.",
  },
  {
    id: 228,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Czym różni się tytuł egzekucyjny od wykonawczego?",
    thesis:
      "Tytuł egzekucyjny stwierdza obowiązek, np. wyrok lub akt 777. Po nadaniu klauzuli staje się tytułem wykonawczym będącym podstawą egzekucji.",
  },
  {
    id: 229,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Czy przed wyrokiem można zabezpieczyć roszczenie?",
    thesis:
      "Tak, jeżeli sąd udzieli zabezpieczenia po uprawdopodobnieniu roszczenia i interesu prawnego. Jedną z form może być hipoteka przymusowa.",
  },
  {
    id: 230,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Kiedy roszczenie z pożyczki się przedawnia?",
    thesis:
      "Ogólny termin wynosi sześć lat, a dla roszczeń związanych z działalnością gospodarczą i świadczeń okresowych zwykle trzy lata; bieg i koniec terminu zależą od wymagalności oraz zdarzeń wpływających na przedawnienie.",
  },
  {
    id: 231,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Czy przedawnienie długu usuwa hipotekę?",
    thesis:
      "Nie zawsze. Przedawnienie zabezpieczonej wierzytelności co do zasady nie odbiera możliwości zaspokojenia z nieruchomości, ale ta zasada nie obejmuje świadczeń ubocznych, np. części odsetek.",
  },
  {
    id: 232,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Jak wybrać komornika?",
    thesis:
      "Wierzyciel musi uwzględnić właściwość ustawową i ograniczenia wyboru; przy egzekucji z nieruchomości kluczowe jest miejsce jej położenia.",
  },
  {
    id: 233,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Jak komornik szuka majątku dłużnika?",
    thesis:
      "Korzysta z prawnie dostępnych systemów i informacji oraz działa na podstawie wniosków wierzyciela. Wierzyciel powinien przekazać wszystkie znane dane o rachunkach, dochodach, wierzytelnościach i nieruchomościach.",
  },
  {
    id: 234,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Jak wygląda egzekucja z rachunku bankowego?",
    thesis:
      "Komornik zajmuje wierzytelność z rachunku do wysokości długu i kosztów, z uwzględnieniem ustawowych wyłączeń i kwot wolnych właściwych dla danego rachunku.",
  },
  {
    id: 235,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Jak wygląda egzekucja z wynagrodzenia?",
    thesis:
      "Pracodawca przekazuje zajętą część wynagrodzenia w granicach ustawowych potrąceń i kwot wolnych. Rodzaj należności wpływa na dopuszczalny zakres zajęcia.",
  },
  {
    id: 236,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Czy komornik może zająć faktury należne przedsiębiorcy?",
    thesis:
      "Tak, może zająć wierzytelności wobec kontrahentów. Dłużnik zajętej wierzytelności otrzymuje zakaz płacenia bezpośrednio przedsiębiorcy w objętym zakresie.",
  },
  {
    id: 237,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Jak wygląda egzekucja z ruchomości?",
    thesis:
      "Komornik może zająć i sprzedać ruchomości należące do dłużnika, z uwzględnieniem przedmiotów wyłączonych spod egzekucji i praw osób trzecich.",
  },
  {
    id: 238,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Jak rozpoczyna się egzekucja z nieruchomości?",
    thesis:
      "Wierzyciel składa wniosek wskazujący nieruchomość, a komornik wzywa dłużnika do zapłaty w terminie dwóch tygodni pod rygorem przejścia do opisu i oszacowania.",
  },
  {
    id: 239,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Co oznacza zajęcie nieruchomości i wpis w KW?",
    thesis:
      "Ogranicza skuteczność późniejszych rozporządzeń wobec egzekucji i informuje innych uczestników obrotu. Sprzedaż po zajęciu nie pozwala po prostu „uciec” z majątkiem.",
  },
  {
    id: 240,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Na czym polega opis i oszacowanie?",
    thesis:
      "Komornik opisuje stan prawny i faktyczny, a wartość zwykle określa biegły rzeczoznawca. To oszacowanie staje się podstawą cen wywołania.",
  },
  {
    id: 241,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Czy można zakwestionować wycenę komorniczą?",
    thesis:
      "Tak, strony mają przewidziane środki zaskarżenia opisu i oszacowania. Trzeba działać w terminie i wskazać konkretne błędy, a nie tylko własne oczekiwanie cenowe.",
  },
  {
    id: 242,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Jaka jest cena wywołania na pierwszej licytacji?",
    thesis:
      "Trzy czwarte sumy oszacowania. Nie oznacza to jednak, że właśnie za tę kwotę nieruchomość zostanie sprzedana.",
  },
  {
    id: 243,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Jaka jest cena wywołania na drugiej licytacji?",
    thesis: "Dwie trzecie sumy oszacowania. Jest to najniższa cena nabycia w tym trybie.",
  },
  {
    id: 244,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Co jeśli na licytacji nie ma kupca?",
    thesis:
      "KPC przewiduje możliwość przejęcia nieruchomości przez uprawnionych na określonych warunkach albo umorzenie danego etapu egzekucji, zależnie od przebiegu i złożonych wniosków.",
  },
  {
    id: 245,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Kiedy licytant staje się właścicielem?",
    thesis:
      "Nie w chwili najwyższego postąpienia. Potrzebne są kolejne rozstrzygnięcia sądu, zapłata ceny i prawomocne przysądzenie własności.",
  },
  {
    id: 246,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Jak dzielone są pieniądze ze sprzedaży?",
    thesis:
      "Według ustawowego planu podziału. Najpierw występują m.in. koszty egzekucyjne i uprzywilejowane kategorie, a wierzytelności hipoteczne są zaspokajane zgodnie z kategorią i pierwszeństwem.",
  },
  {
    id: 247,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Czy pierwszy wierzyciel hipoteczny zawsze dostaje całą cenę?",
    thesis:
      "Nie. Przed nim mogą wystąpić ustawowo uprzywilejowane należności i koszty, a jego wypłata jest ograniczona wysokością wierzytelności oraz zakresem zabezpieczenia.",
  },
  {
    id: 248,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Ile kosztuje komornik?",
    thesis:
      "Podstawowa opłata przy skutecznej egzekucji pieniężnej wynosi co do zasady 10% wyegzekwowanego świadczenia, a szybka wpłata do komornika w ustawowym terminie może oznaczać 3%; dochodzą też niezbędne wydatki i zaliczki.",
  },
  {
    id: 249,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Jak dłużnik może bronić się w egzekucji?",
    thesis:
      "Może korzystać m.in. ze skargi na czynności komornika, zażalenia i powództwa przeciwegzekucyjnego, zależnie od rodzaju zarzutu. Art. 777 nie odbiera prawa do obrony.",
  },
  {
    id: 250,
    category: "inwestor",
    section: "K. Pozew, klauzula i postępowanie komornicze — krok po kroku",
    question: "Ile trwa egzekucja z nieruchomości i czy można zawrzeć ugodę?",
    thesis:
      "Nie ma gwarantowanego terminu: wpływ mają sąd, wycena, zaskarżenia, licytacje, inni wierzyciele i upadłość lub restrukturyzacja. Ugoda lub dobrowolna sprzedaż jest możliwa także po wszczęciu egzekucji, ale trzeba prawidłowo rozliczyć koszty i zakończyć postępowanie.",
  },
];

export function findShortsQuestion(id: number): ShortsQuestion | undefined {
  return SHORTS_QUESTIONS.find((q) => q.id === id);
}

// Prefiks promptu, po którym rozpoznajemy w bibliotece wideo, że job powstał
// z konkretnego pytania z bazy (bez zmiany schematu bazy danych).
export function shortsPromptTag(id: number): string {
  return `#${id} · `;
}

export function shortsPromptForQuestion(q: ShortsQuestion): string {
  return `${shortsPromptTag(q.id)}${q.question}`;
}

export function parseShortsPromptTag(prompt: string): number | null {
  const m = /^#(\d{1,3}) · /.exec(prompt);
  return m ? Number(m[1]) : null;
}
