// Faktura na żądanie (narzędzie issue_invoice botów) — reużywa pipeline
// faktur Tpay: numeracja, sales_invoices, KSeF, mail z fakturą.
//
// Bezpieczniki (FV to dokument księgowy — błąd wymaga korekty):
//   - walidacja NIP (suma kontrolna) + dane firmy z GUS (bot nie przepisuje
//     nazwy ze słuchu, jeśli GUS odpowiada),
//   - pozycja z cennika (access_products) → wystawiana od ręki,
//   - dowolna kwota/pozycja z rozmowy → SZKIC (status draft) do zatwierdzenia
//     przez księgowość w panelu fakturowania,
//   - dedup: ta sama prośba (NIP+kwota+dzień) = jedna faktura,
//   - ślad: source_type "other" + payment_id z prefiksem "agent:".
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function isValidNip(raw: string): boolean {
  const nip = raw.replace(/[\s-]/g, "");
  if (!/^\d{10}$/.test(nip)) return false;
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(nip[i]), 0);
  return sum % 11 === Number(nip[9]);
}

export interface IssueInvoiceInput {
  nip: string;
  email: string;
  description: string;
  grossAmount?: number | null;
  /** Kod produktu z cennika (access_products) — wtedy kwota z katalogu. */
  productCode?: string | null;
  buyerName?: string | null;
  buyerStreet?: string | null;
  buyerPostalCode?: string | null;
  buyerCity?: string | null;
}

export interface IssueInvoiceResult {
  ok: boolean;
  status?: "issued" | "draft";
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  message: string;
}

const DAILY_LIMIT_PER_NIP = 3;

export async function issueInvoiceOnDemand(input: IssueInvoiceInput): Promise<IssueInvoiceResult> {
  const nip = input.nip.replace(/[\s-]/g, "");
  if (!isValidNip(nip)) {
    return { ok: false, message: "Nieprawidłowy NIP — poproś rozmówcę o sprawdzenie numeru." };
  }
  const email = input.email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: "Nieprawidłowy adres e-mail do wysyłki faktury." };
  }

  // Kwota: z cennika (od ręki) albo z rozmowy (szkic do zatwierdzenia).
  let gross = input.grossAmount != null ? Number(input.grossAmount) : null;
  let fromPricelist = false;
  let description = input.description.trim().slice(0, 300);
  if (input.productCode) {
    const { data: product } = await (supabaseAdmin as any)
      .from("access_products")
      .select("id, label, price_grosz")
      .eq("id", input.productCode)
      .maybeSingle();
    if (product?.price_grosz) {
      gross = Number(product.price_grosz) / 100;
      description = product.label ?? description;
      fromPricelist = true;
    }
  }
  if (gross == null || !Number.isFinite(gross) || gross <= 0) {
    return { ok: false, message: "Brak kwoty faktury — podaj kwotę brutto albo kod produktu." };
  }

  // Limit dzienny per NIP (anty-nadużycia).
  const today = new Date().toISOString().slice(0, 10);
  const { count } = await (supabaseAdmin as any)
    .from("sales_invoices")
    .select("id", { count: "exact", head: true })
    .eq("buyer_nip", nip)
    .like("payment_id", "agent:%")
    .gte("issue_date", today);
  if ((count ?? 0) >= DAILY_LIMIT_PER_NIP) {
    return {
      ok: false,
      message: "Limit faktur na dziś dla tego NIP wyczerpany — przekaż sprawę księgowości.",
    };
  }

  // Dane firmy z GUS (nazwa z rejestru zamiast ze słuchu, gdy dostępna).
  let buyerName = (input.buyerName ?? "").trim() || null;
  try {
    const { gusLookupByNip } = await import("@/lib/client-profile.functions");
    const gus = await gusLookupByNip(nip);
    if (gus.kind === "found" && gus.nazwa) buyerName = gus.nazwa;
  } catch (e) {
    console.error("[invoice-on-demand] GUS lookup failed", (e as Error).message);
  }
  if (!buyerName) {
    return { ok: false, message: "Brak nazwy firmy — podaj pełną nazwę nabywcy." };
  }

  // Dedup: ta sama prośba (NIP + kwota + dzień) → jedna faktura.
  const dedupKey = `agent:${nip}:${Math.round(gross * 100)}:${today}`;

  const { createInvoiceFromPayment } = await import("@/lib/accounting/auto-invoice");
  const res = await createInvoiceFromPayment(supabaseAdmin as any, {
    paymentId: dedupKey,
    grossAmount: gross,
    currency: "PLN",
    description,
    buyerName,
    buyerEmail: email,
    buyerNip: nip,
    buyerStreet: input.buyerStreet ?? null,
    buyerPostalCode: input.buyerPostalCode ?? null,
    buyerCity: input.buyerCity ?? null,
    sourceType: "other",
    // Pozycja z cennika → wystaw od ręki; dowolna kwota → szkic dla księgowości.
    autoIssue: fromPricelist,
  });

  if (!res.invoiceId && res.deduped) {
    const { data: existing } = await (supabaseAdmin as any)
      .from("sales_invoices")
      .select("id, invoice_number, status")
      .eq("payment_id", dedupKey)
      .maybeSingle();
    if (existing?.id) {
      return {
        ok: true,
        status: existing.status === "draft" ? "draft" : "issued",
        invoiceId: existing.id,
        invoiceNumber: existing.invoice_number ?? null,
        message: "Faktura dla tej prośby już istnieje — nie wystawiono duplikatu.",
      };
    }
  }
  if (!res.invoiceId) {
    return { ok: false, message: res.message ?? "Nie udało się przygotować faktury." };
  }

  const { data: inv } = await (supabaseAdmin as any)
    .from("sales_invoices")
    .select("id, invoice_number, status")
    .eq("id", res.invoiceId)
    .maybeSingle();

  if (fromPricelist) {
    return {
      ok: true,
      status: "issued",
      invoiceId: res.invoiceId,
      invoiceNumber: inv?.invoice_number ?? null,
      message: `Faktura ${inv?.invoice_number ?? ""} wystawiona i zostanie wysłana na ${email}.`,
    };
  }
  return {
    ok: true,
    status: "draft",
    invoiceId: res.invoiceId,
    invoiceNumber: null,
    message:
      "Faktura przygotowana jako szkic — zostanie wysłana po zatwierdzeniu przez księgowość.",
  };
}
