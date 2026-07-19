// Panel administratora: płatności za dostęp, faktury, ręczne zmiany dostępu,
// log webhooków, audyt ról partnerów. Każda ręczna zmiana dostępu przechodzi
// przez SQL `admin_adjust_access` (audyt w access_audit_logs).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["administrator", "ksiegowosc"]);
  if (!((data ?? []) as any[]).length) throw new Error("Brak uprawnień");
}

export const adminListAccessPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        status: z.string().optional().default(""),
        audience: z.enum(["investor", "broker", "all"]).optional().default("all"),
        search: z.string().optional().default(""),
        needsReview: z.boolean().optional().default(false),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    let q = db
      .from("access_payments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status) q = q.eq("status", data.status);
    if (data.audience !== "all") q = q.eq("audience", data.audience);
    if (data.needsReview) q = q.eq("needs_review", true);
    const { data: payments, error } = await q;
    if (error) throw new Error(error.message);
    let rows = (payments ?? []) as any[];

    if (data.search) {
      const s = data.search.toLowerCase();
      rows = rows.filter((p) =>
        [p.buyer_name, p.buyer_email, p.buyer_nip, p.provider_transaction_id, p.user_id, p.id].some(
          (v) =>
            String(v ?? "")
              .toLowerCase()
              .includes(s),
        ),
      );
    }

    const productIds = Array.from(new Set(rows.map((r) => r.product_id).filter(Boolean)));
    const invoiceIds = Array.from(new Set(rows.map((r) => r.invoice_id).filter(Boolean)));
    const eventIds = Array.from(new Set(rows.map((r) => r.affiliate_event_id).filter(Boolean)));
    const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));

    const [productsRes, invoicesRes, eventsRes, rolesRes] = await Promise.all([
      productIds.length
        ? db.from("access_products").select("id,code,label,duration_days").in("id", productIds)
        : { data: [] },
      invoiceIds.length
        ? db
            .from("sales_invoices")
            .select("id,invoice_number,status,ksef_status,error_message")
            .in("id", invoiceIds)
        : { data: [] },
      eventIds.length
        ? db
            .from("affiliate_commission_events")
            .select("id,event_type,event_status,external_ref")
            .in("id", eventIds)
        : { data: [] },
      userIds.length
        ? db.from("user_roles").select("user_id,role").in("user_id", userIds)
        : { data: [] },
    ]);
    const productById = new Map(((productsRes.data ?? []) as any[]).map((p) => [p.id, p]));
    const invoiceById = new Map(((invoicesRes.data ?? []) as any[]).map((i) => [i.id, i]));
    const eventById = new Map(((eventsRes.data ?? []) as any[]).map((e) => [e.id, e]));
    const rolesByUser = new Map<string, string[]>();
    for (const r of (rolesRes.data ?? []) as any[]) {
      rolesByUser.set(r.user_id, [...(rolesByUser.get(r.user_id) ?? []), r.role]);
    }

    return rows.map((p) => ({
      ...p,
      product: productById.get(p.product_id) ?? null,
      invoice: p.invoice_id ? (invoiceById.get(p.invoice_id) ?? null) : null,
      affiliateEvent: p.affiliate_event_id ? (eventById.get(p.affiliate_event_id) ?? null) : null,
      userRoles: rolesByUser.get(p.user_id) ?? [],
    }));
  });

export const adminRetryAccessInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ paymentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { ensureInvoiceForAccessPayment, sendAccessInvoiceEmail } =
      await import("./invoice.server");
    const res = await ensureInvoiceForAccessPayment(data.paymentId);
    if (res.ok && res.invoiceId && !res.deduped) {
      try {
        await sendAccessInvoiceEmail(data.paymentId);
      } catch {
        /* e-mail best effort */
      }
    }
    return res;
  });

export const adminResendAccessInvoiceEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ paymentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { sendAccessInvoiceEmail } = await import("./invoice.server");
    return sendAccessInvoiceEmail(data.paymentId);
  });

export const adminAdjustUserAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        userId: z.string().uuid(),
        audience: z.enum(["investor", "broker"]),
        // null → cofnięcie dostępu (natychmiastowe wygaszenie)
        newUntil: z.string().datetime().nullable(),
        reason: z.string().trim().min(3).max(1000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    // RPC sama weryfikuje rolę administratora po auth.uid() i audytuje zmianę.
    const { data: result, error } = await (context.supabase as any).rpc("admin_adjust_access", {
      _target_user_id: data.userId,
      _audience: data.audience,
      _new_until: data.newUntil,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);

    // Powiadomienie e-mail o ręcznej zmianie.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: userRes } = await (supabaseAdmin as any).auth.admin.getUserById(data.userId);
      const email = userRes?.user?.email as string | undefined;
      if (email) {
        const { sendManualAccessChangeEmail } = await import("./emails.server");
        await sendManualAccessChangeEmail({
          to: email,
          audience: data.audience,
          activeUntil: data.newUntil,
          revoked: data.newUntil === null,
        });
      }
    } catch (e) {
      console.error("[access-admin] manual change email failed", (e as Error).message);
    }
    return result ?? { ok: true };
  });

export const adminSetPaymentReviewFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ paymentId: z.string().uuid(), needsReview: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("access_payments")
      .update({ needs_review: data.needsReview })
      .eq("id", data.paymentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListWebhookLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ transactionId: z.string().optional().default("") }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = (supabaseAdmin as any)
      .from("access_webhook_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.transactionId) q = q.eq("provider_transaction_id", data.transactionId);
    const { data: logs, error } = await q;
    if (error) throw new Error(error.message);
    return logs ?? [];
  });

// Lista kont partnerskich, które nadal mają historyczną rolę 'operator'
// (do ręcznego przeglądu i odebrania roli przez administratora).
export const adminListPartnerOperatorAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("partner_operator_role_audit")
      .select("*");
    if (error) throw new Error(error.message);
    return data ?? [];
  });
