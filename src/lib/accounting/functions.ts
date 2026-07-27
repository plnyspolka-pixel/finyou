// Funkcje serwerowe modułu księgowości: podmioty, faktury sprzedaży, KSeF, eksporty.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  accountingDb,
  assertAccounting,
  assertAdmin,
  getUserRoles,
  logAccountingAudit,
} from "./db";
import { encryptSensitive } from "@/lib/affiliate/crypto";
import { issueSalesInvoice } from "./issue";

function stripSecrets(e: any) {
  const { ksef_token_encrypted, ...rest } = e;
  return { ...rest, has_ksef_token: Boolean(ksef_token_encrypted) };
}

async function actorRole(userId: string): Promise<string> {
  const roles = await getUserRoles(accountingDb, userId);
  return roles.includes("administrator")
    ? "administrator"
    : roles.includes("ksiegowosc")
      ? "ksiegowosc"
      : (roles[0] ?? "operator");
}

// --------------------------- PODMIOTY ---------------------------
export const listAccountingEntities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccounting(accountingDb, context.userId);
    const { data } = await accountingDb
      .from("accounting_entities")
      .select("*")
      .order("is_default", { ascending: false })
      .order("name");
    return (data ?? []).map(stripSecrets);
  });

const EntityInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  legal_name: z.string().min(1),
  nip: z.string().optional().nullable(),
  regon: z.string().optional().nullable(),
  address_street: z.string().optional().nullable(),
  address_postal_code: z.string().optional().nullable(),
  address_city: z.string().optional().nullable(),
  bank_account: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  active: z.boolean().default(true),
  invoice_prefix: z.string().default("FV"),
  vat_payer: z.boolean().default(true),
  default_vat_rate: z.string().default("23"),
  provider: z.enum(["manual", "ksef"]).default("manual"),
  ksef_environment: z.enum(["disabled", "test", "demo", "prod"]).default("disabled"),
  ksef_nip: z.string().optional().nullable(),
  ksef_token: z.string().optional(), // jawny token — zaszyfrujemy
});

export const upsertAccountingEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => EntityInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(accountingDb, context.userId);
    const row: Record<string, unknown> = {
      name: data.name,
      legal_name: data.legal_name,
      nip: data.nip ?? null,
      regon: data.regon ?? null,
      address_street: data.address_street ?? null,
      address_postal_code: data.address_postal_code ?? null,
      address_city: data.address_city ?? null,
      bank_account: data.bank_account ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      active: data.active,
      invoice_prefix: data.invoice_prefix,
      vat_payer: data.vat_payer,
      default_vat_rate: data.default_vat_rate,
      provider: data.provider,
      ksef_environment: data.ksef_environment,
      ksef_nip: data.ksef_nip ?? data.nip ?? null,
    };
    if (data.ksef_token) row.ksef_token_encrypted = encryptSensitive(data.ksef_token);

    let id = data.id;
    if (id) {
      await accountingDb.from("accounting_entities").update(row).eq("id", id);
    } else {
      const { data: ins } = await accountingDb
        .from("accounting_entities")
        .insert(row)
        .select("id")
        .single();
      id = (ins as any)?.id;
    }
    await logAccountingAudit(accountingDb, {
      actorUserId: context.userId,
      actorRole: "administrator",
      entityType: "accounting_entity",
      entityId: id ?? null,
      action: data.id ? "entity_updated" : "entity_created",
    });
    return { ok: true, id };
  });

export const setDefaultAccountingEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(accountingDb, context.userId);
    await accountingDb
      .from("accounting_entities")
      .update({ is_default: false })
      .eq("is_default", true);
    await accountingDb.from("accounting_entities").update({ is_default: true }).eq("id", data.id);
    await logAccountingAudit(accountingDb, {
      actorUserId: context.userId,
      actorRole: "administrator",
      entityType: "accounting_entity",
      entityId: data.id,
      action: "entity_set_default",
    });
    return { ok: true };
  });

// --------------------------- FAKTURY ---------------------------
export const listSalesInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        status: z.string().optional(),
        entityId: z.string().uuid().optional(),
        ksefStatus: z.string().optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAccounting(accountingDb, context.userId);
    let q = accountingDb
      .from("sales_invoices")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (data.status) q = q.eq("status", data.status);
    if (data.entityId) q = q.eq("entity_id", data.entityId);
    if (data.ksefStatus) q = q.eq("ksef_status", data.ksefStatus);
    const { data: invoices } = await q;

    const entityIds = Array.from(
      new Set((invoices ?? []).map((i: any) => i.entity_id).filter(Boolean)),
    );
    const entityNames: Record<string, string> = {};
    if (entityIds.length) {
      const { data: ents } = await accountingDb
        .from("accounting_entities")
        .select("id,name")
        .in("id", entityIds);
      for (const e of ents ?? []) entityNames[(e as any).id] = (e as any).name;
    }
    return (invoices ?? []).map((i: any) => ({
      ...i,
      ksef_upo_xml: undefined,
      entity_name: entityNames[i.entity_id] ?? "—",
    }));
  });

const ManualInvoiceInput = z.object({
  entityId: z.string().uuid(),
  buyerName: z.string().min(1),
  buyerNip: z.string().optional(),
  buyerEmail: z.string().optional(),
  buyerStreet: z.string().optional(),
  buyerCity: z.string().optional(),
  buyerPostalCode: z.string().optional(),
  description: z.string().min(1),
  grossAmount: z.number().positive(),
  vatRate: z.string().default("23"),
  currency: z.string().default("PLN"),
  issueNow: z.boolean().default(true),
});

export const createManualSalesInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => ManualInvoiceInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAccounting(accountingDb, context.userId);
    const pct = data.vatRate === "zw" || data.vatRate === "0" ? 0 : Number(data.vatRate) || 0;
    const net = pct
      ? Math.round((data.grossAmount / (1 + pct / 100)) * 100) / 100
      : data.grossAmount;
    const vat = Math.round((data.grossAmount - net) * 100) / 100;
    const { data: ins, error } = await accountingDb
      .from("sales_invoices")
      .insert({
        entity_id: data.entityId,
        buyer_name: data.buyerName,
        buyer_nip: data.buyerNip ?? null,
        buyer_email: data.buyerEmail ?? null,
        buyer_street: data.buyerStreet ?? null,
        buyer_city: data.buyerCity ?? null,
        buyer_postal_code: data.buyerPostalCode ?? null,
        issue_date: new Date().toISOString().slice(0, 10),
        sale_date: new Date().toISOString().slice(0, 10),
        currency: data.currency,
        net_amount: net,
        vat_amount: vat,
        gross_amount: data.grossAmount,
        vat_rate: data.vatRate,
        items: [
          {
            name: data.description,
            quantity: 1,
            unit: "szt.",
            unitNet: net,
            vatRate: data.vatRate,
          },
        ],
        source_type: "manual",
        status: "draft",
        ksef_status: "not_sent",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Nie udało się utworzyć faktury: ${error.message}`);
    const id = (ins as any).id;
    if (data.issueNow) await issueSalesInvoice(accountingDb, id, context.userId);
    return { ok: true, id };
  });

export const issueSalesInvoiceNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAccounting(accountingDb, context.userId);
    return await issueSalesInvoice(accountingDb, data.id, context.userId);
  });

export const setSalesInvoiceEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid(), entityId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAccounting(accountingDb, context.userId);
    const { data: inv } = await accountingDb
      .from("sales_invoices")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if ((inv as any)?.status !== "draft")
      throw new Error(
        "Podmiot można zmienić tylko dla faktury w wersji roboczej (przed wystawieniem).",
      );
    await accountingDb
      .from("sales_invoices")
      .update({ entity_id: data.entityId })
      .eq("id", data.id);
    await logAccountingAudit(accountingDb, {
      actorUserId: context.userId,
      actorRole: await actorRole(context.userId),
      entityType: "sales_invoice",
      entityId: data.id,
      action: "invoice_entity_changed",
      after: { entity_id: data.entityId },
    });
    return { ok: true };
  });

export const setSalesInvoicePaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAccounting(accountingDb, context.userId);
    await accountingDb.from("sales_invoices").update({ status: "paid" }).eq("id", data.id);
    return { ok: true };
  });

export const getAccountingStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccounting(accountingDb, context.userId);
    const { data: invoices } = await accountingDb
      .from("sales_invoices")
      .select("status,ksef_status,gross_amount,entity_id");
    const sum = (pred: (i: any) => boolean) =>
      Math.round(
        (invoices ?? [])
          .filter(pred)
          .reduce((s: number, i: any) => s + Number(i.gross_amount || 0), 0) * 100,
      ) / 100;
    return {
      count: (invoices ?? []).length,
      draft: (invoices ?? []).filter((i: any) => i.status === "draft").length,
      issued: (invoices ?? []).filter((i: any) => i.status === "issued").length,
      paid: (invoices ?? []).filter((i: any) => i.status === "paid").length,
      ksefAccepted: (invoices ?? []).filter((i: any) => i.ksef_status === "accepted").length,
      ksefPending: (invoices ?? []).filter((i: any) => i.ksef_status === "pending").length,
      ksefError: (invoices ?? []).filter(
        (i: any) => i.ksef_status === "error" || i.ksef_status === "rejected",
      ).length,
      grossTotal: sum(() => true),
      grossPaid: sum((i) => i.status === "paid"),
    };
  });

// --------------------------- EKSPORT ---------------------------
export const exportSalesInvoicesCsv = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccounting(accountingDb, context.userId);
    const { data: invoices } = await accountingDb
      .from("sales_invoices")
      .select("*")
      .order("created_at", { ascending: false });
    const entityIds = Array.from(
      new Set((invoices ?? []).map((i: any) => i.entity_id).filter(Boolean)),
    );
    const names: Record<string, string> = {};
    if (entityIds.length) {
      const { data: ents } = await accountingDb
        .from("accounting_entities")
        .select("id,name")
        .in("id", entityIds);
      for (const e of ents ?? []) names[(e as any).id] = (e as any).name;
    }
    const cell = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const money = (n: unknown) =>
      Number(n ?? 0)
        .toFixed(2)
        .replace(".", ",");
    const headers = [
      "Numer",
      "Podmiot",
      "Data",
      "Nabywca",
      "NIP",
      "Netto",
      "VAT",
      "Brutto",
      "Waluta",
      "Status",
      "KSeF status",
      "Numer KSeF",
    ];
    const lines = [headers.join(";")];
    for (const i of (invoices ?? []) as any[]) {
      lines.push(
        [
          i.invoice_number ?? "",
          names[i.entity_id] ?? "",
          i.issue_date ?? "",
          i.buyer_name ?? "",
          i.buyer_nip ?? "",
          money(i.net_amount),
          money(i.vat_amount),
          money(i.gross_amount),
          i.currency,
          i.status,
          i.ksef_status,
          i.ksef_reference_number ?? "",
        ]
          .map(cell)
          .join(";"),
      );
    }
    return {
      filename: `faktury-sprzedazy-${new Date().toISOString().slice(0, 10)}.csv`,
      csv: "﻿" + lines.join("\r\n"),
    };
  });
