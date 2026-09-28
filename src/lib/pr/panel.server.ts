// Server functions panelu Digital PR (/admin/pr-media).
// WYSYŁKA OUTREACH WYŁĄCZNIE PO KLIKNIĘCIU CZŁOWIEKA (sendPrOutreach w panelu
// albo send_pr_outreach w MCP po potwierdzeniu użytkownika) — żaden cron ani
// flaga nie wywołuje wysyłki automatycznie.
// Digital PR (okazje, szkice, wysyłka) — logika wyniesiona z pr.functions.ts: wspólna dla
// server functions panelu (cienkie delegaty) i narzędzi MCP. Zachowanie 1:1.
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generatePrOpportunityDraftSchema,
  updatePrOpportunitySchema,
  sendPrOutreachSchema,
  GeneratePrOpportunityDraftInput,
  UpdatePrOpportunityInput,
  SendPrOutreachInput,
} from "../pr-schema";
import type { PrOpportunity, PrOutreachLogItem } from "../pr.functions";

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

export async function listPrOpportunities(
  _supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ opportunities: PrOpportunity[] }> {
  await assertStaff(userId);
  const db = await untypedAdmin();
  const { data, error } = await db
    .from("pr_opportunities")
    .select("*")
    .neq("status", "rejected")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return { opportunities: (data ?? []) as PrOpportunity[] };
}

export async function listPrOutreachLog(
  _supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ log: PrOutreachLogItem[] }> {
  await assertStaff(userId);
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
}

export async function generatePrOpportunityDraft(
  _supabase: SupabaseClient<Database>,
  userId: string,
  data: GeneratePrOpportunityDraftInput,
) {
  await assertStaff(userId);
  const { generatePrDraft } = await import("@/lib/pr/draft.server");
  const result = await generatePrDraft(data.id);
  if (!result.ok) throw new Error(result.error ?? "Generowanie draftu nie powiodło się");
  return result;
}

export async function updatePrOpportunity(
  _supabase: SupabaseClient<Database>,
  userId: string,
  data: UpdatePrOpportunityInput,
) {
  await assertStaff(userId);
  const db = await untypedAdmin();
  const { id, ...patchRaw } = data;
  const patch: Record<string, unknown> = { ...patchRaw };
  if (patch.recipient_email === "") patch.recipient_email = null;
  const { error } = await db.from("pr_opportunities").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function sendPrOutreach(
  _supabase: SupabaseClient<Database>,
  userId: string,
  data: SendPrOutreachInput,
) {
  await assertStaff(userId, true);
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
    sent_by: userId,
  };
  const { error: logErr } = await db.from("pr_outreach_log").insert(logRow);
  if (logErr) console.error("[pr] outreach log insert failed", logErr);

  if (!sent.ok) throw new Error(`Wysyłka nie powiodła się: ${sent.error}`);

  await db.from("pr_opportunities").update({ status: "sent" }).eq("id", opp.id);
  return { ok: true, resendId: sent.id };
}
