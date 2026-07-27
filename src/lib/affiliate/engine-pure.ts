// =====================================================================
// Program pośredników — czysta logika naliczania prowizji (bez bazy danych).
// Testowalna jednostkowo. Reguły biznesowe zgodne z regulaminem:
//  - prowizja TYLKO od realnych zdarzeń gospodarczych,
//  - maksymalnie 3 poziomy sieci,
//  - brak automatycznej kompresji do wyższego poziomu,
//  - próg wypłaty 500 zł.
// =====================================================================

export const PAYOUT_THRESHOLD_PLN = 500;

export type CommissionEventType =
  | "investor_account_paid"
  | "broker_account_paid"
  | "client_funds_disbursed";

export type SettlementType = "b2b" | "unregistered_activity";

export type BasisType =
  | "fixed_amount"
  | "percent_of_net_revenue"
  | "percent_of_gross_payment"
  | "percent_of_loan_amount"
  | "percent_of_finance_you_fee"
  | "manual";

export type NetworkRecipient = { partnerId: string; level: 1 | 2 | 3 };

export type PartnerLike = {
  id: string;
  sponsor_partner_id?: string | null;
  status?: string | null;
  settlement_type?: SettlementType | null;
  bank_account_encrypted?: string | null;
};

export type EventLike = {
  event_type?: string | null;
  event_status?: string | null;
  gross_payment_amount?: number | null;
  net_revenue_amount?: number | null;
  finance_you_fee_amount?: number | null;
  loan_amount?: number | null;
};

export type RuleLike = {
  id?: string;
  basis_type: BasisType | string;
  fixed_amount?: number | null;
  percent_rate?: number | null;
  min_commission?: number | null;
  max_commission?: number | null;
};

// Zdarzenia, od których NIGDY nie naliczamy prowizji.
const NON_PAYABLE_EVENT_STATUSES = new Set([
  "cancelled",
  "refunded",
  "chargeback",
  "fraud",
  "manually_blocked",
]);

// Statusy partnera, którym NIE naliczamy prowizji (zawieszeni / odrzuceni / zakończeni).
const ELIGIBLE_PARTNER_STATUS = "active";

// Statusy prowizji wliczane do wykorzystania limitu działalności nierejestrowanej.
export const LIMIT_COUNTING_STATUSES = [
  "pending_admin_approval",
  "approved",
  "payable",
  "paid",
  "requires_invoice",
  "requires_unregistered_activity_statement",
];

export function roundMoney(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function getTaxPeriod(date: Date | string): { year: number; quarter: number } {
  const d = typeof date === "string" ? new Date(date) : date;
  return { year: d.getFullYear(), quarter: Math.floor(d.getMonth() / 3) + 1 };
}

export function isPayableEvent(eventStatus?: string | null): boolean {
  if (!eventStatus) return false;
  return !NON_PAYABLE_EVENT_STATUSES.has(eventStatus);
}

export function isEligiblePartner(partner?: PartnerLike | null): boolean {
  return Boolean(partner && partner.status === ELIGIBLE_PARTNER_STATUS);
}

/**
 * Odbiorcy prowizji sieciowej — partner bezpośredni (poziom 1) oraz jego sponsorzy
 * do poziomu 3 włącznie. NIGDY powyżej 3 poziomów.
 */
export function getNetworkRecipients(
  partnersById: Record<string, PartnerLike>,
  directPartnerId: string,
): NetworkRecipient[] {
  const recipients: NetworkRecipient[] = [];
  const direct = partnersById[directPartnerId];
  if (!direct) return recipients;
  recipients.push({ partnerId: direct.id, level: 1 });

  const l2 = direct.sponsor_partner_id ? partnersById[direct.sponsor_partner_id] : null;
  if (l2) {
    recipients.push({ partnerId: l2.id, level: 2 });
    const l3 = l2.sponsor_partner_id ? partnersById[l2.sponsor_partner_id] : null;
    if (l3) recipients.push({ partnerId: l3.id, level: 3 });
  }
  return recipients;
}

export function getBasisAmount(event: EventLike, basisType: BasisType | string): number {
  switch (basisType) {
    case "fixed_amount":
      return 1;
    case "percent_of_net_revenue":
      return Number(event.net_revenue_amount ?? 0);
    case "percent_of_gross_payment":
      return Number(event.gross_payment_amount ?? 0);
    case "percent_of_finance_you_fee":
      return Number(event.finance_you_fee_amount ?? 0);
    case "percent_of_loan_amount":
      return Number(event.loan_amount ?? 0);
    default:
      return 0;
  }
}

export function calculateAmount(rule: RuleLike, basisAmount: number): number {
  let amount = 0;
  if (rule.basis_type === "fixed_amount") {
    amount = Number(rule.fixed_amount ?? 0);
  } else if (rule.basis_type === "manual") {
    amount = 0;
  } else {
    amount = basisAmount * (Number(rule.percent_rate ?? 0) / 100);
  }
  if (rule.min_commission != null && amount < rule.min_commission)
    amount = Number(rule.min_commission);
  if (rule.max_commission != null && amount > rule.max_commission)
    amount = Number(rule.max_commission);
  return roundMoney(amount);
}

export type CommissionDecision = {
  status: string;
  requiresInvoice: boolean;
  requiresUnregisteredActivityStatement: boolean;
  requiresBusinessRegistration: boolean;
};

/**
 * Status nowo naliczonej prowizji wg formy rozliczenia i limitu działalności
 * nierejestrowanej. Zgodne z pseudokodem regulaminu.
 */
export function decideCommissionStatus(input: {
  settlementType: SettlementType;
  grossAmount: number;
  quarterApprovedSum: number;
  limitAmount: number | null | undefined;
}): CommissionDecision {
  const decision: CommissionDecision = {
    status: "pending_admin_approval",
    requiresInvoice: false,
    requiresUnregisteredActivityStatement: false,
    requiresBusinessRegistration: false,
  };

  if (input.settlementType === "b2b") {
    decision.requiresInvoice = true;
    decision.status = "requires_invoice";
    return decision;
  }

  // działalność nierejestrowana
  decision.requiresUnregisteredActivityStatement = true;
  const limit = input.limitAmount;
  const withinLimit = limit != null && input.quarterApprovedSum + input.grossAmount <= limit;
  if (!withinLimit) {
    decision.requiresBusinessRegistration = true;
    decision.status = "requires_business_registration";
  }
  return decision;
}

export function unregisteredLimitState(input: {
  quarterApprovedSum: number;
  newAmount?: number;
  limitAmount: number | null | undefined;
}): { withinLimit: boolean; remaining: number; nearLimit: boolean; ratio: number } {
  const limit = input.limitAmount ?? 0;
  const projected = input.quarterApprovedSum + (input.newAmount ?? 0);
  const remaining = roundMoney(Math.max(0, limit - input.quarterApprovedSum));
  const ratio = limit > 0 ? projected / limit : 1;
  return {
    withinLimit: limit > 0 && projected <= limit,
    remaining,
    nearLimit: limit > 0 && ratio >= 0.8,
    ratio,
  };
}

/** Wykrywa cykl w strukturze sponsorów (zapobiega pętli). */
export function wouldCreateCycle(
  partnersById: Record<string, PartnerLike>,
  partnerId: string,
  newSponsorId: string | null,
): boolean {
  if (!newSponsorId) return false;
  if (newSponsorId === partnerId) return true;
  let cursor: string | null | undefined = newSponsorId;
  let guard = 0;
  while (cursor && guard < 1000) {
    if (cursor === partnerId) return true;
    cursor = partnersById[cursor]?.sponsor_partner_id ?? null;
    guard += 1;
  }
  return false;
}

/** Łańcuch przodków (sponsorów) do 3 poziomów — do odbudowy closure table. */
export function ancestorChain(
  partnersById: Record<string, PartnerLike>,
  partnerId: string,
  maxDepth = 3,
): { ancestorId: string; depth: number }[] {
  const chain: { ancestorId: string; depth: number }[] = [];
  let cursor = partnersById[partnerId]?.sponsor_partner_id ?? null;
  let depth = 1;
  const seen = new Set<string>([partnerId]);
  while (cursor && depth <= maxDepth && !seen.has(cursor)) {
    chain.push({ ancestorId: cursor, depth });
    seen.add(cursor);
    cursor = partnersById[cursor]?.sponsor_partner_id ?? null;
    depth += 1;
  }
  return chain;
}

export function buildTransferTitle(commission: { id: string }, partner: PartnerLike): string {
  if (partner.settlement_type === "b2b") {
    return "Prowizja partnerska Finance You - faktura";
  }
  return `Prowizja w programie pośredników Finance You - ${commission.id}`;
}

export type PayoutCandidate = {
  partner_id: string;
  gross_amount: number;
  id: string;
};

/**
 * Grupuje zatwierdzone prowizje w pozycje wypłaty, respektując próg 500 zł
 * oraz wymóg kompletnych danych bankowych partnera.
 */
export function groupPayouts(
  commissions: PayoutCandidate[],
  partnersById: Record<string, PartnerLike>,
): {
  items: { commission_id: string; partner_id: string; amount: number; transfer_title: string }[];
  skipped: {
    partner_id: string;
    reason: "below_threshold" | "missing_bank_account";
    total: number;
  }[];
} {
  const byPartner = new Map<string, PayoutCandidate[]>();
  for (const c of commissions) {
    const arr = byPartner.get(c.partner_id) ?? [];
    arr.push(c);
    byPartner.set(c.partner_id, arr);
  }

  const items: {
    commission_id: string;
    partner_id: string;
    amount: number;
    transfer_title: string;
  }[] = [];
  const skipped: {
    partner_id: string;
    reason: "below_threshold" | "missing_bank_account";
    total: number;
  }[] = [];

  for (const [partnerId, list] of byPartner.entries()) {
    const total = roundMoney(list.reduce((s, c) => s + Number(c.gross_amount || 0), 0));
    const partner = partnersById[partnerId];
    if (total < PAYOUT_THRESHOLD_PLN) {
      skipped.push({ partner_id: partnerId, reason: "below_threshold", total });
      continue;
    }
    if (!partner?.bank_account_encrypted) {
      skipped.push({ partner_id: partnerId, reason: "missing_bank_account", total });
      continue;
    }
    for (const c of list) {
      items.push({
        commission_id: c.id,
        partner_id: partnerId,
        amount: roundMoney(Number(c.gross_amount || 0)),
        transfer_title: buildTransferTitle({ id: c.id }, partner),
      });
    }
  }

  return { items, skipped };
}
