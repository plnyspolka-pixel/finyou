// ════════════════════════════════════════════════════════════════════
// PROCEDURA WINDYKACYJNA — ścieżki, etapy i logika „sugerowanego kroku".
// Czyste, deterministyczne funkcje (bez I/O). Procedura jest wbudowana w
// interfejs: inwestor nie musi znać jej na pamięć.
// ════════════════════════════════════════════════════════════════════

export type WindPath = "miekka" | "standardowa" | "twarda" | "karna";

export type WindEventType =
  | "sms"
  | "email"
  | "telefon"
  | "pismo_nadane"
  | "pismo_doreczone"
  | "pismo_awizo"
  | "pismo_zwrot"
  | "wplata"
  | "dokument_wygenerowany"
  | "zmiana_etapu"
  | "notatka"
  | "czynnosc_sadowa";

export type WindDeliveryStatus =
  | "oczekuje"
  | "doreczone"
  | "awizowane"
  | "termin_uplynal"
  | "zwrot";

export interface WindEventLite {
  typ: WindEventType;
  data_zdarzenia: string;
  data_doreczenia?: string | null;
  status_doreczenia?: WindDeliveryStatus | null;
}

export interface WindCaseLite {
  sciezka: WindPath;
  etap: string;
  opoznienie_dni: number;
  kwota_zalegla: number;
}

// ── Etykiety i kolory ścieżek ────────────────────────────────────────
export const PATH_LABELS: Record<WindPath, string> = {
  miekka: "Miękka (ugodowa)",
  standardowa: "Standardowa (art. 777)",
  twarda: "Twarda (egzekucja z nieruchomości)",
  karna: "Karna (art. 286/297 k.k.)",
};

export const PATH_BADGE: Record<WindPath, string> = {
  miekka: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  standardowa: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  twarda: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  karna: "bg-zinc-800 text-zinc-100 dark:bg-zinc-700 dark:text-zinc-100",
};

// ── Etapy w ramach ścieżki (stepper) ─────────────────────────────────
export interface StageDef {
  key: string;
  label: string;
}

export const PATH_STAGES: Record<WindPath, StageDef[]> = {
  miekka: [
    { key: "kontakt_wstepny", label: "Kontakt wstępny" },
    { key: "monitoring", label: "Monitoring" },
    { key: "restrukturyzacja", label: "Restrukturyzacja" },
  ],
  standardowa: [
    { key: "wezwanie", label: "Wezwanie do zapłaty" },
    { key: "oczekiwanie_doreczenie", label: "Oczekiwanie na doręczenie" },
    { key: "po_terminie", label: "Po upływie terminu" },
    { key: "klauzula", label: "Wniosek o klauzulę" },
    { key: "egzekucja_miekka", label: "Egzekucja miękka" },
  ],
  twarda: [
    { key: "wypowiedzenie", label: "Wypowiedzenie umowy" },
    { key: "oczekiwanie_doreczenie", label: "Oczekiwanie na doręczenie" },
    { key: "klauzula", label: "Wniosek o klauzulę" },
    { key: "egzekucja_nieruchomosc", label: "Egzekucja z nieruchomości" },
    { key: "licytacja", label: "Licytacja / plan podziału" },
  ],
  karna: [
    { key: "ocena_przeslanek", label: "Ocena przesłanek" },
    { key: "zabezpieczenie_dowodow", label: "Zabezpieczenie dowodów" },
    { key: "zawiadomienie", label: "Zawiadomienie do prokuratury" },
    { key: "zlozone", label: "Złożone" },
  ],
};

export function stageLabel(path: WindPath, etap: string): string {
  return PATH_STAGES[path]?.find((s) => s.key === etap)?.label ?? etap;
}

// ── Kolory opóźnienia ────────────────────────────────────────────────
export function delayColorClass(days: number): string {
  if (days <= 14) return "text-green-700 dark:text-green-400";
  if (days <= 30) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export function recommendedPathForDelay(days: number): WindPath {
  if (days <= 14) return "miekka";
  if (days <= 30) return "standardowa";
  return "twarda";
}

// ── Doręczenia: data skuteczna i termin 7 dni ────────────────────────
function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** Pisma, które mogą ustanawiać skutek doręczenia (zwykła korespondencja). */
const DELIVERY_EVENT_TYPES: WindEventType[] = ["pismo_doreczone", "pismo_awizo", "pismo_zwrot"];

/**
 * Zwraca datę skutecznego doręczenia ostatniego pisma (rzeczywiste doręczenie
 * albo fikcja doręczenia: upływ terminu / zwrot), o ile da się ją ustalić.
 */
export function effectiveDeliveryDate(events: WindEventLite[]): string | null {
  const candidates = events
    .filter(
      (e) =>
        DELIVERY_EVENT_TYPES.includes(e.typ) &&
        e.data_doreczenia &&
        (e.status_doreczenia === "doreczone" ||
          e.status_doreczenia === "termin_uplynal" ||
          e.status_doreczenia === "zwrot"),
    )
    .map((e) => e.data_doreczenia as string)
    .sort((a, b) => b.localeCompare(a));
  return candidates[0] ?? null;
}

export interface NextActionSuggestion {
  text: string;
  /** Sugerowany typ działania (do podświetlenia przycisku), opcjonalnie. */
  hint?:
    | "sms"
    | "telefon"
    | "email"
    | "pismo"
    | "doreczenie"
    | "dokument"
    | "czynnosc_sadowa"
    | "zamknij"
    | "eskalacja";
  urgent?: boolean;
}

const TERM_DAYS = 7;

/**
 * Sugeruje kolejny krok zgodnie z procedurą — na podstawie ścieżki, etapu,
 * zdarzeń i upływu terminów. To kluczowy element UX karty sprawy.
 */
export function suggestNextAction(
  c: WindCaseLite,
  events: WindEventLite[],
  nowISO: string,
): NextActionSuggestion {
  const now = new Date(nowISO).getTime();
  const has = (t: WindEventType) => events.some((e) => e.typ === t);
  const paid = has("wplata");

  // Wpłata domyka sprawę niezależnie od etapu.
  if (c.kwota_zalegla <= 0) {
    return {
      text: "Zaległość uregulowana — zamknij sprawę z wynikiem „spłacona”.",
      hint: "zamknij",
    };
  }

  if (c.sciezka === "miekka") {
    if (c.etap === "kontakt_wstepny") {
      if (!has("sms") && !has("telefon")) {
        return {
          text: "Wykonaj kontakt wstępny: wyślij SMS z przypomnieniem i zadzwoń do dłużnika.",
          hint: "sms",
        };
      }
      return {
        text: "Kontakt wykonany. Wybierz wariant: deklaracja spłaty (monitoring), przesunięcie terminu, restrukturyzacja albo eskalacja do ścieżki standardowej.",
        hint: "dokument",
      };
    }
    if (c.etap === "monitoring") {
      if (c.opoznienie_dni > 14) {
        return {
          text: "Minął termin monitoringu bez wpłaty — eskaluj do ścieżki standardowej (wezwanie do zapłaty).",
          hint: "eskalacja",
          urgent: true,
        };
      }
      return {
        text: "Monitoring w toku — czekaj na zadeklarowaną wpłatę lub ustaw przypomnienie.",
        hint: "notatka" as never,
      };
    }
    return {
      text: "Restrukturyzacja w toku — monitoruj realizację nowego harmonogramu.",
      hint: "dokument",
    };
  }

  if (c.sciezka === "standardowa") {
    if (!has("dokument_wygenerowany") && c.etap === "wezwanie") {
      return {
        text: "Wygeneruj wezwanie do zapłaty z 7-dniowym terminem, wyślij e-mailem (jeśli zgoda) i nadaj listem poleconym.",
        hint: "dokument",
        urgent: true,
      };
    }
    if (!has("pismo_nadane")) {
      return {
        text: "Nadaj wezwanie listem poleconym i dodaj zdarzenie „pismo nadane” z numerem nadania (dowód krytyczny).",
        hint: "pismo",
        urgent: true,
      };
    }
    const delivery = effectiveDeliveryDate(events);
    if (!delivery) {
      return {
        text: "Oczekiwanie na doręczenie — po otrzymaniu zwrotki/awizo zaktualizuj status doręczenia pisma.",
        hint: "doreczenie",
      };
    }
    const deadline = new Date(addDaysISO(delivery, TERM_DAYS)).getTime();
    if (now < deadline) {
      const days = Math.ceil((deadline - now) / 86_400_000);
      return {
        text: `Biegnie 7-dniowy termin od doręczenia — pozostało ${days} dni. Czekaj na wpłatę.`,
        hint: "doreczenie",
      };
    }
    return {
      text: "Upłynął 7-dniowy termin od doręczenia wezwania — złóż wniosek o nadanie klauzuli wykonalności (art. 777).",
      hint: "czynnosc_sadowa",
      urgent: true,
    };
  }

  if (c.sciezka === "twarda") {
    if (!has("dokument_wygenerowany") && c.etap === "wypowiedzenie") {
      return {
        text: "Wygeneruj wypowiedzenie umowy — całość staje się wymagalna z odsetkami maksymalnymi. Nadaj listem poleconym.",
        hint: "dokument",
        urgent: true,
      };
    }
    if (!has("pismo_nadane")) {
      return {
        text: "Nadaj wypowiedzenie listem poleconym i odnotuj „pismo nadane”.",
        hint: "pismo",
        urgent: true,
      };
    }
    const delivery = effectiveDeliveryDate(events);
    if (!delivery) {
      return {
        text: "Oczekiwanie na doręczenie wypowiedzenia — zaktualizuj status po zwrotce/awizo.",
        hint: "doreczenie",
      };
    }
    return {
      text: "Wypowiedzenie skutecznie doręczone — złóż wniosek o klauzulę, a następnie wniosek do komornika o egzekucję z nieruchomości.",
      hint: "czynnosc_sadowa",
      urgent: true,
    };
  }

  // karna
  if (c.etap === "ocena_przeslanek") {
    return {
      text: "Oceń przesłanki karne (art. 286 — oszustwo lub art. 297 — oszustwo kredytowe) i przejdź do zabezpieczenia dowodów.",
      hint: "notatka" as never,
    };
  }
  if (c.etap === "zabezpieczenie_dowodow") {
    return {
      text: "Skompletuj dowody (wniosek, umowa, oświadczenia, historia rachunku, wydruki KRS/CEIDG/KW) i wygeneruj zawiadomienie.",
      hint: "dokument",
    };
  }
  if (c.etap === "zawiadomienie") {
    return {
      text: "Złóż zawiadomienie do prokuratury. Pamiętaj: ścieżkę cywilną prowadź równolegle.",
      hint: "czynnosc_sadowa",
      urgent: true,
    };
  }
  return {
    text: "Zawiadomienie złożone — monitoruj postępowanie, równolegle prowadź egzekucję cywilną.",
    hint: "notatka" as never,
  };
}

/** Czy sprawa wymaga działania dziś (upłynął termin / brak ruchu). */
export function needsActionToday(
  c: WindCaseLite,
  events: WindEventLite[],
  nowISO: string,
): boolean {
  if (c.kwota_zalegla <= 0) return false;
  const s = suggestNextAction(c, events, nowISO);
  return Boolean(s.urgent);
}

// ── Dokumenty dostępne na danym etapie/ścieżce ───────────────────────
export type WindDocumentType =
  | "wezwanie"
  | "wypowiedzenie"
  | "wniosek_klauzula"
  | "wniosek_komornik"
  | "aneks"
  | "porozumienie"
  | "ugoda"
  | "zawiadomienie_286"
  | "zawiadomienie_297"
  | "notatka";

export const DOCUMENT_LABELS: Record<WindDocumentType, string> = {
  wezwanie: "Wezwanie do zapłaty",
  wypowiedzenie: "Wypowiedzenie umowy",
  wniosek_klauzula: "Wniosek o nadanie klauzuli wykonalności",
  wniosek_komornik: "Wniosek do komornika o egzekucję",
  aneks: "Aneks do umowy",
  porozumienie: "Porozumienie ratalne",
  ugoda: "Ugoda przedsądowa",
  zawiadomienie_286: "Zawiadomienie o przestępstwie (art. 286 k.k.)",
  zawiadomienie_297: "Zawiadomienie o przestępstwie (art. 297 k.k.)",
  notatka: "Notatka",
};

// ── Etykiety typów zdarzeń (oś czasu / raport) ───────────────────────
export const EVENT_TYPE_LABELS: Record<WindEventType, string> = {
  sms: "SMS",
  email: "E-mail",
  telefon: "Telefon",
  pismo_nadane: "Pismo nadane",
  pismo_doreczone: "Pismo doręczone",
  pismo_awizo: "Awizo",
  pismo_zwrot: "Zwrot przesyłki",
  wplata: "Wpłata",
  dokument_wygenerowany: "Dokument wygenerowany",
  zmiana_etapu: "Zmiana etapu",
  notatka: "Notatka",
  czynnosc_sadowa: "Czynność sądowa",
};

export const DELIVERY_STATUS_LABELS: Record<WindDeliveryStatus, string> = {
  oczekuje: "oczekuje na doręczenie",
  doreczone: "doręczone",
  awizowane: "awizowane",
  termin_uplynal: "termin upłynął (fikcja doręczenia)",
  zwrot: "zwrot — fikcja doręczenia",
};

/** Termin (ISO) liczony jako data skutecznego doręczenia + 7 dni, jeśli ustalono. */
export function deliveryDeadline(deliveryISO?: string | null): string | null {
  if (!deliveryISO) return null;
  return addDaysISO(deliveryISO, TERM_DAYS);
}

export function documentsForPath(path: WindPath): WindDocumentType[] {
  switch (path) {
    case "miekka":
      return ["aneks", "porozumienie", "notatka"];
    case "standardowa":
      return ["wezwanie", "porozumienie", "wniosek_klauzula", "notatka"];
    case "twarda":
      return ["wypowiedzenie", "ugoda", "wniosek_klauzula", "wniosek_komornik", "notatka"];
    case "karna":
      return ["zawiadomienie_286", "zawiadomienie_297", "notatka"];
  }
}

// ════════════════════════════════════════════════════════════════════
// PRZEWODNIK KROK PO KROKU (asystent dla inwestora).
// Każdy etap ma: prosty opis „co teraz zrobić i dlaczego", podstawę prawną
// (przepisy, na podstawie których działamy) oraz JEDNO główne działanie.
// Cel: inwestor nie musi znać procedury — klika „Dalej".
// ════════════════════════════════════════════════════════════════════

/** Jedno, główne działanie przypisane do kroku przewodnika. */
export type StepActionKind =
  | "sms"
  | "telefon"
  | "email"
  | "pismo"
  | "doreczenie"
  | "dokument"
  | "wplata"
  | "notatka"
  | "etap"
  | "info";

export interface StepGuide {
  /** Krótki, zrozumiały tytuł kroku. */
  tytul: string;
  /** Prosty język: co teraz zrobić i po co. */
  opis: string;
  /** Przepisy, na podstawie których działamy na tym etapie. */
  podstawa_prawna: string[];
  /** Jedno główne działanie do wykonania (przycisk „zrób to teraz"). */
  akcja: StepActionKind;
  /** Etykieta przycisku głównego działania. */
  akcjaLabel: string;
  /** Jeśli akcja = „dokument" — jaki dokument zaproponować. */
  dokumentTyp?: WindDocumentType;
}

const STEP_GUIDE: Record<WindPath, Record<string, StepGuide>> = {
  miekka: {
    kontakt_wstepny: {
      tytul: "Skontaktuj się z klientem",
      opis: "Najpierw spokojnie przypomnij o zaległości — SMS-em i telefonicznie. Na tym etapie nie straszymy sądem, tylko ustalamy, kiedy klient zapłaci.",
      podstawa_prawna: [
        "art. 354 k.c. — dłużnik powinien wykonać zobowiązanie zgodnie z jego treścią",
        "art. 481 § 1 k.c. — za czas opóźnienia należą się odsetki",
      ],
      akcja: "sms",
      akcjaLabel: "Wyślij SMS z przypomnieniem",
    },
    monitoring: {
      tytul: "Czekaj na zadeklarowaną wpłatę",
      opis: "Klient obiecał spłatę. Odnotuj wpłatę, gdy wpłynie. Jeśli termin minie bez zapłaty, system zaproponuje przejście do oficjalnego wezwania.",
      podstawa_prawna: ["art. 451 k.c. — wpłaty zaliczamy kolejno: koszty → odsetki → kapitał"],
      akcja: "wplata",
      akcjaLabel: "Odnotuj wpłatę",
    },
    restrukturyzacja: {
      tytul: "Rozłóż dług na raty (porozumienie)",
      opis: "Jeśli klient chce płacić, ale nie naraz — podpiszcie porozumienie ratalne. To wciąż tańsze i szybsze niż sąd.",
      podstawa_prawna: [
        "art. 917 k.c. — ugoda (wzajemne ustępstwa stron)",
        "art. 353¹ k.c. — swoboda kształtowania treści umowy",
      ],
      akcja: "dokument",
      akcjaLabel: "Przygotuj porozumienie ratalne",
      dokumentTyp: "porozumienie",
    },
  },
  standardowa: {
    wezwanie: {
      tytul: "Wyślij oficjalne wezwanie do zapłaty",
      opis: "Czas na pismo z twardym terminem 7 dni. To formalny warunek, by później ruszyć z egzekucją. Wygeneruj dokument — dane klienta wstawimy automatycznie.",
      podstawa_prawna: [
        "art. 455 k.c. — wezwanie wyznacza termin spełnienia świadczenia",
        "art. 476 k.c. — po terminie dłużnik pozostaje w zwłoce",
        "art. 481 § 2¹ k.c. — odsetki maksymalne za opóźnienie",
      ],
      akcja: "dokument",
      akcjaLabel: "Wygeneruj wezwanie do zapłaty",
      dokumentTyp: "wezwanie",
    },
    oczekiwanie_doreczenie: {
      tytul: "Nadaj pismo i czekaj na doręczenie",
      opis: "Wyślij wezwanie listem poleconym i zapisz numer nadania — to dowód. Gdy wróci zwrotka albo awizo, odnotuj doręczenie. Od tej daty liczy się 7 dni.",
      podstawa_prawna: [
        "art. 61 § 1 k.c. — oświadczenie jest skuteczne, gdy adresat mógł się z nim zapoznać",
        "tzw. fikcja doręczenia — dwukrotne awizo / zwrot traktujemy jak doręczenie",
      ],
      akcja: "pismo",
      akcjaLabel: "Dodaj nadane pismo",
    },
    po_terminie: {
      tytul: "Minął termin — przygotuj wniosek o klauzulę",
      opis: "7 dni minęło, klient nie zapłacił. Jeśli macie akt notarialny 777, możecie iść prosto do sądu po klauzulę wykonalności — bez całego procesu.",
      podstawa_prawna: [
        "art. 777 § 1 pkt 5 k.p.c. — akt notarialny jako tytuł egzekucyjny",
        "art. 781 k.p.c. — sąd nadaje klauzulę wykonalności",
      ],
      akcja: "dokument",
      akcjaLabel: "Wygeneruj wniosek o klauzulę",
      dokumentTyp: "wniosek_klauzula",
    },
    klauzula: {
      tytul: "Złóż wniosek o klauzulę w sądzie",
      opis: "Zanieś lub wyślij wniosek do sądu i odnotuj to jako czynność sądową. Sąd nada klauzulę — wtedy masz tytuł wykonawczy dla komornika.",
      podstawa_prawna: [
        "art. 776 k.p.c. — podstawą egzekucji jest tytuł wykonawczy",
        "art. 781 § 1 k.p.c. — właściwość sądu do nadania klauzuli",
      ],
      akcja: "notatka",
      akcjaLabel: "Odnotuj złożenie wniosku",
    },
    egzekucja_miekka: {
      tytul: "Skieruj sprawę do komornika",
      opis: "Masz tytuł wykonawczy. Złóż wniosek do komornika o egzekucję z konta, wynagrodzenia lub ruchomości dłużnika.",
      podstawa_prawna: [
        "art. 796 k.p.c. — wszczęcie egzekucji na wniosek wierzyciela",
        "art. 889 i nast. k.p.c. — egzekucja z rachunku bankowego",
      ],
      akcja: "dokument",
      akcjaLabel: "Wygeneruj wniosek do komornika",
      dokumentTyp: "wniosek_komornik",
    },
  },
  twarda: {
    wypowiedzenie: {
      tytul: "Wypowiedz umowę",
      opis: "Sytuacja jest poważna. Wypowiedzenie sprawia, że CAŁY dług staje się od razu wymagalny — odsetki liczymy wtedy od całości (kapitał, odsetki, prowizja, dopłaty), a nie tylko od zaległych rat. Wygeneruj pismo i wyślij listem poleconym.",
      podstawa_prawna: [
        "art. 723 k.c. — termin zwrotu pożyczki po wypowiedzeniu",
        "postanowienia umowy o przesłankach i terminie wypowiedzenia",
        "art. 481 § 2¹ k.c. — odsetki maksymalne od całej wymagalnej kwoty",
      ],
      akcja: "dokument",
      akcjaLabel: "Wygeneruj wypowiedzenie umowy",
      dokumentTyp: "wypowiedzenie",
    },
    oczekiwanie_doreczenie: {
      tytul: "Doręcz wypowiedzenie",
      opis: "Nadaj wypowiedzenie listem poleconym i zapisz dowód nadania. Wypowiedzenie działa dopiero, gdy dotrze do dłużnika (lub po awizo/zwrocie).",
      podstawa_prawna: [
        "art. 61 § 1 k.c. — skuteczność oświadczenia z chwilą możliwości zapoznania się",
      ],
      akcja: "pismo",
      akcjaLabel: "Dodaj nadane wypowiedzenie",
    },
    klauzula: {
      tytul: "Uzyskaj klauzulę wykonalności",
      opis: "Po skutecznym wypowiedzeniu złóż wniosek o klauzulę do aktu 777. To otwiera drogę do egzekucji z nieruchomości (hipoteki).",
      podstawa_prawna: [
        "art. 777 § 1 pkt 5 k.p.c. — akt notarialny jako tytuł egzekucyjny",
        "art. 781 k.p.c. — nadanie klauzuli wykonalności",
      ],
      akcja: "dokument",
      akcjaLabel: "Wygeneruj wniosek o klauzulę",
      dokumentTyp: "wniosek_klauzula",
    },
    egzekucja_nieruchomosc: {
      tytul: "Egzekucja z nieruchomości",
      opis: "Złóż do komornika wniosek o egzekucję z nieruchomości obciążonej hipoteką. Komornik zajmie nieruchomość i rozpocznie procedurę licytacji.",
      podstawa_prawna: [
        "art. 921 i nast. k.p.c. — egzekucja z nieruchomości",
        "art. 65 ustawy o księgach wieczystych i hipotece — zaspokojenie z hipoteki",
      ],
      akcja: "dokument",
      akcjaLabel: "Wygeneruj wniosek do komornika",
      dokumentTyp: "wniosek_komornik",
    },
    licytacja: {
      tytul: "Licytacja i podział sumy",
      opis: "Komornik prowadzi licytację. Monitoruj postępowanie i odnotowuj kolejne czynności — z uzyskanej sumy zaspokoisz się jako wierzyciel hipoteczny.",
      podstawa_prawna: [
        "art. 1023 k.p.c. — plan podziału sumy uzyskanej z egzekucji",
        "art. 1025 k.p.c. — kolejność zaspokojenia wierzycieli",
      ],
      akcja: "notatka",
      akcjaLabel: "Odnotuj czynność / postęp",
    },
  },
  karna: {
    ocena_przeslanek: {
      tytul: "Oceń, czy to oszustwo",
      opis: "Jeśli klient od początku nie zamierzał spłacać (zero wpłat, fałszywe dane, zerwany kontakt), to może być przestępstwo. Zapisz swoje ustalenia w notatce.",
      podstawa_prawna: [
        "art. 286 § 1 k.k. — oszustwo (zamiar niewywiązania się od początku)",
        "art. 297 § 1 k.k. — oszustwo kredytowe (nierzetelne dokumenty)",
      ],
      akcja: "notatka",
      akcjaLabel: "Zapisz ocenę przesłanek",
    },
    zabezpieczenie_dowodow: {
      tytul: "Zbierz dowody",
      opis: "Skompletuj wniosek, umowę, oświadczenia klienta, historię rachunku i wydruki (KRS/CEIDG/KW). To załączniki do zawiadomienia dla prokuratury.",
      podstawa_prawna: ["art. 304 § 1 k.p.k. — społeczny obowiązek zawiadomienia o przestępstwie"],
      akcja: "pismo",
      akcjaLabel: "Dodaj dokument do akt",
    },
    zawiadomienie: {
      tytul: "Złóż zawiadomienie do prokuratury",
      opis: "Wygeneruj zawiadomienie o podejrzeniu przestępstwa i złóż je w prokuraturze. Ścieżkę cywilną (odzyskanie pieniędzy) prowadź dalej równolegle.",
      podstawa_prawna: [
        "art. 286 § 1 k.k. / art. 297 § 1 k.k. — kwalifikacja czynu",
        "art. 304 k.p.k. — zawiadomienie o przestępstwie",
      ],
      akcja: "dokument",
      akcjaLabel: "Wygeneruj zawiadomienie",
      dokumentTyp: "zawiadomienie_286",
    },
    zlozone: {
      tytul: "Zawiadomienie złożone — monitoruj",
      opis: "Prokuratura prowadzi postępowanie. Odnotowuj korespondencję i decyzje. Równolegle dochodź należności w postępowaniu cywilnym/egzekucyjnym.",
      podstawa_prawna: ["art. 305 k.p.k. — wszczęcie lub odmowa wszczęcia śledztwa"],
      akcja: "notatka",
      akcjaLabel: "Odnotuj postęp sprawy",
    },
  },
};

/** Zwraca przewodnik dla danego etapu (z bezpiecznym fallbackiem). */
export function stepGuide(path: WindPath, etap: string): StepGuide {
  return (
    STEP_GUIDE[path]?.[etap] ?? {
      tytul: stageLabel(path, etap),
      opis: "Wykonaj działanie zgodnie z procedurą lub zmień etap sprawy.",
      podstawa_prawna: [],
      akcja: "notatka",
      akcjaLabel: "Dodaj notatkę",
    }
  );
}

/**
 * Indeks etapu w ścieżce (do paska „Krok X z Y"). Zwraca {index, total}.
 */
export function stageProgress(path: WindPath, etap: string): { index: number; total: number } {
  const stages = PATH_STAGES[path] ?? [];
  const idx = stages.findIndex((s) => s.key === etap);
  return { index: idx < 0 ? 0 : idx, total: stages.length };
}
