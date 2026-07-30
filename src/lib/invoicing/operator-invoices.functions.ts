// Wystawianie faktur sprzedaży przez operatora — w całości w aplikacji.
// Numeracja i wystawienie realizowane natywnie; numer rachunku do zapłaty pobierany
// z podmiotu (accounting_entities.bank_account) i możliwy do potwierdzenia na formularzu.
// Dane transakcji (miasto/zabezpieczenie/kwota/zysk), typ nabywcy oraz prowizje
// zapisujemy TYLKO informacyjnie w items[0].meta — nie trafiają do opisu faktury.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { accountingDb, logAccountingAudit } from "@/lib/accounting/db";
import { assertRole } from "@/lib/affiliate/db";

// Personel uprawniony do wystawiania FV w panelu operatora.
const INVOICING_ROLES = ["administrator", "ksiegowosc", "operator"] as const;

function pad(n: number, len = 4): string {
  return String(n).padStart(len, "0");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function stripEntity(e: any) {
  const { ksef_token_encrypted, ...rest } = e ?? {};
  return rest;
}

// Lista podmiotów wystawiających (sprzedawców) dostępnych operatorowi — wraz z
// numerem rachunku, który pojawi się na fakturze.
export const listInvoiceEntities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRole(accountingDb, context.userId, [...INVOICING_ROLES]);
    const { data } = await accountingDb
      .from("accounting_entities")
      .select(
        "id,name,legal_name,nip,regon,address_street,address_postal_code,address_city,address_country,bank_account,email,phone,invoice_prefix,default_vat_rate,is_default,active",
      )
      .eq("active", true)
      .order("is_default", { ascending: false })
      .order("name");
    return (data ?? []).map(stripEntity);
  });

// Lista partnerów instytucjonalnych (nabywców) do wyboru na fakturze.
export const listInstitutionalPartners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRole(accountingDb, context.userId, [...INVOICING_ROLES]);
    const { data } = await accountingDb
      .from("investors")
      .select(
        "id,company_name,first_name,last_name,nip,regon,krs,street,postal_code,city,email,phone,investor_type",
      )
      .eq("investor_type", "instytucjonalny")
      .eq("is_active", true)
      .order("company_name", { ascending: true });
    return data ?? [];
  });

const DealContext = z.object({
  city: z.string().optional().default(""),
  security: z.string().optional().default(""),
  loanAmount: z.string().optional().default(""),
  investorProfitAnnual: z.string().optional().default(""),
});

const CreateInput = z.object({
  entityId: z.string().uuid(),
  // instytucja = FV na dane instytucji; klient_indywidualny = FV na dane klienta
  // pożyczkowego (inwestor wypłaca to jako część pożyczki na konto Finance You).
  buyerType: z.enum(["instytucja", "klient_indywidualny"]).default("instytucja"),
  buyerName: z.string().min(1),
  buyerNip: z.string().optional().default(""),
  buyerEmail: z.string().optional().default(""),
  buyerStreet: z.string().optional().default(""),
  buyerCity: z.string().optional().default(""),
  buyerPostalCode: z.string().optional().default(""),
  description: z.string().min(1),
  grossAmount: z.number().positive(),
  vatRate: z.string().default("23"),
  currency: z.string().default("PLN"),
  bankAccount: z.string().optional().default(""),
  dueDate: z.string().optional().default(""),
  deal: DealContext.optional(),
  // Prowizja wewnętrzna operatora (wypłacana, jeśli pożyczka zostanie wypłacona).
  operatorCommission: z.number().nonnegative().optional(),
});

// Tworzy i od razu wystawia fakturę natywnie (nadaje numer, status "issued").
export const createOperatorInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => CreateInput.parse(i))
  .handler(async ({ data, context }) => {
    const roles = await assertRole(accountingDb, context.userId, [...INVOICING_ROLES]);

    const { data: entityRow } = await accountingDb
      .from("accounting_entities")
      .select("*")
      .eq("id", data.entityId)
      .maybeSingle();
    if (!entityRow) throw new Error("Nie znaleziono podmiotu wystawiającego.");
    const entity = entityRow as any;

    const pct = data.vatRate === "zw" || data.vatRate === "0" ? 0 : Number(data.vatRate) || 0;
    const net = pct ? round2(data.grossAmount / (1 + pct / 100)) : data.grossAmount;
    const vat = round2(data.grossAmount - net);

    const bankAccount = (data.bankAccount || entity.bank_account || "").trim();
    const today = new Date().toISOString().slice(0, 10);

    // Numeracja natywna: PREFIX/ROK/NNNN wg licznika podmiotu.
    const year = new Date().getFullYear();
    const next = Number(entity.invoice_next_number || 1);
    const invoiceNumber = `${entity.invoice_prefix || "FV"}/${year}/${pad(next)}`;

    // Dane wewnętrzne (informacyjne) — NIE pokazujemy ich w opisie faktury.
    const items = [
      {
        name: data.description,
        quantity: 1,
        unit: "szt.",
        unitNet: net,
        vatRate: data.vatRate,
        meta: {
          bankAccount,
          buyerType: data.buyerType,
          deal: data.deal ?? null,
          realized: true, // zrealizowane — rejestr wewnętrzny
          dealCommission: data.grossAmount, // kwota prowizji dociągnięta z faktury
          operatorCommission: data.operatorCommission ?? 0,
          loanPaidOut: false, // ustawiane, gdy wypłacimy pożyczkę
        },
      },
    ];

    const { data: ins, error } = await accountingDb
      .from("sales_invoices")
      .insert({
        entity_id: data.entityId,
        invoice_number: invoiceNumber,
        buyer_name: data.buyerName,
        buyer_nip: data.buyerNip || null,
        buyer_email: data.buyerEmail || null,
        buyer_street: data.buyerStreet || null,
        buyer_city: data.buyerCity || null,
        buyer_postal_code: data.buyerPostalCode || null,
        issue_date: today,
        sale_date: today,
        due_date: data.dueDate || null,
        currency: data.currency,
        net_amount: net,
        vat_amount: vat,
        gross_amount: data.grossAmount,
        vat_rate: data.vatRate,
        items,
        source_type: "manual",
        provider: "manual",
        status: "issued",
        ksef_status: "not_sent",
        created_by: context.userId,
      })
      .select("id, invoice_number")
      .single();
    if (error) throw new Error(`Nie udało się wystawić faktury: ${error.message}`);

    // Zwiększ licznik podmiotu dopiero po udanym zapisie.
    await accountingDb
      .from("accounting_entities")
      .update({ invoice_next_number: next + 1 })
      .eq("id", data.entityId);

    const id = (ins as any).id;
    await logAccountingAudit(accountingDb, {
      actorUserId: context.userId,
      actorRole: roles.includes("operator") ? "operator" : (roles[0] ?? "operator"),
      entityType: "sales_invoice",
      entityId: id,
      action: "invoice_issued_operator",
      after: { number: invoiceNumber, provider: "manual", gross: data.grossAmount },
    });

    return { ok: true, id, invoiceNumber };
  });

// Faktury wystawione przez zalogowanego operatora (admin/księgowość widzą wszystkie).
export const listMyOperatorInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await assertRole(accountingDb, context.userId, [...INVOICING_ROLES]);
    const seeAll = roles.includes("administrator") || roles.includes("ksiegowosc");
    let q = accountingDb
      .from("sales_invoices")
      .select(
        "id, invoice_number, buyer_name, buyer_nip, gross_amount, currency, status, issue_date, entity_id, created_by, items",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (!seeAll) q = q.eq("created_by", context.userId);
    const { data } = await q;

    const entityIds = Array.from(
      new Set((data ?? []).map((i: any) => i.entity_id).filter(Boolean)),
    );
    const names: Record<string, string> = {};
    if (entityIds.length) {
      const { data: ents } = await accountingDb
        .from("accounting_entities")
        .select("id,name")
        .in("id", entityIds);
      for (const e of ents ?? []) names[(e as any).id] = (e as any).name;
    }
    return (data ?? []).map((i: any) => {
      const meta = (i.items?.[0]?.meta ?? {}) as Record<string, any>;
      return {
        id: i.id,
        invoice_number: i.invoice_number,
        buyer_name: i.buyer_name,
        buyer_nip: i.buyer_nip,
        gross_amount: i.gross_amount,
        currency: i.currency,
        status: i.status,
        issue_date: i.issue_date,
        entity_name: names[i.entity_id] ?? "—",
        buyer_type: meta.buyerType ?? "instytucja",
        deal: meta.deal ?? null,
        deal_commission: Number(meta.dealCommission ?? i.gross_amount ?? 0),
        operator_commission: Number(meta.operatorCommission ?? 0),
        loan_paid_out: Boolean(meta.loanPaidOut),
      };
    });
  });

// Oznacza, że pożyczka została wypłacona — aktywuje prowizję wewnętrzną operatora.
export const setLoanPaidOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ id: z.string().uuid(), paidOut: z.boolean().default(true) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const roles = await assertRole(accountingDb, context.userId, [...INVOICING_ROLES]);
    const seeAll = roles.includes("administrator") || roles.includes("ksiegowosc");

    const { data: invRow } = await accountingDb
      .from("sales_invoices")
      .select("items, created_by")
      .eq("id", data.id)
      .maybeSingle();
    if (!invRow) throw new Error("Nie znaleziono faktury.");
    const inv = invRow as any;
    if (!seeAll && inv.created_by !== context.userId)
      throw new Error("Brak dostępu do tej faktury.");

    const items = Array.isArray(inv.items) && inv.items.length ? inv.items : [{ meta: {} }];
    items[0] = { ...items[0], meta: { ...(items[0]?.meta ?? {}), loanPaidOut: data.paidOut } };
    await accountingDb.from("sales_invoices").update({ items }).eq("id", data.id);
    return { ok: true };
  });

// Zapisuje dane transakcji (miasto/zabezpieczenie/kwota/zysk) do wystawionej faktury.
// Wywoływane z UI PO wystawieniu FV — user uzupełnia kontekst na końcu.
export const setInvoiceDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        deal: DealContext,
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const roles = await assertRole(accountingDb, context.userId, [...INVOICING_ROLES]);
    const seeAll = roles.includes("administrator") || roles.includes("ksiegowosc");
    const { data: invRow } = await accountingDb
      .from("sales_invoices")
      .select("items, created_by")
      .eq("id", data.id)
      .maybeSingle();
    if (!invRow) throw new Error("Nie znaleziono faktury.");
    const inv = invRow as any;
    if (!seeAll && inv.created_by !== context.userId)
      throw new Error("Brak dostępu do tej faktury.");
    const items = Array.isArray(inv.items) && inv.items.length ? inv.items : [{ meta: {} }];
    items[0] = { ...items[0], meta: { ...(items[0]?.meta ?? {}), deal: data.deal } };
    await accountingDb.from("sales_invoices").update({ items }).eq("id", data.id);
    return { ok: true };
  });

// Pełne dane faktury do wydruku (faktura + sprzedawca). Operator widzi tylko własne.
export const getInvoiceForPrint = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: invRow } = await accountingDb
      .from("sales_invoices")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!invRow) throw new Error("Nie znaleziono faktury.");
    const invoice = invRow as any;

    // Nabywca (inwestor/pośrednik) może otworzyć wyłącznie fakturę przypisaną
    // do jego konta (buyer_user_id) i już wystawioną. Personel wg ról jak dotąd.
    const isBuyer = invoice.buyer_user_id === context.userId && invoice.status !== "draft";
    if (!isBuyer) {
      const roles = await assertRole(accountingDb, context.userId, [...INVOICING_ROLES]);
      const seeAll = roles.includes("administrator") || roles.includes("ksiegowosc");
      if (!seeAll && invoice.created_by !== context.userId) {
        throw new Error("Brak dostępu do tej faktury.");
      }
    }

    const { data: entRow } = await accountingDb
      .from("accounting_entities")
      .select(
        "id,name,legal_name,nip,regon,address_street,address_postal_code,address_city,address_country,bank_account,email,phone",
      )
      .eq("id", invoice.entity_id)
      .maybeSingle();

    // Numer konta: nadpisany na fakturze (items[0].meta.bankAccount) lub z podmiotu.
    const metaBank = invoice.items?.[0]?.meta?.bankAccount as string | undefined;
    const bankAccount = (metaBank && metaBank.trim()) || (entRow as any)?.bank_account || "";

    return {
      invoice: { ...invoice, ksef_upo_xml: undefined },
      entity: (entRow as any) ?? null,
      bankAccount,
      deal: (invoice.items?.[0]?.meta?.deal as any) ?? null,
    };
  });
