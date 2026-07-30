// Sekwencja poganiania leada przez Anię — 365 dni, opadająco.
// Mail: codziennie w 1. m-cu, co 3 dni w m-cach 2–3, co 7 dni w m-cach 4–6, co 14 dni do końca roku.
// Telefon: intensywnie w tyg. 1, potem coraz rzadziej (łącznie ~26 prób / rok).
// SMS: ~12 sms / rok (w punktach „kontrolnych": 1, 7, 14, 21, 30, 45, 60, 90, 120, 180, 240, 365).
// Telefon i SMS tylko 8:00–21:00 Europe/Warsaw, pon–pt (sobota/niedziela → przesuwane).
// Mail o każdej porze (mail nie irytuje).
//
// Sekwencję przerywa: odpowiedź klienta (mail/SMS/messenger/IG), odebrany telefon,
// dokończenie wniosku, status terminalny, ręczna pauza.
//
// Treści maili/SMS-ów cyklują po istniejących 30 szablonach mailowych / 4 SMS-owych
// (lookup modulo), żeby nie powtarzać tych samych tekstów obok siebie.

import { createClient } from "@supabase/supabase-js";
import { LEAD_TERMINAL_STATUSES, LEAD_CONTACT_WINDOW } from "./follow-up-config";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

type Channel = "email" | "sms" | "call";

interface Slot {
  day: number; // 1..365 — N-ty dzień od wpadnięcia leada (1 = dzień wpadnięcia)
  hourWarsaw: number; // godzina lokalna PL (0..23)
  channel: Channel;
  stepIndex: number; // numer kroku w sekwencji danego kanału (unikalny w obrębie kanału/leada)
}

// === SEKWENCJA — generowana, opadająca przez cały rok ===
function buildCadence(): Slot[] {
  const slots: Slot[] = [];
  let emailStep = 0;
  let callStep = 0;
  let smsStep = 0;

  // E-MAIL: codziennie 1–30, co 3 dni 31–90, co 7 dni 91–182, co 14 dni 183–365
  const emailDays = new Set<number>();
  for (let d = 1; d <= 30; d++) emailDays.add(d);
  for (let d = 33; d <= 90; d += 3) emailDays.add(d);
  for (let d = 97; d <= 182; d += 7) emailDays.add(d);
  for (let d = 196; d <= 365; d += 14) emailDays.add(d);
  for (const d of Array.from(emailDays).sort((a, b) => a - b)) {
    emailStep++;
    slots.push({ day: d, hourWarsaw: 10, channel: "email", stepIndex: emailStep });
  }

  // TELEFON: intensywnie w tyg. 1, potem coraz rzadziej
  const callDays = [
    1,
    1,
    2,
    3,
    4,
    5,
    6,
    7, // tyg. 1 — 8 prób
    10,
    14,
    18,
    22,
    28, // tyg. 2–4 — 5 prób
    38,
    50,
    62,
    75,
    88, // m-c 2–3 — 5 prób
    110,
    140,
    170, // m-c 4–6 — 3 próby
    210,
    260,
    320,
    365, // m-c 7–12 — 4 próby
  ];
  for (const d of callDays) {
    callStep++;
    // dwa telefony w dniu 1 — drugi po południu
    const hour = callStep === 2 ? 15 : 11 + (callStep % 3);
    slots.push({ day: d, hourWarsaw: hour, channel: "call", stepIndex: callStep });
  }

  // SMS: 12 punktów kontrolnych w roku
  const smsDays = [1, 7, 14, 21, 30, 45, 60, 90, 120, 180, 240, 365];
  for (const d of smsDays) {
    smsStep++;
    slots.push({ day: d, hourWarsaw: 11, channel: "sms", stepIndex: smsStep });
  }

  return slots;
}

export const CADENCE: Slot[] = buildCadence();

// === TREŚCI MAILI ===
type Tpl = { subject: string; body: (v: TplVars) => string };
interface TplVars {
  firstName: string;
  returnLink: string;
}

const greet = (v: TplVars) => (v.firstName ? `Cześć ${v.firstName}!` : "Cześć!");
const cta = (v: TplVars) => `Dokończ wniosek tutaj: ${v.returnLink}`;
const ctaCalc = (v: TplVars) => `Policz swoją ratę w kalkulatorze: ${v.returnLink}`;
const sig = "\n\nZespół Finance You";

/**
 * Zamienia gołe URL-e w tekście na ładne anchor "financeyou.pl" wskazujące na ten sam URL
 * (magic link działa pod spodem, ale wizualnie klient widzi nasz brand).
 */
function renderEmailHtml(textBody: string, subject: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const linkify = (line: string) =>
    line.replace(
      /(https?:\/\/[^\s]+)/g,
      (url) =>
        `<a href="${url}" style="color:#0f172a;font-weight:600;text-decoration:underline">financeyou.pl</a>`,
    );
  const paragraphs = textBody
    .split(/\n{2,}/)
    .map((p) => {
      const lines = p
        .split("\n")
        .map((l) => linkify(escape(l)))
        .join("<br/>");
      return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#0f172a">${lines}</p>`;
    })
    .join("");
  return `<div data-fy-section="follow-up"><h2 style="font-size:18px;margin:0 0 16px;color:#0f172a">${escape(subject)}</h2>${paragraphs}</div>`;
}

export const EMAIL_TEMPLATES: Record<number, Tpl> = {
  1: {
    subject: "Ponad 300 inwestorów czeka na Twój wniosek 🔥",
    body: (v) =>
      `${greet(v)}\n\nMasz otwarty wniosek w Finance You. Twój profil trafia do ponad 300 aktywnych inwestorów — a Ty wybierasz najkorzystniejszą ofertę. Rata rozłożona nawet na 70 miesięcy = realnie niska miesięczna kwota.\n\n${cta(v)}\n\nDecyzja wstępna w 24h, wypłata w 7–14 dni.${sig}`,
  },
  2: {
    subject: "Sprawdź, ile wyniesie Twoja rata — 30 sekund",
    body: (v) =>
      `${greet(v)}\n\nPrzesuń trzy suwaki w kalkulatorze i zobacz swoją ratę przy okresie do 70 miesięcy. Bez zobowiązań, bez rejestracji, bez dzwonienia.\n\n${ctaCalc(v)}${sig}`,
  },
  3: {
    subject: "Twoja rata może być NIŻSZA, niż myślisz",
    body: (v) =>
      `${greet(v)}\n\nNa 70 miesiącach rata potrafi spaść nawet o połowę względem krótkiego kredytu. Policz to sam — kalkulator pokazuje uczciwie wszystkie koszty.\n\n${ctaCalc(v)}${sig}`,
  },
  4: {
    subject: "Decyzja w 24 godziny — bez BIK i ZUS",
    body: (v) =>
      `${greet(v)}\n\nU nas zabezpieczeniem jest nieruchomość. Wstępną decyzję dostajesz w 24h, wypłatę w 7–14 dni. Bez PIT-ów, bez zaświadczeń z ZUS.\n\n${cta(v)}${sig}`,
  },
  5: {
    subject: "300+ inwestorów licytuje się o dobre wnioski",
    body: (v) =>
      `${greet(v)}\n\nTwój wniosek pokazujemy jednocześnie ponad 300 inwestorom. Oni konkurują o Ciebie — Ty wybierasz najkorzystniejsze warunki.\n\n${cta(v)}${sig}`,
  },
  6: {
    subject: "Ile realnie zapłacisz? Sprawdź w 30 sekund",
    body: (v) =>
      `${greet(v)}\n\nKalkulator pokazuje ratę, całkowity koszt i pełny harmonogram co do złotówki. Zero „od", zero gwiazdek.\n\n${ctaCalc(v)}${sig}`,
  },
  7: {
    subject: "Wypłata jeszcze w tym tygodniu — realnie",
    body: (v) =>
      `${greet(v)}\n\nJeśli dokończysz wniosek dzisiaj, jesteśmy w stanie zamknąć temat w tym tygodniu. Inwestorzy są gotowi.\n\n${cta(v)}${sig}`,
  },
  8: {
    subject: "Rata dopasowana DO CIEBIE — nie do tabelki",
    body: (v) =>
      `${greet(v)}\n\nNie mamy sztywnego scoringu jak bank. Każdy wniosek analizujemy ręcznie i dobieramy okres (nawet 70 miesięcy) tak, żeby rata była realna do udźwignięcia.\n\n${cta(v)}${sig}`,
  },
  9: {
    subject: "Bank powiedział NIE? U nas usłyszysz TAK",
    body: (v) =>
      `${greet(v)}\n\nZabezpieczeniem jest nieruchomość, nie historia w BIK. Klienci, którym bank odmówił, dostają u nas finansowanie w 10 dni.\n\n${cta(v)}${sig}`,
  },
  10: {
    subject: "Twoja rata < 1500 zł? Sprawdź w kalkulatorze",
    body: (v) =>
      `${greet(v)}\n\nRozłóż spłatę nawet na 70 miesięcy i zobacz, jak niska może być rata. Kalkulator pokazuje wszystko od razu.\n\n${ctaCalc(v)}${sig}`,
  },
  11: {
    subject: "Zostały Ci 3 minuty do wypłaty",
    body: (v) =>
      `${greet(v)}\n\nTwój wniosek jest w połowie drogi. Wystarczą 3 minuty, żeby ponad 300 inwestorów zobaczyło Twój profil.\n\n${cta(v)}${sig}`,
  },
  12: {
    subject: "Dlaczego klienci wybierają nas zamiast banku",
    body: (v) =>
      `${greet(v)}\n\n• 300+ inwestorów zamiast jednego banku\n• okres do 70 miesięcy\n• decyzja w 24h\n• wypłata w 7–14 dni\n• bez BIK i ZUS\n\n${cta(v)}${sig}`,
  },
  13: {
    subject: "Ile pożyczysz pod swoją nieruchomość?",
    body: (v) =>
      `${greet(v)}\n\nWpisz kwotę w kalkulatorze i zobacz ratę na 70 miesięcy. To Ty decydujesz, ile i na jak długo.\n\n${ctaCalc(v)}${sig}`,
  },
  14: {
    subject: "Twoje miejsce w kolejce jeszcze jest zarezerwowane",
    body: (v) =>
      `${greet(v)}\n\nProfil masz zapisany, inwestorzy czekają. Wystarczy kilka kliknięć i ruszamy z ofertą w 24h.\n\n${cta(v)}${sig}`,
  },
  15: {
    subject: "Wybierz spośród OFERT, nie bierz pierwszej z brzegu",
    body: (v) =>
      `${greet(v)}\n\nZbieramy dla Ciebie oferty od 300+ inwestorów i pokazujemy najkorzystniejszą. Ty porównujesz i wybierasz.\n\n${cta(v)}${sig}`,
  },
  16: {
    subject: "Kalkulator: rata na 24 vs 70 miesięcy — sprawdź różnicę",
    body: (v) =>
      `${greet(v)}\n\nZobacz na własne oczy, ile możesz zaoszczędzić miesięcznie wybierając dłuższy okres spłaty.\n\n${ctaCalc(v)}${sig}`,
  },
  17: {
    subject: "Ania czeka na Twój wniosek 👋",
    body: (v) =>
      `${greet(v)}\n\nJestem Twoim indywidualnym opiekunem. Odpowiem na każde pytanie, wytłumaczę każdy zapis umowy. Klient MUSI rozumieć wszystko — to nasza zasada.\n\n${cta(v)}${sig}`,
  },
  18: {
    subject: "Wycenę robimy MY — Ty oszczędzasz 1500 zł",
    body: (v) =>
      `${greet(v)}\n\nNie potrzebujesz operatu szacunkowego. Wycenę Twojej nieruchomości robimy sami, na podstawie RCN i ofert rynkowych.\n\n${cta(v)}${sig}`,
  },
  19: {
    subject: "Jedna niska rata zamiast kilku drogich",
    body: (v) =>
      `${greet(v)}\n\nMasz kilka zobowiązań? Zbierz je w jedną ratę rozłożoną na 70 miesięcy. Kalkulator pokaże Ci ile zaoszczędzisz.\n\n${ctaCalc(v)}${sig}`,
  },
  20: {
    subject: "Firma bez PIT-ów — u nas to normalne",
    body: (v) =>
      `${greet(v)}\n\nProwadzisz działalność? Zabezpieczenie na nieruchomości = pomijamy PIT-y i ZUS. Decyzja w 24h.\n\n${cta(v)}${sig}`,
  },
  21: {
    subject: "Pieniądze na koncie w 7–14 dni",
    body: (v) =>
      `${greet(v)}\n\nŚredni czas od dokończenia wniosku do wypłaty: 10 dni. Bez kolejek, bez procedur.\n\n${cta(v)}${sig}`,
  },
  22: {
    subject: "Sprawdź ratę zanim ktokolwiek zadzwoni",
    body: (v) =>
      `${greet(v)}\n\nNie musisz odbierać telefonu, żeby poznać warunki. Kalkulator pokaże Ci wszystko od razu.\n\n${ctaCalc(v)}${sig}`,
  },
  23: {
    subject: "300 inwestorów, 1 formularz, 3 minuty",
    body: (v) =>
      `${greet(v)}\n\nTyle wystarczy, żeby ponad 300 inwestorów walczyło o Twój wniosek. Wybierzesz najkorzystniejszą ofertę.\n\n${cta(v)}${sig}`,
  },
  24: {
    subject: "Twoja nieruchomość ZOSTAJE Twoja",
    body: (v) =>
      `${greet(v)}\n\nUmowa u notariusza, wpis w KW to tylko zabezpieczenie dla inwestora. Ty cały czas jesteś właścicielem.\n\n${cta(v)}${sig}`,
  },
  25: {
    subject: "Ile możesz pożyczyć? Sprawdź w 30 sekund",
    body: (v) =>
      `${greet(v)}\n\nKalkulator pokaże Ci maksymalną kwotę i ratę na 70 miesięcy. Bez rejestracji.\n\n${ctaCalc(v)}${sig}`,
  },
  26: {
    subject: "Twój profil pasuje do 4 inwestorów TERAZ",
    body: (v) =>
      `${greet(v)}\n\nMamy aktualnie 4 inwestorów szukających nieruchomości podobnych do Twojej. Im szybciej dokończysz, tym lepsze warunki.\n\n${cta(v)}${sig}`,
  },
  27: {
    subject: "5 kroków, 10 dni, pieniądze u Ciebie",
    body: (v) =>
      `${greet(v)}\n\n1) Wniosek (3 min)\n2) Wycena (24h)\n3) Decyzja inwestora (24–48h)\n4) Notariusz (3–5 dni)\n5) Wypłata na Twoje konto\n\n${cta(v)}${sig}`,
  },
  28: {
    subject: "Rata 850 zł/mies? Sprawdź, czy się zmieścisz",
    body: (v) =>
      `${greet(v)}\n\nPrzy długim okresie spłaty rata potrafi być zaskakująco niska. Sprawdź swój scenariusz w kalkulatorze.\n\n${ctaCalc(v)}${sig}`,
  },
  29: {
    subject: "Bez ukrytych kosztów. Bez gwiazdek. Bez „od”",
    body: (v) =>
      `${greet(v)}\n\nPełna transparentność: oprocentowanie, prowizja, harmonogram — wszystko widzisz zanim cokolwiek podpiszesz.\n\n${ctaCalc(v)}${sig}`,
  },
  30: {
    subject: "Ostatnia szansa na wypłatę przed weekendem",
    body: (v) =>
      `${greet(v)}\n\nDokończ wniosek do końca dnia — inwestorzy zobaczą Twój profil jeszcze dziś, decyzja jutro.\n\n${cta(v)}${sig}`,
  },
  31: {
    subject: "Historia klienta: 180 tys. w 9 dni",
    body: (v) =>
      `${greet(v)}\n\n„Bank odmówił, Finance You dał 180 tys. w 9 dni. Rata rozłożona na 70 mies., naprawdę do udźwignięcia." — pani Anna, Kraków.\n\n${cta(v)}${sig}`,
  },
  32: {
    subject: "Twoja rata < niż rata twojego samochodu?",
    body: (v) =>
      `${greet(v)}\n\nNa 70 miesiącach rata za pożyczkę hipoteczną potrafi być niższa niż rata leasingu auta. Policz to.\n\n${ctaCalc(v)}${sig}`,
  },
  33: {
    subject: "300+ inwestorów = najlepsze warunki dla Ciebie",
    body: (v) =>
      `${greet(v)}\n\nKonkurencja między inwestorami działa na Twoją korzyść. Wybierasz najniższą ratę i najdłuższy okres.\n\n${cta(v)}${sig}`,
  },
  34: {
    subject: "Jesteś 3 minuty od pieniędzy",
    body: (v) =>
      `${greet(v)}\n\nTwój wniosek prawie gotowy. Kliknij i dokończ — reszta po naszej stronie.\n\n${cta(v)}${sig}`,
  },
  35: {
    subject: "Kalkulator: sprawdź 5 różnych scenariuszy",
    body: (v) =>
      `${greet(v)}\n\nKrótszy okres = niższy koszt. Dłuższy = niższa rata. Ty wybierasz, my organizujemy resztę.\n\n${ctaCalc(v)}${sig}`,
  },
  36: {
    subject: "Bez wychodzenia z domu — całość online",
    body: (v) =>
      `${greet(v)}\n\nWniosek, wycena, oferty — wszystko online. Do notariusza wybierasz się raz.\n\n${cta(v)}${sig}`,
  },
  37: {
    subject: "Twój wniosek trafia dziś do inwestorów",
    body: (v) =>
      `${greet(v)}\n\nDokończ w ciągu 24h, a jutro Twój profil zobaczy 300+ inwestorów. Decyzja tego samego dnia.\n\n${cta(v)}${sig}`,
  },
  38: {
    subject: "Ile potrzebujesz? 50 tys.? 500 tys.? Sprawdź",
    body: (v) =>
      `${greet(v)}\n\nOd 30 tys. do kilku milionów — pod zastaw nieruchomości. Kalkulator pokaże ratę dla Twojej kwoty.\n\n${ctaCalc(v)}${sig}`,
  },
  39: {
    subject: "Ania: „Twój wniosek wygląda obiecująco”",
    body: (v) =>
      `${greet(v)}\n\nSprawdziłam Twój profil — pasuje do naszych aktywnych inwestorów. Szkoda przepuścić okazję.\n\n${cta(v)}${sig}`,
  },
  40: {
    subject: "Rata rozłożona na 70 mies. = spokój na 6 lat",
    body: (v) =>
      `${greet(v)}\n\nDługi okres spłaty to nie „drożej" — to „stabilniej". Niska, przewidywalna rata przez cały okres.\n\n${ctaCalc(v)}${sig}`,
  },
  41: {
    subject: "Pieniądze przed świętami — tak, to możliwe",
    body: (v) =>
      `${greet(v)}\n\nOd wniosku do wypłaty średnio 10 dni. Jeśli klikniesz dziś, zdążymy z komfortem.\n\n${cta(v)}${sig}`,
  },
  42: {
    subject: "Twoja rata w kalkulatorze — bez podawania danych",
    body: (v) =>
      `${greet(v)}\n\nNie musisz się rejestrować ani niczego wysyłać. Wchodzisz, liczysz, wiesz.\n\n${ctaCalc(v)}${sig}`,
  },
  43: {
    subject: "Klient MUSI rozumieć wszystko",
    body: (v) =>
      `${greet(v)}\n\nTłumaczymy każdy zapis umowy prostym językiem. Zadajesz każde pytanie — także te „głupie". Zero drobnego druku.\n\n${cta(v)}${sig}`,
  },
  44: {
    subject: "300+ inwestorów. Ty wybierasz. Bez presji.",
    body: (v) =>
      `${greet(v)}\n\nZbieramy oferty, pokazujemy Ci, Ty decydujesz. Bez naciskania, bez tricków.\n\n${cta(v)}${sig}`,
  },
  45: {
    subject: "Twoja rata może być o 40% niższa",
    body: (v) =>
      `${greet(v)}\n\nOkres 70 miesięcy vs 24 miesiące = rata niższa nawet o 40%. Sprawdź, ile wyjdzie u Ciebie.\n\n${ctaCalc(v)}${sig}`,
  },
  46: {
    subject: "Wypłata do 14 dni — gwarancja terminu",
    body: (v) =>
      `${greet(v)}\n\nOd akceptacji oferty do przelewu maks. 14 dni. Zazwyczaj szybciej. Zawsze mówimy prawdę o terminach.\n\n${cta(v)}${sig}`,
  },
  47: {
    subject: "Nie wiesz, ile pożyczyć? Kalkulator podpowie",
    body: (v) =>
      `${greet(v)}\n\nWpisz swoją nieruchomość i budżet miesięczny — kalkulator pokaże, ile realnie możesz wziąć.\n\n${ctaCalc(v)}${sig}`,
  },
  48: {
    subject: "Bez zaświadczeń o zarobkach",
    body: (v) =>
      `${greet(v)}\n\nZabezpieczenie na nieruchomości = koniec z papierologią. Zaświadczenia, PIT-y, ZUS — pomijamy.\n\n${cta(v)}${sig}`,
  },
  49: {
    subject: "Twój profil = TOP dla naszych inwestorów",
    body: (v) =>
      `${greet(v)}\n\nMasz nieruchomość, potrzebujesz gotówki — to dokładnie to, czego szukają nasi inwestorzy. Kilka kliknięć i ruszamy.\n\n${cta(v)}${sig}`,
  },
  50: {
    subject: "50 mail — 50 powodów, żeby dokończyć",
    body: (v) =>
      `${greet(v)}\n\nOK, może 5: 300+ inwestorów, okres do 70 mies., decyzja 24h, wypłata 10 dni, indywidualny opiekun. Wystarczy?\n\n${cta(v)}${sig}`,
  },
  51: {
    subject: "Sprawdź ratę zanim zdecydujesz",
    body: (v) =>
      `${greet(v)}\n\nKalkulator to Twoje narzędzie — bez zobowiązań, bez rozmów. Wchodzisz, liczysz, wiesz na czym stoisz.\n\n${ctaCalc(v)}${sig}`,
  },
  52: {
    subject: "Jak wygląda nasza umowa? Pokazujemy przed",
    body: (v) =>
      `${greet(v)}\n\nWzór umowy dostajesz zanim cokolwiek podpiszesz. Bez tajemnic, bez „potem się dogadamy".\n\n${cta(v)}${sig}`,
  },
  53: {
    subject: "Twoja historia BIK NIE MA znaczenia",
    body: (v) =>
      `${greet(v)}\n\nInwestorzy patrzą na nieruchomość, nie na Twoje raty sprzed 5 lat. Zła historia? Nieaktualne dla nas.\n\n${cta(v)}${sig}`,
  },
  54: {
    subject: "Rata 1200 zł na 300 tys.? Sprawdź scenariusz",
    body: (v) =>
      `${greet(v)}\n\nPrzy 70 miesiącach i średnim oprocentowaniu — to nie jest bajka. Policz w kalkulatorze.\n\n${ctaCalc(v)}${sig}`,
  },
  55: {
    subject: "24h to długo? U nas zwykle szybciej",
    body: (v) =>
      `${greet(v)}\n\nWstępna decyzja często przychodzi tego samego dnia. Dokończ wniosek i sprawdź.\n\n${cta(v)}${sig}`,
  },
  56: {
    subject: "Ania wraca z pytaniem",
    body: (v) =>
      `${greet(v)}\n\nCzy coś w wniosku Cię blokuje? Napisz jedno zdanie — pomogę bez zbędnych formalności.\n\n${cta(v)}${sig}`,
  },
  57: {
    subject: "Twoja rata na 5 lat vs na 6 lat",
    body: (v) =>
      `${greet(v)}\n\nJeden rok dłużej = spokojniejszy budżet. Kalkulator pokaże Ci różnicę co do złotówki.\n\n${ctaCalc(v)}${sig}`,
  },
  58: {
    subject: "Bez wychodzenia z pracy — całość online",
    body: (v) =>
      `${greet(v)}\n\nWniosek, wycena, oferty, wybór — wszystko w Twoim panelu. Wpadasz do notariusza raz.\n\n${cta(v)}${sig}`,
  },
  59: {
    subject: "Twoi konkurenci już złożyli wnioski",
    body: (v) =>
      `${greet(v)}\n\nCo tydzień składamy dziesiątki wniosków. Inwestorzy wybierają najciekawsze. Twój ciągle czeka.\n\n${cta(v)}${sig}`,
  },
  60: {
    subject: "300+ inwestorów — Twoja przewaga negocjacyjna",
    body: (v) =>
      `${greet(v)}\n\nJeden bank ma jedną ofertę. My mamy 300+ inwestorów i wybieramy z nimi najlepsze warunki DLA CIEBIE.\n\n${cta(v)}${sig}`,
  },
  61: {
    subject: "Sprawdź ratę teraz — nawet z telefonu",
    body: (v) =>
      `${greet(v)}\n\nKalkulator działa na telefonie. 30 sekund i wiesz, ile wyjdzie miesięcznie.\n\n${ctaCalc(v)}${sig}`,
  },
  62: {
    subject: "Odsetki niższe niż w chwilówce — dużo",
    body: (v) =>
      `${greet(v)}\n\nZabezpieczenie na nieruchomości = niższe ryzyko dla inwestora = niższy koszt dla Ciebie.\n\n${cta(v)}${sig}`,
  },
  63: {
    subject: "Rata dopasowana do Twojego budżetu",
    body: (v) =>
      `${greet(v)}\n\nPowiedz nam ile chcesz płacić miesięcznie — dobierzemy kwotę i okres. Do 70 miesięcy w zapasie.\n\n${cta(v)}${sig}`,
  },
  64: {
    subject: "Twoje pieniądze na wakacje? Sprawdź scenariusz",
    body: (v) =>
      `${greet(v)}\n\nWypłata w 10 dni, spłata rozłożona na 70 mies. Kalkulator pokaże Ci ratę.\n\n${ctaCalc(v)}${sig}`,
  },
  65: {
    subject: "Twój wniosek nie ginie — trzymamy go dla Ciebie",
    body: (v) =>
      `${greet(v)}\n\nDane są u nas bezpieczne, dostęp masz zawsze. Nie musisz zaczynać od zera.\n\n${cta(v)}${sig}`,
  },
  66: {
    subject: "Nie musisz decydować teraz — policz na spokojnie",
    body: (v) =>
      `${greet(v)}\n\nKalkulator jest do zabawy. Sprawdź różne kwoty i okresy. Zdecydujesz kiedy będziesz gotowy.\n\n${ctaCalc(v)}${sig}`,
  },
  67: {
    subject: "Wypłata przed 15. — jeszcze zdążysz",
    body: (v) =>
      `${greet(v)}\n\nDokończ wniosek dzisiaj, mamy 10 dni do końca miesiąca. Realny termin.\n\n${cta(v)}${sig}`,
  },
  68: {
    subject: "Twoja nieruchomość + nasi inwestorzy = TAK",
    body: (v) =>
      `${greet(v)}\n\nMieszkanie, dom, działka, lokal, magazyn — pracujemy ze wszystkim. Także z obciążeniami.\n\n${cta(v)}${sig}`,
  },
  69: {
    subject: "Rata jak abonament komórkowy? Sprawdź",
    body: (v) =>
      `${greet(v)}\n\nNa długim okresie rata potrafi być zaskakująco niska. Policz swoją.\n\n${ctaCalc(v)}${sig}`,
  },
  70: {
    subject: "300+ inwestorów wciąż na Ciebie czeka",
    body: (v) =>
      `${greet(v)}\n\nDrzwi dalej otwarte. Kilka kliknięć i uruchamiamy oferty.\n\n${cta(v)}${sig}`,
  },
  71: {
    subject: "Ania: „Mam dla Ciebie 5 minut”",
    body: (v) =>
      `${greet(v)}\n\nNapisz kiedy mam zadzwonić — przejdziemy wniosek razem, punkt po punkcie.\n\n${cta(v)}${sig}`,
  },
  72: {
    subject: "Do 70 miesięcy — najdłuższy okres na rynku",
    body: (v) =>
      `${greet(v)}\n\nMało kto rozkłada spłatę na 70 miesięcy. My tak — bo wiemy, że niska rata to spokojny sen.\n\n${ctaCalc(v)}${sig}`,
  },
  73: {
    subject: "Twój wniosek + 24h + oferta — działamy",
    body: (v) =>
      `${greet(v)}\n\nProstsze niż w banku. Szybsze niż w banku. Elastyczniejsze niż w banku.\n\n${cta(v)}${sig}`,
  },
  74: {
    subject: "Sprawdź, czy Twoja nieruchomość się nadaje",
    body: (v) =>
      `${greet(v)}\n\nMieszkanie, dom, działka, lokal — praktycznie wszystko. Wpisz w kalkulatorze i sprawdź kwotę.\n\n${ctaCalc(v)}${sig}`,
  },
  75: {
    subject: "Klient z wypłatą: „Nie wierzyłem, że tak szybko”",
    body: (v) =>
      `${greet(v)}\n\n„8 dni od wniosku do przelewu. Bank kazałby czekać 2 miesiące." — pan Marek, Wrocław.\n\n${cta(v)}${sig}`,
  },
  76: {
    subject: "Twój wniosek = Twoje warunki",
    body: (v) =>
      `${greet(v)}\n\nTo Ty ustawiasz kwotę, okres i preferencje. My szukamy inwestorów, którzy się do tego dopasują.\n\n${cta(v)}${sig}`,
  },
  77: {
    subject: "Sprawdź maksymalną kwotę pod swoją nieruchomość",
    body: (v) =>
      `${greet(v)}\n\nKalkulator pokaże Ci górny limit i odpowiednią ratę na 70 miesięcy.\n\n${ctaCalc(v)}${sig}`,
  },
  78: {
    subject: "Twój indywidualny opiekun — nie call center",
    body: (v) =>
      `${greet(v)}\n\nJedna osoba prowadzi Cię od początku do końca. Znam Twoją sprawę, odbieram Twoje telefony.\n\n${cta(v)}${sig}`,
  },
  79: {
    subject: "Rata w Twoim budżecie — zagwarantowane",
    body: (v) =>
      `${greet(v)}\n\nJeśli standardowa rata za wysoka — wydłużamy okres. Do 70 miesięcy w zapasie.\n\n${ctaCalc(v)}${sig}`,
  },
  80: {
    subject: "Bez ryzyka utraty domu — jasne zasady",
    body: (v) =>
      `${greet(v)}\n\nUmowa notarialna, hipoteka jako zabezpieczenie, przewidywalny harmonogram. Wszystko jasne od początku.\n\n${cta(v)}${sig}`,
  },
  81: {
    subject: "300+ inwestorów zobaczy Twój wniosek dziś",
    body: (v) =>
      `${greet(v)}\n\nWystarczy dokończyć — wysyłamy Twój profil jednym kliknięciem do wszystkich aktywnych inwestorów.\n\n${cta(v)}${sig}`,
  },
  82: {
    subject: "Rata na 6 lat vs kredyt na 2 lata — porównanie",
    body: (v) =>
      `${greet(v)}\n\nDokładne liczby w kalkulatorze. Zobaczysz, dlaczego długi okres to Twoja przewaga.\n\n${ctaCalc(v)}${sig}`,
  },
  83: {
    subject: "Jesteś krok od rozwiązania",
    body: (v) =>
      `${greet(v)}\n\nCokolwiek Cię przygnębia finansowo — pożyczka pod zastaw daje spokój na lata. Sprawdź scenariusz.\n\n${cta(v)}${sig}`,
  },
  84: {
    subject: "Twoja rata w kalkulatorze — teraz",
    body: (v) =>
      `${greet(v)}\n\n30 sekund + 3 suwaki = pełny obraz Twoich kosztów.\n\n${ctaCalc(v)}${sig}`,
  },
  85: {
    subject: "300+ inwestorów, 70 miesięcy, decyzja w 24h",
    body: (v) =>
      `${greet(v)}\n\nTrzy liczby, które oddają wszystko, co robimy inaczej niż bank.\n\n${cta(v)}${sig}`,
  },
  86: {
    subject: "Twój profil nadal aktywny — inwestorzy pytają",
    body: (v) =>
      `${greet(v)}\n\nZapytania od inwestorów wciąż spływają. Twój wniosek jest gotowy do publikacji — tylko finisz.\n\n${cta(v)}${sig}`,
  },
  87: {
    subject: "Nie masz operatu? Nie potrzebujesz",
    body: (v) =>
      `${greet(v)}\n\nWycena po naszej stronie. Ty tylko wysyłasz kilka zdjęć.\n\n${cta(v)}${sig}`,
  },
  88: {
    subject: "Ania: „Sprawdź kalkulator, potem porozmawiamy”",
    body: (v) =>
      `${greet(v)}\n\nJak zobaczysz konkretną ratę — łatwiej podjąć decyzję. Kalkulator jest tuż tuż.\n\n${ctaCalc(v)}${sig}`,
  },
  89: {
    subject: "Twój wniosek żyje — wystarczy jeden klik",
    body: (v) =>
      `${greet(v)}\n\nDane masz zapisane, link działa, 300+ inwestorów czeka. Naprawdę tylko klik.\n\n${cta(v)}${sig}`,
  },
  90: {
    subject: "Ostatnie przypomnienie — Twoje drzwi nadal otwarte",
    body: (v) =>
      `${greet(v)}\n\nGdyby kiedykolwiek pożyczka Ci się przydała — link zawsze działa, Ania zawsze odbiera. Powodzenia!\n\n${cta(v)}${sig}\n\n— Ania`,
  },
};

export const SMS_TEMPLATES: Record<number, (v: TplVars) => string> = {
  1: (v) =>
    `Finance You: ${v.firstName || "Cześć"}, dokończ wniosek o pożyczkę na financeyou.pl → ${v.returnLink}`,
  2: (v) =>
    `Finance You: hej${v.firstName ? " " + v.firstName : ""}, masz otwarty wniosek. Wróć: ${v.returnLink}`,
  3: (v) => `Finance You: policz swoją ratę w kalkulatorze — 30 sek: ${v.returnLink}`,
  4: (v) =>
    `Finance You: ${v.firstName || "Cześć"}, sprawdź ile wyniesie Twoja rata: ${v.returnLink}`,
  5: (v) => `Finance You: pomożemy Ci finansowo — wystarczy dokończyć wniosek: ${v.returnLink}`,
  6: (v) =>
    `Finance You: ${v.firstName || ""} Twój profil pasuje do naszych inwestorów. Dokończ: ${v.returnLink}`,
  7: (v) => `Finance You: niska rata, długi okres spłaty, decyzja w 24h. Sprawdź: ${v.returnLink}`,
  8: (v) => `Finance You: pobaw się suwakami w kalkulatorze i zobacz swoją ratę: ${v.returnLink}`,
  9: (v) =>
    `Finance You: ${v.firstName || "Cześć"}, otrzymasz pomoc finansową szybciej, niż myślisz: ${v.returnLink}`,
  10: (v) => `Finance You: jeden klik = zalogowany w panelu, gotowy wniosek czeka: ${v.returnLink}`,
  11: (v) =>
    `Finance You: ${v.firstName || ""} masz jeszcze chwilę? Dokończ wniosek: ${v.returnLink}`,
  12: (v) =>
    `Finance You: ostatnia szansa w tym miesiącu — dokończ wniosek: ${v.returnLink} . Stop=STOP`,
};

// === KONWERSJA STREF CZASOWYCH ===
/** Buduje Date odpowiadający podanej dacie i godzinie w Europe/Warsaw. */
function warsawDateAt(year: number, month: number, day: number, hour: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const wallUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  const diff = wallUtc - guess.getTime();
  return new Date(guess.getTime() - diff);
}

function warsawDateParts(d: Date): { y: number; m: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get("year"), m: get("month"), day: get("day") };
}

/** Czy aktualnie 8:00–21:00 i pon–pt (Warszawa)? Telefon i SMS tylko w tym oknie. */
function isInQuietWindow(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  const isWeekday = !["Sat", "Sun"].includes(wd);
  return isWeekday && hour >= LEAD_CONTACT_WINDOW.startHour && hour < LEAD_CONTACT_WINDOW.endHour;
}

// === PLANOWANIE ===
export async function scheduleFollowUpsForLead(
  leadId: string,
  anchorAt: Date = new Date(),
): Promise<{ inserted: number }> {
  const s = admin();
  const { y, m, day } = warsawDateParts(anchorAt);
  // Bazowa data Warszawy dla dnia 1 to dzień wpadnięcia leada (kalendarzowo PL).
  const rows = CADENCE.map((slot) => {
    // dayOffset: day 1 = anchorDay, day 2 = +1 doba, itd.
    const target = warsawDateAt(y, m, day + (slot.day - 1), slot.hourWarsaw);
    const scheduledAt = target.getTime() < Date.now() ? new Date(Date.now() + 60_000) : target;
    return {
      lead_id: leadId,
      channel: slot.channel,
      step_index: slot.stepIndex,
      scheduled_at: scheduledAt.toISOString(),
      status: "pending" as const,
      metadata: { day: slot.day, hourWarsaw: slot.hourWarsaw },
    };
  });
  // Idempotentnie — unikalne (lead_id,channel,step_index)
  const { error } = await s.from("lead_follow_up_schedule").upsert(rows, {
    onConflict: "lead_id,channel,step_index",
    ignoreDuplicates: true,
  });
  if (error) {
    console.error("[follow-up-plan] schedule insert error", error);
    return { inserted: 0 };
  }
  return { inserted: rows.length };
}

export async function cancelFollowUpsForLead(leadId: string, reason: string): Promise<void> {
  const s = admin();
  await s
    .from("lead_follow_up_schedule")
    .update({ status: "cancelled", error_message: reason })
    .eq("lead_id", leadId)
    .eq("status", "pending");
}

// === PRZETWARZANIE (cron tick) ===
const TERMINAL = new Set<string>(LEAD_TERMINAL_STATUSES);

interface DueRow {
  id: string;
  lead_id: string;
  channel: Channel;
  step_index: number;
}

export async function processDueFollowUps(): Promise<{
  processed: number;
  sent: number;
  skipped: number;
}> {
  const s = admin();
  const now = new Date();

  const { data: due } = await s
    .from("lead_follow_up_schedule")
    .select("id, lead_id, channel, step_index")
    .eq("status", "pending")
    .lte("scheduled_at", now.toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(200);

  if (!due || due.length === 0) return { processed: 0, sent: 0, skipped: 0 };

  // Czy są jakieś inboundy/odebrania (anulowanie sekwencji)?
  const leadIds = Array.from(new Set(due.map((r) => r.lead_id)));
  const { data: leads } = await s
    .from("leads")
    .select(
      "id, status, email, phone_normalized, first_name, application_data, loan_application_id, client_id",
    )
    .in("id", leadIds);
  const leadMap = new Map<string, any>();
  for (const l of leads ?? []) leadMap.set(l.id, l);

  // Czy klient już odpisał? (dowolny inbound w lead_communications)
  const { data: inbounds } = await s
    .from("lead_communications")
    .select("lead_id")
    .in("lead_id", leadIds)
    .eq("direction", "inbound");
  const respondedLeads = new Set<string>((inbounds ?? []).map((r) => r.lead_id).filter(Boolean));

  let sent = 0,
    skipped = 0;
  const inWindow = isInQuietWindow(now);

  for (const row of due as DueRow[]) {
    const lead = leadMap.get(row.lead_id);
    if (!lead) {
      await s
        .from("lead_follow_up_schedule")
        .update({ status: "cancelled", error_message: "lead not found" })
        .eq("id", row.id);
      skipped++;
      continue;
    }
    if (lead.status && TERMINAL.has(String(lead.status))) {
      await cancelFollowUpsForLead(row.lead_id, `terminal status: ${lead.status}`);
      skipped++;
      continue;
    }
    if (lead.application_data?.followup_paused) {
      skipped++;
      continue;
    }
    if (respondedLeads.has(row.lead_id)) {
      await cancelFollowUpsForLead(row.lead_id, "client responded");
      skipped++;
      continue;
    }

    // Okno godzinowe — tylko dla call/sms
    if ((row.channel === "call" || row.channel === "sms") && !inWindow) {
      // Przesuń na najbliższy poniedziałek 10:00 PL lub dzisiaj 10:00 PL jeśli przed 8
      const next = nextWindowOpenAt(now);
      await s
        .from("lead_follow_up_schedule")
        .update({ scheduled_at: next.toISOString(), attempts: 0 })
        .eq("id", row.id);
      skipped++;
      continue;
    }

    const firstName = lead.first_name ?? "";
    // Spróbuj świeży magic link (auto-zaloguje klienta do /klient). Fallback: financeyou.pl
    let returnLink = "https://financeyou.pl";
    if (lead.email && (row.channel === "email" || row.channel === "sms")) {
      try {
        const { ensureKlientAccountAndMagicLink } = await import("@/lib/client-magic-link.server");
        const r = await ensureKlientAccountAndMagicLink(lead.email, {
          firstName: lead.first_name ?? null,
          source: "meta_lead",
        });
        if (r.magicLink) returnLink = r.magicLink;
        if (r.userId && lead.client_id) {
          await s
            .from("clients")
            .update({ user_id: r.userId })
            .eq("id", lead.client_id)
            .is("user_id", null);
        }
      } catch {
        /* fallback do financeyou.pl */
      }
    }
    const vars: TplVars = { firstName, returnLink };

    try {
      if (row.channel === "email") {
        const emailCount = Object.keys(EMAIL_TEMPLATES).length;
        const tpl = EMAIL_TEMPLATES[((row.step_index - 1) % emailCount) + 1];
        if (!tpl || !lead.email) {
          await s
            .from("lead_follow_up_schedule")
            .update({ status: "skipped", error_message: "no email/template" })
            .eq("id", row.id);
          skipped++;
          continue;
        }
        const bodyText = tpl.body(vars);
        const { sendResendEmail } = await import("@/lib/resend-send.server");
        const r = await sendResendEmail({
          to: lead.email,
          subject: tpl.subject,
          text: bodyText,
          html: renderEmailHtml(bodyText, tpl.subject),
          fromName: "Ania z Finance You",
        });
        await s
          .from("lead_follow_up_schedule")
          .update({
            status: r.ok ? "sent" : "error",
            sent_at: r.ok ? new Date().toISOString() : null,
            external_id: r.id ?? null,
            error_message: r.ok ? null : (r.error ?? "send error"),
            attempts: 1,
          })
          .eq("id", row.id);
        if (r.ok) {
          await logComm(
            row.lead_id,
            "email",
            lead.email,
            bodyText,
            tpl.subject,
            r.id ?? null,
            row.step_index,
          );
          sent++;
        }
      } else if (row.channel === "sms") {
        const phone = lead.phone_normalized;
        const smsCount = Object.keys(SMS_TEMPLATES).length;
        const tplFn = SMS_TEMPLATES[((row.step_index - 1) % smsCount) + 1];
        if (!phone || !tplFn) {
          await s
            .from("lead_follow_up_schedule")
            .update({ status: "skipped", error_message: "no phone/template" })
            .eq("id", row.id);
          skipped++;
          continue;
        }
        const { sendSmsInternal } = await import("@/lib/voicebot.functions");
        const r = await sendSmsInternal({
          phone,
          body: tplFn(vars),
          source: `follow_up_sms_${row.step_index}`,
        });
        await s
          .from("lead_follow_up_schedule")
          .update({
            status: r.ok ? "sent" : "error",
            sent_at: r.ok ? new Date().toISOString() : null,
            external_id: r.sid ?? null,
            error_message: r.ok ? null : (r.error ?? "send error"),
            attempts: 1,
          })
          .eq("id", row.id);
        if (r.ok) sent++;
      } else if (row.channel === "call") {
        const phone = lead.phone_normalized;
        if (!phone) {
          await s
            .from("lead_follow_up_schedule")
            .update({ status: "skipped", error_message: "no phone" })
            .eq("id", row.id);
          skipped++;
          continue;
        }
        const { placeOutboundCallInternal } = await import("@/lib/voicebot.functions");
        const r = await placeOutboundCallInternal({
          phone,
          source: `follow_up_call_${row.step_index}`,
          clientId: lead.client_id ?? null,
          loanApplicationId: lead.loan_application_id ?? null,
          firstName,
        });
        await s
          .from("lead_follow_up_schedule")
          .update({
            status: r.ok ? "sent" : "error",
            sent_at: r.ok ? new Date().toISOString() : null,
            external_id: r.conversationId ?? r.callSid ?? null,
            error_message: r.ok ? null : (r.error ?? "call error"),
            attempts: 1,
          })
          .eq("id", row.id);
        if (r.ok) sent++;
      }
    } catch (e: any) {
      console.error("[follow-up-plan] process error", row, e?.message);
      await s
        .from("lead_follow_up_schedule")
        .update({
          status: "error",
          error_message: e?.message ?? "exception",
          attempts: 1,
        })
        .eq("id", row.id);
    }
  }
  return { processed: due.length, sent, skipped };
}

function nextWindowOpenAt(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = get("hour");
  const y = get("year"),
    m = get("month"),
    d = get("day");
  let addDays = 0;
  if (wd === "Sat") addDays = 2;
  else if (wd === "Sun") addDays = 1;
  else if (hour >= 21) addDays = wd === "Fri" ? 3 : 1;
  let targetHour = 10;
  if (addDays === 0 && hour < 8) targetHour = 9;
  return warsawDateAt(y, m, d + addDays, targetHour);
}

async function fetchReturnLink(loanApplicationId: string): Promise<string | null> {
  const s = admin();
  const { data } = await s
    .from("loan_applications")
    .select("return_link")
    .eq("id", loanApplicationId)
    .maybeSingle();
  return data?.return_link ?? null;
}

async function logComm(
  leadId: string,
  channel: "email" | "sms",
  to: string,
  body: string,
  subject: string | null,
  externalId: string | null,
  step: number,
) {
  try {
    const { logLeadCommunication } = await import("@/lib/lead-comms.server");
    await logLeadCommunication({
      leadId,
      channel: channel === "sms" ? "sms" : "email",
      direction: "outbound",
      email: channel === "email" ? to : null,
      content: body,
      subject,
      externalId,
      status: "sent",
      metadata: { follow_up_step: step, auto: true, source: "follow_up_plan" },
    });
  } catch (e) {
    console.error("[follow-up-plan] log error", e);
  }
}
