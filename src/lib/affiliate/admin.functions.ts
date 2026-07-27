// Funkcje serwerowe panelu administratora i księgowości — program pośredników.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  affiliateDb,
  assertStaff,
  assertAdmin,
  assertAccounting,
  getUserRoles,
  logAffiliateAudit,
} from "./db";
import { decryptSensitive, maskBankAccount, maskPesel } from "./crypto";
import {
  approveCommission,
  assignSponsor,
  blockCommission,
  createCommissionEvent,
  createPayoutBatch,
  markPayoutBatchPaid,
  setEventStatus,
  setPartnerStatus,
  getActiveLimit,
  quarterCountedSum,
} from "./engine";
import { getTaxPeriod, unregisteredLimitState } from "./engine-pure";

// --------------------------- CSV helpers -----------------------------
function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(";")];
  for (const r of rows) lines.push(r.map(csvCell).join(";"));
  return "﻿" + lines.join("\r\n");
}
const money = (n: unknown) =>
  Number(n ?? 0)
    .toFixed(2)
    .replace(".", ",");

async function actorRole(userId: string): Promise<string> {
  const roles = await getUserRoles(affiliateDb, userId);
  return roles.includes("administrator")
    ? "administrator"
    : roles.includes("ksiegowosc")
      ? "ksiegowosc"
      : (roles[0] ?? "operator");
}

// =====================================================================
// DASHBOARD / STATY
// =====================================================================
export const getAffiliateProgramStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(affiliateDb, context.userId);

    const [{ data: partners }, { data: commissions }, { data: events }, { data: batches }] =
      await Promise.all([
        affiliateDb.from("affiliate_partners").select("id,status,settlement_type"),
        affiliateDb.from("affiliate_commissions").select("gross_amount,status,network_level"),
        affiliateDb.from("affiliate_commission_events").select("id,event_type,event_status"),
        affiliateDb.from("affiliate_payout_batches").select("id,status,total_amount"),
      ]);

    const sum = (pred: (c: any) => boolean) =>
      Math.round(
        (commissions ?? [])
          .filter(pred)
          .reduce((s: number, c: any) => s + Number(c.gross_amount || 0), 0) * 100,
      ) / 100;
    const countPartners = (pred: (p: any) => boolean) => (partners ?? []).filter(pred).length;

    return {
      partners: {
        total: (partners ?? []).length,
        active: countPartners((p) => p.status === "active"),
        pending: countPartners((p) => p.status === "pending_approval"),
        b2b: countPartners((p) => p.settlement_type === "b2b"),
        unregistered: countPartners((p) => p.settlement_type === "unregistered_activity"),
      },
      commissions: {
        pendingApproval: sum(
          (c) =>
            c.status === "pending_admin_approval" ||
            c.status === "requires_invoice" ||
            c.status === "requires_unregistered_activity_statement",
        ),
        approved: sum((c) => c.status === "approved" || c.status === "payable"),
        paid: sum((c) => c.status === "paid"),
        blocked: sum(
          (c) => c.status === "blocked" || c.status === "requires_business_registration",
        ),
        level1: sum(
          (c) => c.network_level === 1 && c.status !== "cancelled" && c.status !== "blocked",
        ),
        level2: sum(
          (c) => c.network_level === 2 && c.status !== "cancelled" && c.status !== "blocked",
        ),
        level3: sum(
          (c) => c.network_level === 3 && c.status !== "cancelled" && c.status !== "blocked",
        ),
      },
      events: {
        total: (events ?? []).length,
        confirmed: (events ?? []).filter((e: any) => e.event_status === "confirmed").length,
        investor: (events ?? []).filter((e: any) => e.event_type === "investor_account_paid")
          .length,
        broker: (events ?? []).filter((e: any) => e.event_type === "broker_account_paid").length,
        client: (events ?? []).filter((e: any) => e.event_type === "client_funds_disbursed").length,
      },
      payouts: {
        batches: (batches ?? []).length,
        paidTotal:
          Math.round(
            (batches ?? [])
              .filter((b: any) => b.status === "paid")
              .reduce((s: number, b: any) => s + Number(b.total_amount || 0), 0) * 100,
          ) / 100,
      },
    };
  });

// =====================================================================
// PARTNERZY
// =====================================================================
export const adminListPartners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ status: z.string().optional(), search: z.string().optional() }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(affiliateDb, context.userId);
    let q = affiliateDb
      .from("affiliate_partners")
      .select(
        "id,settlement_type,status,referral_code,first_name,last_name,company_name,email,phone,nip,sponsor_partner_id,created_at,approved_at,bank_account_encrypted",
      )
      .order("created_at", { ascending: false });
    if (data.status) q = q.eq("status", data.status);
    const { data: partners } = await q;
    let rows = (partners ?? []) as any[];
    if (data.search) {
      const s = data.search.toLowerCase();
      rows = rows.filter((p) =>
        [p.first_name, p.last_name, p.company_name, p.email, p.nip, p.referral_code].some(
          (v: any) =>
            String(v ?? "")
              .toLowerCase()
              .includes(s),
        ),
      );
    }
    return rows.map((p) => ({
      ...p,
      has_bank_account: Boolean(p.bank_account_encrypted),
      bank_account_encrypted: undefined,
    }));
  });

export const adminGetPartner = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(affiliateDb, context.userId);
    const { data: p } = await affiliateDb
      .from("affiliate_partners")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!p) return null;
    const partner = p as any;
    const { data: commissions } = await affiliateDb
      .from("affiliate_commissions")
      .select(
        "id,network_level,status,gross_amount,settlement_type,tax_year,tax_quarter,created_at",
      )
      .eq("partner_id", data.id)
      .order("created_at", { ascending: false });
    return {
      ...partner,
      pesel_encrypted: undefined,
      bank_account_encrypted: undefined,
      pesel_masked: maskPesel(decryptSensitive(partner.pesel_encrypted)),
      bank_account_masked: maskBankAccount(decryptSensitive(partner.bank_account_encrypted)),
      commissions: commissions ?? [],
    };
  });

export const adminApprovePartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(affiliateDb, context.userId);
    await setPartnerStatus(affiliateDb, {
      partnerId: data.id,
      status: "active",
      adminUserId: context.userId,
      actorRole: "administrator",
    });
    // Zewnętrzny partner dostaje dedykowaną rolę 'posrednik' (dostęp do panelu
    // pośrednika w zakresie darmowy/płatny). Roli pracowniczej 'operator' nie
    // nadajemy — dawała pełne uprawnienia personelu do danych klientów.
    const { data: partner } = await affiliateDb
      .from("affiliate_partners")
      .select("user_id")
      .eq("id", data.id)
      .maybeSingle();
    if ((partner as any)?.user_id) {
      await affiliateDb
        .from("user_roles")
        .upsert({ user_id: (partner as any).user_id, role: "posrednik" } as any, {
          onConflict: "user_id,role",
        });
    }
    return { ok: true };
  });

export const adminSetPartnerStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum([
          "pending_approval",
          "active",
          "suspended",
          "rejected",
          "missing_billing_data",
          "requires_accounting_review",
          "requires_business_registration",
          "terminated",
        ]),
        reason: z.string().max(1000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(affiliateDb, context.userId);
    await setPartnerStatus(affiliateDb, {
      partnerId: data.id,
      status: data.status,
      adminUserId: context.userId,
      reason: data.reason,
      actorRole: "administrator",
    });
    return { ok: true };
  });

export const adminAssignSponsor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        partnerId: z.string().uuid(),
        sponsorId: z.string().uuid().nullable(),
        note: z.string().min(1),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(affiliateDb, context.userId);
    await assignSponsor(affiliateDb, {
      partnerId: data.partnerId,
      sponsorId: data.sponsorId,
      adminUserId: context.userId,
      note: data.note,
      actorRole: "administrator",
    });
    return { ok: true };
  });

export const adminGetTree = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(affiliateDb, context.userId);
    const { data } = await affiliateDb
      .from("affiliate_partners")
      .select(
        "id,first_name,last_name,company_name,status,settlement_type,sponsor_partner_id,referral_code,created_at",
      )
      .order("created_at", { ascending: true });
    return data ?? [];
  });

// =====================================================================
// ZDARZENIA PROWIZYJNE
// =====================================================================
export const adminListEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ status: z.string().optional(), eventType: z.string().optional() }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(affiliateDb, context.userId);
    let q = affiliateDb
      .from("affiliate_commission_events")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(500);
    if (data.status) q = q.eq("event_status", data.status);
    if (data.eventType) q = q.eq("event_type", data.eventType);
    const { data: rows } = await q;
    return rows ?? [];
  });

export const adminCreateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        eventType: z.enum([
          "investor_account_paid",
          "broker_account_paid",
          "client_funds_disbursed",
        ]),
        directPartnerId: z.string().uuid(),
        grossPaymentAmount: z.number().optional(),
        netRevenueAmount: z.number().optional(),
        financeYouFeeAmount: z.number().optional(),
        loanAmount: z.number().optional(),
        productId: z.string().uuid().optional(),
        customerId: z.string().uuid().optional(),
        applicationId: z.string().uuid().optional(),
        sourceEntityType: z.string().optional(),
        sourceEntityId: z.string().uuid().optional(),
        occurredAt: z.string().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(affiliateDb, context.userId);
    const res = await createCommissionEvent(affiliateDb, { ...data, occurredAt: data.occurredAt });
    await logAffiliateAudit(affiliateDb, {
      actorUserId: context.userId,
      actorRole: "administrator",
      entityType: "commission_event",
      entityId: res.eventId,
      action: "event_created_manually",
      after: { eventType: data.eventType, created: res.created },
    });
    return res;
  });

export const adminSetEventStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        eventId: z.string().uuid(),
        status: z.enum([
          "pending",
          "confirmed",
          "refund_window",
          "eligible",
          "cancelled",
          "refunded",
          "chargeback",
          "fraud",
          "manually_blocked",
        ]),
        reason: z.string().max(1000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(affiliateDb, context.userId);
    await setEventStatus(affiliateDb, {
      eventId: data.eventId,
      status: data.status,
      reason: data.reason,
      actorUserId: context.userId,
      actorRole: "administrator",
    });
    return { ok: true };
  });

// =====================================================================
// PROWIZJE
// =====================================================================
export const adminListCommissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({ status: z.string().optional(), settlementType: z.string().optional() })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(affiliateDb, context.userId);
    let q = affiliateDb
      .from("affiliate_commissions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (data.status) q = q.eq("status", data.status);
    if (data.settlementType) q = q.eq("settlement_type", data.settlementType);
    const { data: commissions } = await q;

    const partnerIds = Array.from(new Set((commissions ?? []).map((c: any) => c.partner_id)));
    const names: Record<string, string> = {};
    if (partnerIds.length) {
      const { data: partners } = await affiliateDb
        .from("affiliate_partners")
        .select("id,first_name,last_name,company_name")
        .in("id", partnerIds);
      for (const p of partners ?? [])
        names[(p as any).id] =
          (p as any).company_name ||
          `${(p as any).first_name ?? ""} ${(p as any).last_name ?? ""}`.trim();
    }
    return (commissions ?? []).map((c: any) => ({
      ...c,
      partner_name: names[c.partner_id] ?? "—",
    }));
  });

export const adminApproveCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(affiliateDb, context.userId);
    await approveCommission(affiliateDb, {
      commissionId: data.id,
      adminUserId: context.userId,
      actorRole: "administrator",
    });
    return { ok: true };
  });

export const adminBlockCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid(), reason: z.string().min(1) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(affiliateDb, context.userId);
    await blockCommission(affiliateDb, {
      commissionId: data.id,
      reason: data.reason,
      adminUserId: context.userId,
      actorRole: "administrator",
    });
    return { ok: true };
  });

// =====================================================================
// REGUŁY PROWIZJI
// =====================================================================
export const adminListRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(affiliateDb, context.userId);
    const { data } = await affiliateDb
      .from("affiliate_commission_rules")
      .select("*")
      .order("event_type")
      .order("network_level");
    return data ?? [];
  });

const RuleInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  active: z.boolean().default(true),
  event_type: z.enum(["investor_account_paid", "broker_account_paid", "client_funds_disbursed"]),
  network_level: z.number().int().min(1).max(3),
  settlement_type_filter: z.enum(["b2b", "unregistered_activity"]).nullable().optional(),
  basis_type: z.enum([
    "fixed_amount",
    "percent_of_net_revenue",
    "percent_of_gross_payment",
    "percent_of_loan_amount",
    "percent_of_finance_you_fee",
    "manual",
  ]),
  fixed_amount: z.number().nullable().optional(),
  percent_rate: z.number().nullable().optional(),
  min_commission: z.number().nullable().optional(),
  max_commission: z.number().nullable().optional(),
  requires_admin_approval: z.boolean().default(true),
  refund_window_days: z.number().int().min(0).default(14),
});

export const adminUpsertRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => RuleInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(affiliateDb, context.userId);
    const row = {
      name: data.name,
      active: data.active,
      event_type: data.event_type,
      network_level: data.network_level,
      settlement_type_filter: data.settlement_type_filter ?? null,
      basis_type: data.basis_type,
      fixed_amount: data.fixed_amount ?? null,
      percent_rate: data.percent_rate ?? null,
      min_commission: data.min_commission ?? null,
      max_commission: data.max_commission ?? null,
      requires_admin_approval: data.requires_admin_approval,
      refund_window_days: data.refund_window_days,
    };
    if (data.id) {
      await affiliateDb.from("affiliate_commission_rules").update(row).eq("id", data.id);
    } else {
      await affiliateDb.from("affiliate_commission_rules").insert(row);
    }
    await logAffiliateAudit(affiliateDb, {
      actorUserId: context.userId,
      actorRole: "administrator",
      entityType: "commission_rule",
      entityId: data.id ?? null,
      action: data.id ? "rule_updated" : "rule_created",
      after: row,
    });
    return { ok: true };
  });

export const adminDeleteRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(affiliateDb, context.userId);
    await affiliateDb.from("affiliate_commission_rules").delete().eq("id", data.id);
    await logAffiliateAudit(affiliateDb, {
      actorUserId: context.userId,
      actorRole: "administrator",
      entityType: "commission_rule",
      entityId: data.id,
      action: "rule_deleted",
    });
    return { ok: true };
  });

// =====================================================================
// LIMITY DZIAŁALNOŚCI NIEREJESTROWANEJ
// =====================================================================
export const adminListLimits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(affiliateDb, context.userId);
    const { data } = await affiliateDb
      .from("affiliate_unregistered_activity_limits")
      .select("*")
      .order("year", { ascending: false })
      .order("quarter");
    return data ?? [];
  });

export const adminUpsertLimit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        year: z.number().int(),
        quarter: z.number().int().min(1).max(4),
        limit_amount: z.number().nonnegative(),
        source_note: z.string().optional(),
        active: z.boolean().default(true),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(affiliateDb, context.userId);
    await affiliateDb.from("affiliate_unregistered_activity_limits").upsert(
      {
        year: data.year,
        quarter: data.quarter,
        limit_amount: data.limit_amount,
        source_note: data.source_note ?? null,
        active: data.active,
      },
      { onConflict: "year,quarter" },
    );
    await logAffiliateAudit(affiliateDb, {
      actorUserId: context.userId,
      actorRole: "administrator",
      entityType: "unregistered_limit",
      action: "limit_upserted",
      after: data,
    });
    return { ok: true };
  });

// =====================================================================
// PACZKI WYPŁAT
// =====================================================================
export const adminListPayoutBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(affiliateDb, context.userId);
    const { data } = await affiliateDb
      .from("affiliate_payout_batches")
      .select("*")
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const adminGetPayoutItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ batchId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(affiliateDb, context.userId);
    const { data: items } = await affiliateDb
      .from("affiliate_payout_items")
      .select("*")
      .eq("payout_batch_id", data.batchId);
    const partnerIds = Array.from(new Set((items ?? []).map((i: any) => i.partner_id)));
    const names: Record<string, string> = {};
    if (partnerIds.length) {
      const { data: partners } = await affiliateDb
        .from("affiliate_partners")
        .select("id,first_name,last_name,company_name")
        .in("id", partnerIds);
      for (const p of partners ?? [])
        names[(p as any).id] =
          (p as any).company_name ||
          `${(p as any).first_name ?? ""} ${(p as any).last_name ?? ""}`.trim();
    }
    return (items ?? []).map((it: any) => ({ ...it, partner_name: names[it.partner_id] ?? "—" }));
  });

export const adminCreatePayoutBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({ partnerIds: z.array(z.string().uuid()).optional(), name: z.string().optional() })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(affiliateDb, context.userId);
    return await createPayoutBatch(affiliateDb, {
      partnerIds: data.partnerIds,
      name: data.name,
      createdBy: context.userId,
      actorRole: "administrator",
    });
  });

export const adminMarkBatchPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ batchId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(affiliateDb, context.userId);
    await markPayoutBatchPaid(affiliateDb, {
      batchId: data.batchId,
      paidBy: context.userId,
      actorRole: "administrator",
    });
    return { ok: true };
  });

// =====================================================================
// FAKTURY PARTNERÓW (księgowość)
// =====================================================================
export const adminListAffiliateInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccounting(affiliateDb, context.userId);
    const { data: invoices } = await affiliateDb
      .from("affiliate_invoices")
      .select("*")
      .order("created_at", { ascending: false });
    const partnerIds = Array.from(new Set((invoices ?? []).map((i: any) => i.partner_id)));
    const names: Record<string, string> = {};
    if (partnerIds.length) {
      const { data: partners } = await affiliateDb
        .from("affiliate_partners")
        .select("id,first_name,last_name,company_name,nip")
        .in("id", partnerIds);
      for (const p of partners ?? [])
        names[(p as any).id] =
          `${(p as any).company_name || `${(p as any).first_name ?? ""} ${(p as any).last_name ?? ""}`.trim()}${(p as any).nip ? ` (NIP ${(p as any).nip})` : ""}`;
    }
    return (invoices ?? []).map((i: any) => ({ ...i, partner_name: names[i.partner_id] ?? "—" }));
  });

export const adminVerifyAffiliateInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ id: z.string().uuid(), status: z.enum(["verified", "rejected", "paid"]) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAccounting(affiliateDb, context.userId);
    const role = await actorRole(context.userId);
    await affiliateDb
      .from("affiliate_invoices")
      .update({
        status: data.status,
        verified_at: new Date().toISOString(),
        verified_by: context.userId,
      })
      .eq("id", data.id);
    await logAffiliateAudit(affiliateDb, {
      actorUserId: context.userId,
      actorRole: role,
      entityType: "affiliate_invoice",
      entityId: data.id,
      action: `invoice_${data.status}`,
    });
    return { ok: true };
  });

// =====================================================================
// AUDYT
// =====================================================================
export const adminListAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ entityType: z.string().optional(), entityId: z.string().optional() }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAccounting(affiliateDb, context.userId);
    let q = affiliateDb
      .from("affiliate_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.entityType) q = q.eq("entity_type", data.entityType);
    if (data.entityId) q = q.eq("entity_id", data.entityId);
    const { data: rows } = await q;
    return rows ?? [];
  });

// =====================================================================
// EKSPORTY CSV (księgowość)
// =====================================================================
async function partnerNameMap(ids: string[]): Promise<Record<string, any>> {
  const map: Record<string, any> = {};
  if (!ids.length) return map;
  const { data } = await affiliateDb
    .from("affiliate_partners")
    .select("id,first_name,last_name,company_name,nip,settlement_type,bank_account_encrypted")
    .in("id", ids);
  for (const p of data ?? []) map[(p as any).id] = p;
  return map;
}

export const exportAffiliateCsv = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        kind: z.enum([
          "b2b_commissions",
          "b2b_invoices",
          "unregistered_ledger",
          "unregistered_near_limit",
          "bank_transfers",
          "full_report",
        ]),
        batchId: z.string().uuid().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAccounting(affiliateDb, context.userId);
    const stamp = new Date().toISOString().slice(0, 10);

    if (data.kind === "b2b_commissions") {
      const { data: rows } = await affiliateDb
        .from("affiliate_commissions")
        .select(
          "id,partner_id,network_level,gross_amount,currency,status,tax_year,tax_quarter,requires_invoice,invoice_id,created_at",
        )
        .eq("settlement_type", "b2b")
        .in("status", ["requires_invoice", "pending_admin_approval", "approved", "payable"]);
      const names = await partnerNameMap(
        Array.from(new Set((rows ?? []).map((r: any) => r.partner_id))),
      );
      const csv = toCsv(
        [
          "ID prowizji",
          "Partner",
          "NIP",
          "Poziom",
          "Kwota",
          "Waluta",
          "Status",
          "Rok",
          "Kwartał",
          "Faktura?",
          "Data",
        ],
        (rows ?? []).map((r: any) => {
          const p = names[r.partner_id];
          return [
            r.id,
            p?.company_name || `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim(),
            p?.nip ?? "",
            r.network_level,
            money(r.gross_amount),
            r.currency,
            r.status,
            r.tax_year,
            r.tax_quarter,
            r.invoice_id ? "tak" : "nie",
            String(r.created_at).slice(0, 10),
          ];
        }),
      );
      return { filename: `b2b-prowizje-${stamp}.csv`, csv };
    }

    if (data.kind === "b2b_invoices") {
      const { data: invoices } = await affiliateDb
        .from("affiliate_invoices")
        .select("*")
        .order("created_at", { ascending: false });
      const names = await partnerNameMap(
        Array.from(new Set((invoices ?? []).map((i: any) => i.partner_id))),
      );
      const csv = toCsv(
        [
          "Nr faktury",
          "Partner",
          "NIP",
          "Data wystawienia",
          "Netto",
          "VAT",
          "Brutto",
          "Waluta",
          "Status",
        ],
        (invoices ?? []).map((i: any) => {
          const p = names[i.partner_id];
          return [
            i.invoice_number,
            p?.company_name || `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim(),
            p?.nip ?? "",
            i.issue_date ?? "",
            money(i.net_amount),
            money(i.vat_amount),
            money(i.gross_amount),
            i.currency,
            i.status,
          ];
        }),
      );
      return { filename: `b2b-faktury-${stamp}.csv`, csv };
    }

    if (data.kind === "unregistered_ledger") {
      const { data: rows } = await affiliateDb
        .from("affiliate_commissions")
        .select("partner_id,gross_amount,status,tax_year,tax_quarter")
        .eq("settlement_type", "unregistered_activity");
      const names = await partnerNameMap(
        Array.from(new Set((rows ?? []).map((r: any) => r.partner_id))),
      );
      // Ewidencja wg partnera / roku / kwartału.
      const agg: Record<
        string,
        { partner_id: string; year: number; quarter: number; sum: number }
      > = {};
      for (const r of rows ?? []) {
        const k = `${(r as any).partner_id}|${(r as any).tax_year}|${(r as any).tax_quarter}`;
        agg[k] ??= {
          partner_id: (r as any).partner_id,
          year: (r as any).tax_year,
          quarter: (r as any).tax_quarter,
          sum: 0,
        };
        agg[k].sum += Number((r as any).gross_amount || 0);
      }
      const csv = toCsv(
        ["Partner", "PESEL (masked)", "Rok", "Kwartał", "Suma prowizji"],
        Object.values(agg).map((a) => {
          const p = names[a.partner_id];
          return [
            `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim(),
            "•••",
            a.year,
            a.quarter,
            money(a.sum),
          ];
        }),
      );
      return { filename: `dzialalnosc-nierejestrowana-ewidencja-${stamp}.csv`, csv };
    }

    if (data.kind === "unregistered_near_limit") {
      const { data: partners } = await affiliateDb
        .from("affiliate_partners")
        .select("id,first_name,last_name")
        .eq("settlement_type", "unregistered_activity");
      const { year, quarter } = getTaxPeriod(new Date());
      const limit = await getActiveLimit(affiliateDb, year, quarter);
      const out: unknown[][] = [];
      for (const p of partners ?? []) {
        const sum = await quarterCountedSum(affiliateDb, (p as any).id, year, quarter);
        const state = unregisteredLimitState({
          quarterApprovedSum: sum,
          newAmount: 0,
          limitAmount: limit,
        });
        out.push([
          `${(p as any).first_name ?? ""} ${(p as any).last_name ?? ""}`.trim(),
          year,
          quarter,
          money(sum),
          money(limit ?? 0),
          money(state.remaining),
          `${Math.round(state.ratio * 100)}%`,
          state.nearLimit ? "ZBLIŻA SIĘ" : state.withinLimit ? "OK" : "PRZEKROCZONY",
        ]);
      }
      const csv = toCsv(
        ["Partner", "Rok", "Kwartał", "Wykorzystano", "Limit", "Pozostało", "% limitu", "Stan"],
        out,
      );
      return { filename: `dzialalnosc-nierejestrowana-limit-${stamp}.csv`, csv };
    }

    if (data.kind === "bank_transfers") {
      if (!data.batchId) throw new Error("Wymagany identyfikator paczki wypłat.");
      const { data: items } = await affiliateDb
        .from("affiliate_payout_items")
        .select("*")
        .eq("payout_batch_id", data.batchId);
      const names = await partnerNameMap(
        Array.from(new Set((items ?? []).map((i: any) => i.partner_id))),
      );
      const csv = toCsv(
        ["Odbiorca", "Rachunek", "Kwota", "Waluta", "Tytuł przelewu"],
        (items ?? []).map((i: any) => {
          const p = names[i.partner_id];
          const acct = decryptSensitive(p?.bank_account_encrypted) ?? "";
          return [
            p?.company_name || `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim(),
            acct,
            money(i.amount),
            "PLN",
            i.transfer_title ?? "",
          ];
        }),
      );
      return { filename: `przelewy-${data.batchId.slice(0, 8)}-${stamp}.csv`, csv };
    }

    // full_report
    const { data: rows } = await affiliateDb
      .from("affiliate_commissions")
      .select(
        "id,partner_id,network_level,settlement_type,status,gross_amount,currency,tax_year,tax_quarter,created_at,commission_event_id",
      )
      .order("created_at", { ascending: false })
      .limit(5000);
    const names = await partnerNameMap(
      Array.from(new Set((rows ?? []).map((r: any) => r.partner_id))),
    );
    const csv = toCsv(
      [
        "ID",
        "Partner",
        "Poziom",
        "Forma",
        "Status",
        "Kwota",
        "Waluta",
        "Rok",
        "Kwartał",
        "Data",
        "Zdarzenie",
      ],
      (rows ?? []).map((r: any) => {
        const p = names[r.partner_id];
        return [
          r.id,
          p?.company_name || `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim(),
          r.network_level,
          r.settlement_type,
          r.status,
          money(r.gross_amount),
          r.currency,
          r.tax_year,
          r.tax_quarter,
          String(r.created_at).slice(0, 10),
          r.commission_event_id,
        ];
      }),
    );
    return { filename: `program-posrednikow-raport-${stamp}.csv`, csv };
  });
