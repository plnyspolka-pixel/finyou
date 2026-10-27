import type { Icon3DName } from "@/components/marketing/icon-3d";

/** Historie z portfela; `icon` — ikona 3D karty wg nieruchomości/sytuacji. */
export const PORTFOLIO_STORIES: readonly {
  title: string;
  icon: Icon3DName;
  amount: string;
  outcome: string;
  text: string;
}[] = [
  {
    title: "Spłacona po 49 dniach",
    icon: "propApartment",
    amount: "55 000 zł",
    outcome: "49 dni",
    text: "Firma z zachodniej Polski, 55 000 zł na 12 miesięcy pod hipotekę do 150 000 zł na mieszkaniu. Klientka rozliczyła całość po 49 dniach od umowy.",
  },
  {
    title: "Klientka przestała płacić. Hipoteka zadziałała.",
    icon: "shieldcheck",
    amount: "50 000 zł",
    outcome: "19 miesięcy",
    text: "50 000 zł dla firmy, zabezpieczone mieszkaniem poręczycielki (hipoteka do 150 000 zł). Po kilku miesiącach raty przestały przychodzić. Wezwania, negocjacje, a potem promesa wykreślenia hipoteki dla kupującego — i spłata całej wierzytelności przy sprzedaży mieszkania, 19 miesięcy od umowy.",
  },
  {
    title: "Mieszkanie bez księgi wieczystej",
    icon: "dossier",
    amount: "ok. 35 000 zł",
    outcome: "9 miesięcy",
    text: "Lokal nie miał założonej KW — dla banku sprawa zamknięta. Założyliśmy księgę, wpisaliśmy hipotekę do 150 000 zł i sfinansowaliśmy ok. 35 000 zł na trzy lata, z kosztami notariusza w wypłacie. Klientka rozliczyła całość po dziewięciu miesiącach.",
  },
  {
    title: "80 000 zł, spłacone po 100 dniach",
    icon: "growth",
    amount: "80 000 zł",
    outcome: "100 dni",
    text: "Przedsiębiorczyni ze Śląska, 80 000 zł na bieżącą działalność, hipoteka do 190 000 zł. Trzy raty w terminie, potem jednorazowe rozliczenie przed terminem, po wydaniu promesy wykreślenia hipoteki.",
  },
  {
    title: "Pół roku planu, 118 dni spłaty",
    icon: "status",
    amount: "ok. 30 000 zł",
    outcome: "118 dni",
    text: "Przedsiębiorca ze Śląska, ok. 30 000 zł, hipoteka do 90 000 zł. Harmonogram na sześć miesięcy; rozliczenie jednorazową wpłatą po 118 dniach.",
  },
  {
    title: "Restrukturyzacja zamiast egzekucji",
    icon: "handshake",
    amount: "40 000 zł",
    outcome: "ugoda",
    text: "Firma usługowa, pożyczka 40 000 zł. Gdy pojawiły się zaległości, zamiast egzekucji przygotowaliśmy ugodę: nowy harmonogram i dodatkowe 10 000 zł, żeby firma mogła dalej działać. Zabezpieczenia zostały utrzymane, a klientka rozliczyła całość jednorazową wpłatą.",
  },
  {
    title: "Ugoda: 30 000 zł na start i niskie raty",
    icon: "procedures",
    amount: "40 000 zł",
    outcome: "ugoda",
    text: "Pożyczka 40 000 zł zabezpieczona hipoteką łączną na trzech nieruchomościach (do 150 000 zł). Po problemach ze spłatą zaproponowaliśmy dwa warianty ugody. Klientka wybrała 30 000 zł wpłaty na start i raty po 1 000 zł — sprawa rozliczona polubownie.",
  },
  {
    title: "Regularne raty, potem duża wpłata",
    icon: "loan",
    amount: "40 000 zł",
    outcome: "9 miesięcy",
    text: "Przedsiębiorca z Lubelszczyzny, 40 000 zł na działalność, hipoteka do 90 000 zł. Raty przychodziły co miesiąc, a po dziewięciu miesiącach klient rozliczył zadłużenie jedną większą wpłatą.",
  },
  {
    title: "Nadpłaty z własnej woli",
    icon: "updates",
    amount: "80 000 zł",
    outcome: "2 transze",
    text: "Przedsiębiorczyni z Małopolski, 80 000 zł w dwóch transzach, hipoteka do 190 000 zł. Raty w terminie, a już w drugim miesiącu klientka sama zaczęła nadpłacać.",
  },
  {
    title: "Rok dla firmy produkcyjnej",
    icon: "propStore",
    amount: "50 000 zł",
    outcome: "12 miesięcy",
    text: "Firma stolarska, 50 000 zł na rok, miesięczne raty i większa rata końcowa. Finansowanie uruchomione dzień po podpisaniu umowy.",
  },
  {
    title: "Przedłużenie na prośbę klienta",
    icon: "documents",
    amount: "40 000 zł",
    outcome: "aneks",
    text: "Przedsiębiorca budowlany, 40 000 zł, z kosztami notariusza opłaconymi z wypłaty. Po roku klient poprosił o więcej czasu — dostał aneks z nowym harmonogramem i dalej regularnie spłacał.",
  },
  {
    title: "Pięć lat finansowania warsztatu",
    icon: "propStore",
    amount: "221 000 zł",
    outcome: "5 lat",
    text: "Przedsiębiorca prowadzący warsztat dostał finansowanie na pięć lat i przez cały ten czas pracował w swojej nieruchomości, spłacając raty. Gdy pod koniec pojawiły się zaległości, przyjęliśmy rozwiązanie przez sprzedaż nieruchomości w rodzinie, tak żeby mógł dalej prowadzić warsztat w tym samym miejscu.",
  },
  {
    title: "Finansowanie, które spłaciło poprzedniego wierzyciela",
    icon: "propHouse",
    amount: "260 000 zł",
    outcome: "spłata długu",
    text: "Dwaj współwłaściciele domu mieli wcześniejszą prywatną pożyczkę. Przyjęliśmy rozwiązanie z wykupem nieruchomości — z tych środków od razu spłaciliśmy ich poprzedniego wierzyciela, 67 000 zł przelewem w dniu podpisania. Właściciele zostali w domu jako najemcy, na umowie najmu okazjonalnego.",
  },
  {
    title: "Dwie działki: jedna sprzedana za dwukrotność wyceny, druga pod deweloperkę",
    icon: "propPlot",
    amount: "100 000 zł",
    outcome: "182 dni",
    text: "Przedsiębiorczyni dostała 100 000 zł pożyczki pod dwie działki rolne. Gdy pojawiły się kłopoty ze spłatą, zorganizowaliśmy wykup działek. Mniejszą — wycenioną w transakcji na 40 000 zł — sprzedaliśmy za 80 000 zł niecałe pół roku później. Druga jest dziś przeznaczona pod inwestycję deweloperską.",
  },
];
