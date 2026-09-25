// Faktura do wpisu w rejestrze sprzedaży osób fizycznych — wspólne dla panelu
// (/admin/ksiegowosc/rejestr-of) i narzędzi MCP.
import type { SupabaseClient } from "@supabase/supabase-js";

export async function issueInvoiceForIndividualSaleRow(
  db: SupabaseClient,
  id: string,
): Promise<{ invoiceId: string | null; deduped?: boolean; message?: string }> {
  const { data: row, error } = await (db.from("individual_sales_register") as any)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !row) throw new Error(error?.message ?? "Brak wpisu");

  // Deduplikacja po identyfikatorze płatności Tpay: jeżeli faktura już
  // istnieje (automatyczna z webhooka albo wcześniejsza ręczna), tylko ją
  // podpinamy — nigdy nie wystawiamy drugiej.
  if (row.invoice_id) return { invoiceId: row.invoice_id, deduped: true };
  const { data: existingInvoice } = await (db.from("sales_invoices") as any)
    .select("id")
    .in("payment_id", [String(row.transaction_id), `indiv-${row.transaction_id}`])
    .limit(1)
    .maybeSingle();
  if (existingInvoice?.id) {
    await (db.from("individual_sales_register") as any)
      .update({ invoice_id: existingInvoice.id })
      .eq("id", row.id);
    return { invoiceId: existingInvoice.id, deduped: true };
  }

  if (
    !row.buyer_name?.trim() ||
    !row.buyer_address?.trim() ||
    !row.buyer_postal_code?.trim() ||
    !row.buyer_city?.trim()
  ) {
    throw new Error(
      "Uzupełnij dane nabywcy (imię i nazwisko, ulica, kod pocztowy, miasto) przed wystawieniem faktury.",
    );
  }
  const { createInvoiceFromPayment } = await import("@/lib/accounting/auto-invoice");
  const res = await createInvoiceFromPayment(db, {
    paymentId: String(row.transaction_id),
    grossAmount: Number(row.gross_amount),
    currency: row.currency ?? "PLN",
    description: row.description,
    // Adres w dedykowanych kolumnach faktury, nie w buyer_name.
    buyerName: row.buyer_name,
    buyerEmail: row.buyer_email ?? null,
    buyerStreet: row.buyer_address ?? null,
    buyerPostalCode: row.buyer_postal_code ?? null,
    buyerCity: row.buyer_city ?? null,
    buyerUserId: row.user_id ?? null,
    sourceType: "tpay_payment",
    sourceId: row.user_id ?? null,
  });
  if (res.invoiceId) {
    await (db.from("individual_sales_register") as any)
      .update({ invoice_id: res.invoiceId })
      .eq("id", row.id);
  }
  return res;
}
