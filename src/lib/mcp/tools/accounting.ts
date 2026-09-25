// Księgowość: podmioty, faktury sprzedaży (tworzenie, wystawienie w KSeF,
// statusy), należności, rejestr VAT, dokumenty kosztowe, rejestr sprzedaży
// osób fizycznych, synchronizacja z KSeF. Logika wystawiania i numeracji jest
// wspólna z panelem /admin/ksiegowosc (src/lib/accounting).
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  WRITE,
  WRITE_IDEMPOTENT,
  actorId,
  fail,
  handle,
  ilikeAny,
  insertOne,
  ok,
  oneOf,
  patchOf,
  requireRoles,
  requireRolesAdmin,
  rowsOf,
  updateOne,
} from "../_helpers";
import { defineListTool, search, text, uuid } from "../_list-tool";

const FINANCE_ROLES = ["administrator", "ksiegowosc"] as const;
/** Rejestr sprzedaży osób fizycznych prowadzi też operator (jak w panelu). */
const REGISTER_ROLES = ["administrator", "operator", "ksiegowosc"] as const;

export const VAT_RATES = ["23", "8", "5", "0", "zw"] as const;
export type VatRate = (typeof VAT_RATES)[number];

const INVOICE_COLUMNS =
  "id, entity_id, invoice_number, status, ksef_status, ksef_reference_number, issue_date, sale_date, due_date, buyer_name, buyer_nip, buyer_email, buyer_street, buyer_postal_code, buyer_city, buyer_country, buyer_user_id, net_amount, vat_amount, gross_amount, vat_rate, currency, items, provider, source_type, source_id, payment_id, pdf_url, error_message, created_by, created_at, updated_at";

const ENTITY_COLUMNS =
  "id, name, legal_name, nip, regon, address_street, address_postal_code, address_city, address_country, bank_account, email, phone, is_default, active, invoice_prefix, invoice_next_number, vat_payer, default_vat_rate, provider, ksef_environment, ksef_nip, created_at, updated_at";

// ------------------------------------------------------------------
// Czyste funkcje (testowane w accounting.test.ts)
// ------------------------------------------------------------------

export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Stawka VAT w procentach; `zw` i `0` → 0. */
export function vatPct(rate: string): number {
  if (rate === "zw" || rate === "0") return 0;
  const n = Number(rate);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Nieznana stawka VAT: ${rate}`);
  return n;
}

export type LineInput = {
  name: string;
  quantity?: number;
  unit?: string;
  unit_net?: number;
  unit_gross?: number;
  vat_rate?: VatRate;
};

export type InvoiceLine = {
  name: string;
  quantity: number;
  unit: string;
  unitNet: number;
  vatRate: string;
  net: number;
  vat: number;
  gross: number;
};

/**
 * Pozycje faktury → wiersze w formacie `sales_invoices.items` (jak w panelu i
 * generatorze FA KSeF) + sumy. Każda pozycja podaje cenę netto albo brutto.
 * Przy cenie brutto brutto pozycji jest dokładne, netto wyliczane w dół.
 */
export function buildInvoiceLines(items: LineInput[], defaultRate: string) {
  if (!items.length) throw new Error("Faktura musi mieć co najmniej jedną pozycję.");
  const lines: InvoiceLine[] = items.map((it, i) => {
    const quantity = it.quantity ?? 1;
    if (!(quantity > 0)) throw new Error(`Pozycja ${i + 1}: ilość musi być dodatnia.`);
    const rate = it.vat_rate ?? defaultRate;
    const pct = vatPct(rate);
    const hasNet = typeof it.unit_net === "number";
    const hasGross = typeof it.unit_gross === "number";
    if (hasNet === hasGross)
      throw new Error(`Pozycja ${i + 1}: podaj dokładnie jedno z unit_net albo unit_gross.`);
    let net: number;
    let gross: number;
    if (hasNet) {
      net = round2(quantity * it.unit_net!);
      gross = round2(net + round2((net * pct) / 100));
    } else {
      gross = round2(quantity * it.unit_gross!);
      net = round2(gross / (1 + pct / 100));
    }
    return {
      name: it.name,
      quantity,
      unit: it.unit ?? "szt.",
      unitNet: hasNet ? it.unit_net! : Math.round((net / quantity) * 10_000) / 10_000,
      vatRate: rate,
      net,
      vat: round2(gross - net),
      gross,
    };
  });
  const net = round2(lines.reduce((a, l) => a + l.net, 0));
  const vat = round2(lines.reduce((a, l) => a + l.vat, 0));
  const gross = round2(lines.reduce((a, l) => a + l.gross, 0));
  const rates = [...new Set(lines.map((l) => l.vatRate))];
  return {
    items: lines.map(({ name, quantity, unit, unitNet, vatRate }) => ({
      name,
      quantity,
      unit,
      unitNet,
      vatRate,
    })),
    lines,
    net_amount: net,
    vat_amount: vat,
    gross_amount: gross,
    vat_rate: rates.length === 1 ? rates[0] : "mix",
  };
}

/** Okres rozliczeniowy: `YYYY-MM` (miesiąc), `YYYY-Qn` (kwartał) albo `YYYY` (rok). Koniec wyłącznie. */
export function periodRange(period: string): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  let m = /^(\d{4})-(\d{2})$/.exec(period);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    if (mo < 1 || mo > 12) throw new Error(`Nieprawidłowy miesiąc: ${period}`);
    const ny = mo === 12 ? y + 1 : y;
    const nm = mo === 12 ? 1 : mo + 1;
    return { from: `${y}-${pad(mo)}-01`, to: `${ny}-${pad(nm)}-01` };
  }
  m = /^(\d{4})-Q([1-4])$/i.exec(period);
  if (m) {
    const y = Number(m[1]);
    const q = Number(m[2]);
    const start = (q - 1) * 3 + 1;
    return {
      from: `${y}-${pad(start)}-01`,
      to: q === 4 ? `${y + 1}-01-01` : `${y}-${pad(start + 3)}-01`,
    };
  }
  m = /^(\d{4})$/.exec(period);
  if (m) return { from: `${m[1]}-01-01`, to: `${Number(m[1]) + 1}-01-01` };
  throw new Error(`Nieprawidłowy okres: ${period} (użyj YYYY-MM, YYYY-Qn albo YYYY).`);
}

/** Data `YYYY-MM-DD` (walidacja). */
export function ymd(v: string, label = "data"): string {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error(`Nieprawidłowa ${label}: ${v}`);
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : d.toISOString().slice(0, 10);
}

export type AgingBucket = "not_due" | "no_due_date" | "1-30" | "31-60" | "61-90" | "90+";

/** Dni po terminie (ujemne = przed terminem) i koszyk wiekowania należności. */
export function aging(
  dueDate: string | null | undefined,
  today: string,
): { days_overdue: number | null; bucket: AgingBucket } {
  if (!dueDate) return { days_overdue: null, bucket: "no_due_date" };
  const days = Math.round(
    (Date.parse(today.slice(0, 10)) - Date.parse(dueDate.slice(0, 10))) / 86_400_000,
  );
  const bucket: AgingBucket =
    days <= 0
      ? "not_due"
      : days <= 30
        ? "1-30"
        : days <= 60
          ? "31-60"
          : days <= 90
            ? "61-90"
            : "90+";
  return { days_overdue: days, bucket };
}

type VatRow = {
  direction: string;
  vat_rate: string | null;
  net_amount: number | string | null;
  vat_amount: number | string | null;
  gross_amount: number | string | null;
  currency?: string | null;
};

/** Rejestr VAT: sumy netto/VAT/brutto po kierunku i stawce + VAT do zapłaty (należny − naliczony). */
export function summarizeVat(rows: VatRow[]) {
  type T = { count: number; net: number; vat: number; gross: number };
  const zero = (): T => ({ count: 0, net: 0, vat: 0, gross: 0 });
  const add = (t: T, r: VatRow) => {
    t.count += 1;
    t.net += Number(r.net_amount ?? 0);
    t.vat += Number(r.vat_amount ?? 0);
    t.gross += Number(r.gross_amount ?? 0);
  };
  const fix = (t: T): T => ({
    count: t.count,
    net: round2(t.net),
    vat: round2(t.vat),
    gross: round2(t.gross),
  });
  const sales = zero();
  const purchase = zero();
  const salesByRate: Record<string, T> = {};
  const purchaseByRate: Record<string, T> = {};
  const currencies = new Set<string>();
  for (const r of rows) {
    if (r.currency) currencies.add(r.currency);
    const rate = r.vat_rate || "(brak)";
    if (r.direction === "sales") {
      add(sales, r);
      add((salesByRate[rate] ??= zero()), r);
    } else {
      add(purchase, r);
      add((purchaseByRate[rate] ??= zero()), r);
    }
  }
  const mapFix = (m: Record<string, T>) =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, fix(v)]));
  return {
    sales: fix(sales),
    purchase: fix(purchase),
    sales_by_rate: mapFix(salesByRate),
    purchase_by_rate: mapFix(purchaseByRate),
    vat_output: round2(sales.vat),
    vat_input: round2(purchase.vat),
    vat_due: round2(sales.vat - purchase.vat),
    currencies: [...currencies],
  };
}

// ------------------------------------------------------------------
// Wspólne
// ------------------------------------------------------------------

async function audit(
  db: SupabaseClient,
  ctx: ToolContext,
  entityType: string,
  entityId: string | null,
  action: string,
  after?: unknown,
  reason?: string | null,
) {
  const { logAccountingAudit } = await import("@/lib/accounting/db");
  await logAccountingAudit(db, {
    actorUserId: ctx.getUserId() ?? null,
    actorRole: "mcp",
    entityType,
    entityId,
    action,
    after,
    reason: reason ?? null,
  });
}

async function loadInvoice(db: SupabaseClient, id: string) {
  const inv = await oneOf(
    db.from("sales_invoices").select(INVOICE_COLUMNS).eq("id", id),
    "sales_invoices",
  );
  if (!inv) throw new Error(`Nie znaleziono faktury ${id}.`);
  return inv;
}

const lineSchema = z.object({
  name: z.string().min(1).max(512).describe("Nazwa towaru/usługi."),
  quantity: z.number().positive().optional().describe("Ilość (domyślnie 1)."),
  unit: z.string().max(20).optional().describe("Jednostka (domyślnie „szt.”)."),
  unit_net: z.number().min(0).optional().describe("Cena jednostkowa netto."),
  unit_gross: z.number().min(0).optional().describe("Cena jednostkowa brutto (zamiast netto)."),
  vat_rate: z.enum(VAT_RATES).optional().describe("Stawka VAT (domyślnie stawka podmiotu)."),
});

const buyerShape = {
  buyer_name: z.string().min(1).max(300).optional(),
  buyer_nip: z.string().max(20).nullable().optional(),
  buyer_email: z.string().email().nullable().optional(),
  buyer_street: z.string().max(300).nullable().optional(),
  buyer_postal_code: z.string().max(20).nullable().optional(),
  buyer_city: z.string().max(120).nullable().optional(),
  buyer_country: z.string().length(2).optional().describe("Kod kraju ISO (domyślnie PL)."),
};

// ------------------------------------------------------------------
// ODCZYT
// ------------------------------------------------------------------

export const listAccountingEntities = defineTool({
  name: "list_accounting_entities",
  title: "List accounting entities",
  description:
    "Podmioty gospodarcze Finance You wystawiające faktury: nazwa, dane na fakturze (NIP, REGON, adres, rachunek), prefiks i licznik numeracji, stawka VAT, dostawca (manual/KSeF), środowisko KSeF, czy domyślny. Bez sekretów. Tylko administrator/księgowość.",
  inputSchema: { active_only: z.boolean().optional().describe("Tylko aktywne.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ active_only }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRoles(ctx, FINANCE_ROLES);
      let q = s
        .from("accounting_entities")
        .select(ENTITY_COLUMNS)
        .order("is_default", { ascending: false })
        .order("name");
      if (active_only) q = q.eq("active", true);
      return ok({ entities: await rowsOf(q, "accounting_entities") });
    }),
});

export const getSalesInvoice = defineTool({
  name: "get_sales_invoice",
  title: "Get sales invoice",
  description:
    "Pełna faktura sprzedaży po id albo numerze: nabywca, pozycje, kwoty, daty, status, status i numer KSeF, błędy, podmiot wystawiający. `include_upo` dołącza UPO (XML potwierdzenia KSeF). Tylko administrator/księgowość.",
  inputSchema: {
    invoice_id: z.string().uuid().optional(),
    invoice_number: z.string().min(1).optional().describe("Np. FY/2026/0012."),
    include_upo: z.boolean().optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ invoice_id, invoice_number, include_upo }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRoles(ctx, FINANCE_ROLES);
      if (!invoice_id && !invoice_number) return fail("Podaj invoice_id albo invoice_number.");
      const cols = include_upo ? `${INVOICE_COLUMNS}, ksef_upo_xml` : INVOICE_COLUMNS;
      let q = s.from("sales_invoices").select(cols);
      q = invoice_id ? q.eq("id", invoice_id) : q.eq("invoice_number", invoice_number!);
      const inv = await oneOf(q.limit(1), "sales_invoices");
      if (!inv) return fail("Nie znaleziono faktury.");
      const entity = inv.entity_id
        ? await oneOf(
            s
              .from("accounting_entities")
              .select("id, name, legal_name, nip, provider, ksef_environment")
              .eq("id", inv.entity_id),
            "accounting_entities",
          )
        : null;
      const today = new Date().toISOString().slice(0, 10);
      const unpaid = inv.status === "issued" || inv.status === "sent";
      return ok({ invoice: inv, entity, ...(unpaid ? aging(inv.due_date, today) : {}) });
    }),
});

export const listReceivables = defineTool({
  name: "list_receivables",
  title: "List receivables (unpaid invoices)",
  description:
    "Należności: wystawione i niezapłacone faktury sprzedaży (status issued/sent) z liczbą dni po terminie i wiekowaniem (nie wymagalne, 1–30, 31–60, 61–90, 90+ dni). `overdue_only` zostawia przeterminowane. Zwraca też sumy per koszyk. Tylko administrator/księgowość.",
  inputSchema: {
    entity_id: z.string().uuid().optional(),
    overdue_only: z.boolean().optional(),
    query: z.string().min(2).optional().describe("Fraza: numer, nabywca, NIP, e-mail."),
    limit: z.number().int().min(1).max(500).optional().describe("Domyślnie 100."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ entity_id, overdue_only, query, limit }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRoles(ctx, FINANCE_ROLES);
      const today = new Date().toISOString().slice(0, 10);
      let q = s
        .from("sales_invoices")
        .select(
          "id, entity_id, invoice_number, status, issue_date, due_date, buyer_name, buyer_nip, buyer_email, gross_amount, currency, pdf_url",
        )
        .in("status", ["issued", "sent"])
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(2000);
      if (entity_id) q = q.eq("entity_id", entity_id);
      if (overdue_only) q = q.lt("due_date", today);
      if (query)
        q = q.or(ilikeAny(["invoice_number", "buyer_name", "buyer_nip", "buyer_email"], query));
      const rows = (await rowsOf(q, "sales_invoices")).map((r): Record<string, any> => ({
        ...r,
        ...aging(r.due_date, today),
      }));
      const buckets: Record<string, { count: number; gross: number }> = {};
      for (const r of rows) {
        const b = (buckets[`${r.bucket}|${r.currency}`] ??= { count: 0, gross: 0 });
        b.count += 1;
        b.gross = round2(b.gross + Number(r.gross_amount ?? 0));
      }
      const totalByCurrency: Record<string, number> = {};
      for (const r of rows)
        totalByCurrency[r.currency] = round2(
          (totalByCurrency[r.currency] ?? 0) + Number(r.gross_amount ?? 0),
        );
      return ok({
        as_of: today,
        count: rows.length,
        total_by_currency: totalByCurrency,
        by_bucket: buckets,
        receivables: rows.slice(0, limit ?? 100),
        truncated: rows.length >= 2000,
      });
    }),
});

export const getVatSummary = defineTool({
  name: "get_vat_summary",
  title: "Get VAT summary (VAT register)",
  description:
    "Rejestr VAT za okres: sprzedaż i zakupy (netto/VAT/brutto), rozbicie po stawkach, VAT należny, naliczony i do zapłaty. Okres jako `period` (YYYY-MM, YYYY-Qn, YYYY) albo `since`/`until` (YYYY-MM-DD, `until` wyłącznie). Źródło: `documents` (domyślnie — rejestr dokumentów z KSeF/importu, sprzedaż i koszty) albo `invoices` (tylko faktury sprzedaży wystawione w platformie). `include_documents` dołącza listę dokumentów. Tylko administrator/księgowość. To zestawienie pomocnicze — deklarację VAT/JPK weryfikuje księgowa.",
  inputSchema: {
    period: z
      .string()
      .optional()
      .describe("YYYY-MM, YYYY-Qn albo YYYY; domyślnie bieżący miesiąc."),
    since: z.string().optional(),
    until: z.string().optional(),
    entity_id: z.string().uuid().optional(),
    source: z.enum(["documents", "invoices"]).optional(),
    include_documents: z.boolean().optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRoles(ctx, FINANCE_ROLES);
      const range =
        a.since || a.until
          ? {
              from: a.since ? ymd(a.since, "data od") : "1900-01-01",
              to: a.until ? ymd(a.until, "data do") : "2999-01-01",
            }
          : periodRange(a.period ?? new Date().toISOString().slice(0, 7));
      let rows: Array<VatRow & Record<string, any>>;
      if ((a.source ?? "documents") === "documents") {
        let q = s
          .from("accounting_documents")
          .select(
            "id, direction, source, invoice_number, issue_date, counterparty_name, counterparty_nip, net_amount, vat_amount, gross_amount, vat_rate, currency, ksef_reference_number, entity_id",
          )
          .gte("issue_date", range.from)
          .lt("issue_date", range.to)
          .order("issue_date")
          .limit(10_000);
        if (a.entity_id) q = q.eq("entity_id", a.entity_id);
        rows = await rowsOf<VatRow & Record<string, any>>(q, "accounting_documents");
      } else {
        let q = s
          .from("sales_invoices")
          .select(
            "id, invoice_number, issue_date, buyer_name, buyer_nip, net_amount, vat_amount, gross_amount, vat_rate, currency, ksef_reference_number, entity_id, status",
          )
          .in("status", ["issued", "sent", "paid"])
          .gte("issue_date", range.from)
          .lt("issue_date", range.to)
          .order("issue_date")
          .limit(10_000);
        if (a.entity_id) q = q.eq("entity_id", a.entity_id);
        rows = (await rowsOf(q, "sales_invoices")).map((r): VatRow & Record<string, any> => ({
          ...(r as VatRow),
          direction: "sales",
        }));
      }
      return ok({
        from: range.from,
        until_exclusive: range.to,
        source: a.source ?? "documents",
        entity_id: a.entity_id ?? null,
        documents_count: rows.length,
        truncated: rows.length >= 10_000,
        ...summarizeVat(rows),
        ...(a.include_documents ? { documents: rows } : {}),
      });
    }),
});

export const getAccountingOverview = defineTool({
  name: "get_accounting_overview",
  title: "Get accounting overview",
  description:
    "Stan księgowości w pigułce: faktury sprzedaży wg statusu i statusu KSeF (w tym błędy do poprawy, szkice do wystawienia), należności i przeterminowane, sprzedaż/koszty/VAT po miesiącach (ostatnie `months`, domyślnie 6) i od początku roku, stan synchronizacji z KSeF. Zacznij od niego, gdy użytkownik pyta ogólnie o księgowość. Tylko administrator/księgowość.",
  inputSchema: {
    months: z.number().int().min(1).max(24).optional(),
    entity_id: z.string().uuid().optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ months, entity_id }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRoles(ctx, FINANCE_ROLES);
      const n = months ?? 6;
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1), 1));
      const yearStart = `${now.getUTCFullYear()}-01-01`;
      const from = [start.toISOString().slice(0, 10), yearStart].sort()[0];

      let invQ = s
        .from("sales_invoices")
        .select(
          "id, invoice_number, status, ksef_status, due_date, gross_amount, currency, error_message, buyer_name, created_at",
        )
        .limit(20_000);
      if (entity_id) invQ = invQ.eq("entity_id", entity_id);
      let docQ = s
        .from("accounting_documents")
        .select("direction, issue_date, net_amount, vat_amount, gross_amount, vat_rate, currency")
        .gte("issue_date", from)
        .limit(20_000);
      if (entity_id) docQ = docQ.eq("entity_id", entity_id);
      let syncQ = s
        .from("accounting_sync_status")
        .select(
          "entity_id, source, direction, last_run_at, last_success_at, last_error, documents_synced",
        );
      if (entity_id) syncQ = syncQ.eq("entity_id", entity_id);

      const [invoices, docs, sync] = await Promise.all([
        rowsOf(invQ, "sales_invoices"),
        rowsOf<VatRow & Record<string, any>>(docQ, "accounting_documents"),
        rowsOf(syncQ, "accounting_sync_status"),
      ]);

      const byStatus: Record<string, number> = {};
      const byKsef: Record<string, number> = {};
      for (const i of invoices) {
        byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
        byKsef[i.ksef_status] = (byKsef[i.ksef_status] ?? 0) + 1;
      }
      const unpaid = invoices.filter((i) => i.status === "issued" || i.status === "sent");
      const overdue = unpaid.filter((i) => i.due_date && i.due_date < today);
      const sum = (rows: any[]) =>
        round2(rows.reduce((a, r) => a + Number(r.gross_amount ?? 0), 0));

      const monthly: Record<string, VatRow[]> = {};
      for (const d of docs) {
        const m = String(d.issue_date ?? "").slice(0, 7);
        if (m && `${m}-01` >= start.toISOString().slice(0, 10)) (monthly[m] ??= []).push(d);
      }
      const monthRows = Object.keys(monthly)
        .sort()
        .map((m) => {
          const v = summarizeVat(monthly[m]);
          return {
            month: m,
            sales_net: v.sales.net,
            sales_vat: v.sales.vat,
            purchase_net: v.purchase.net,
            purchase_vat: v.purchase.vat,
            vat_due: v.vat_due,
            result_net: round2(v.sales.net - v.purchase.net),
          };
        });
      const ytd = summarizeVat(docs.filter((d) => String(d.issue_date ?? "") >= yearStart));

      return ok({
        as_of: today,
        invoices: {
          total: invoices.length,
          by_status: byStatus,
          by_ksef_status: byKsef,
          drafts_to_issue: invoices
            .filter((i) => i.status === "draft")
            .slice(0, 20)
            .map((i) => ({
              id: i.id,
              buyer_name: i.buyer_name,
              gross_amount: i.gross_amount,
              created_at: i.created_at,
            })),
          ksef_errors: invoices
            .filter((i) => i.ksef_status === "error" || i.ksef_status === "rejected")
            .slice(0, 20)
            .map((i) => ({
              id: i.id,
              invoice_number: i.invoice_number,
              error_message: i.error_message,
            })),
        },
        receivables: {
          unpaid_count: unpaid.length,
          unpaid_gross: sum(unpaid),
          overdue_count: overdue.length,
          overdue_gross: sum(overdue),
        },
        months: monthRows,
        ytd: {
          sales: ytd.sales,
          purchase: ytd.purchase,
          vat_due: ytd.vat_due,
          result_net: round2(ytd.sales.net - ytd.purchase.net),
        },
        sync_status: sync,
      });
    }),
});

export const getAccountingDocument = defineTool({
  name: "get_accounting_document",
  title: "Get accounting document",
  description:
    "Jeden dokument z rejestru księgowego (faktura sprzedaży lub kosztowa z KSeF / importu / wpisana ręcznie): kontrahent, pozycje, kwoty, numer KSeF, PDF. `include_xml` dołącza źródłowy XML faktury KSeF (FA). Tylko administrator/księgowość.",
  inputSchema: {
    document_id: z.string().uuid(),
    include_xml: z.boolean().optional(),
    include_raw: z.boolean().optional().describe("Surowe dane z importu."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ document_id, include_xml, include_raw }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRoles(ctx, FINANCE_ROLES);
      const cols = [
        "id, entity_id, direction, source, external_id, invoice_number, issue_date, sale_date, due_date, counterparty_name, counterparty_nip, counterparty_address, currency, net_amount, vat_amount, gross_amount, vat_rate, items, pdf_url, ksef_reference_number, ksef_status, imported_at, created_at, updated_at",
        include_xml ? "xml_content" : null,
        include_raw ? "raw_payload" : null,
      ]
        .filter(Boolean)
        .join(", ");
      const doc = await oneOf(
        s.from("accounting_documents").select(cols).eq("id", document_id),
        "accounting_documents",
      );
      if (!doc) return fail("Nie znaleziono dokumentu.");
      return ok({ document: doc });
    }),
});

export const listIndividualSales = defineListTool({
  name: "list_individual_sales",
  title: "List individual sales register",
  description:
    "Rejestr sprzedaży na rzecz osób fizycznych (wpłaty Tpay bez faktury na firmę): transakcja, nabywca, opis, kwota, data wpłaty, czy wystawiono fakturę. `without_invoice` zostawia wpisy bez faktury. Administrator/operator/księgowość.",
  table: "individual_sales_register",
  columns:
    "id, transaction_id, user_id, buyer_name, buyer_email, buyer_address, buyer_postal_code, buyer_city, description, gross_amount, currency, paid_at, invoice_requested_at, invoice_id, notes, created_at",
  resultKey: "sales",
  access: REGISTER_ROLES,
  order: { column: "paid_at", ascending: false },
  filters: {
    without_invoice: {
      schema: z.boolean().optional().describe("Tylko wpisy bez faktury."),
      apply: (q, v) => (v ? q.is("invoice_id", null) : q),
    },
    query: search(
      ["transaction_id", "buyer_name", "buyer_email", "description"],
      "Fraza: transakcja, nabywca, e-mail, opis.",
    ),
    since: {
      schema: z.string().optional().describe("Wpłaty od (YYYY-MM-DD)."),
      apply: (q, v) => q.gte("paid_at", ymd(v, "data od")),
    },
    until: {
      schema: z.string().optional().describe("Wpłaty do (YYYY-MM-DD, wyłącznie)."),
      apply: (q, v) => q.lt("paid_at", ymd(v, "data do")),
    },
  },
});

export const listAccountingSyncStatus = defineListTool({
  name: "get_accounting_sync_status",
  title: "Get accounting sync status",
  description:
    "Stan synchronizacji księgowości z KSeF / Fakturowo per podmiot i kierunek: ostatnie uruchomienie, ostatni sukces, błąd, liczba dokumentów. Tylko administrator/księgowość.",
  table: "accounting_sync_status",
  columns:
    "id, entity_id, source, direction, last_run_at, last_success_at, last_error, documents_synced, updated_at",
  resultKey: "sync_status",
  access: FINANCE_ROLES,
  order: { column: "updated_at", ascending: false },
  filters: {
    entity_id: uuid("entity_id", "Tylko dla tego podmiotu."),
    source: text("source", "Źródło (ksef, fakturowo)."),
    failed_only: {
      schema: z.boolean().optional().describe("Tylko z błędem ostatniego przebiegu."),
      apply: (q, v) => (v ? q.not("last_error", "is", null) : q),
    },
  },
  attach: [{ key: "entity_id", table: "accounting_entities", columns: "id, name", as: "entity" }],
});

// ------------------------------------------------------------------
// ZAPIS
// ------------------------------------------------------------------

export const createSalesInvoice = defineTool({
  name: "create_sales_invoice",
  title: "Create sales invoice",
  description:
    "Tworzy fakturę sprzedaży (szkic) z pozycjami: każda z ceną netto (`unit_net`) albo brutto (`unit_gross`), ilością i stawką VAT (23/8/5/0/zw). Kwoty liczy kod. Podmiot: `entity_id` albo domyślny. Termin płatności: `due_date` albo `payment_days` (domyślnie 14). Z `issue_now: true` od razu wystawia (numer + wysyłka do KSeF, jeśli podmiot ma KSeF) — tylko po akceptacji podglądu przez użytkownika. Tylko administrator/księgowość.",
  inputSchema: {
    entity_id: z.string().uuid().optional(),
    ...buyerShape,
    buyer_name: z.string().min(1).max(300),
    buyer_user_id: z
      .string()
      .uuid()
      .optional()
      .describe("Konto nabywcy — udostępnia mu fakturę w panelu."),
    items: z.array(lineSchema).min(1).max(100),
    sale_date: z.string().optional().describe("Data sprzedaży (domyślnie dziś)."),
    due_date: z.string().optional(),
    payment_days: z.number().int().min(0).max(365).optional(),
    currency: z.string().length(3).optional().describe("Domyślnie PLN."),
    issue_now: z.boolean().optional(),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const db = await requireRolesAdmin(ctx, FINANCE_ROLES);
      const { pickEntity } = await import("@/lib/accounting/auto-invoice");
      const entity = await pickEntity(db, a.entity_id);
      if (!entity) return fail("Brak podmiotu gospodarczego (list_accounting_entities).");
      if (a.entity_id && entity.id !== a.entity_id)
        return fail("Nie znaleziono wskazanego podmiotu.");
      if (!entity.active) return fail(`Podmiot „${entity.name}” jest nieaktywny.`);
      const calc = buildInvoiceLines(a.items, entity.default_vat_rate ?? "23");
      const today = new Date().toISOString().slice(0, 10);
      const due =
        a.due_date !== undefined
          ? ymd(a.due_date, "due_date")
          : new Date(Date.now() + (a.payment_days ?? 14) * 86_400_000).toISOString().slice(0, 10);
      const row = await insertOne(
        db,
        "sales_invoices",
        {
          entity_id: entity.id,
          buyer_name: a.buyer_name,
          buyer_nip: a.buyer_nip ?? null,
          buyer_email: a.buyer_email ?? null,
          buyer_street: a.buyer_street ?? null,
          buyer_postal_code: a.buyer_postal_code ?? null,
          buyer_city: a.buyer_city ?? null,
          buyer_country: a.buyer_country ?? "PL",
          buyer_user_id: a.buyer_user_id ?? null,
          sale_date: a.sale_date ? ymd(a.sale_date, "sale_date") : today,
          due_date: due,
          currency: (a.currency ?? "PLN").toUpperCase(),
          net_amount: calc.net_amount,
          vat_amount: calc.vat_amount,
          gross_amount: calc.gross_amount,
          vat_rate: calc.vat_rate,
          items: calc.items,
          source_type: "manual",
          status: "draft",
          ksef_status: entity.ksef_environment === "disabled" ? "disabled" : "not_sent",
          provider: entity.provider,
          created_by: actorId(ctx),
        },
        INVOICE_COLUMNS,
      );
      await audit(db, ctx, "sales_invoice", row.id, "invoice_created", {
        gross: calc.gross_amount,
        buyer: a.buyer_name,
      });
      if (!a.issue_now) {
        return ok({
          ok: true,
          invoice: row,
          lines: calc.lines,
          next: "Szkic zapisany. Po akceptacji wywołaj issue_sales_invoice.",
        });
      }
      const { issueSalesInvoice } = await import("@/lib/accounting/issue");
      const issued = await issueSalesInvoice(db, row.id, actorId(ctx));
      return ok({
        ok: issued.ok,
        issue: issued,
        invoice: await loadInvoice(db, row.id),
        lines: calc.lines,
      });
    }),
});

export const updateSalesInvoice = defineTool({
  name: "update_sales_invoice",
  title: "Update draft sales invoice",
  description:
    "Poprawia fakturę w wersji roboczej (przed wystawieniem): nabywca, podmiot, pozycje (zastępują dotychczasowe, kwoty liczone od nowa), daty sprzedaży i płatności. Wystawionej faktury nie da się edytować — wymaga korekty. Tylko administrator/księgowość.",
  inputSchema: {
    invoice_id: z.string().uuid(),
    entity_id: z.string().uuid().optional(),
    ...buyerShape,
    buyer_user_id: z.string().uuid().nullable().optional(),
    items: z.array(lineSchema).min(1).max(100).optional(),
    sale_date: z.string().optional(),
    due_date: z.string().nullable().optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const db = await requireRolesAdmin(ctx, FINANCE_ROLES);
      const inv = await loadInvoice(db, a.invoice_id);
      if (inv.status !== "draft")
        return fail(`Faktura ma status „${inv.status}” — edytować można tylko szkic (draft).`);
      const patch = patchOf(a, [
        "buyer_name",
        "buyer_nip",
        "buyer_email",
        "buyer_street",
        "buyer_postal_code",
        "buyer_city",
        "buyer_country",
        "buyer_user_id",
      ]);
      let entity: any = null;
      if (a.entity_id) {
        entity = await oneOf(
          db
            .from("accounting_entities")
            .select("id, active, provider, ksef_environment, default_vat_rate")
            .eq("id", a.entity_id),
          "accounting_entities",
        );
        if (!entity) return fail("Nie znaleziono podmiotu.");
        if (!entity.active) return fail("Podmiot jest nieaktywny.");
        patch.entity_id = entity.id;
        patch.provider = entity.provider;
        patch.ksef_status = entity.ksef_environment === "disabled" ? "disabled" : "not_sent";
      }
      let lines: InvoiceLine[] | undefined;
      if (a.items) {
        if (!entity)
          entity = await oneOf(
            db.from("accounting_entities").select("default_vat_rate").eq("id", inv.entity_id),
            "accounting_entities",
          );
        const calc = buildInvoiceLines(a.items, entity?.default_vat_rate ?? "23");
        Object.assign(patch, {
          items: calc.items,
          net_amount: calc.net_amount,
          vat_amount: calc.vat_amount,
          gross_amount: calc.gross_amount,
          vat_rate: calc.vat_rate,
        });
        lines = calc.lines;
      }
      if (a.sale_date !== undefined) patch.sale_date = ymd(a.sale_date, "sale_date");
      if (a.due_date !== undefined)
        patch.due_date = a.due_date === null ? null : ymd(a.due_date, "due_date");
      if (Object.keys(patch).length === 0) return fail("Brak pól do zmiany.");
      const row = await updateOne(db, "sales_invoices", a.invoice_id, patch, INVOICE_COLUMNS);
      await audit(db, ctx, "sales_invoice", a.invoice_id, "invoice_updated", patch);
      return ok({ ok: true, invoice: row, ...(lines ? { lines } : {}) });
    }),
});

export const issueSalesInvoiceTool = defineTool({
  name: "issue_sales_invoice",
  title: "Issue sales invoice (numbering + KSeF)",
  description:
    "Wystawia fakturę: nadaje numer wg prefiksu podmiotu (np. FY/2026/0007), ustawia datę wystawienia i — gdy podmiot działa przez KSeF — wysyła ją do KSeF (nieodwracalne; błąd KSeF zostawia szkic z opisem). Ponowne wywołanie dla faktury z błędem KSeF ponawia wysyłkę. Wywołuj tylko na wyraźne polecenie. Tylko administrator/księgowość.",
  inputSchema: { invoice_id: z.string().uuid() },
  annotations: { ...WRITE, openWorldHint: true },
  handler: ({ invoice_id }, ctx: ToolContext) =>
    handle(async () => {
      const db = await requireRolesAdmin(ctx, FINANCE_ROLES);
      const inv = await loadInvoice(db, invoice_id);
      if (inv.status === "cancelled") return fail("Faktura jest anulowana.");
      // Błąd KSeF zostawia szkic (issue.ts), więc ponowienie to też wystawienie szkicu.
      if (inv.status !== "draft")
        return fail(
          `Faktura ${inv.invoice_number ?? invoice_id} jest już wystawiona (status ${inv.status}, KSeF ${inv.ksef_status}).`,
        );
      const { issueSalesInvoice } = await import("@/lib/accounting/issue");
      const res = await issueSalesInvoice(db, invoice_id, actorId(ctx));
      return ok({ ok: res.ok, result: res, invoice: await loadInvoice(db, invoice_id) });
    }),
});

export const setSalesInvoiceStatus = defineTool({
  name: "set_sales_invoice_status",
  title: "Set sales invoice status",
  description:
    "Zmienia status faktury sprzedaży: `paid` (zapłacona — rozlicza należność), `sent` (wysłana nabywcy), `issued` (cofnięcie oznaczenia zapłaty/wysyłki), `cancelled` (anulowanie — tylko szkic albo faktura niewysłana do KSeF; przyjętej w KSeF nie da się anulować, potrzebna korekta). Podaj powód przy anulowaniu. Tylko administrator/księgowość.",
  inputSchema: {
    invoice_id: z.string().uuid(),
    status: z.enum(["paid", "sent", "issued", "cancelled"]),
    reason: z.string().max(500).optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: ({ invoice_id, status, reason }, ctx: ToolContext) =>
    handle(async () => {
      const db = await requireRolesAdmin(ctx, FINANCE_ROLES);
      const inv = await loadInvoice(db, invoice_id);
      if (inv.status === status) return ok({ ok: true, unchanged: true, invoice: inv });
      if (inv.status === "cancelled")
        return fail("Faktura jest anulowana — zmiana statusu niemożliwa.");
      if (status === "cancelled") {
        if (["accepted", "pending"].includes(inv.ksef_status))
          return fail(
            "Faktura jest w KSeF — nie można jej anulować. Wystaw fakturę korygującą (do zera) w systemie księgowym.",
          );
        if (!reason) return fail("Podaj powód anulowania (reason).");
      } else if (inv.status === "draft") {
        return fail("Szkic trzeba najpierw wystawić (issue_sales_invoice).");
      }
      const row = await updateOne(
        db,
        "sales_invoices",
        invoice_id,
        { status },
        "id, invoice_number, status, ksef_status, gross_amount, currency, due_date",
      );
      await audit(
        db,
        ctx,
        "sales_invoice",
        invoice_id,
        `invoice_status_${status}`,
        { from: inv.status, to: status },
        reason,
      );
      return ok({ ok: true, invoice: row });
    }),
});

export const addPurchaseDocument = defineTool({
  name: "add_purchase_document",
  title: "Add purchase (cost) document",
  description:
    "Dopisuje do rejestru księgowego fakturę kosztową spoza KSeF (np. zagraniczną, paragon z NIP): podmiot, numer, kontrahent, daty, kwoty netto/VAT/brutto (brakujące dolicza ze stawki), stawka, link do PDF. Dokumenty z KSeF trafiają same przez sync_accounting — nie dubluj ich. Tylko administrator/księgowość.",
  inputSchema: {
    entity_id: z.string().uuid(),
    invoice_number: z.string().min(1).max(120),
    counterparty_name: z.string().min(1).max(300),
    counterparty_nip: z.string().max(20).optional(),
    counterparty_address: z.string().max(500).optional(),
    issue_date: z.string(),
    sale_date: z.string().optional(),
    due_date: z.string().optional(),
    net_amount: z.number().min(0).optional(),
    vat_amount: z.number().min(0).optional(),
    gross_amount: z.number().min(0).optional(),
    vat_rate: z.enum(VAT_RATES).optional().describe("Domyślnie 23."),
    currency: z.string().length(3).optional(),
    description: z.string().max(500).optional().describe("Czego dotyczy (pozycja dokumentu)."),
    pdf_url: z.string().url().optional(),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const db = await requireRolesAdmin(ctx, FINANCE_ROLES);
      const rate = a.vat_rate ?? "23";
      const pct = vatPct(rate);
      let net = a.net_amount;
      let vat = a.vat_amount;
      let gross = a.gross_amount;
      if (net === undefined && gross === undefined)
        return fail("Podaj net_amount albo gross_amount.");
      if (net === undefined) net = round2(gross! / (1 + pct / 100));
      if (vat === undefined)
        vat = gross !== undefined ? round2(gross - net) : round2((net * pct) / 100);
      if (gross === undefined) gross = round2(net + vat);
      if (Math.abs(round2(net + vat) - gross) > 0.02)
        return fail(`Kwoty się nie sumują: netto ${net} + VAT ${vat} ≠ brutto ${gross}.`);
      // Ten sam numer u różnych sprzedawców jest dozwolony — duplikat to numer + kontrahent.
      let dupQ = db
        .from("accounting_documents")
        .select("id, source")
        .eq("entity_id", a.entity_id)
        .eq("direction", "purchase")
        .eq("invoice_number", a.invoice_number);
      dupQ = a.counterparty_nip
        ? dupQ.eq("counterparty_nip", a.counterparty_nip)
        : dupQ.ilike("counterparty_name", a.counterparty_name);
      const dup = await oneOf(dupQ.limit(1), "accounting_documents");
      if (dup)
        return fail(
          `Dokument ${a.invoice_number} już jest w rejestrze (id ${dup.id}, źródło ${dup.source}).`,
        );
      const row = await insertOne(
        db,
        "accounting_documents",
        {
          entity_id: a.entity_id,
          direction: "purchase",
          source: "manual",
          external_id: `mcp-${crypto.randomUUID()}`,
          invoice_number: a.invoice_number,
          issue_date: ymd(a.issue_date, "issue_date"),
          sale_date: a.sale_date ? ymd(a.sale_date, "sale_date") : null,
          due_date: a.due_date ? ymd(a.due_date, "due_date") : null,
          counterparty_name: a.counterparty_name,
          counterparty_nip: a.counterparty_nip ?? null,
          counterparty_address: a.counterparty_address ?? null,
          currency: (a.currency ?? "PLN").toUpperCase(),
          net_amount: net,
          vat_amount: vat,
          gross_amount: gross,
          vat_rate: rate,
          items: a.description
            ? [{ name: a.description, quantity: 1, unit: "szt.", unitNet: net, vatRate: rate }]
            : [],
          pdf_url: a.pdf_url ?? null,
          raw_payload: { added_by: actorId(ctx), via: "mcp" },
        },
        "id, entity_id, direction, source, invoice_number, issue_date, counterparty_name, net_amount, vat_amount, gross_amount, vat_rate, currency",
      );
      await audit(db, ctx, "accounting_document", row.id, "purchase_document_added", {
        number: a.invoice_number,
        gross,
      });
      return ok({ ok: true, document: row });
    }),
});

export const syncAccounting = defineTool({
  name: "sync_accounting",
  title: "Sync accounting with KSeF",
  description:
    "Uruchamia synchronizację księgowości: pobiera faktury sprzedaży i kosztowe z KSeF (oraz Fakturowo) dla wszystkich aktywnych podmiotów do rejestru dokumentów. Może potrwać; wynik per podmiot i kierunek. Tylko administrator/księgowość.",
  inputSchema: {},
  annotations: { ...WRITE_IDEMPOTENT, openWorldHint: true },
  handler: (_a, ctx: ToolContext) =>
    handle(async () => {
      const db = await requireRolesAdmin(ctx, FINANCE_ROLES);
      const { syncAllAccounting } = await import("@/lib/accounting/sync-core.server");
      const { results } = await syncAllAccounting();
      await audit(db, ctx, "accounting_sync", null, "sync_run", {
        ok: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
      });
      return ok({ ok: results.every((r) => r.ok), results });
    }),
});

export const updateIndividualSaleBuyer = defineTool({
  name: "update_individual_sale_buyer",
  title: "Update individual sale buyer data",
  description:
    "Uzupełnia dane nabywcy we wpisie rejestru sprzedaży osób fizycznych (imię i nazwisko, e-mail, ulica, kod, miasto, notatka) — potrzebne przed wystawieniem faktury imiennej. Administrator/operator/księgowość.",
  inputSchema: {
    sale_id: z.string().uuid(),
    buyer_name: z.string().max(300).optional(),
    buyer_email: z.string().email().nullable().optional(),
    buyer_address: z.string().max(300).optional(),
    buyer_postal_code: z.string().max(20).optional(),
    buyer_city: z.string().max(120).optional(),
    notes: z.string().max(2000).nullable().optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const db = await requireRolesAdmin(ctx, REGISTER_ROLES);
      const patch = patchOf(a, [
        "buyer_name",
        "buyer_email",
        "buyer_address",
        "buyer_postal_code",
        "buyer_city",
        "notes",
      ]);
      if (Object.keys(patch).length === 0) return fail("Brak pól do zmiany.");
      patch.invoice_requested_at = new Date().toISOString();
      const row = await updateOne(
        db,
        "individual_sales_register",
        a.sale_id,
        patch,
        "id, transaction_id, buyer_name, buyer_email, buyer_address, buyer_postal_code, buyer_city, gross_amount, invoice_id, notes",
      );
      return ok({ ok: true, sale: row });
    }),
});

export const issueIndividualSaleInvoice = defineTool({
  name: "issue_individual_sale_invoice",
  title: "Issue invoice for individual sale",
  description:
    "Wystawia fakturę imienną do wpisu w rejestrze sprzedaży osób fizycznych (wymaga uzupełnionych danych nabywcy). Nie dubluje: jeśli faktura do tej płatności już istnieje, tylko ją podpina. Wystawienie idzie przez podmiot domyślny (numer, KSeF). Administrator/operator/księgowość.",
  inputSchema: { sale_id: z.string().uuid() },
  annotations: { ...WRITE_IDEMPOTENT, openWorldHint: true },
  handler: ({ sale_id }, ctx: ToolContext) =>
    handle(async () => {
      const db = await requireRolesAdmin(ctx, REGISTER_ROLES);
      const { issueInvoiceForIndividualSaleRow } =
        await import("@/lib/accounting/individual-sale-invoice");
      const res = await issueInvoiceForIndividualSaleRow(db, sale_id);
      if (!res.invoiceId) return fail(res.message ?? "Nie udało się utworzyć faktury.");
      return ok({ ok: true, ...res, invoice: await loadInvoice(db, res.invoiceId) });
    }),
});

export const accountingTools = [
  getAccountingOverview,
  listAccountingEntities,
  getSalesInvoice,
  listReceivables,
  getVatSummary,
  getAccountingDocument,
  listIndividualSales,
  listAccountingSyncStatus,
  createSalesInvoice,
  updateSalesInvoice,
  issueSalesInvoiceTool,
  setSalesInvoiceStatus,
  addPurchaseDocument,
  syncAccounting,
  updateIndividualSaleBuyer,
  issueIndividualSaleInvoice,
];
