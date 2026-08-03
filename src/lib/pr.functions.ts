// Server functions panelu Digital PR (/admin/pr-media).
// WYSYŁKA OUTREACH WYŁĄCZNIE PO KLIKNIĘCIU CZŁOWIEKA (sendPrOutreach) —
// żaden cron ani flaga nie wywołuje wysyłki automatycznie.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertStaff(userId: string, adminOnly = false) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role as string);
  const allowed = adminOnly
    ? roles.includes("administrator")
    : roles.includes("administrator") || roles.includes("operator");
  if (!allowed) throw new Error("Brak uprawnień");
}

// Tabele pr_* nie są jeszcze w wygenerowanych typach Supabase (types.ts
// odświeża się po zastosowaniu migracji) — klient bez generyka Database.
async function untypedAdmin(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

export type PrOpportunity = {
  id: string;
  source: string;
  url: string;
  topic: string;
  snippet: string | null;
  matched_phrases: string[];
  article_published_at: string | null;
  deadline: string | null;
  status: string;
  draft_subject: string | null;
  draft_body: string | null;
  draft_generated_at: string | null;
  recipient_email: string | null;
  notes: string | null;
  created_at: string;
};

export type PrOutreachLogItem = {
  id: string;
  opportunity_id: string | null;
  recipient_email: string;
  subject: string;
  status: string;
  sent_at: string;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  replied_at: string | null;
  error: string | null;
};

export const listPrOpportunities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ opportunities: PrOpportunity[] }> => {
    await assertStaff(context.userId);
    const db = await untypedAdmin();
    const { data, error } = await db
      .from("pr_opportunities")
      .select("*")
      .neq("status", "rejected")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { opportunities: (data ?? []) as PrOpportunity[] };
  });

export const listPrOutreachLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ log: PrOutreachLogItem[] }> => {
    await assertStaff(context.userId);
    const db = await untypedAdmin();
    const { data, error } = await db
      .from("pr_outreach_log")
      .select(
        "id, opportunity_id, recipient_email, subject, status, sent_at, delivered_at, opened_at, clicked_at, replied_at, error",
      )
      .order("sent_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { log: (data ?? []) as PrOutreachLogItem[] };
  });

export const generatePrOpportunityDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { generatePrDraft } = await import("@/lib/pr/draft.server");
    const result = await generatePrDraft(data.id);
    if (!result.ok) throw new Error(result.error ?? "Generowanie draftu nie powiodło się");
    return result;
  });

export const updatePrOpportunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        draft_subject: z.string().max(300).optional(),
        draft_body: z.string().max(20000).optional(),
        recipient_email: z.string().email().or(z.literal("")).optional(),
        deadline: z.string().datetime().nullable().optional(),
        notes: z.string().max(5000).optional(),
        status: z.enum(["new", "drafted", "approved", "rejected"]).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const db = await untypedAdmin();
    const { id, ...patchRaw } = data;
    const patch: Record<string, unknown> = { ...patchRaw };
    if (patch.recipient_email === "") patch.recipient_email = null;
    const { error } = await db.from("pr_opportunities").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Zatwierdź i wyślij — JEDYNA ścieżka wysyłki outreach. Wymaga roli
 * administratora (human-in-the-loop): wysyła draft przez Resend, loguje do
 * pr_outreach_log i ustawia status 'sent'.
 */
export const sendPrOutreach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId, true);
    const db = await untypedAdmin();
    const { data: opp, error } = await db
      .from("pr_opportunities")
      .select("id, topic, status, draft_subject, draft_body, recipient_email")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !opp) throw new Error(error?.message ?? "Okazja nie istnieje");
    if (opp.status === "sent") throw new Error("Ta okazja ma już wysłany outreach");
    if (!opp.draft_subject || !opp.draft_body) throw new Error("Brak draftu do wysyłki");
    if (!opp.recipient_email) throw new Error("Uzupełnij adres e-mail odbiorcy");

    const { sendResendEmail } = await import("@/lib/resend-send.server");
    const sent = await sendResendEmail({
      to: opp.recipient_email,
      subject: opp.draft_subject,
      text: opp.draft_body,
      fromName: "Finance You — biuro prasowe",
      replyTo: "kontakt@financeyou.pl",
    });

    const logRow = {
      opportunity_id: opp.id,
      recipient_email: opp.recipient_email,
      subject: opp.draft_subject,
      body_text: opp.draft_body,
      resend_id: sent.id ?? null,
      status: sent.ok ? "sent" : "failed",
      error: sent.ok ? null : (sent.error ?? "unknown"),
      sent_by: context.userId,
    };
    const { error: logErr } = await db.from("pr_outreach_log").insert(logRow);
    if (logErr) console.error("[pr] outreach log insert failed", logErr);

    if (!sent.ok) throw new Error(`Wysyłka nie powiodła się: ${sent.error}`);

    await db.from("pr_opportunities").update({ status: "sent" }).eq("id", opp.id);
    return { ok: true, resendId: sent.id };
  });
