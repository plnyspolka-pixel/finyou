// Automatyczne wystawienie faktury sprzedaży po zaksięgowanej wpłacie.
// Wywoływane z webhooka płatności. Wybiera podmiot (domyślny lub wskazany),
// liczy netto/VAT z kwoty brutto i wystawia fakturę zgodnie z konfiguracją podmiotu.
import type { SupabaseClient } from "@supabase/supabase-js";
import { issueSalesInvoice } from "./issue";

function splitGross(gross: number, vatRate: string): { net: number; vat: number } {
  if (vatRate === "zw" || vatRate === "0") return { net: round(gross), vat: 0 };
  const pct = Number(vatRate) || 0;
  const net = gross / (1 + pct / 100);
  return { net: round(net), vat: round(gross - net) };
}
function round(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export async function pickEntity(
  db: SupabaseClient,
  entityId?: string | null,
): Promise<any | null> {
  if (entityId) {
    const { data } = await db
      .from("accounting_entities")
      .select("*")
      .eq("id", entityId)
      .maybeSingle();
    if (data) return data;
  }
  const { data: def } = await db
    .from("accounting_entities")
    .select("*")
    .eq("is_default", true)
    .eq("active", true)
    .maybeSingle();
  if (def) return def;
  const { data: any1 } = await db
    .from("accounting_entities")
    .select("*")
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  return any1 ?? null;
}

export async function createInvoiceFromPayment(
  db: SupabaseClient,
  input: {
    paymentId: string;
    grossAmount: number;
    currency?: string;
    description: string;
    buyerName?: string | null;
    buyerEmail?: string | null;
    buyerNip?: string | null;
    // Adres nabywcy trafia do właściwych kolumn faktury (nigdy do buyer_name).
    buyerStreet?: string | null;
    buyerPostalCode?: string | null;
    buyerCity?: string | null;
    buyerCountry?: string | null;
    // Konto użytkownika-nabywcy — udostępnia fakturę w panelu (RLS).
    buyerUserId?: string | null;
    sourceType?: "stripe_payment" | "tpay_payment" | "affiliate_commission" | "other";
    sourceId?: string | null;
    entityId?: string | null;
    autoIssue?: boolean;
  },
): Promise<{ invoiceId: string | null; deduped?: boolean; message?: string }> {
  // Deduplikacja po identyfikatorze płatności.
  const { data: existing } = await db
    .from("sales_invoices")
    .select("id")
    .eq("payment_id", input.paymentId)
    .maybeSingle();
  if (existing) return { invoiceId: (existing as any).id, deduped: true };

  const entity = await pickEntity(db, input.entityId);
  if (!entity) return { invoiceId: null, message: "Brak skonfigurowanego podmiotu gospodarczego." };

  const vatRate = entity.default_vat_rate ?? "23";
  const { net, vat } = splitGross(input.grossAmount, vatRate);

  const { data: inserted, error } = await db
    .from("sales_invoices")
    .insert({
      entity_id: entity.id,
      buyer_name: input.buyerName ?? null,
      buyer_email: input.buyerEmail ?? null,
      buyer_nip: input.buyerNip ?? null,
      buyer_street: input.buyerStreet ?? null,
      buyer_postal_code: input.buyerPostalCode ?? null,
      buyer_city: input.buyerCity ?? null,
      buyer_country: input.buyerCountry ?? "PL",
      buyer_user_id: input.buyerUserId ?? null,
      issue_date: new Date().toISOString().slice(0, 10),
      sale_date: new Date().toISOString().slice(0, 10),
      currency: input.currency ?? "PLN",
      net_amount: net,
      vat_amount: vat,
      gross_amount: round(input.grossAmount),
      vat_rate: vatRate,
      items: [{ name: input.description, quantity: 1, unit: "szt.", unitNet: net, vatRate }],
      payment_id: input.paymentId,
      source_type: input.sourceType ?? "stripe_payment",
      source_id: input.sourceId ?? null,
      status: "draft",
      ksef_status: entity.ksef_environment === "disabled" ? "disabled" : "not_sent",
      provider: entity.provider,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    // Najpewniej wyścig na unikalnym payment_id — traktujemy jako zdeduplikowane.
    return { invoiceId: null, deduped: true, message: error?.message };
  }

  const invoiceId = (inserted as { id: string }).id;
  if (input.autoIssue !== false) {
    try {
      await issueSalesInvoice(db, invoiceId);
    } catch (e) {
      await db
        .from("sales_invoices")
        .update({ error_message: `Auto-wystawienie nie powiodło się: ${(e as Error).message}` })
        .eq("id", invoiceId);
    }
  }
  return { invoiceId };
}
