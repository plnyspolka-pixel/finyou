import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

async function assertStaff(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role);
  if (!roles.includes("administrator") && !roles.includes("operator"))
    throw new Error("Brak uprawnień");
}

export const previewAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { audience_type: string; audience_filter?: Record<string, unknown> }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { fetchCampaignAudience } = await import("./mailing.server");
    const list = await fetchCampaignAudience(data.audience_type, data.audience_filter ?? {});
    return { count: list.length, sample: list.slice(0, 10) };
  });

// ============ CAMPAIGN CRUD ============
const campaignSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  subject: z.string().min(1).max(300),
  html_body: z.string().max(200000),
  text_body: z.string().max(200000).optional().nullable(),
  from_email: z.string().email().max(200),
  from_name: z.string().max(200).optional().nullable(),
  audience_type: z.enum(["leady", "klienci", "inwestorzy", "wszyscy"]),
  audience_filter: z.record(z.string(), z.unknown()).default({}),
  scheduled_at: z.string().nullable().optional(),
});

export const saveCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => campaignSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const payload: any = { ...data, created_by: context.userId };
    if (data.id) {
      const { id, ...rest } = payload;
      const { error } = await supabaseAdmin.from("email_campaigns").update(rest).eq("id", id!);
      if (error) throw new Error(error.message);
      return { id: id! };
    }
    const { data: row, error } = await supabaseAdmin
      .from("email_campaigns")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { data } = await supabaseAdmin
      .from("email_campaigns")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    return { campaigns: data ?? [] };
  });

export const getCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { data: c } = await supabaseAdmin
      .from("email_campaigns")
      .select("*")
      .eq("id", data.id)
      .single();
    const { data: recipients } = await supabaseAdmin
      .from("email_campaign_recipients")
      .select("*")
      .eq("campaign_id", data.id)
      .order("created_at", { ascending: false })
      .limit(500);
    return { campaign: c, recipients: recipients ?? [] };
  });

export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { error } = await supabaseAdmin.from("email_campaigns").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; toEmail: string }) =>
    z.object({ id: z.string().uuid(), toEmail: z.string().email() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { sendCampaignTest } = await import("./mailing.server");
    await sendCampaignTest(data.id, data.toEmail);
    return { ok: true };
  });

export const scheduleCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; sendNow?: boolean }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { scheduleCampaignSend } = await import("./mailing.server");
    return scheduleCampaignSend(data.id, { sendNow: !!data.sendNow });
  });

export const cancelCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    await supabaseAdmin
      .from("email_campaigns")
      .update({ status: "anulowana" })
      .eq("id", data.id)
      .in("status", ["zaplanowana"]);
    return { ok: true };
  });

// ============ TEMPLATES ============
export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { data } = await supabaseAdmin.from("email_templates").select("*").order("name");
    return { templates: data ?? [] };
  });

export const saveTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; name: string; subject: string; html_body: string }) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(200),
        subject: z.string().min(1).max(300),
        html_body: z.string().max(200000),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    if (data.id) {
      const { id, ...rest } = data;
      await supabaseAdmin.from("email_templates").update(rest).eq("id", id!);
      return { id: id! };
    }
    const { data: row, error } = await supabaseAdmin
      .from("email_templates")
      .insert({ ...data, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    await supabaseAdmin.from("email_templates").delete().eq("id", data.id);
    return { ok: true };
  });
