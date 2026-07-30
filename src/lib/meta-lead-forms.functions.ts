import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("administrator") && !roles.includes("operator")) {
    throw new Error("Brak uprawnień");
  }
}

export const listMetaLeadForms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: forms }, { data: roles }, { data: profiles }] = await Promise.all([
      supabaseAdmin
        .from("meta_lead_forms")
        .select(
          "id, meta_form_id, form_name, page_name, is_enabled, voicebot_enabled, assigned_user_id, assigned_role, last_lead_at, total_leads_pulled",
        )
        .order("form_name", { ascending: true }),
      supabaseAdmin
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["administrator", "operator"]),
      supabaseAdmin.from("profiles").select("user_id, first_name, last_name, email"),
    ]);
    const profMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
    const seen = new Set<string>();
    const assignable: Array<{ user_id: string; label: string; role: string }> = [];
    for (const r of roles ?? []) {
      if (seen.has(r.user_id)) continue;
      seen.add(r.user_id);
      const p: any = profMap.get(r.user_id);
      const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
      assignable.push({
        user_id: r.user_id,
        role: r.role,
        label: `${name || p?.email || r.user_id.slice(0, 8)} · ${r.role}`,
      });
    }
    assignable.sort((a, b) => a.label.localeCompare(b.label, "pl"));
    return { forms: forms ?? [], assignable };
  });

export const setMetaLeadFormAssignee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { formId: string; userId: string | null }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("meta_lead_forms")
      .update({ assigned_user_id: data.userId })
      .eq("id", data.formId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setMetaLeadFormRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { formId: string; role: "klient" | "operator" | "inwestor" }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("meta_lead_forms")
      .update({ assigned_role: data.role as any })
      .eq("id", data.formId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Backfill: dla wszystkich klientów ze źródła meta_lead (lub starych meta_leads) —
// załóż konto auth (rola: klient) jeśli jeszcze go nie ma. Magic linki generowane są
// dopiero przy wysyłce follow-upów (świeży link = nie wygasa).
export const backfillMetaLeadAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureKlientAccountAndMagicLink } = await import("@/lib/client-magic-link.server");

    const { data: clients, error } = await supabaseAdmin
      .from("clients")
      .select("id, email, first_name, last_name, user_id")
      .eq("source", "meta_lead")
      .is("user_id", null)
      .not("email", "is", null)
      .limit(2000);
    if (error) throw new Error(error.message);

    let created = 0,
      linked = 0,
      failed = 0;
    const errors: string[] = [];
    for (const c of clients ?? []) {
      const email = (c.email ?? "").trim();
      if (!email) continue;
      const r = await ensureKlientAccountAndMagicLink(email, {
        firstName: c.first_name,
        lastName: c.last_name,
        source: "meta_lead_backfill",
      });
      if (r.userId) {
        await supabaseAdmin.from("clients").update({ user_id: r.userId }).eq("id", c.id);
        if (r.created) created++;
        else linked++;
      } else {
        failed++;
        if (r.error) errors.push(`${email}: ${r.error}`);
      }
    }
    return {
      processed: clients?.length ?? 0,
      created,
      linked_existing: linked,
      failed,
      errors: errors.slice(0, 20),
    };
  });
