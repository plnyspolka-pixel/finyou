// Centralne mapowanie wartości technicznych (z bazy) na polskie etykiety dla UI.

import { LOAN_STATUS_SHORT_LABELS } from "./loan-status";

// Status wniosku pożyczkowego — JEDNO źródło prawdy w `loan-status.ts`
// (zsynchronizowane z enumem `public.loan_status`). Tu tylko re-eksport dla UI.
export const loanStatusLabels = LOAN_STATUS_SHORT_LABELS;

// Status leada (pipeline sprzedażowy) — odrębna domena od cyklu życia wniosku.
export const leadStatusLabels: Record<string, string> = {
  nowy: "Nowy",
  w_kontakcie: "W kontakcie",
  rozmowa: "Po rozmowie",
  wniosek_wyslany: "Wniosek wysłany",
  wniosek_zlozony: "Wniosek złożony",
  zakwalifikowany: "Zakwalifikowany",
  odrzucony: "Odrzucony",
  zamkniety: "Zamknięty",
  bad_lead: "Zły lead",
};

export const propertyTypeLabels: Record<string, string> = {
  mieszkanie: "Mieszkanie",
  dom: "Dom",
  lokal_uslugowy: "Lokal usługowy",
  dzialka_budowlana: "Działka budowlana",
  grunt_rolny: "Grunt rolny",
  udzial_w_nieruchomosci: "Udział w nieruchomości",
  inna: "Inna nieruchomość",
};

export const contactChannelLabels: Record<string, string> = {
  telefon: "Telefon",
  sms: "SMS",
  email: "E-mail",
  voicebot: "Voicebot",
  notatka: "Notatka",
  system: "System",
};

export const contactDirectionLabels: Record<string, string> = {
  wychodzacy: "Wychodzący",
  przychodzacy: "Przychodzący",
  wewnetrzny: "Wewnętrzny",
};

export const investorTypeLabels: Record<string, string> = {
  indywidualny: "Indywidualny",
  instytucjonalny: "Instytucjonalny",
};

export const subscriptionPlanLabels: Record<string, string> = {
  podstawowy: "Podstawowy",
  rozszerzony: "Rozszerzony",
  profesjonalny: "Profesjonalny",
};

export const subscriptionStatusLabels: Record<string, string> = {
  aktywny: "Aktywny",
  nieaktywny: "Nieaktywny",
  wstrzymany: "Wstrzymany",
  probny: "Próbny",
};

export const distributionStatusLabels: Record<string, string> = {
  szkic: "Szkic",
  gotowe_do_wysylki: "Gotowe do wysyłki",
  wyslane: "Wysłane",
  otworzone: "Otworzone",
  odpowiedz_otrzymana: "Odpowiedź otrzymana",
  prosba_o_dodatkowe_informacje: "Prośba o dodatkowe informacje",
  oferta_otrzymana: "Oferta otrzymana",
  odrzucone: "Odrzucone",
  brak_odpowiedzi: "Brak odpowiedzi",
  zamkniete: "Zamknięte",
};

export const offerStatusLabels: Record<string, string> = {
  szkic: "Szkic",
  zlozona: "Złożona",
  w_trakcie_weryfikacji: "W trakcie weryfikacji",
  zatwierdzona_przez_administratora: "Zatwierdzona przez administratora",
  odrzucona_przez_administratora: "Odrzucona przez administratora",
  wyslana_do_klienta: "Wysłana do klienta",
  zaakceptowana_przez_klienta: "Zaakceptowana przez klienta",
  odrzucona_przez_klienta: "Odrzucona przez klienta",
  wygasla: "Wygasła",
};

export const repaymentTypeLabels: Record<string, string> = {
  miesieczna: "Spłata miesięczna",
  balonowa: "Spłata balonowa",
  mieszana: "Spłata mieszana",
};

export const visibilityLabels: Record<string, string> = {
  zanonimizowane: "Zanonimizowane",
  czesciowe: "Częściowe",
  pelne: "Pełne",
};

export const integrationStatusLabels: Record<string, string> = {
  niepolaczona: "Niepołączona",
  polaczona: "Połączona",
  blad: "Błąd",
  wymaga_konfiguracji: "Wymaga konfiguracji",
  wylaczona: "Wyłączona",
};

export const roleLabels: Record<string, string> = {
  administrator: "Administrator",
  operator: "Operator",
  klient: "Klient",
  inwestor: "Inwestor",
};

export function formatPLN(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium" }).format(d);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

/** Kwota w zł bez symbolu waluty, zaokrąglona do pełnych złotych (np. „12 500 zł"). */
export function formatPLNCompact(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pl-PL").format(Math.round(Number(value))) + " zł";
}

/** Czas względny po polsku (np. „5 min temu", „wczoraj"), z fallbackiem na datę. */
export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "przed chwilą";
  if (m < 60) return `${m} min temu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h temu`;
  const days = Math.floor(h / 24);
  if (days === 1) return "wczoraj";
  if (days < 7) return `${days} dni temu`;
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short" }).format(d);
}
