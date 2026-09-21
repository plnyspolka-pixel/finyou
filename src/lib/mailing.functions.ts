import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchAllPaged } from "@/lib/supabase-paging.server";
import { z } from "zod";

async function assertStaff(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role);
  if (!roles.includes("administrator") && !roles.includes("operator"))
    throw new Error("Brak uprawnień");
}

// ============ AUDIENCE ============
// Wszystkie odczyty audiencji idą stronami — jedno zapytanie na kilka tysięcy
// wierszy potrafiło wpaść w `statement timeout` i wywrócić całą wysyłkę.
function clientsPage(from: number, to: number) {
  return supabaseAdmin
    .from("clients")
    .select("email, first_name, last_name, consent_marketing")
    .not("email", "is", null)
    .order("id", { ascending: true })
    .range(from, to);
}

function investorsPage(from: number, to: number) {
  return supabaseAdmin
    .from("investors")
    .select("email, first_name, last_name, company_name")
    .not("email", "is", null)
    .order("id", { ascending: true })
    .range(from, to);
}

async function fetchAudience(type: string, filter: Record<string, unknown>) {
  if (type === "leady") {
    const rows = await fetchAllPaged((from, to) =>
      supabaseAdmin
        .from("loan_applications")
        .select(
          "id, client_id, status, clients!inner(email, first_name, last_name, consent_email, consent_marketing)",
        )
        .order("id", { ascending: true })
        .range(from, to),
    );
    return rows
      .filter((r: any) => r.clients?.email && r.clients?.consent_marketing !== false)
      .map((r: any) => ({
        email: r.clients.email,
        name: `${r.clients.first_name ?? ""} ${r.clients.last_name ?? ""}`.trim(),
      }));
  }
  if (type === "klienci") {
    const rows = await fetchAllPaged(clientsPage);
    return rows
      .filter((c) => c.consent_marketing !== false)
      .map((c) => ({ email: c.email!, name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() }));
  }
  if (type === "inwestorzy") {
    const rows = await fetchAllPaged(investorsPage);
    return rows.map((i) => ({
      email: i.email!,
      name: i.company_name ?? `${i.first_name ?? ""} ${i.last_name ?? ""}`.trim(),
    }));
  }
  if (type === "wszyscy") {
    const [a, b] = await Promise.all([fetchAllPaged(clientsPage), fetchAllPaged(investorsPage)]);
    const list: { email: string; name: string }[] = [];
    a.filter((x) => x.consent_marketing !== false).forEach((x) =>
      list.push({ email: x.email!, name: `${x.first_name ?? ""} ${x.last_name ?? ""}`.trim() }),
    );
    b.forEach((x) =>
      list.push({
        email: x.email!,
        name: x.company_name ?? `${x.first_name ?? ""} ${x.last_name ?? ""}`.trim(),
      }),
    );
    // dedup
    const map = new Map<string, { email: string; name: string }>();
    list.forEach((x) => map.set(x.email.toLowerCase(), x));
    return [...map.values()];
  }
  return [];
}

export const previewAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { audience_type: string; audience_filter?: Record<string, unknown> }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const list = await fetchAudience(data.audience_type, data.audience_filter ?? {});
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
    const { data: c } = await supabaseAdmin
      .from("email_campaigns")
      .select("*")
      .eq("id", data.id)
      .single();
    if (!c) throw new Error("Kampania nie znaleziona");
    const { sendViaLovable, renderTemplate } = await import("./mailing.server");
    await sendViaLovable({
      to: data.toEmail,
      from: c.from_email!,
      fromName: c.from_name,
      subject: `[TEST] ${c.subject}`,
      html: renderTemplate(c.html_body, { imie: "Janie", firma: "Test sp. z o.o." }),
      text: c.text_body,
    });
    return { ok: true };
  });

export const scheduleCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; sendNow?: boolean }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { data: c } = await supabaseAdmin
      .from("email_campaigns")
      .select("*")
      .eq("id", data.id)
      .single();
    if (!c) throw new Error("Kampania nie znaleziona");
    if (c.status !== "szkic") throw new Error("Tylko szkice mogą być zaplanowane");

    const recipients = await fetchAudience(
      c.audience_type,
      (c.audience_filter as Record<string, unknown>) ?? {},
    );
    if (!recipients.length) throw new Error("Brak odbiorców w wybranym segmencie");

    const rows = recipients.map((r) => ({
      campaign_id: data.id,
      recipient_email: r.email,
      recipient_name: r.name,
      status: "oczekuje",
    }));
    // batch insert
    for (let i = 0; i < rows.length; i += 500) {
      await supabaseAdmin.from("email_campaign_recipients").insert(rows.slice(i, i + 500));
    }
    const when = data.sendNow
      ? new Date().toISOString()
      : (c.scheduled_at ?? new Date().toISOString());
    await supabaseAdmin
      .from("email_campaigns")
      .update({ status: "zaplanowana", scheduled_at: when, recipients_total: rows.length })
      .eq("id", data.id);
    return { ok: true, count: rows.length };
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
