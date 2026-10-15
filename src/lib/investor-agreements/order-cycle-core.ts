// Czyste reguły cyklu Zlecenie–Projekt (Etap U2, pakiet FY-LEGAL-2026-09-29).
// Bez I/O — wszystko testowalne jednostkowo. Źródła: Umowa ramowa v7 (§ 5–7,
// Zał. 1 Karta Leada, Zał. 6, Zał. 7), NDA v6 (§ 5, § 7), plik 00 paczki.

/** Statusy Dopasowania (para Zlecenie–Projekt) — cykl z § 5 Umowy ramowej. */
import { FY_COMMISSION_MIN_PLN, FY_COMMISSION_PCT, fyCommission } from "@/lib/contract-engine/fees";
export const MATCH_STATUSES = [
  "dopasowane", // Dopasowanie utworzone, teaser jeszcze nie udostępniony
  "teaser", // teaser anonimowy widoczny dla inwestora
  "karta_leada", // Karta Leada (Zał. 1) zaakceptowana — czeka na Kartę Transferu / Ujawnienie
  "rezerwacja", // Ujawnienie Identyfikujące + wyłączność 24 h (+12 h)
  "transakcja", // inwestor wchodzi w Transakcję (dalej: Zał. 6 przy wypłacie)
  "odrzucone", // inwestor odrzucił Projekt
  "przekazane", // przekazany do kolejnego Zlecenia (sekwencyjnie)
  "wygasle", // teaser albo rezerwacja wygasły bez decyzji
] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

/** Statusy, w których Projekt jest ZAJĘTY (wyłączność sekwencyjna — uwaga
 *  wdrożeniowa nr 2/3 paczki: ten sam Projekt tylko dla jednego zleceniodawcy
 *  naraz). Musi odpowiadać partial unique index w migracji. */
export const ACTIVE_MATCH_STATUSES: MatchStatus[] = [
  "dopasowane",
  "teaser",
  "karta_leada",
  "rezerwacja",
];

/** Statusy Dopasowania, w których inwestor widzi teaser Projektu (do
 *  Transakcji włącznie — po zawarciu umowy Projekt nadal jest „jego"). */
export const TEASER_VISIBLE_MATCH_STATUSES: MatchStatus[] = [
  ...ACTIVE_MATCH_STATUSES,
  "transakcja",
];

export interface OrderWithMatches {
  id: string;
  status: string;
  investor_order_matches?: Array<{
    id: string;
    application_id: string;
    project_ref: string | null;
    status: string;
    created_at: string;
  }> | null;
}

export interface TeaserRef {
  orderId: string;
  matchId: string;
  applicationId: string;
  projectRef: string | null;
  matchStatus: string;
  createdAt: string;
}

/**
 * Teasery WYŁĄCZNIE z Dopasowań do PRZYJĘTYCH Zleceń (§ 5 Umowy ramowej,
 * decyzja nadrzędna nr 7). Zlecenia złożone/wygasłe/cofnięte nie dają
 * żadnego teasera; bez Zlecenia — pusta lista. Najnowsze dopasowania pierwsze.
 */
export function teasersForAcceptedOrders(orders: OrderWithMatches[]): TeaserRef[] {
  const out: TeaserRef[] = [];
  for (const o of orders) {
    if (o.status !== "przyjete") continue;
    for (const m of o.investor_order_matches ?? []) {
      if (!TEASER_VISIBLE_MATCH_STATUSES.includes(m.status as MatchStatus)) continue;
      out.push({
        orderId: o.id,
        matchId: m.id,
        applicationId: m.application_id,
        projectRef: m.project_ref ?? null,
        matchStatus: m.status,
        createdAt: m.created_at,
      });
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Rezerwacja: 24 h wyłączności + jednorazowe przedłużenie o 12 h (§ 5).
 * Wartości DOMYŚLNE — źródłem prawdy są `project_module_settings`
 * (assignment_hours / extension_hours / max_active_assignments /
 * max_extended_assignments / rejection_review_threshold), które server
 * functions przekazują tu jako `OrderLimits`.
 */
export const RESERVATION_HOURS = 24;
export const RESERVATION_EXTENSION_HOURS = 12;

/**
 * Teaser: 24 h na decyzję (Karta Leada / rezerwacja / odrzucenie) +
 * jednorazowe przedłużenie o 12 h. Teaser bez decyzji wygasa i zwalnia
 * Zlecenie dla kolejnego Projektu (a Projekt — dla innych zleceniodawców).
 */
export const TEASER_HOURS = 24;
export const TEASER_EXTENSION_HOURS = 12;

/** Termin teasera: zapisany `teaser_expires_at`, a dla starszych wierszy
 *  (sprzed kolumny) — udostępnienie + 24 h (+12 h, jeśli przedłużony). */
export function teaserDeadline(m: {
  teaser_expires_at?: string | null;
  teaser_released_at?: string | null;
  created_at?: string | null;
  teaser_extended?: boolean | null;
}): Date | null {
  if (m.teaser_expires_at) return new Date(m.teaser_expires_at);
  const from = m.teaser_released_at ?? m.created_at;
  if (!from) return null;
  const hours = TEASER_HOURS + (m.teaser_extended ? TEASER_EXTENSION_HOURS : 0);
  return new Date(new Date(from).getTime() + hours * 3600_000);
}

/** Czy Dopasowanie przeterminowane: teaser po terminie albo rezerwacja po terminie. */
export function isMatchStale(
  m: {
    status: string;
    reservation_expires_at?: string | null;
    teaser_expires_at?: string | null;
    teaser_released_at?: string | null;
    created_at?: string | null;
    teaser_extended?: boolean | null;
  },
  now: Date,
): boolean {
  if (m.status === "teaser") {
    const d = teaserDeadline(m);
    return d != null && d.getTime() < now.getTime();
  }
  if (m.status === "rezerwacja") {
    return (
      Boolean(m.reservation_expires_at) &&
      new Date(m.reservation_expires_at as string).getTime() < now.getTime()
    );
  }
  return false;
}

/** Okno „świeżości" Projektu względem złożenia Zlecenia (dni wstecz). */
export const PROJECT_WINDOW_DAYS_BEFORE_ORDER = 3;

export function projectWindowStart(order: { submitted_at?: string | null }): Date {
  const base = order.submitted_at ? new Date(order.submitted_at) : new Date();
  return new Date(base.getTime() - PROJECT_WINDOW_DAYS_BEFORE_ORDER * 24 * 3600 * 1000);
}

/**
 * Data „pojawienia się" Projektu: utworzenie wniosku albo — gdy do starszego
 * wniosku scalono nowszy duplikat (ten sam klient dodany ponownie, np. przez
 * operatora) — utworzenie najnowszego scalonego wniosku. Dzięki temu klient
 * dodany dziś do istniejącej karty jest dla inwestora nowym Projektem.
 */
export function projectFreshAt(createdAt: string, latestMergedAt?: string | null): string {
  if (latestMergedAt && new Date(latestMergedAt).getTime() > new Date(createdAt).getTime()) {
    return latestMergedAt;
  }
  return createdAt;
}

export interface OrderLimits {
  /** Godziny rezerwacji po Ujawnieniu. */
  assignmentHours: number;
  /** Godziny jednorazowego przedłużenia. */
  extensionHours: number;
  /** Maks. przyjętych Zleceń / aktywnych rezerwacji naraz. */
  maxActive: number;
  /** Maks. przedłużonych rezerwacji naraz. */
  maxExtended: number;
  /** Po tylu odrzuceniach Zlecenie wygasa. */
  rejectionThreshold: number;
  /** Maks. okres Finansowania w Zleceniu (miesiące). */
  maxPeriodMonths: number;
}

export const DEFAULT_ORDER_LIMITS: OrderLimits = {
  assignmentHours: RESERVATION_HOURS,
  extensionHours: RESERVATION_EXTENSION_HOURS,
  maxActive: 5,
  maxExtended: 2,
  rejectionThreshold: 5,
  maxPeriodMonths: 120,
};

/** Mapowanie wiersza project_module_settings → limity cyklu Zlecenia. */
export function orderLimitsFromSettings(
  s: {
    assignment_hours?: number | null;
    extension_hours?: number | null;
    max_active_assignments?: number | null;
    max_extended_assignments?: number | null;
    rejection_review_threshold?: number | null;
    max_period_months?: number | null;
  } | null,
): OrderLimits {
  const n = (v: number | null | undefined, d: number) =>
    Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d;
  return {
    assignmentHours: n(s?.assignment_hours, DEFAULT_ORDER_LIMITS.assignmentHours),
    extensionHours: n(s?.extension_hours, DEFAULT_ORDER_LIMITS.extensionHours),
    maxActive: n(s?.max_active_assignments, DEFAULT_ORDER_LIMITS.maxActive),
    maxExtended: n(s?.max_extended_assignments, DEFAULT_ORDER_LIMITS.maxExtended),
    rejectionThreshold: n(s?.rejection_review_threshold, DEFAULT_ORDER_LIMITS.rejectionThreshold),
    maxPeriodMonths: Math.min(120, n(s?.max_period_months, DEFAULT_ORDER_LIMITS.maxPeriodMonths)),
  };
}

export function reservationDeadline(from: Date, hours: number = RESERVATION_HOURS): Date {
  return new Date(from.getTime() + hours * 3600_000);
}

export function extendedReservationDeadline(
  current: Date,
  hours: number = RESERVATION_EXTENSION_HOURS,
): Date {
  return new Date(current.getTime() + hours * 3600_000);
}

/** Prowizja od Pożyczkobiorcy: 5% kwoty Finansowania, nie mniej niż 5000 zł
 *  (Zał. 6 — dyspozycja Klienta i klauzula prowizyjna przy wypłacie). */
export const PROVISION_RATE = FY_COMMISSION_PCT / 100;
export const PROVISION_MIN_PLN = FY_COMMISSION_MIN_PLN;

/** Deleguje do fees.ts (jedno źródło); brak kwoty → kwota minimalna. */
export function clientProvisionPln(payoutAmountPln: number): number {
  if (!Number.isFinite(payoutAmountPln) || payoutAmountPln <= 0) return PROVISION_MIN_PLN;
  return fyCommission(payoutAmountPln);
}

/** Role, które razem oznaczają finansowanie ze środków własnych Finance You
 *  (administrator, który jest też inwestorem) — bez prowizji Finance You. */
export const FY_COMMISSION_TOGGLE_ROLES = ["inwestor", "administrator"] as const;

/** Czy użytkownik ma JEDNOCZEŚNIE uprawnienia inwestora i administratora,
 *  czyli finansuje Projekty sam (Finance You nie pośredniczy sama u siebie). */
export function canToggleFyCommission(roles: readonly string[] | null | undefined): boolean {
  const set = new Set(roles ?? []);
  return FY_COMMISSION_TOGGLE_ROLES.every((r) => set.has(r));
}

/** Alias czytelniejszy w miejscach wyceny: finansowanie własne = bez prowizji FY. */
export const isSelfFinancingInvestor = canToggleFyCommission;

/** Wartość flagi do zapisu w Zleceniu. Administrator-inwestor finansuje sam —
 *  prowizji Finance You nie ma nigdy (bez względu na żądanie). Pozostali
 *  inwestorzy: prowizja zawsze włączona. */
export function resolveFyCommissionEnabled(
  roles: readonly string[] | null | undefined,
  _requested?: boolean,
): boolean {
  return !isSelfFinancingInvestor(roles);
}

/** Zlecenie: jedyny parametr to kwota maksymalna (Zał. 7) — Projekt pasuje,
 *  gdy jego kwota nie przekracza kwoty Zlecenia. */
export function amountMatchesOrder(orderMaxAmountPln: number, projectAmountPln: number): boolean {
  if (!(orderMaxAmountPln > 0) || !(projectAmountPln > 0)) return false;
  return projectAmountPln <= orderMaxAmountPln;
}

/** Konsument: prawo odstąpienia od Umowy ramowej — 14 dni od akceptacji
 *  (§ 15, wzór odstąpienia: Załącznik nr 4). */
export const WITHDRAWAL_DAYS = 14;

export function withdrawalDeadline(acceptedAt: Date): Date {
  return new Date(acceptedAt.getTime() + WITHDRAWAL_DAYS * 24 * 3600_000);
}

export function isWithinWithdrawalWindow(acceptedAt: Date, now: Date): boolean {
  return now.getTime() <= withdrawalDeadline(acceptedAt).getTime();
}

/** Kara Obejściowa wobec Konsumenta (NDA § 7 / Umowa ramowa § 15):
 *  wymaga rzeczywistego, indywidualnego uzgodnienia PRZED Ujawnieniem,
 *  w odrębnym oświadczeniu ze sposobem obliczenia i przykładem kwotowym. */
export function consumerKaraStatement(sumaHipotecznaExamplePln: number): {
  sposob_obliczenia: string;
  przyklad_kwotowy: string;
  stawka: string;
} {
  const example = Math.round(sumaHipotecznaExamplePln * 0.05 * 100) / 100;
  return {
    stawka: "5% Sumy Hipotecznej",
    sposob_obliczenia:
      "Kara Obejściowa = 5% Sumy Hipotecznej, tj. sumy hipoteki (hipotek) zabezpieczających Transakcję Chronioną; niezależnie od wpisu w księdze wieczystej, jeżeli Transakcja Chroniona doszła do skutku z pominięciem Mechanizmu Zabezpieczenia Prowizji.",
    przyklad_kwotowy: `Przykład: przy Sumie Hipotecznej ${sumaHipotecznaExamplePln.toLocaleString("pl-PL")} zł kara wynosi 5% × ${sumaHipotecznaExamplePln.toLocaleString("pl-PL")} zł = ${example.toLocaleString("pl-PL")} zł.`,
  };
}

/** Dozwolone przejścia cyklu — walidowane w server functions. */
export function canTransition(from: MatchStatus, to: MatchStatus): boolean {
  const allowed: Record<MatchStatus, MatchStatus[]> = {
    dopasowane: ["teaser", "odrzucone", "przekazane", "wygasle"],
    teaser: ["karta_leada", "odrzucone", "przekazane", "wygasle"],
    karta_leada: ["rezerwacja", "odrzucone", "przekazane", "wygasle"],
    rezerwacja: ["transakcja", "odrzucone", "przekazane", "wygasle"],
    transakcja: [],
    odrzucone: [],
    przekazane: [],
    wygasle: [],
  };
  return allowed[from]?.includes(to) ?? false;
}

/** Payload Karty Leada (Załącznik nr 1 do Umowy ramowej, v5): pola Nr
 *  Zlecenia, Parametry, Przyjęcie/Dopasowanie + wersje dokumentów pakietu. */
export interface KartaLeadaPayload {
  projekt_ref: string;
  nr_zlecenia: string;
  parametry: {
    kwota_pln: number | null;
    okres_miesiecy: number | null;
    oprocentowanie_roczne: number | null;
    ltv: number | null;
    typ_zabezpieczenia: string | null;
    lokalizacja: string | null;
  };
  dopasowanie: { data: string };
  okres_ochronny: "5 lat od Ujawnienia Identyfikującego";
  kara_obejsciowa: "5% Sumy Hipotecznej";
  wersje_dokumentow: Array<{ code: string; version: string; sha256: string }>;
}

export function buildKartaLeada(input: {
  projectRef: string;
  orderSeq: number;
  matchedAt: Date;
  teaser: {
    loan_amount?: number | null;
    period_months?: number | null;
    annual_rate?: number | null;
    ltv?: number | null;
    property_type?: string | null;
    city?: string | null;
    voivodeship?: string | null;
  };
  documents: Array<{ code: string; version: string; sha256: string }>;
}): KartaLeadaPayload {
  const t = input.teaser;
  return {
    projekt_ref: input.projectRef,
    nr_zlecenia: `FY-Z-${input.orderSeq}`,
    parametry: {
      kwota_pln: t.loan_amount ?? null,
      okres_miesiecy: t.period_months ?? null,
      oprocentowanie_roczne: t.annual_rate ?? null,
      ltv: t.ltv ?? null,
      typ_zabezpieczenia: t.property_type ?? null,
      lokalizacja: [t.city, t.voivodeship].filter(Boolean).join(", ") || null,
    },
    dopasowanie: { data: input.matchedAt.toISOString() },
    okres_ochronny: "5 lat od Ujawnienia Identyfikującego",
    kara_obejsciowa: "5% Sumy Hipotecznej",
    wersje_dokumentow: input.documents.map((d) => ({
      code: d.code,
      version: d.version,
      sha256: d.sha256,
    })),
  };
}

/**
 * Czy inwestor ma „żywe" Zlecenie: złożone (czeka na przyjęcie) albo przyjęte
 * i jeszcze ważne. Steruje menu panelu: po złożeniu Zlecenia zakładka „Złóż
 * zlecenie" znika; wraca, gdy Zlecenie zostanie cofnięte, odrzucone,
 * wykonane lub wygaśnie — wtedy inwestor może złożyć kolejne.
 */
export function hasLiveOrder(
  orders: Array<{ status: string; expires_at?: string | null }>,
  now: Date = new Date(),
): boolean {
  return orders.some((o) => {
    if (o.status === "zlozone") return true;
    if (o.status !== "przyjete") return false;
    return !o.expires_at || new Date(o.expires_at).getTime() > now.getTime();
  });
}
