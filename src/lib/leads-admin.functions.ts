import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("administrator") && !roles.includes("operator")) {
    throw new Error("Brak uprawnień");
  }
}

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      type: z.enum(["pozyczkowy", "inwestorski", "all"]).optional().default("all"),
      search: z.string().optional().default(""),
      source: z.string().optional().default(""),
    }).parse(i ?? {})
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    let q = context.supabase
      .from("leads")
      .select("id, type, status, source, first_name, last_name, email, phone_normalized, current_form_step, created_at, updated_at, loan_application_id, investor_id, meta_lead_id")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.type !== "all") q = q.eq("type", data.type);
    if (data.source) q = q.eq("source", data.source);
    if (data.search) {
      const s = `%${data.search}%`;
      q = q.or(`first_name.ilike.${s},last_name.ilike.${s},email.ilike.${s},phone_normalized.ilike.${s}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: lead, error } = await context.supabase.from("leads").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!lead) throw new Error("Lead nie istnieje");

    const { data: comms } = await context.supabase
      .from("lead_communications")
      .select("*")
      .eq("lead_id", data.id)
      .order("created_at", { ascending: false });

    let documents: any[] = [];
    if (lead.loan_application_id) {
      const { data: docs } = await context.supabase
        .from("documents")
        .select("id, document_type, file_name, file_path, created_at")
        .eq("loan_application_id", lead.loan_application_id)
        .order("created_at", { ascending: false });
      documents = docs ?? [];
    }
    return { lead, communications: comms ?? [], documents };
  });

export const updateLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      id: z.string().uuid(),
      patch: z.object({
        status: z.string().optional(),
        notes: z.string().optional().nullable(),
        assigned_to: z.string().uuid().optional().nullable(),
        first_name: z.string().optional().nullable(),
        last_name: z.string().optional().nullable(),
        email: z.string().optional().nullable(),
        phone_normalized: z.string().optional().nullable(),
      }),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("leads").update(data.patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addManualNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      leadId: z.string().uuid(),
      content: z.string().min(1).max(5000),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("lead_communications").insert({
      lead_id: data.leadId,
      channel: "manual_note",
      direction: "outbound",
      content: data.content,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
