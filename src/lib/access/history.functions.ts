// „Płatności i faktury" — historia własnych płatności użytkownika
// (inwestor i pośrednik). Użytkownik widzi wyłącznie swoje dane.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AccessPaymentHistoryRow {
  id: string;
  createdAt: string;
  status: string;
  productLabel: string;
  audience: "investor" | "broker";
  amountGrosz: number;
  currency: string;
  buyerType: "person" | "company";
  grantedFrom: string | null;
  grantedUntil: string | null;
  providerTransactionId: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  invoiceKsefStatus: string | null;
  invoicePending: boolean;
}

export const listMyAccessPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccessPaymentHistoryRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const { data: payments, error } = await db
      .from("access_payments")
      .select(
        "id,created_at,status,audience,expected_amount_grosz,paid_amount_grosz,currency,buyer_type,granted_from,granted_until,provider_transaction_id,invoice_id,product_id",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const rows = (payments ?? []) as any[];

    const productIds = Array.from(new Set(rows.map((r) => r.product_id).filter(Boolean)));
    const invoiceIds = Array.from(new Set(rows.map((r) => r.invoice_id).filter(Boolean)));

    const [productsRes, invoicesRes] = await Promise.all([
      productIds.length
        ? db.from("access_products").select("id,label").in("id", productIds)
        : Promise.resolve({ data: [] }),
      invoiceIds.length
        ? db
            .from("sales_invoices")
            .select("id,invoice_number,status,ksef_status")
            .in("id", invoiceIds)
        : Promise.resolve({ data: [] }),
    ]);
    const productById = new Map<string, any>(
      ((productsRes.data ?? []) as any[]).map((p) => [p.id, p]),
    );
    const invoiceById = new Map<string, any>(
      ((invoicesRes.data ?? []) as any[]).map((i) => [i.id, i]),
    );

    return rows.map((r) => {
      const invoice = r.invoice_id ? invoiceById.get(r.invoice_id) : null;
      return {
        id: r.id,
        createdAt: r.created_at,
        status: r.status,
        productLabel: productById.get(r.product_id)?.label ?? "Dostęp do platformy",
        audience: r.audience,
        amountGrosz: Number(r.paid_amount_grosz ?? r.expected_amount_grosz),
        currency: r.currency ?? "PLN",
        buyerType: r.buyer_type,
        grantedFrom: r.granted_from,
        grantedUntil: r.granted_until,
        providerTransactionId: r.provider_transaction_id,
        invoiceId: r.invoice_id,
        invoiceNumber: invoice?.invoice_number ?? null,
        invoiceStatus: invoice?.status ?? null,
        invoiceKsefStatus: invoice?.ksef_status ?? null,
        invoicePending: r.status === "paid" && !r.invoice_id,
      };
    });
  });

// Ponowna wysyłka własnej faktury na e-mail nabywcy.
export const resendMyInvoiceEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ paymentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: payment } = await db
      .from("access_payments")
      .select("id,user_id,invoice_id")
      .eq("id", data.paymentId)
      .maybeSingle();
    if (!payment || payment.user_id !== context.userId) throw new Error("Nie znaleziono płatności");
    if (!payment.invoice_id) throw new Error("Do tej płatności nie wystawiono jeszcze faktury");
    const { sendAccessInvoiceEmail } = await import("./invoice.server");
    const res = await sendAccessInvoiceEmail(data.paymentId);
    if (!res.ok) throw new Error(res.message ?? "Nie udało się wysłać faktury");
    return { ok: true };
  });
