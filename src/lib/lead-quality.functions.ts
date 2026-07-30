import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.some((r: string) => ["administrator", "operator"].includes(r))) {
    throw new Error("Brak uprawnień");
  }
}

export const rescoreLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ leadId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { rescoreAndSend } = await import("./lead-quality.server");
    return rescoreAndSend({ supabaseAdmin, leadId: data.leadId });
  });

export const markBadLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        leadId: z.string().uuid(),
        reason: z.string().min(1).max(500),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("leads")
      .update({
        marked_bad_lead: true,
        marked_bad_reason: data.reason,
        marked_by: context.userId,
        quality_tier: "D",
        quality_score: 0,
        quality_reason: `Spam/zły: ${data.reason}`,
      })
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);

    // Send negative signal to Meta
    const { rescoreAndSend } = await import("./lead-quality.server");
    await rescoreAndSend({ supabaseAdmin, leadId: data.leadId, forceEvent: "BadLead" });
    return { ok: true };
  });

export const unmarkBadLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ leadId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("leads")
      .update({ marked_bad_lead: false, marked_bad_reason: null })
      .eq("id", data.leadId);
    const { rescoreAndSend } = await import("./lead-quality.server");
    return rescoreAndSend({ supabaseAdmin, leadId: data.leadId });
  });

export const markGoodLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ leadId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Force-promote to A and send strong signal
    await supabaseAdmin
      .from("leads")
      .update({
        quality_tier: "A",
        quality_score: 100,
        quality_reason: "Oznaczony ręcznie jako TOP lead",
        marked_bad_lead: false,
      })
      .eq("id", data.leadId);
    const { rescoreAndSend } = await import("./lead-quality.server");
    return rescoreAndSend({
      supabaseAdmin,
      leadId: data.leadId,
      forceEvent: "SubmitApplication",
    });
  });

export const listCapiEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ leadId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("meta_capi_events")
      .select("id, event_name, value, tier, status, error, sent_at")
      .eq("lead_id", data.leadId)
      .order("sent_at", { ascending: false })
      .limit(50);
    return rows ?? [];
  });
