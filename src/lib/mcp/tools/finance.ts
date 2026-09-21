// Finanse: płatności za dostęp, uprawnienia, cennik, faktury, dokumenty
// księgowe, raport przychodów, rozliczenia pośredników.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  daysAgo,
  handle,
  isoDate,
  ok,
  oneOf,
  requireTeam,
  requireUser,
  rowsOf,
  section,
  userRoles,
} from "../_helpers";
import { defineListTool, flag, search, since, text, uuid, until } from "../_list-tool";

const FINANCE_ROLES = ["administrator", "ksiegowosc"] as const;

export const listAccessPayments = defineListTool({
  name: "list_access_payments",
  title: "List access payments",
  description:
    "Płatności za dostęp do platformy (Tpay/Stripe): kupujący, produkt, kwota oczekiwana i zapłacona, status, okres dostępu, czy wymaga przeglądu, faktura. Tylko administrator/operator.",
  table: "access_payments",
  columns:
    "id, user_id, audience, product_id, status, provider, provider_transaction_id, expected_amount_grosz, paid_amount_grosz, currency, buyer_type, buyer_email, buyer_name, buyer_nip, needs_review, failure_reason, invoice_id, invoice_error, granted_from, granted_until, processed_at, created_at",
  resultKey: "payments",
  access: "team",
  filters: {
    status: text("status", "Status płatności (np. pending, paid, failed, refunded)."),
    audience: text("audience", "Grupa (np. investor, client, partner)."),
    provider: text("provider", "Operator płatności."),
    needs_review: flag("needs_review", "Tylko wymagające przeglądu."),
    query: search(
      ["buyer_email", "buyer_name", "buyer_nip"],
      "Fraza: e-mail, nazwa, NIP kupującego.",
    ),
    since: since("created_at"),
    until: until("created_at"),
  },
});

export const listAccessEntitlements = defineListTool({
  name: "list_access_entitlements",
  title: "List access entitlements",
  description:
    "Kto ma dostęp do platformy i do kiedy: użytkownik (e-mail z profilu), grupa, okres aktywności, ostatni produkt i płatność. `active_only` zostawia tylko aktywne. Tylko administrator/operator.",
  table: "access_entitlements",
  columns:
    "id, user_id, audience, active_from, active_until, last_product_id, last_payment_id, created_at, updated_at",
  resultKey: "entitlements",
  access: "team",
  order: { column: "active_until", ascending: false },
  filters: {
    audience: text("audience", "Grupa (np. investor, client, partner)."),
    user_id: uuid("user_id", "Tylko dla tego użytkownika."),
    active_only: {
      schema: z.boolean().default(false).describe("Tylko dostępy aktywne w tej chwili."),
      apply: (q, v) => (v ? q.gte("active_until", new Date().toISOString()) : q),
    },
  },
  attach: [
    {
      key: "user_id",
      table: "profiles",
      columns: "user_id, first_name, last_name, email",
      as: "user",
      targetKey: "user_id",
    },
  ],
});

export const listAccessProducts = defineListTool({
  name: "list_access_products",
  title: "List access products (price list)",
  description:
    "Cennik dostępu: kod produktu, etykieta, grupa, cena w groszach, waluta, długość dostępu w dniach, czy aktywny.",
  table: "access_products",
  columns: "id, code, label, audience, amount_grosz, currency, duration_days, active, sort_order",
  resultKey: "products",
  order: { column: "sort_order", ascending: true },
  filters: {
    audience: text("audience", "Grupa (np. investor, client, partner)."),
    active: flag("active", "Tylko aktywne produkty."),
  },
  openWorld: true,
});

export const getMyAccess = defineTool({
  name: "get_my_access",
  title: "Get my access & roles",
  description:
    "Stan konta zalogowanego użytkownika: role, aktywne dostępy (do kiedy), subskrypcja inwestora, ostatnie płatności. Działa dla każdej roli.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (_i, ctx: ToolContext) =>
    handle(async () => {
      const s = requireUser(ctx);
      const uid = ctx.getUserId();
      const errors: string[] = [];
      const [roles, entitlements, investor, payments] = await Promise.all([
        section(errors, "user_roles", () => userRoles(ctx)),
        section(errors, "access_entitlements", () =>
          rowsOf(
            s
              .from("access_entitlements")
              .select("audience, active_from, active_until, last_product_id, updated_at")
              .eq("user_id", uid),
            "access_entitlements",
          ),
        ),
        section(errors, "investors", () =>
          oneOf(
            s
              .from("investors")
              .select(
                "id, subscription_plan, subscription_status, subscription_active_until, subscription_source, is_active",
              )
              .eq("user_id", uid),
            "investors",
          ),
        ),
        section(errors, "access_payments", () =>
          rowsOf(
            s
              .from("access_payments")
              .select(
                "id, audience, product_id, status, paid_amount_grosz, currency, granted_from, granted_until, processed_at, created_at",
              )
              .eq("user_id", uid)
              .order("created_at", { ascending: false })
              .limit(10),
            "access_payments",
          ),
        ),
      ]);
      const now = new Date().toISOString();
      return ok({
        user_id: uid,
        roles: roles ?? [],
        entitlements: (entitlements ?? []).map((e) => ({
          ...e,
          active: !!e.active_until && e.active_until > now,
        })),
        investor_subscription: investor,
        recent_payments: payments ?? [],
        errors,
      });
    }),
});

export const listSalesInvoices = defineListTool({
  name: "list_sales_invoices",
  title: "List sales invoices",
  description:
    "Faktury sprzedaży (Fakturowo / KSeF): numer, status, status KSeF, daty, nabywca, kwoty netto/VAT/brutto, źródło, PDF, błędy. Tylko administrator/księgowość.",
  table: "sales_invoices",
  columns:
    "id, invoice_number, status, ksef_status, ksef_reference_number, issue_date, sale_date, due_date, buyer_name, buyer_nip, buyer_email, net_amount, vat_amount, gross_amount, vat_rate, currency, provider, source_type, payment_id, pdf_url, error_message, created_at",
  resultKey: "invoices",
  access: FINANCE_ROLES,
  filters: {
    status: text("status", "Status faktury."),
    ksef_status: text("ksef_status", "Status w KSeF."),
    query: search(
      ["invoice_number", "buyer_name", "buyer_nip", "buyer_email"],
      "Fraza: numer, nabywca, NIP.",
    ),
    since: since("created_at"),
    until: until("created_at"),
  },
});

export const listAccountingDocuments = defineListTool({
  name: "list_accounting_documents",
  title: "List accounting documents",
  description:
    "Dokumenty księgowe zaimportowane z KSeF / systemu księgowego: kierunek (sprzedaż/zakup), kontrahent, numer, daty, kwoty, źródło. Tylko administrator/księgowość.",
  table: "accounting_documents",
  columns:
    "id, direction, invoice_number, counterparty_name, counterparty_nip, issue_date, sale_date, due_date, net_amount, vat_amount, gross_amount, vat_rate, currency, source, ksef_status, ksef_reference_number, entity_id, pdf_url, imported_at, created_at",
  resultKey: "documents",
  access: FINANCE_ROLES,
  filters: {
    direction: text("direction", "Kierunek (np. sales, purchase)."),
    entity_id: uuid("entity_id", "Tylko dla tego podmiotu księgowego."),
    query: search(
      ["invoice_number", "counterparty_name", "counterparty_nip"],
      "Fraza: numer, kontrahent, NIP.",
    ),
    since: since("issue_date", "wystawienia"),
    until: until("issue_date", "wystawienia"),
  },
});

export const getRevenueReport = defineTool({
  name: "get_revenue_report",
  title: "Get revenue report",
  description:
    "Przychody z opłaconych dostępów w okresie (domyślnie 30 dni): suma, liczba płatności, rozbicie po produkcie, grupie i miesiącu. Tylko administrator/operator.",
  inputSchema: {
    since: z
      .string()
      .optional()
      .describe("Od kiedy (ISO 8601 lub YYYY-MM-DD; domyślnie 30 dni wstecz)."),
    until: z.string().optional().describe("Do kiedy (domyślnie teraz)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ since, until }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeam(ctx);
      const from = isoDate(since, "data od") ?? daysAgo(30);
      const to = isoDate(until, "data do") ?? new Date().toISOString();
      const rows = await rowsOf<{
        product_id: string;
        audience: string;
        paid_amount_grosz: number | null;
        currency: string;
        processed_at: string;
      }>(
        s
          .from("access_payments")
          .select("product_id, audience, paid_amount_grosz, currency, processed_at")
          .eq("status", "paid")
          .gte("processed_at", from)
          .lt("processed_at", to)
          .order("processed_at", { ascending: false })
          .limit(5000),
        "access_payments",
      );
      const sumBy = (key: (r: (typeof rows)[number]) => string) => {
        const out: Record<string, { count: number; amount_grosz: number }> = {};
        for (const r of rows) {
          const k = key(r) || "(brak)";
          out[k] ??= { count: 0, amount_grosz: 0 };
          out[k].count += 1;
          out[k].amount_grosz += r.paid_amount_grosz ?? 0;
        }
        return out;
      };
      const total = rows.reduce((a, r) => a + (r.paid_amount_grosz ?? 0), 0);
      return ok({
        since: from,
        until: to,
        payments: rows.length,
        truncated: rows.length >= 5000,
        total_grosz: total,
        total_pln: Math.round(total) / 100,
        by_product: sumBy((r) => r.product_id),
        by_audience: sumBy((r) => r.audience),
        by_month: sumBy((r) => String(r.processed_at).slice(0, 7)),
        by_currency: sumBy((r) => r.currency),
      });
    }),
});

export const listBrokerSettlements = defineListTool({
  name: "list_broker_settlements",
  title: "List broker settlements",
  description:
    "Rozliczenia pośredników (prowizje za wnioski): kwota, okres, status, data wypłaty, klient, wniosek. Pośrednik widzi swoje (RLS), zespół — wszystkie.",
  table: "broker_settlements",
  columns:
    "id, broker_user_id, client_name, loan_application_id, amount, currency, period_label, status, paid_at, notes, created_at, updated_at",
  resultKey: "settlements",
  filters: {
    status: text("status", "Status rozliczenia."),
    broker_user_id: uuid("broker_user_id", "Tylko dla tego pośrednika."),
    since: since("created_at"),
  },
});

export const financeTools = [
  listAccessPayments,
  listAccessEntitlements,
  listAccessProducts,
  getMyAccess,
  listSalesInvoices,
  listAccountingDocuments,
  getRevenueReport,
  listBrokerSettlements,
];
