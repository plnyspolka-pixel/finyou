import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertStaff(ctx: { supabase: any; userId: string }) {
  const { data: isAdmin } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "administrator" });
  const { data: isOp } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "operator" });
  if (!isAdmin && !isOp) throw new Error("Brak uprawnień");
}

export const listIndividualSales = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin.from("individual_sales_register") as any)
      .select("*")
      .order("paid_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as any[];
  });

export const updateIndividualSaleBuyer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    id: string;
    buyer_name?: string | null;
    buyer_email?: string | null;
    buyer_address?: string | null;
    buyer_city?: string | null;
    buyer_postal_code?: string | null;
    notes?: string | null;
  }) => data)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("individual_sales_register") as any)
      .update({
        buyer_name: data.buyer_name ?? null,
        buyer_email: data.buyer_email ?? null,
        buyer_address: data.buyer_address ?? null,
        buyer_city: data.buyer_city ?? null,
        buyer_postal_code: data.buyer_postal_code ?? null,
        notes: data.notes ?? null,
        invoice_requested_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const issueInvoiceForIndividualSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin.from("individual_sales_register") as any)
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error(error?.message ?? "Brak wpisu");
    if (!row.buyer_name?.trim() || !row.buyer_address?.trim() || !row.buyer_postal_code?.trim() || !row.buyer_city?.trim()) {
      throw new Error("Uzupełnij dane nabywcy (imię i nazwisko, ulica, kod pocztowy, miasto) przed wystawieniem faktury.");
    }
    const { createInvoiceFromPayment } = await import("@/lib/accounting/auto-invoice");
    const buyerFullName = [
      row.buyer_name,
      row.buyer_address,
      [row.buyer_postal_code, row.buyer_city].filter(Boolean).join(" "),
    ]
      .filter(Boolean)
      .join(", ");
    const res = await createInvoiceFromPayment(supabaseAdmin as any, {
      paymentId: `indiv-${row.transaction_id}`,
      grossAmount: Number(row.gross_amount),
      currency: row.currency ?? "PLN",
      description: row.description,
      buyerName: buyerFullName,
      buyerEmail: row.buyer_email ?? null,
      sourceType: "stripe_payment",
      sourceId: row.user_id ?? null,
    });
    if (res.invoiceId) {
      await (supabaseAdmin.from("individual_sales_register") as any)
        .update({ invoice_id: res.invoiceId })
        .eq("id", row.id);
    }
    return res;
  });
