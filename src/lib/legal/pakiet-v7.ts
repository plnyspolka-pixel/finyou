/**
 * PAKIET INWESTORA v7 (FY-LEGAL-2026-09-29) — deterministyczne transformacje
 * treści dokumentów prawnych (Etap 5 sprzątania spójności 2026-09).
 *
 * Źródłem jest treść poprzednich wersji zapisana w migracjach
 * (umowa ramowa v6, NDA v5, RODO v4). Każda podmiana jest jawna i
 * asertywna: jeżeli fragment źródłowy nie występuje dokładnie raz, funkcja
 * rzuca błąd — dzięki temu wynik jest powtarzalny i weryfikowalny testem.
 *
 * Decyzje nadrzędne:
 *  • Finance You nie pobiera od Inwestora wynagrodzenia z Umowy. Dostęp do
 *    systemu wymaga aktywnego ABONAMENTU, który sprzedaje Fundacja
 *    Krzewienia Edukacji Finansowej im. Pieczaka na podstawie Regulaminu
 *    Abonamentu Inwestora (akceptowanego przy płatności): 1 500,00 zł brutto
 *    za 30 dni albo 7 000,00 zł brutto za 365 dni, z góry, bez automatycznego
 *    odnowienia. Umowę (z NDA i RODO) Inwestor akceptuje, gdy chce dostępu
 *    do Klientów i Projektów (decyzje właściciela 2026-09-30 — v7 nie był
 *    jeszcze przez nikogo zaakceptowany). Bez Pakietów, Cennika, Opłaty
 *    Sukcesu, Opłaty za Udostępnienie Okazji i Zał. 8,
 *  • Prowizja od Pożyczkobiorcy (dawniej „Prowizja Klientowska” — nazwa
 *    zmieniona decyzją właściciela 2026-09-30, przed pierwszą akceptacją):
 *    7 % Kwoty Udzielonej, min 5 000 zł, bez VAT, potrącana z wypłaty
 *    (Zał. 6 — dwie części przelewu),
 *  • § 5: maks. 5 przyjętych Zleceń, wygaśnięcie po 5 odrzuceniach,
 *    24 h + 12 h, maks. 2 przedłużone naraz,
 *  • Kara Obejściowa 5 % Sumy Hipotecznej i 5-letni Okres Ochronny bez zmian,
 *  • kontakt: kontakt@financeyou.pl (telefon zostaje jako drugi kanał).
 */

export const PACKAGE_ID_V7 = "FY-LEGAL-2026-09-29";
/** Kwoty Opłaty Abonamentowej w treści umowy — muszą zgadzać się z lib/investor-plan/plans.ts. */
export const ABONAMENT_UMOWA = "1 500,00 zł brutto za 30 dni albo 7 000,00 zł brutto za 365 dni";
/** Sprzedawca Abonamentu (i wystawca faktur za niego) — decyzja właściciela 2026-09-30. */
export const SPRZEDAWCA_ABONAMENTU =
  "Fundacja Krzewienia Edukacji Finansowej im. Pieczaka z siedzibą w Lublinie (KRS 0001140846, NIP 9462747637)";
export const PACKAGE_DATE_PL = "29 września 2026 r.";
export const OLD_EMAIL = "plnyspolka@gmail.com";
export const NEW_EMAIL = "kontakt@financeyou.pl";

export const V7_VERSIONS = {
  umowa_ramowa: "v7",
  nda: "v6",
  rodo: "v5",
} as const;

export const V7_FILENAMES = {
  umowa_ramowa: "02_Ramowa_umowa_posrednictwa_na_odleglosc_Finance_You_v7.docx",
  nda: "01_NDA_i_zakaz_obchodzenia_Finance_You_v6.docx",
  rodo: "03_Umowa_udostepniania_i_powierzenia_danych_RODO_Finance_You_v5.docx",
} as const;

export class Transform {
  constructor(private text: string) {}

  /** Podmiana dokładnie jednego wystąpienia. */
  replaceOnce(from: string, to: string): this {
    const first = this.text.indexOf(from);
    if (first < 0) throw new Error(`Brak fragmentu: ${from.slice(0, 80)}…`);
    if (this.text.indexOf(from, first + from.length) >= 0) {
      throw new Error(`Fragment występuje więcej niż raz: ${from.slice(0, 80)}…`);
    }
    this.text = this.text.slice(0, first) + to + this.text.slice(first + from.length);
    return this;
  }

  /** Podmiana wszystkich wystąpień (co najmniej jednego). */
  replaceAll(from: string, to: string): this {
    if (!this.text.includes(from)) throw new Error(`Brak fragmentu: ${from.slice(0, 80)}…`);
    this.text = this.text.split(from).join(to);
    return this;
  }

  /** Usunięcie całej linii, która zaczyna się od prefiksu (dokładnie jedna). */
  dropLineStartingWith(prefix: string): this {
    const lines = this.text.split("\n");
    const idx = lines.findIndex((l) => l.startsWith(prefix));
    if (idx < 0) throw new Error(`Brak linii: ${prefix.slice(0, 80)}…`);
    if (lines.findIndex((l, i) => i !== idx && l.startsWith(prefix)) >= 0) {
      throw new Error(`Linia występuje więcej niż raz: ${prefix.slice(0, 80)}…`);
    }
    lines.splice(idx, 1);
    this.text = lines.join("\n");
    return this;
  }

  /** Podmiana całej linii zaczynającej się od prefiksu (dokładnie jedna). */
  replaceLineStartingWith(prefix: string, newLine: string): this {
    const lines = this.text.split("\n");
    const idx = lines.findIndex((l) => l.startsWith(prefix));
    if (idx < 0) throw new Error(`Brak linii: ${prefix.slice(0, 80)}…`);
    if (lines.findIndex((l, i) => i !== idx && l.startsWith(prefix)) >= 0) {
      throw new Error(`Linia występuje więcej niż raz: ${prefix.slice(0, 80)}…`);
    }
    lines[idx] = newLine;
    this.text = lines.join("\n");
    return this;
  }

  /** Usunięcie wszystkiego od linii zaczynającej się od prefiksu do końca. */
  truncateFromLineStartingWith(prefix: string): this {
    const lines = this.text.split("\n");
    const idx = lines.findIndex((l) => l.startsWith(prefix));
    if (idx < 0) throw new Error(`Brak linii: ${prefix.slice(0, 80)}…`);
    this.text = lines.slice(0, idx).join("\n").replace(/\n+$/, "") + "\n";
    return this;
  }

  value(): string {
    return this.text;
  }
}

/**
 * W źródłowych treściach rola i opis pola podpisu były sklejone
 * („FINANCE YOUimię, nazwisko…”) — w nowych wersjach rozdzielamy je
 * myślnikiem. Liczba linii się nie zmienia.
 */
export function rozdzielPodpisy(text: string): string {
  return text.replace(/([A-ZĄĆĘŁŃÓŚŹŻ])imię, nazwisko/g, "$1 — imię, nazwisko");
}

/**
 * Nazwa prowizji płaconej przez Klienta (pożyczkobiorcę): „Prowizja od
 * Pożyczkobiorcy” zamiast „Prowizja Klientowska” — we wszystkich formach
 * (decyzja właściciela 2026-09-30). Źródła v6/v5 zawierają starą nazwę,
 * więc zmiana idzie ostatnim krokiem transformacji.
 */
export function prowizjaOdPozyczkobiorcy(text: string): string {
  return text
    .replace(/\b(Prowizj[aięą]) Klientowsk(?:a|iej|ą)/g, "$1 od Pożyczkobiorcy")
    .replace(/\b(prowizj[aięą]) klientowsk(?:a|iej|ą)/g, "$1 od pożyczkobiorcy")
    .replace(/\b(PROWIZJ[AIĘĄ]) KLIENTOWSK(?:A|IEJ|Ą)/g, "$1 OD POŻYCZKOBIORCY");
}

/** Umowa ramowa v6 → v7. */
export function transformUmowaV7(v6: string): string {
  const t = new Transform(v6);
  // nagłówek wersji
  t.replaceOnce(
    "FY-LEGAL-2026-09-04.v6 • 21 września 2026 r.",
    `${PACKAGE_ID_V7}.v7 • ${PACKAGE_DATE_PL}`,
  );

  // Preambuła — model rozliczenia
  t.replaceLineStartingWith(
    "Usługa pośrednictwa transakcyjnego na podstawie niniejszej Umowy jest odpłatna według Pakietu",
    "Finance You nie pobiera od Inwestora wynagrodzenia za przedstawienie Projektu ani za wsparcie transakcyjne. Korzystanie z systemu Finance You wymaga aktywnego Abonamentu, nabywanego na podstawie Regulaminu Abonamentu Inwestora (§ 7). Prowizja Klientowska jest należna Finance You od Klienta na podstawie odrębnej umowy i jest potrącana z kwoty Finansowania zgodnie z dyspozycją Klienta (Załącznik nr 6): Inwestor przekazuje ją bezpośrednio na rachunek Finance You, a pozostałą część wypłaca Klientowi. Abonament nie zwalnia z Mechanizmu Zabezpieczenia Prowizji.",
  );
  t.replaceLineStartingWith(
    "Model rozliczenia.  Inwestor płaci Finance You wyłącznie Opłaty",
    `Model rozliczenia.  Finance You nie pobiera od Inwestora wynagrodzenia z Umowy; dostęp do systemu wymaga aktywnego Abonamentu (Regulamin Abonamentu Inwestora, obecnie ${ABONAMENT_UMOWA}). Klient płaci Prowizję Klientowską według odrębnej umowy (7% Kwoty Udzielonej, nie mniej niż 5 000,00 zł, bez VAT), a Inwestor zabezpiecza jej bezpośredni przelew z kwoty Finansowania i potrąca ją z wypłaty. Zawarcie lub wykonanie Transakcji Chronionej bez tego mechanizmu stanowi Naruszenie Obejściowe i uruchamia Karę Obejściową równą 5% Sumy Hipotecznej.`,
  );

  // § 1 Definicje
  t.replaceOnce(
    "regułę Sumy Hipotecznej, wskazanie Pakietu Inwestora oraz Opłat należnych od niego za ten Projekt, rzeczywiste warunki Prowizji Klientowskiej",
    "regułę Sumy Hipotecznej, potwierdzenie, że za Projekt nie są należne od Inwestora żadne opłaty, rzeczywiste warunki Prowizji Klientowskiej",
  );
  t.dropLineStartingWith("Kwota Wypłacona Klientowi oznacza");
  t.replaceOnce(
    "Standardowo wynosi 7% Kwoty Wypłaconej Klientowi, nie mniej niż 5 000,00 zł, chyba że odrębna umowa z Klientem przewiduje inną stawkę, minimum albo podstawę; w takim przypadku Karta Leada musi odzwierciedlać rzeczywiste warunki tej umowy.",
    "Wynosi 7% Kwoty Udzielonej, nie mniej niż 5 000,00 zł, bez VAT, i jest potrącana z wypłaty Finansowania zgodnie z dyspozycją Klienta (Załącznik nr 6): Inwestor przekazuje ją bezpośrednio na rachunek Finance You, a pozostałą część Kwoty Udzielonej wypłaca Klientowi; jeżeli odrębna umowa z Klientem przewiduje inną stawkę, minimum albo podstawę, Karta Leada musi odzwierciedlać rzeczywiste warunki tej umowy.",
  );
  t.dropLineStartingWith("Pakiet oznacza wariant odpłatności");
  t.dropLineStartingWith("Cennik oznacza aktualny cennik");
  t.dropLineStartingWith("Pakiet Podstawowy oznacza");
  t.dropLineStartingWith("Pakiet PRO oznacza");
  t.dropLineStartingWith("Opłata za Udostępnienie Okazji oznacza");
  t.replaceLineStartingWith(
    "Opłata Abonamentowa oznacza",
    `Abonament oznacza odpłatny dostęp Inwestora do systemu Finance You (panelu Inwestora) przez Okres Abonamentowy, sprzedawany przez ${SPRZEDAWCA_ABONAMENTU} na podstawie Regulaminu Abonamentu Inwestora, akceptowanego przy zakupie.\nOpłata Abonamentowa oznacza cenę Abonamentu określoną w Regulaminie Abonamentu Inwestora (obecnie ${ABONAMENT_UMOWA}, według wyboru Inwestora); nie jest wynagrodzeniem Finance You z tytułu Umowy.\nOkres Abonamentowy oznacza opłacony okres Abonamentu (30 albo 365 dni), liczony od zaksięgowania Opłaty Abonamentowej, a jeżeli poprzedni opłacony okres jeszcze trwa — od jego końca.`,
  );
  t.dropLineStartingWith("Opłata Sukcesu oznacza");

  // § 2
  t.replaceLineStartingWith(
    "Usługa przedstawienia i wsparcia transakcyjnego na podstawie niniejszej Umowy jest odpłatna według Pakietu",
    "Finance You nie pobiera od Inwestora wynagrodzenia za przedstawienie i wsparcie transakcyjne na podstawie niniejszej Umowy — ani opłaty za udostępnienie Projektu, ani wynagrodzenia od rezultatu. Warunkiem korzystania z systemu jest aktywny Abonament (§ 7); jego zasady, w tym zmianę ceny wyłącznie na przyszłość, określa Regulamin Abonamentu Inwestora.",
  );

  // § 4
  t.replaceOnce(
    "zastosowanie mają domyślne warunki: Opłaty według Pakietu, w którym Inwestor działa, i Cennika obowiązującego w dniu Ujawnienia, standardowy Mechanizm Zabezpieczenia Prowizji",
    "zastosowanie mają domyślne warunki: standardowy Mechanizm Zabezpieczenia Prowizji",
  );
  t.replaceOnce(
    "Karta Leada nie może ustanawiać Opłat wyższych niż wynikające z Cennika zaakceptowanego przez Inwestora przed zakupem ani wprowadzać Opłat w Cenniku nieprzewidzianych.",
    "Karta Leada nie może ustanawiać żadnych opłat ani wynagrodzenia należnych Finance You od Inwestora.",
  );

  // § 5 — limity
  t.replaceOnce(
    "Inwestor może mieć jednocześnie nie więcej niż trzy przyjęte Zlecenia.",
    "Inwestor może mieć jednocześnie nie więcej niż pięć przyjętych Zleceń.",
  );
  t.replaceOnce(
    "albo po odrzuceniu przez Inwestora trzech kolejnych Projektów.",
    "albo po odrzuceniu przez Inwestora pięciu kolejnych Projektów.",
  );
  t.replaceOnce(
    "Inwestor może mieć jednocześnie więcej niż jedną rezerwację w ramach jednego lub kilku Zleceń.",
    "Inwestor może mieć jednocześnie nie więcej niż pięć aktywnych rezerwacji w ramach jednego lub kilku Zleceń, w tym nie więcej niż dwie rezerwacje przedłużone.",
  );
  t.replaceLineStartingWith(
    "Składanie Zleceń jest możliwe w obu Pakietach",
    "Składanie Zleceń, udostępnienie teasera, Karta Leada, Ujawnienie Identyfikujące i rezerwacja są dostępne w aktywnym Okresie Abonamentowym i nie wymagają żadnych opłat na rzecz Finance You. Inwestor nie ma dostępu do Projektów nieprzypisanych do jego Zleceń ani do ich zestawienia. Abonament jest niezależny od Prowizji Klientowskiej i Kary Obejściowej i nie zwalnia z Mechanizmu Zabezpieczenia Prowizji.",
  );

  // § 7
  t.replaceOnce(
    "§ 7. Opłaty Inwestora i zabezpieczenie Prowizji Klientowskiej",
    "§ 7. Abonament i zabezpieczenie Prowizji Klientowskiej",
  );
  t.replaceLineStartingWith(
    "Finance You pobiera od Inwestora wyłącznie Opłaty wynikające z wybranego Pakietu i Cennika",
    `Finance You nie pobiera od Inwestora wynagrodzenia z tytułu Umowy. Korzystanie z systemu Finance You, w tym składanie Zleceń, wymaga aktywnego Abonamentu, który Inwestor nabywa od Fundacji Krzewienia Edukacji Finansowej im. Pieczaka na podstawie Regulaminu Abonamentu Inwestora (obecnie ${ABONAMENT_UMOWA}, płatne z góry za wybrany okres, bez automatycznego odnowienia); faktury za Abonament wystawia Fundacja. Przyjęcie Zlecenia, udostępnienie teasera, Karta Leada, Ujawnienie Identyfikujące, rezerwacja, wsparcie transakcyjne oraz zawarcie Transakcji Chronionej nie wymagają żadnych opłat na rzecz Finance You. Po upływie Okresu Abonamentowego Finance You wstrzymuje przyjmowanie nowych Zleceń i dostęp do funkcji systemu do czasu opłacenia kolejnego okresu; dane i dokumenty Inwestora nie są usuwane, a poufność, Mechanizm Zabezpieczenia Prowizji i Okres Ochronny pozostają w mocy.`,
  );
  t.replaceOnce(
    "Standardem operacyjnym jest 7% Kwoty Wypłaconej Klientowi, nie mniej niż 5 000,00 zł, chyba że umowa Klienta przewiduje",
    "Prowizja Klientowska wynosi 7% Kwoty Udzielonej, nie mniej niż 5 000,00 zł, bez VAT, i jest potrącana z wypłaty, chyba że umowa Klienta przewiduje",
  );

  // § 15 — Konsument
  t.replaceOnce(
    "wzór odstąpienia oraz Cennik Pakietów (Załącznik nr 8) z łączną ceną wszystkich Opłat.",
    "wzór odstąpienia oraz informację, że Finance You nie pobiera od Inwestora wynagrodzenia, a Abonament jest nabywany na podstawie Regulaminu Abonamentu Inwestora.",
  );
  t.replaceOnce(
    "indywidualną Kartę Leada wskazującą Pakiet, Opłaty należne za ten Projekt wraz z przykładem kwotowym, warunki Prowizji Klientowskiej",
    "indywidualną Kartę Leada wskazującą, że za Projekt nie są należne od Inwestora żadne opłaty, warunki Prowizji Klientowskiej",
  );
  t.replaceOnce(
    " Jeżeli Ujawnienie Identyfikujące jeszcze nie nastąpiło, Opłata za Udostępnienie Okazji podlega zwrotowi w całości. Opłata Abonamentowa podlega zwrotowi proporcjonalnie do niewykorzystanego okresu. Opłata Sukcesu nie jest należna, jeżeli Transakcja Chroniona nie została zawarta.",
    " Odstąpienie od Umowy nie obejmuje Abonamentu — odstąpienie od umowy o Abonament i zwrot Opłaty Abonamentowej określa Regulamin Abonamentu Inwestora. Za przedstawienie Projektu nie nalicza się żadnej kwoty.",
  );

  // § 16
  t.replaceOnce(
    "naruszenia Umowy, braku wymaganej Opłaty wynikającej z Pakietu, braku dokumentów AML",
    "naruszenia Umowy, braku dokumentów AML",
  );

  // § 17 / kontakt
  t.replaceOnce(
    "Inwestor płaci wyłącznie Opłaty wynikające z wybranego Pakietu, a Kara Obejściowa nie powstaje.",
    "Kara Obejściowa nie powstaje, a Inwestor nie płaci Finance You od tej Transakcji żadnego wynagrodzenia.",
  );
  // § 9–§ 12: ochrona i kary — bez odwołań do Opłaty Sukcesu i Pakietów.
  t.replaceOnce(
    "nie powstaje ani Kara Obejściowa, ani Opłata Sukcesu; jeżeli zawrze ją prawidłowo z Mechanizmem Zabezpieczenia Prowizji, należne są wyłącznie Opłaty z wybranego Pakietu.",
    "nie powstaje Kara Obejściowa; jeżeli zawrze ją prawidłowo z Mechanizmem Zabezpieczenia Prowizji, Inwestor nie płaci Finance You od tej Transakcji żadnego wynagrodzenia.",
  );
  t.replaceOnce(
    "oraz jednoznaczne rozróżnienie Kary Obejściowej od Opłat należnych z Pakietu. Wobec Konsumenta Opłata Sukcesu wymaga uprzedniego, wyraźnego uzgodnienia z podaniem kwoty albo formuły i przykładu kwotowego; bez takiego uzgodnienia nie jest należna. W pozostałym zakresie",
    "oraz jednoznaczne wskazanie, że poza Karą Obejściową Inwestor nie płaci Finance You żadnego wynagrodzenia. W pozostałym zakresie",
  );
  t.replaceAll(OLD_EMAIL, NEW_EMAIL);

  // § 18
  t.replaceOnce(
    "Cennik i regulamin mogą zmieniać się na przyszłość po uprzednim powiadomieniu;",
    "Regulamin może zmieniać się na przyszłość po uprzednim powiadomieniu;",
  );

  // Zał. 1 — Karta Leada
  t.replaceLineStartingWith(
    "zgodnie z Pakietem Inwestora i Cennikiem (Załącznik nr 8)",
    "za ten Projekt Finance You nie pobiera od Inwestora żadnych opłat (§ 7 Umowy)",
  );
  t.replaceLineStartingWith(
    "Rzeczywiste warunki z odrębnej umowy Klienta: ______ % Kwoty Wypłaconej Klientowi",
    "Rzeczywiste warunki z odrębnej umowy Klienta: ______ % Kwoty Udzielonej; minimum: __________ zł; bez VAT; kwota / formuła: __________________; potrącana z wypłaty: ☐ tak; moment należności: __________________Standard, jeżeli umowa Klienta nie stanowi inaczej: 7% Kwoty Udzielonej, minimum 5 000,00 zł, bez VAT.",
  );
  t.replaceOnce(
    "dopóki nie potwierdzono Pakietu i Opłat należnych od Inwestora za ten Projekt (a w Pakiecie Podstawowym — zapłaty Opłaty za Udostępnienie Okazji), rzeczywistych warunków",
    "dopóki nie potwierdzono rzeczywistych warunków",
  );
  t.replaceLineStartingWith(
    "Opłata proporcjonalna za rozpoczętą usługę pośrednictwa:",
    "Opłata proporcjonalna za rozpoczętą usługę pośrednictwa: nie dotyczy — Finance You nie pobiera od Inwestora wynagrodzenia (§ 7 Umowy).",
  );
  t.replaceOnce(
    "Potwierdzam, że znam Pakiet, w którym działam, oraz wysokość i sposób obliczenia należnych ode mnie Opłat wskazanych w Cenniku. Akceptuję",
    "Potwierdzam, że za ten Projekt nie płacę Finance You żadnej opłaty. Akceptuję",
  );

  // Zał. 3 — informacja przedumowna
  t.replaceLineStartingWith(
    "Usługa przedstawienia i wsparcia Transakcji Chronionej jest odpłatna zgodnie z wybranym Pakietem",
    `Finance You nie pobiera od Inwestora wynagrodzenia — ani opłaty za udostępnienie Projektu, ani wynagrodzenia od rezultatu. Dostęp do systemu wymaga aktywnego Abonamentu, sprzedawanego przez ${SPRZEDAWCA_ABONAMENTU} na podstawie Regulaminu Abonamentu Inwestora (obecnie ${ABONAMENT_UMOWA}, płatny z góry, bez konieczności podawania danych karty płatniczej i bez automatycznego odnowienia).`,
  );
  t.replaceOnce(
    "Standardowo: 7% Kwoty Wypłaconej Klientowi, minimum 5 000,00 zł.",
    "Standardowo: 7% Kwoty Udzielonej, nie mniej niż 5 000,00 zł, bez VAT — potrącana z wypłaty.",
  );
  t.replaceOnce(
    "Potwierdzam otrzymanie informacji przedumownej, Umowy, Cennika Pakietów (Załącznik nr 8), Karty Leada",
    "Potwierdzam otrzymanie informacji przedumownej, Umowy, Karty Leada",
  );

  // Zał. 5 — protokół
  t.replaceOnce("Usługa Inwestora: 0,00 zł", "Opłata Inwestora za Projekt: brak");

  // Zał. 6 — dyspozycja
  t.replaceOnce("Całkowita kwota Finansowania\n", "Kwota Udzielona (kwota Finansowania z umowy)\n");
  t.replaceOnce(
    "Kwota Wypłacona Klientowi\n",
    "Kwota wypłacana Klientowi (Kwota Udzielona pomniejszona o Prowizję Klientowską)\n",
  );

  // Zał. 7 — oświadczenia
  t.replaceOnce(
    "Znam Pakiet, w którym działam, i wysokość należnych ode mnie Opłat zgodnie z Cennikiem; Prowizja Klientowska obciąża Klienta i podlega Mechanizmowi Zabezpieczenia Prowizji.",
    `Wiem, że nie płacę Finance You za Projekty ani od rezultatu, a dostęp do systemu wymaga aktywnego Abonamentu (Regulamin Abonamentu Inwestora); Prowizja Klientowska (7% Kwoty Udzielonej, nie mniej niż 5 000,00 zł, bez VAT) obciąża Klienta, jest potrącana z wypłaty i podlega Mechanizmowi Zabezpieczenia Prowizji.`,
  );

  // Zał. 8 — usunięty w całości
  t.truncateFromLineStartingWith("Załącznik nr 8 — Cennik Pakietów Inwestora");

  return rozdzielPodpisy(prowizjaOdPozyczkobiorcy(t.value()));
}

/** NDA v5 → v6: e-mail, wspólny package_id / nagłówek wersji i nazwa Prowizji od Pożyczkobiorcy. */
export function transformNdaV6(v5: string): string {
  const t = new Transform(v5);
  t.replaceOnce(
    "FY-LEGAL-2026-09-04.v5 • 4 września 2026 r.",
    `${PACKAGE_ID_V7}.v6 • ${PACKAGE_DATE_PL}`,
  );
  t.replaceOnce("FY-LEGAL-2026-09-04.v5 / ", `${PACKAGE_ID_V7}.v6 / `);
  if (v5.includes(OLD_EMAIL)) t.replaceAll(OLD_EMAIL, NEW_EMAIL);
  return rozdzielPodpisy(prowizjaOdPozyczkobiorcy(t.value()));
}

/** RODO v4 → v5: tylko e-mail i wspólny package_id / nagłówek wersji. */
export function transformRodoV5(v4: string): string {
  const t = new Transform(v4);
  t.replaceOnce(
    "FY-LEGAL-2026-09-04.v4 • 4 września 2026 r.",
    `${PACKAGE_ID_V7}.v5 • ${PACKAGE_DATE_PL}`,
  );
  t.replaceAll(OLD_EMAIL, NEW_EMAIL);
  return rozdzielPodpisy(t.value());
}

/** Frazy, których w v7 NIE może być (test regresji). */
export const FORBIDDEN_IN_V7 = [
  "Pakiet PRO",
  "Pakietu",
  "Pakiecie",
  "Opłaty wynikające",
  "Pakiet Podstawowy",
  "Pakietu Podstawowego",
  "Opłata Sukcesu",
  "Opłaty Sukcesu",
  "Opłata za Udostępnienie Okazji",
  "Opłatę za Udostępnienie Okazji",
  "Cennik",
  "Cennika",
  "Załącznik nr 8",
  "Kwota Wypłacona Klientowi",
  "Kwoty Wypłaconej Klientowi",
  "Usługa Inwestora: 0,00 zł",
  "3 000,00",
  "nieodpłatn",
  "lientowsk",
  "LIENTOWSK",
  OLD_EMAIL,
];

/** Podmiany w oryginalnym .docx NDA v5 → v6 (treść, stopki). */
export const DOCX_PODMIANY_NDA = [
  {
    z: "FY-LEGAL-2026-09-04.v5 • 4 września 2026 r.",
    na: `${PACKAGE_ID_V7}.v6 • ${PACKAGE_DATE_PL}`,
  },
  { z: "FY-LEGAL-2026-09-04.v5", na: `${PACKAGE_ID_V7}.v6` },
  { z: "Prowizja Klientowska", na: "Prowizja od Pożyczkobiorcy" },
  { z: "Prowizji Klientowskiej", na: "Prowizji od Pożyczkobiorcy" },
] as const;

/** Podmiany w oryginalnym .docx RODO v4 → v5 (treść, stopki, e-mail). */
export const DOCX_PODMIANY_RODO = [
  {
    z: "FY-LEGAL-2026-09-04.v4 • 4 września 2026 r.",
    na: `${PACKAGE_ID_V7}.v5 • ${PACKAGE_DATE_PL}`,
  },
  { z: "FY-LEGAL-2026-09-04.v4", na: `${PACKAGE_ID_V7}.v5` },
  { z: OLD_EMAIL, na: NEW_EMAIL },
] as const;
