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
      status: z.string().optional().default(""),
    }).parse(i ?? {})
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    let q = context.supabase
      .from("leads")
      .select(`
        id, type, status, source, first_name, last_name, email, phone_normalized,
        current_form_step, created_at, updated_at, loan_application_id, investor_id, meta_lead_id,
        loan:loan_applications(
          id, status, loan_amount, preferred_period_months, completeness_percent,
          properties(property_type, city, estimated_value, land_register_number, photos)
        )
      `)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.type !== "all") q = q.eq("type", data.type);
    if (data.source) q = q.eq("source", data.source);
    if (data.status) q = q.eq("status", data.status);
    if (data.search) {
      const s = `%${data.search}%`;
      q = q.or(`first_name.ilike.${s},last_name.ilike.${s},email.ilike.${s},phone_normalized.ilike.${s}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as any[];

    const ids = list.map((l) => l.id);
    const phones = Array.from(new Set(list.map((l) => l.phone_normalized).filter(Boolean))) as string[];
    const emails = Array.from(new Set(list.map((l) => l.email).filter(Boolean))) as string[];

    type BrokerCall = { id: string; name?: string | null; count: number; lastAt: string };
    type Comm = { calls: number; sms: number; emails: number; notes: number; inboundEmails: number; lastInboundEmailAt: string | null; lastInboundEmailSubject: string | null; lastAt: string | null; lastChannel: string | null; lastCallAt: string | null; lastCallById: string | null; lastCallByName?: string | null; lastNoteAt: string | null; lastNoteContent: string | null; lastNoteById: string | null; lastNoteByName?: string | null; brokerCalls?: BrokerCall[] };
    const commsByLead: Record<string, Comm> = {};
    const brokerByLead: Record<string, Record<string, { count: number; lastAt: string }>> = {};
    const ensure = (id: string): Comm => (commsByLead[id] ??= { calls: 0, sms: 0, emails: 0, notes: 0, inboundEmails: 0, lastInboundEmailAt: null, lastInboundEmailSubject: null, lastAt: null, lastChannel: null, lastCallAt: null, lastCallById: null, lastNoteAt: null, lastNoteContent: null, lastNoteById: null });

    const COLS = "lead_id, phone_normalized, email, channel, direction, subject, created_at, created_by, content";
    const queries: Promise<any>[] = [];
    if (ids.length) queries.push(Promise.resolve(context.supabase.from("lead_communications").select(COLS).in("lead_id", ids)));
    if (phones.length) queries.push(Promise.resolve(context.supabase.from("lead_communications").select(COLS).in("phone_normalized", phones)));
    if (emails.length) queries.push(Promise.resolve(context.supabase.from("lead_communications").select(COLS).in("email", emails)));
    const results = await Promise.all(queries);

    const seen = new Set<string>();
    for (const r of results) {
      for (const ev of (r.data ?? []) as any[]) {
        const key = `${ev.lead_id ?? ""}|${ev.phone_normalized ?? ""}|${ev.email ?? ""}|${ev.channel}|${ev.created_at}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const matching = list.filter((l) =>
          (ev.lead_id && l.id === ev.lead_id) ||
          (ev.phone_normalized && l.phone_normalized === ev.phone_normalized) ||
          (ev.email && l.email === ev.email)
        );
        for (const l of matching) {
          const s = ensure(l.id);
          if (ev.channel === "voicebot_call" || ev.channel === "call") {
            s.calls++;
            // Tylko ręczne telefony pośrednika (channel='call') zliczamy jako "Ostatni telefon"
            if (ev.channel === "call") {
              if (!s.lastCallAt || new Date(ev.created_at) > new Date(s.lastCallAt)) {
                s.lastCallAt = ev.created_at;
                s.lastCallById = ev.created_by ?? null;
              }
              if (ev.created_by) {
                const bMap = (brokerByLead[l.id] ??= {});
                const entry = (bMap[ev.created_by] ??= { count: 0, lastAt: ev.created_at });
                entry.count++;
                if (new Date(ev.created_at) > new Date(entry.lastAt)) entry.lastAt = ev.created_at;
              }
            }
          }
          else if (ev.channel === "sms") s.sms++;
          else if (ev.channel === "email") {
            s.emails++;
            if (ev.direction === "inbound") {
              s.inboundEmails++;
              if (!s.lastInboundEmailAt || new Date(ev.created_at) > new Date(s.lastInboundEmailAt)) {
                s.lastInboundEmailAt = ev.created_at;
                s.lastInboundEmailSubject = ev.subject ?? null;
              }
            }
          }
          else if (ev.channel === "manual_note") {
            s.notes++;
            if (!s.lastNoteAt || new Date(ev.created_at) > new Date(s.lastNoteAt)) {
              s.lastNoteAt = ev.created_at;
              s.lastNoteContent = ev.content ?? null;
              s.lastNoteById = ev.created_by ?? null;
            }
          }
          if (!s.lastAt || new Date(ev.created_at) > new Date(s.lastAt)) {
            s.lastAt = ev.created_at;
            s.lastChannel = ev.channel;
          }
        }
      }
    }

    const brokerIds = Array.from(new Set(Object.values(brokerByLead).flatMap((m) => Object.keys(m))));
    const callerIds = Array.from(new Set([
      ...Object.values(commsByLead).map((c) => c.lastCallById).filter(Boolean),
      ...Object.values(commsByLead).map((c) => c.lastNoteById).filter(Boolean),
      ...brokerIds,
    ])) as string[];
    const callerNames: Record<string, string> = {};
    if (callerIds.length) {
      const { data: profs } = await context.supabase.from("profiles").select("user_id, first_name, last_name, email").in("user_id", callerIds);
      for (const p of (profs ?? []) as any[]) {
        callerNames[p.user_id] = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || "Pośrednik";
      }
    }
    for (const [leadId, c] of Object.entries(commsByLead)) {
      c.lastCallByName = c.lastCallById ? (callerNames[c.lastCallById] ?? "Pośrednik") : null;
      c.lastNoteByName = c.lastNoteById ? (callerNames[c.lastNoteById] ?? "Pośrednik") : null;
      const bMap = brokerByLead[leadId];
      if (bMap) {
        c.brokerCalls = Object.entries(bMap)
          .map(([id, v]) => ({ id, name: callerNames[id] ?? "Pośrednik", count: v.count, lastAt: v.lastAt }))
          .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
      }
    }

    // Liczba dokumentów per wniosek — do „kluczowych faktów" na liście (KW/media).
    const loanIds = Array.from(new Set(list.map((l) => l.loan?.id).filter(Boolean))) as string[];
    const docCountByLoan: Record<string, number> = {};
    if (loanIds.length) {
      const { data: docs } = await context.supabase
        .from("documents")
        .select("loan_application_id")
        .in("loan_application_id", loanIds);
      for (const d of (docs ?? []) as any[]) {
        if (d.loan_application_id) {
          docCountByLoan[d.loan_application_id] = (docCountByLoan[d.loan_application_id] ?? 0) + 1;
        }
      }
    }

    return list.map((l) => ({
      ...l,
      comms: commsByLead[l.id] ?? { calls: 0, sms: 0, emails: 0, notes: 0, lastAt: null, lastChannel: null },
      docCount: l.loan?.id ? (docCountByLoan[l.loan.id] ?? 0) : 0,
    }));
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

    const commAuthorIds = Array.from(new Set(((comms ?? []) as any[]).map((c) => c.created_by).filter(Boolean))) as string[];
    const commAuthorNames: Record<string, string> = {};
    if (commAuthorIds.length) {
      const { data: profs } = await context.supabase
        .from("profiles").select("user_id, first_name, last_name, email").in("user_id", commAuthorIds);
      for (const p of (profs ?? []) as any[]) {
        commAuthorNames[p.user_id] = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || "Pośrednik";
      }
    }
    const commsWithAuthor = ((comms ?? []) as any[]).map((c) => ({
      ...c,
      created_by_name: c.created_by ? (commAuthorNames[c.created_by] ?? "Pośrednik") : null,
    }));


    let documents: any[] = [];
    let emailSequence: any = null;
    if (lead.loan_application_id) {
      const { data: docs } = await context.supabase
        .from("documents")
        .select("id, document_type, file_name, file_path, created_at")
        .eq("loan_application_id", lead.loan_application_id)
        .order("created_at", { ascending: false });
      documents = docs ?? [];

      const { data: loanRow } = await context.supabase
        .from("loan_applications")
        .select("id, created_at, completeness_percent, status, reminder_email_count, reminder_email_first_sent_at, reminder_email_last_sent_at, reminder_email_unsubscribed, reminder_email_unsubscribed_at")
        .eq("id", lead.loan_application_id)
        .maybeSingle();

      const { data: sends } = await context.supabase
        .from("loan_reminder_email_sends")
        .select("id, subject, sent_at, sent_hour_warsaw, opened_at, open_count, clicked_at, click_count, error_message, variant_id, variant:loan_reminder_email_variants(sequence_index, day_index, slot, phase)")
        .eq("loan_application_id", lead.loan_application_id)
        .order("sent_at", { ascending: false });

      const nextIndex = (loanRow?.reminder_email_count ?? 0) + 1;
      const { data: nextVariant } = await context.supabase
        .from("loan_reminder_email_variants")
        .select("id, subject, preview_text, body_html, sequence_index, day_index, slot, phase")
        .eq("sequence_index", nextIndex)
        .maybeSingle();

      emailSequence = { loan: loanRow, sends: sends ?? [], nextVariant, totalVariants: 150 };
    }
    return { lead, communications: commsWithAuthor, documents, emailSequence };
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

export const logBrokerCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      leadId: z.string().uuid(),
      phone: z.string().optional().nullable(),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("lead_communications").insert({
      lead_id: data.leadId,
      phone_normalized: data.phone ?? null,
      channel: "call",
      direction: "outbound",
      status: "initiated",
      content: "Pośrednik wybrał numer telefonu (klik tel:)",
      created_by: context.userId,
      metadata: { source: "broker_phone_click" },
    });
    if (error) throw new Error(error.message);
    return { ok: true, at: new Date().toISOString() };
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
