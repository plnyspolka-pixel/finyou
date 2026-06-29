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
