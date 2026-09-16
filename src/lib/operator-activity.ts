/**
 * Podsumowanie aktywności operatorów — czysta logika widoku.
 *
 * Liczenie dzieje się w bazie (RPC `get_operator_activity_summary`), tutaj
 * zostaje to, co da się sprawdzić testem: kolejność wierszy, etykiety,
 * sumowanie stopki i formatowanie dat.
 */

export type RoleFilter = "all" | "operator" | "posrednik" | "administrator";

export const ROLE_LABELS: Record<string, string> = {
  administrator: "Administrator",
  operator: "Operator",
  operator_wewnetrzny: "Operator wewnętrzny",
  posrednik: "Pośrednik",
};

export const ROLE_FILTERS: { key: RoleFilter; label: string }[] = [
  { key: "all", label: "Wszyscy" },
  { key: "operator", label: "Operatorzy" },
  { key: "posrednik", label: "Pośrednicy" },
  { key: "administrator", label: "Administratorzy" },
];

/** Okresy podsumowania. Domyślny to 30 dni — tyle samo, co licznik w karcie osoby. */
export const SUMMARY_PERIODS: { days: number; label: string }[] = [
  { days: 7, label: "7 dni" },
  { days: 30, label: "30 dni" },
  { days: 90, label: "90 dni" },
];

export const DEFAULT_SUMMARY_DAYS = 30;

/** Jedna rola pasuje do filtra. `operator_wewnetrzny` traktujemy jak operatora. */
export function matchesRoleFilter(role: string | null | undefined, filter: RoleFilter): boolean {
  if (filter === "all") return true;
  if (!role) return false;
  if (filter === "operator") return role === "operator" || role === "operator_wewnetrzny";
  return role === filter;
}

/** Wystarczy jedna pasująca rola z listy (konto może mieć ich kilka). */
export function matchesAnyRole(
  roles: readonly (string | null | undefined)[],
  filter: RoleFilter,
): boolean {
  if (filter === "all") return true;
  return roles.some((r) => matchesRoleFilter(r, filter));
}

export type OperatorActivityRow = {
  user_id: string;
  name: string | null;
  email: string | null;
  roles: string[];
  role_main: string | null;
  calls: number;
  sms: number;
  emails: number;
  messenger: number;
  chats: number;
  notes: number;
  reveals: number;
  documents: number;
  status_changes: number;
  assignments: number;
  decisions: number;
  lead_flags: number;
  other: number;
  total: number;
  leads_touched: number;
  active_days: number;
  last_action_at: string | null;
  last_sign_in_at: string | null;
};

/** Liczniki, które wolno zsumować w stopce (każde zdarzenie należy do jednej osoby). */
const ADDITIVE_KEYS = [
  "calls",
  "sms",
  "emails",
  "messenger",
  "chats",
  "notes",
  "reveals",
  "documents",
  "status_changes",
  "assignments",
  "decisions",
  "lead_flags",
  "other",
  "total",
] as const;

export type OperatorActivityTotals = Record<(typeof ADDITIVE_KEYS)[number], number> & {
  people: number;
  /** Ilu operatorów miało w okresie choć jedno zdarzenie. */
  active_people: number;
};

/** Kontakt z klientem — telefon, SMS, e-mail, Messenger/IG i czat razem. */
export function contactCount(row: OperatorActivityRow): number {
  return row.calls + row.sms + row.emails + row.messenger + row.chats;
}

/**
 * Najpierw najbardziej aktywni, przy remisie alfabetycznie — żeby wiersze
 * nie skakały między odświeżeniami, gdy kilka osób ma tyle samo zdarzeń.
 */
export function sortOperatorRows(rows: readonly OperatorActivityRow[]): OperatorActivityRow[] {
  return [...rows].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    const an = a.name || a.email || a.user_id;
    const bn = b.name || b.email || b.user_id;
    return an.localeCompare(bn, "pl");
  });
}

/**
 * Stopka tabeli. `leads_touched` i `active_days` świadomie nie są sumowane —
 * to liczności zbiorów (ten sam lead i ten sam dzień potrafią wystąpić
 * u kilku osób), więc suma byłaby zawyżona. Stopka pokazuje w tych
 * kolumnach kreskę.
 */
export function sumOperatorRows(rows: readonly OperatorActivityRow[]): OperatorActivityTotals {
  const totals = Object.fromEntries(ADDITIVE_KEYS.map((k) => [k, 0])) as Record<
    (typeof ADDITIVE_KEYS)[number],
    number
  >;
  for (const row of rows) {
    for (const key of ADDITIVE_KEYS) totals[key] += row[key];
  }
  return {
    ...totals,
    people: rows.length,
    active_people: rows.filter((r) => r.total > 0).length,
  };
}

/** Widoczna nazwa osoby: imię i nazwisko, e-mail, a w ostateczności skrót ID. */
export function displayName(row: {
  name: string | null;
  email: string | null;
  user_id: string;
}): string {
  return row.name || row.email || row.user_id.slice(0, 8);
}

/** „dziś" / „wczoraj" / „N dni temu" / data — wspólne dla feedu i podsumowania. */
export function formatRelativeDay(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "nigdy";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "nigdy";
  const days = Math.floor((now.getTime() - then.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "dziś";
  if (days === 1) return "wczoraj";
  if (days < 30) return `${days} dni temu`;
  return then.toLocaleDateString("pl-PL");
}

/** Wiadomości pisane: Messenger/IG i czat na stronie. */
export function messageCount(row: OperatorActivityRow): number {
  return row.messenger + row.chats;
}

/**
 * Reszta dziennika: podglądy danych leada, przypisania, oznaczenia
 * „nietrafiony" i wpisy audytu bez własnej kolumny. Dzięki temu kolumny
 * tabeli sumują się dokładnie do `total` — pilnuje tego test.
 */
export function otherCount(row: OperatorActivityRow): number {
  return row.reveals + row.assignments + row.lead_flags + row.other;
}

export type SummaryColumn = {
  key: string;
  label: string;
  /** Podpowiedź pod kursorem — skąd się bierze liczba. */
  hint: string;
  value: (row: OperatorActivityRow) => number;
};

/** Kolumny liczbowe tabeli. Razem dają dokładnie `row.total`. */
export const SUMMARY_COLUMNS: SummaryColumn[] = [
  {
    key: "calls",
    label: "Telefony",
    hint: "Rozmowy telefoniczne zapisane przy leadzie",
    value: (r) => r.calls,
  },
  { key: "sms", label: "SMS", hint: "SMS-y wysłane ręcznie z panelu", value: (r) => r.sms },
  {
    key: "emails",
    label: "E-maile",
    hint: "E-maile wysłane ze skrzynki panelu",
    value: (r) => r.emails,
  },
  {
    key: "messages",
    label: "Wiadomości",
    hint: "Messenger/Instagram i czat na stronie",
    value: messageCount,
  },
  { key: "notes", label: "Notatki", hint: "Notatki dopisane do leada", value: (r) => r.notes },
  {
    key: "documents",
    label: "Dokumenty",
    hint: "Pliki wgrane do wniosków",
    value: (r) => r.documents,
  },
  {
    key: "status_changes",
    label: "Statusy",
    hint: "Zmiany statusu wniosku lub leada",
    value: (r) => r.status_changes,
  },
  {
    key: "decisions",
    label: "Decyzje",
    hint: "Decyzje w sprawie wniosków",
    value: (r) => r.decisions,
  },
  {
    key: "other",
    label: "Inne",
    hint: "Podglądy danych leada, przypisania, oznaczenia „nietrafiony” i pozostałe wpisy dziennika",
    value: otherCount,
  },
];
