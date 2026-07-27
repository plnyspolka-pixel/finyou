// Automatyczna faktura za opłacony dostęp (firma → FV, osoba prywatna →
// faktura imienna bez NIP, z pełnym adresem). Idempotentna: deduplikacja po
// identyfikatorze transakcji Tpay (sales_invoices.payment_id, unikalny indeks).
// Awaria faktury NIGDY nie cofa przyznanego dostępu — błąd zapisywany jest w
// access_payments.invoice_error, administrator ma akcję „Ponów wystawienie".
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createInvoiceFromPayment } from "@/lib/accounting/auto-invoice";
import { groszToPln } from "./core";

const db = supabaseAdmin as any;

export interface EnsureInvoiceResult {
  ok: boolean;
  invoiceId: string | null;
  invoiceNumber?: string | null;
  deduped?: boolean;
  message?: string;
}

/** Wystawia (lub odnajduje) fakturę dla opłaconej płatności dostępu. */
export async function ensureInvoiceForAccessPayment(
  paymentId: string,
): Promise<EnsureInvoiceResult> {
  const { data: payment } = await db
    .from("access_payments")
    .select("*")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) return { ok: false, invoiceId: null, message: "Nie znaleziono płatności" };
  if (payment.status !== "paid") {
    return {
      ok: false,
      invoiceId: null,
      message: `Płatność nie jest opłacona (status: ${payment.status})`,
    };
  }
  if (payment.invoice_id) {
    const { data: inv } = await db
      .from("sales_invoices")
      .select("id,invoice_number")
      .eq("id", payment.invoice_id)
      .maybeSingle();
    return {
      ok: true,
      invoiceId: payment.invoice_id,
      invoiceNumber: inv?.invoice_number ?? null,
      deduped: true,
    };
  }

  const { data: product } = await db
    .from("access_products")
    .select("label")
    .eq("id", payment.product_id)
    .maybeSingle();
  const description = product?.label ?? "Dostęp do platformy Finance You";

  // Klucz deduplikacji: identyfikator transakcji Tpay (spójny z historycznymi
  // fakturami z webhooka oraz wpisami rejestru sprzedaży osób fizycznych).
  const dedupKey = payment.provider_transaction_id
    ? String(payment.provider_transaction_id)
    : `access-${payment.id}`;

  try {
    const res = await createInvoiceFromPayment(db, {
      paymentId: dedupKey,
      grossAmount: groszToPln(Number(payment.paid_amount_grosz ?? payment.expected_amount_grosz)),
      currency: payment.currency ?? "PLN",
      description,
      buyerName: payment.buyer_name,
      buyerEmail: payment.buyer_email,
      buyerNip: payment.buyer_type === "company" ? payment.buyer_nip : null,
      buyerStreet: payment.buyer_street,
      buyerPostalCode: payment.buyer_postal_code,
      buyerCity: payment.buyer_city,
      buyerCountry: payment.buyer_country ?? "PL",
      buyerUserId: payment.user_id,
      sourceType: "tpay_payment",
      sourceId: payment.user_id,
    });

    if (!res.invoiceId && res.deduped) {
      // Przegrany wyścig z równoległym wystawieniem — faktura już istnieje;
      // podepnij ją zamiast raportować błąd.
      const { data: raced } = await db
        .from("sales_invoices")
        .select("id,invoice_number")
        .eq("payment_id", dedupKey)
        .maybeSingle();
      if (raced?.id) {
        await db
          .from("access_payments")
          .update({ invoice_id: raced.id, invoice_error: null })
          .eq("id", paymentId);
        return {
          ok: true,
          invoiceId: raced.id,
          invoiceNumber: raced.invoice_number ?? null,
          deduped: true,
        };
      }
    }

    if (!res.invoiceId) {
      const message = res.message ?? "Nie udało się wystawić faktury";
      await db.from("access_payments").update({ invoice_error: message }).eq("id", paymentId);
      return { ok: false, invoiceId: null, message };
    }

    await db
      .from("access_payments")
      .update({ invoice_id: res.invoiceId, invoice_error: null })
      .eq("id", paymentId);

    // Osoba prywatna: wpis w rejestrze sprzedaży osób fizycznych automatycznie
    // powiązany z fakturą imienną (deduplikacja po transaction_id).
    if (payment.buyer_type === "person" && payment.provider_transaction_id) {
      try {
        await db.from("individual_sales_register").upsert(
          {
            transaction_id: String(payment.provider_transaction_id),
            user_id: payment.user_id,
            buyer_name: payment.buyer_name,
            buyer_email: payment.buyer_email,
            buyer_address: payment.buyer_street,
            buyer_city: payment.buyer_city,
            buyer_postal_code: payment.buyer_postal_code,
            description,
            gross_amount: groszToPln(
              Number(payment.paid_amount_grosz ?? payment.expected_amount_grosz),
            ),
            currency: payment.currency ?? "PLN",
            paid_at: payment.processed_at ?? new Date().toISOString(),
            invoice_id: res.invoiceId,
          },
          { onConflict: "transaction_id" },
        );
      } catch (e) {
        console.error(
          "[access-invoice] individual_sales_register upsert failed",
          (e as Error).message,
        );
      }
    }

    const { data: inv } = await db
      .from("sales_invoices")
      .select("id,invoice_number")
      .eq("id", res.invoiceId)
      .maybeSingle();
    return {
      ok: true,
      invoiceId: res.invoiceId,
      invoiceNumber: inv?.invoice_number ?? null,
      deduped: res.deduped,
    };
  } catch (e) {
    const message = (e as Error).message;
    await db.from("access_payments").update({ invoice_error: message }).eq("id", paymentId);
    console.error("[access-invoice] failed", message);
    return { ok: false, invoiceId: null, message };
  }
}

/** Wysyła (ponownie) e-mail z fakturą do nabywcy. */
export async function sendAccessInvoiceEmail(
  paymentId: string,
): Promise<{ ok: boolean; message?: string }> {
  const { data: payment } = await db
    .from("access_payments")
    .select(
      "id,buyer_email,buyer_type,invoice_id,paid_amount_grosz,expected_amount_grosz,product_id",
    )
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment?.invoice_id) return { ok: false, message: "Brak faktury dla tej płatności" };
  if (!payment.buyer_email) return { ok: false, message: "Brak adresu e-mail nabywcy" };

  const [{ data: inv }, { data: product }] = await Promise.all([
    db
      .from("sales_invoices")
      .select("id,invoice_number")
      .eq("id", payment.invoice_id)
      .maybeSingle(),
    db.from("access_products").select("label").eq("id", payment.product_id).maybeSingle(),
  ]);
  if (!inv) return { ok: false, message: "Nie znaleziono faktury" };

  const { sendInvoiceIssuedEmail } = await import("./emails.server");
  await sendInvoiceIssuedEmail({
    to: payment.buyer_email,
    invoiceNumber: inv.invoice_number ?? null,
    invoiceId: inv.id,
    productLabel: product?.label ?? "Dostęp do platformy Finance You",
    amountGrosz: Number(payment.paid_amount_grosz ?? payment.expected_amount_grosz),
    buyerType: payment.buyer_type,
  });
  return { ok: true };
}
