// =====================================================================
// Program pośredników — orkiestracja naliczania prowizji na bazie danych.
// Czysta logika w engine-pure.ts; tu zapisy/odczyty przez klienta service_role.
// =====================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ancestorChain,
  buildTransferTitle,
  calculateAmount,
  decideCommissionStatus,
  getBasisAmount,
  getNetworkRecipients,
  getTaxPeriod,
  groupPayouts,
  isEligiblePartner,
  isPayableEvent,
  LIMIT_COUNTING_STATUSES,
  PAYOUT_THRESHOLD_PLN,
  roundMoney,
  wouldCreateCycle,
  type CommissionEventType,
  type PartnerLike,
  type SettlementType,
} from "./engine-pure";
import { logAffiliateAudit } from "./db";

// ---------------------------------------------------------------------
// Reguły prowizji
// ---------------------------------------------------------------------
export async function findCommissionRule(
  db: SupabaseClient,
  input: {
    eventType: string;
    networkLevel: number;
    settlementType: string;
    productId?: string | null;
  },
): Promise<any | null> {
  const { data } = await db
    .from("affiliate_commission_rules")
    .select("*")
    .eq("active", true)
    .eq("event_type", input.eventType)
    .eq("network_level", input.networkLevel);

  const now = Date.now();
  const candidates = (data ?? []).filter((r: any) => {
    if (r.settlement_type_filter && r.settlement_type_filter !== input.settlementType) return false;
    if (r.product_id && input.productId && r.product_id !== input.productId) return false;
    if (r.product_id && !input.productId) return false;
    if (r.valid_from && new Date(r.valid_from).getTime() > now) return false;
    if (r.valid_to && new Date(r.valid_to).getTime() < now) return false;
    return true;
  });

  // Preferuj reguły bardziej szczegółowe (z filtrem formy rozliczenia / produktu).
  candidates.sort((a: any, b: any) => {
    const score = (r: any) => (r.settlement_type_filter ? 2 : 0) + (r.product_id ? 1 : 0);
    return score(b) - score(a);
  });
  return candidates[0] ?? null;
}

// ---------------------------------------------------------------------
// Limit działalności nierejestrowanej
// ---------------------------------------------------------------------
export async function getActiveLimit(
  db: SupabaseClient,
  year: number,
  quarter: number,
): Promise<number | null> {
  const { data } = await db
    .from("affiliate_unregistered_activity_limits")
    .select("limit_amount")
    .eq("year", year)
    .eq("quarter", quarter)
    .eq("active", true)
    .maybeSingle();
  return data ? Number((data as any).limit_amount) : null;
}

export async function quarterCountedSum(
  db: SupabaseClient,
  partnerId: string,
  year: number,
  quarter: number,
): Promise<number> {
  const { data } = await db
    .from("affiliate_commissions")
    .select("gross_amount,status")
    .eq("partner_id", partnerId)
    .eq("tax_year", year)
    .eq("tax_quarter", quarter)
    .in("status", LIMIT_COUNTING_STATUSES);
  return roundMoney((data ?? []).reduce((s: number, c: any) => s + Number(c.gross_amount || 0), 0));
}

export async function checkUnregisteredActivityLimit(
  db: SupabaseClient,
  input: { partnerId: string; year: number; quarter: number; newCommissionAmount: number },
): Promise<{ ok: boolean; quarterSum: number; limitAmount: number | null }> {
  const limitAmount = await getActiveLimit(db, input.year, input.quarter);
  const quarterSum = await quarterCountedSum(db, input.partnerId, input.year, input.quarter);
  const ok = limitAmount != null && quarterSum + input.newCommissionAmount <= limitAmount;
  return { ok, quarterSum, limitAmount };
}

// ---------------------------------------------------------------------
// Sieć partnerska — wczytanie łańcucha sponsorów (do 3 poziomów)
// ---------------------------------------------------------------------
async function loadPartner(db: SupabaseClient, id: string): Promise<PartnerLike | null> {
  const { data } = await db
    .from("affiliate_partners")
    .select("id,sponsor_partner_id,status,settlement_type,bank_account_encrypted")
    .eq("id", id)
    .maybeSingle();
  return (data as PartnerLike | null) ?? null;
}

async function loadNetworkMap(
  db: SupabaseClient,
  directPartnerId: string,
): Promise<Record<string, PartnerLike>> {
  const map: Record<string, PartnerLike> = {};
  let cursor: string | null | undefined = directPartnerId;
  let guard = 0;
  while (cursor && guard < 4) {
    const p = await loadPartner(db, cursor);
    if (!p) break;
    map[p.id] = p;
    cursor = p.sponsor_partner_id ?? null;
    guard += 1;
  }
  return map;
}

// ---------------------------------------------------------------------
// Naliczanie prowizji sieciowej dla zdarzenia
// ---------------------------------------------------------------------
export async function calculateNetworkCommissions(
  db: SupabaseClient,
  eventId: string,
): Promise<{ created: number; skipped: number }> {
  const { data: event } = await db
    .from("affiliate_commission_events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) throw new Error("Nie znaleziono zdarzenia prowizyjnego.");

  // Nie naliczamy prowizji od zwróconych / cofniętych / fraudowych zdarzeń.
  if (!isPayableEvent((event as any).event_status)) {
    await logAffiliateAudit(db, {
      entityType: "commission_event",
      entityId: eventId,
      action: "commission_skipped_event_not_payable",
      after: { event_status: (event as any).event_status },
    });
    return { created: 0, skipped: 0 };
  }

  const directPartnerId = (event as any).direct_partner_id as string;
  const map = await loadNetworkMap(db, directPartnerId);
  const recipients = getNetworkRecipients(map, directPartnerId);

  let created = 0;
  let skipped = 0;

  for (const recipient of recipients) {
    const partner = map[recipient.partnerId];

    if (!isEligiblePartner(partner)) {
      skipped += 1;
      await logAffiliateAudit(db, {
        entityType: "commission_event",
        entityId: eventId,
        action: "commission_skipped_partner_inactive",
        after: {
          partnerId: recipient.partnerId,
          level: recipient.level,
          status: partner?.status ?? null,
        },
      });
      continue;
    }

    const settlementType = (partner.settlement_type ?? "b2b") as SettlementType;
    const rule = await findCommissionRule(db, {
      eventType: (event as any).event_type,
      networkLevel: recipient.level,
      settlementType,
      productId: (event as any).product_id,
    });

    if (!rule) {
      skipped += 1;
      await logAffiliateAudit(db, {
        entityType: "commission_event",
        entityId: eventId,
        action: "commission_skipped_no_rule",
        after: { partnerId: recipient.partnerId, level: recipient.level },
      });
      continue;
    }

    const basisAmount = getBasisAmount(event as any, rule.basis_type);
    const grossAmount = calculateAmount(rule, basisAmount);
    if (grossAmount <= 0) {
      skipped += 1;
      continue;
    }

    const { year, quarter } = getTaxPeriod((event as any).occurred_at);
    const limit = await checkUnregisteredActivityLimit(db, {
      partnerId: partner.id,
      year,
      quarter,
      newCommissionAmount: grossAmount,
    });

    const decision = decideCommissionStatus({
      settlementType,
      grossAmount,
      quarterApprovedSum: limit.quarterSum,
      limitAmount: limit.limitAmount,
    });

    const { error } = await db.from("affiliate_commissions").insert({
      commission_event_id: (event as any).id,
      partner_id: partner.id,
      direct_partner_id: directPartnerId,
      network_level: recipient.level,
      rule_id: rule.id,
      settlement_type: settlementType,
      status: decision.status,
      basis_type: rule.basis_type,
      basis_amount: basisAmount,
      commission_rate: rule.percent_rate ?? null,
      gross_amount: grossAmount,
      currency: (event as any).currency ?? "PLN",
      tax_year: year,
      tax_quarter: quarter,
      requires_invoice: decision.requiresInvoice,
      requires_unregistered_activity_statement: decision.requiresUnregisteredActivityStatement,
      requires_business_registration: decision.requiresBusinessRegistration,
    });

    // Konflikt = prowizja już naliczona (idempotencja) — pomijamy.
    if (error) {
      skipped += 1;
      continue;
    }

    created += 1;
    await logAffiliateAudit(db, {
      entityType: "commission",
      entityId: (event as any).id,
      action: "commission_created",
      after: {
        partnerId: partner.id,
        level: recipient.level,
        grossAmount,
        status: decision.status,
      },
    });
  }

  return { created, skipped };
}

// ---------------------------------------------------------------------
// Tworzenie zdarzenia prowizyjnego
// ---------------------------------------------------------------------
export async function createCommissionEvent(
  db: SupabaseClient,
  input: {
    eventType: CommissionEventType;
    sourceEntityType?: string;
    sourceEntityId?: string;
    directPartnerId: string;
    grossPaymentAmount?: number;
    netRevenueAmount?: number;
    financeYouFeeAmount?: number;
    loanAmount?: number;
    paymentId?: string;
    externalRef?: string;
    productId?: string;
    applicationId?: string;
    customerId?: string;
    paidAccountId?: string;
    currency?: string;
    occurredAt?: Date | string;
    refundWindowDays?: number;
    eventStatus?: string;
  },
): Promise<{ eventId: string; created: number; skipped: number }> {
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  const refundDays = input.refundWindowDays ?? 14;
  const refundUntil = new Date(occurredAt.getTime() + refundDays * 24 * 60 * 60 * 1000);

  const { data: inserted, error } = await db
    .from("affiliate_commission_events")
    .insert({
      event_type: input.eventType,
      event_status: input.eventStatus ?? "confirmed",
      source_entity_type: input.sourceEntityType ?? null,
      source_entity_id: input.sourceEntityId ?? null,
      direct_partner_id: input.directPartnerId,
      external_ref: input.externalRef ?? null,
      gross_payment_amount: input.grossPaymentAmount ?? null,
      net_revenue_amount: input.netRevenueAmount ?? null,
      finance_you_fee_amount: input.financeYouFeeAmount ?? null,
      loan_amount: input.loanAmount ?? null,
      payment_id: input.paymentId ?? null,
      product_id: input.productId ?? null,
      application_id: input.applicationId ?? null,
      customer_id: input.customerId ?? null,
      paid_account_id: input.paidAccountId ?? null,
      currency: input.currency ?? "PLN",
      occurred_at: occurredAt.toISOString(),
      confirmed_at: new Date().toISOString(),
      refund_window_until: refundUntil.toISOString(),
      // Naliczamy prowizje od razu (inline) — oznaczamy jako przetworzone,
      // aby tick nie liczył ich ponownie.
      processed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !inserted)
    throw new Error(`Nie udało się utworzyć zdarzenia prowizyjnego: ${error?.message}`);

  const eventId = (inserted as { id: string }).id;
  const res = await calculateNetworkCommissions(db, eventId);
  return { eventId, ...res };
}

// ---------------------------------------------------------------------
// Zmiana statusu zdarzenia (zwrot / chargeback / fraud → korekta prowizji)
// ---------------------------------------------------------------------
export async function setEventStatus(
  db: SupabaseClient,
  input: {
    eventId: string;
    status: string;
    reason?: string;
    actorUserId?: string;
    actorRole?: string;
  },
): Promise<void> {
  const { data: before } = await db
    .from("affiliate_commission_events")
    .select("*")
    .eq("id", input.eventId)
    .maybeSingle();
  const nowIso = new Date().toISOString();
  const cancelling = !isPayableEvent(input.status);

  await db
    .from("affiliate_commission_events")
    .update({
      event_status: input.status,
      cancellation_reason: input.reason ?? null,
      cancelled_at: cancelling ? nowIso : null,
    })
    .eq("id", input.eventId);

  if (cancelling) {
    // Korekta prowizji: wypłacone → clawback, pozostałe → anulowane.
    const { data: commissions } = await db
      .from("affiliate_commissions")
      .select("id,status")
      .eq("commission_event_id", input.eventId);
    for (const c of commissions ?? []) {
      const next = (c as any).status === "paid" ? "clawback" : "cancelled";
      await db
        .from("affiliate_commissions")
        .update({
          status: next,
          cancelled_at: nowIso,
          cancellation_reason: input.reason ?? "Korekta zdarzenia",
        })
        .eq("id", (c as any).id);
    }
  }

  await logAffiliateAudit(db, {
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    entityType: "commission_event",
    entityId: input.eventId,
    action: "event_status_changed",
    before: before ? { status: (before as any).event_status } : null,
    after: { status: input.status },
    reason: input.reason,
  });
}

// ---------------------------------------------------------------------
// Zatwierdzanie / blokowanie prowizji
// ---------------------------------------------------------------------
export async function approveCommission(
  db: SupabaseClient,
  input: { commissionId: string; adminUserId: string; actorRole?: string },
): Promise<void> {
  const { data: commission } = await db
    .from("affiliate_commissions")
    .select("*")
    .eq("id", input.commissionId)
    .maybeSingle();
  if (!commission) throw new Error("Nie znaleziono prowizji.");
  const c = commission as any;

  if (c.requires_business_registration) {
    throw new Error("Partner musi przejść na B2B przed zatwierdzeniem tej prowizji.");
  }
  if (c.settlement_type === "b2b" && !c.invoice_id) {
    throw new Error("Wymagana faktura przed zatwierdzeniem wypłaty.");
  }
  if (c.settlement_type === "unregistered_activity") {
    const { ok } = await checkUnregisteredActivityLimit(db, {
      partnerId: c.partner_id,
      year: c.tax_year,
      quarter: c.tax_quarter,
      newCommissionAmount: 0,
    });
    if (!ok) {
      await db
        .from("affiliate_commissions")
        .update({ status: "requires_business_registration", requires_business_registration: true })
        .eq("id", input.commissionId);
      throw new Error(
        "Limit działalności nierejestrowanej został przekroczony lub może zostać przekroczony.",
      );
    }
  }

  await db
    .from("affiliate_commissions")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: input.adminUserId,
    })
    .eq("id", input.commissionId);

  await logAffiliateAudit(db, {
    actorUserId: input.adminUserId,
    actorRole: input.actorRole,
    entityType: "commission",
    entityId: input.commissionId,
    action: "commission_approved",
    before: { status: c.status },
    after: { status: "approved" },
  });
}

export async function blockCommission(
  db: SupabaseClient,
  input: { commissionId: string; reason: string; adminUserId: string; actorRole?: string },
): Promise<void> {
  const { data: before } = await db
    .from("affiliate_commissions")
    .select("status")
    .eq("id", input.commissionId)
    .maybeSingle();
  await db
    .from("affiliate_commissions")
    .update({ status: "blocked", cancellation_reason: input.reason })
    .eq("id", input.commissionId);
  await logAffiliateAudit(db, {
    actorUserId: input.adminUserId,
    actorRole: input.actorRole,
    entityType: "commission",
    entityId: input.commissionId,
    action: "commission_blocked",
    before: before ?? null,
    after: { status: "blocked" },
    reason: input.reason,
  });
}

// ---------------------------------------------------------------------
// Struktura: closure table + zmiana sponsora (z zakazem cykli)
// ---------------------------------------------------------------------
export async function rebuildClosure(db: SupabaseClient): Promise<void> {
  const { data: partners } = await db.from("affiliate_partners").select("id,sponsor_partner_id");
  const map: Record<string, PartnerLike> = {};
  for (const p of partners ?? []) map[(p as any).id] = p as PartnerLike;

  const rows: { ancestor_partner_id: string; descendant_partner_id: string; depth: number }[] = [];
  for (const p of partners ?? []) {
    const id = (p as any).id as string;
    for (const a of ancestorChain(map, id, 3)) {
      rows.push({ ancestor_partner_id: a.ancestorId, descendant_partner_id: id, depth: a.depth });
    }
  }

  await db.from("affiliate_network_closure").delete().gte("depth", 0);
  if (rows.length) await db.from("affiliate_network_closure").insert(rows);
}

export async function assignSponsor(
  db: SupabaseClient,
  input: {
    partnerId: string;
    sponsorId: string | null;
    adminUserId: string;
    note: string;
    actorRole?: string;
  },
): Promise<void> {
  if (!input.note || !input.note.trim()) {
    throw new Error("Zmiana sponsora wymaga obowiązkowej notatki.");
  }
  const { data: partners } = await db.from("affiliate_partners").select("id,sponsor_partner_id");
  const map: Record<string, PartnerLike> = {};
  for (const p of partners ?? []) map[(p as any).id] = p as PartnerLike;

  if (!map[input.partnerId]) throw new Error("Nie znaleziono partnera.");
  if (input.sponsorId && !map[input.sponsorId]) throw new Error("Nie znaleziono sponsora.");
  if (wouldCreateCycle(map, input.partnerId, input.sponsorId)) {
    throw new Error("Ta zmiana utworzyłaby cykl w strukturze sponsorów.");
  }

  const before = map[input.partnerId]?.sponsor_partner_id ?? null;
  await db
    .from("affiliate_partners")
    .update({ sponsor_partner_id: input.sponsorId })
    .eq("id", input.partnerId);
  await rebuildClosure(db);

  await logAffiliateAudit(db, {
    actorUserId: input.adminUserId,
    actorRole: input.actorRole,
    entityType: "affiliate_partner",
    entityId: input.partnerId,
    action: "sponsor_changed",
    before: { sponsor_partner_id: before },
    after: { sponsor_partner_id: input.sponsorId },
    reason: input.note,
  });
}

export async function setPartnerStatus(
  db: SupabaseClient,
  input: {
    partnerId: string;
    status: string;
    adminUserId: string;
    reason?: string;
    actorRole?: string;
  },
): Promise<void> {
  const { data: before } = await db
    .from("affiliate_partners")
    .select("status")
    .eq("id", input.partnerId)
    .maybeSingle();
  const patch: Record<string, unknown> = { status: input.status };
  if (input.status === "active") {
    patch.approved_at = new Date().toISOString();
    patch.approved_by = input.adminUserId;
  }
  await db.from("affiliate_partners").update(patch).eq("id", input.partnerId);
  await logAffiliateAudit(db, {
    actorUserId: input.adminUserId,
    actorRole: input.actorRole,
    entityType: "affiliate_partner",
    entityId: input.partnerId,
    action: "partner_status_changed",
    before: before ?? null,
    after: { status: input.status },
    reason: input.reason,
  });
}

// ---------------------------------------------------------------------
// Paczki wypłat (próg 500 zł)
// ---------------------------------------------------------------------
export async function createPayoutBatch(
  db: SupabaseClient,
  input: { partnerIds?: string[]; createdBy: string; name?: string; actorRole?: string },
): Promise<{ batchId: string; total: number; count: number; skipped: any[] }> {
  let query = db
    .from("affiliate_commissions")
    .select("id,partner_id,gross_amount")
    .eq("status", "approved");
  if (input.partnerIds && input.partnerIds.length) query = query.in("partner_id", input.partnerIds);
  const { data: commissions } = await query;

  const partnerIds = Array.from(new Set((commissions ?? []).map((c: any) => c.partner_id)));
  const partnersById: Record<string, PartnerLike> = {};
  if (partnerIds.length) {
    const { data: partners } = await db
      .from("affiliate_partners")
      .select("id,settlement_type,bank_account_encrypted,status")
      .in("id", partnerIds);
    for (const p of partners ?? []) partnersById[(p as any).id] = p as PartnerLike;
  }

  const { items, skipped } = groupPayouts((commissions ?? []) as any, partnersById);
  if (items.length === 0) {
    throw new Error("Brak prowizji spełniających próg wypłaty 500 zł.");
  }

  const total = roundMoney(items.reduce((s, it) => s + it.amount, 0));
  const distinctPartners = new Set(items.map((it) => it.partner_id)).size;

  const { data: batch, error: batchErr } = await db
    .from("affiliate_payout_batches")
    .insert({
      name: input.name ?? `Paczka wypłat ${new Date().toISOString().slice(0, 10)}`,
      status: "draft",
      total_amount: total,
      payout_count: distinctPartners,
      created_by: input.createdBy,
    })
    .select("id")
    .single();
  if (batchErr || !batch) throw new Error(`Nie udało się utworzyć paczki: ${batchErr?.message}`);
  const batchId = (batch as { id: string }).id;

  for (const it of items) {
    await db.from("affiliate_payout_items").insert({
      payout_batch_id: batchId,
      commission_id: it.commission_id,
      partner_id: it.partner_id,
      amount: it.amount,
      transfer_title: it.transfer_title,
      status: "pending",
    });
    await db
      .from("affiliate_commissions")
      .update({ status: "payable", payout_batch_id: batchId, payable_at: new Date().toISOString() })
      .eq("id", it.commission_id);
  }

  await logAffiliateAudit(db, {
    actorUserId: input.createdBy,
    actorRole: input.actorRole,
    entityType: "payout_batch",
    entityId: batchId,
    action: "payout_batch_created",
    after: { total, count: distinctPartners, items: items.length },
  });

  return { batchId, total, count: distinctPartners, skipped };
}

export async function markPayoutBatchPaid(
  db: SupabaseClient,
  input: { batchId: string; paidBy: string; actorRole?: string },
): Promise<void> {
  const nowIso = new Date().toISOString();
  const { data: items } = await db
    .from("affiliate_payout_items")
    .select("id,commission_id")
    .eq("payout_batch_id", input.batchId);
  for (const it of items ?? []) {
    await db
      .from("affiliate_payout_items")
      .update({ status: "paid", paid_at: nowIso })
      .eq("id", (it as any).id);
    await db
      .from("affiliate_commissions")
      .update({ status: "paid", paid_at: nowIso })
      .eq("id", (it as any).commission_id);
  }
  await db
    .from("affiliate_payout_batches")
    .update({ status: "paid", paid_at: nowIso, paid_by: input.paidBy })
    .eq("id", input.batchId);

  await logAffiliateAudit(db, {
    actorUserId: input.paidBy,
    actorRole: input.actorRole,
    entityType: "payout_batch",
    entityId: input.batchId,
    action: "payout_batch_paid",
    after: { paid_at: nowIso },
  });
}

export { PAYOUT_THRESHOLD_PLN, buildTransferTitle };
