// Czyste reguły cyklu Zlecenie–Projekt (Etap U2, pakiet FY-LEGAL-2026-09-04 v5).
// Bez I/O — wszystko testowalne jednostkowo. Źródła: Umowa ramowa v5 (§ 5–6,
// Zał. 1 Karta Leada, Zał. 6, Zał. 7), NDA v5 (§ 5, § 7), plik 00 paczki.

/** Statusy Dopasowania (para Zlecenie–Projekt) — cykl z § 5 Umowy ramowej. */
export const MATCH_STATUSES = [
  "dopasowane", // Dopasowanie utworzone, teaser jeszcze nie udostępniony
  "teaser", // teaser anonimowy widoczny dla inwestora
  "karta_leada", // Karta Leada (Zał. 1) zaakceptowana — czeka na Kartę Transferu / Ujawnienie
  "rezerwacja", // Ujawnienie Identyfikujące + wyłączność 24 h (+12 h)
  "transakcja", // inwestor wchodzi w Transakcję (dalej: Zał. 6 przy wypłacie)
  "odrzucone", // inwestor odrzucił Projekt
  "przekazane", // przekazany do kolejnego Zlecenia (sekwencyjnie)
  "wygasle", // rezerwacja wygasła bez decyzji
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

/** Rezerwacja: 24 h wyłączności + jednorazowe przedłużenie o 12 h (§ 5). */
export const RESERVATION_HOURS = 24;
export const RESERVATION_EXTENSION_HOURS = 12;

export function reservationDeadline(from: Date): Date {
  return new Date(from.getTime() + RESERVATION_HOURS * 3600_000);
}

export function extendedReservationDeadline(current: Date): Date {
  return new Date(current.getTime() + RESERVATION_EXTENSION_HOURS * 3600_000);
}

/** Prowizja Klientowska: 7% kwoty Finansowania, nie mniej niż 5000 zł
 *  (Zał. 6 — dyspozycja Klienta i klauzula prowizyjna przy wypłacie). */
export const PROVISION_RATE = 0.07;
export const PROVISION_MIN_PLN = 5000;

export function clientProvisionPln(payoutAmountPln: number): number {
  if (!Number.isFinite(payoutAmountPln) || payoutAmountPln <= 0) return PROVISION_MIN_PLN;
  return Math.max(Math.round(payoutAmountPln * PROVISION_RATE * 100) / 100, PROVISION_MIN_PLN);
}

/** Zlecenie: kwota ± 15% (Zał. 7). */
export const ORDER_AMOUNT_TOLERANCE = 0.15;

export function amountMatchesOrder(orderAmountPln: number, projectAmountPln: number): boolean {
  if (!(orderAmountPln > 0) || !(projectAmountPln > 0)) return false;
  // Granice zaokrąglone do groszy — bez artefaktów zmiennoprzecinkowych.
  const lo = Math.round(orderAmountPln * (1 - ORDER_AMOUNT_TOLERANCE) * 100) / 100;
  const hi = Math.round(orderAmountPln * (1 + ORDER_AMOUNT_TOLERANCE) * 100) / 100;
  return projectAmountPln >= lo && projectAmountPln <= hi;
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
