import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Pula leadów Finance You to narzędzie premium: personel wewnętrzny ma dostęp
// operacyjny, a zewnętrzny pośrednik (rola 'posrednik' albo historyczny
// 'operator' powiązany z partnerem) wyłącznie z aktywnym płatnym pakietem.
// Partner widzi przy tym wyłącznie otwartą pulę (bez rozpoczętych wniosków)
// — egzekwują to polityki RLS, a `staff` pozwala zdublować filtr w zapytaniu.
async function assertAdmin(_supabase: any, userId: string): Promise<{ staff: boolean }> {
  const { brokerHasPaidAccess, isInternalStaff } = await import("@/lib/access/guards.server");
  const staff = await isInternalStaff(userId);
  if (!staff && !(await brokerHasPaidAccess(userId))) {
    throw new Error(
      "PAYWALL_BROKER: Leady Finance You są dostępne w pełnym (płatnym) pakiecie pośrednika.",
    );
  }
  return { staff };
}

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        type: z.enum(["pozyczkowy", "inwestorski", "all"]).optional().default("all"),
        search: z.string().optional().default(""),
        source: z.string().optional().default(""),
        status: z.string().optional().default(""),
        assignedToMe: z.boolean().optional().default(false),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { staff } = await assertAdmin(context.supabase, context.userId);

    // "Moje leady" = leady przypięte do mnie (leads.assigned_to — trigger
    // przypina przy pierwszej akcji roboczej: odsłonięcie telefonu/e-maila/
    // Messengera, notatka, klik połączenia; kolejne akcje odnawiają
    // 2-dniową wyłączność). Po wygaśnięciu okna lead wraca do wspólnej
    // puli, a przejęcie przez innego partnera przepina assigned_to — więc
    // celowo NIE doklejamy leadów po samej historycznej aktywności.
    let assignedLeadIds: string[] | null = null;
    if (data.assignedToMe) {
      const { data: claimedRows, error: claimErr } = await context.supabase
        .from("leads")
        .select("id")
        .eq("assigned_to", context.userId);
      if (claimErr) throw new Error(claimErr.message);
      assignedLeadIds = (claimedRows ?? []).map((r: any) => r.id).filter(Boolean);
      if (assignedLeadIds.length === 0) return [];
    }

    let q = context.supabase
      .from("leads")
      .select(
        `
        id, type, status, source, first_name, last_name, email, phone_normalized,
        assigned_to, claim_expires_at, current_form_step, created_at, updated_at, loan_application_id, investor_id, meta_lead_id,
        quality_tier, quality_score, marked_bad_lead,
        loan:loan_applications(
          id, status, loan_amount, preferred_period_months, completeness_percent,
          properties(property_type, city, estimated_value, land_register_number, photos)
        )
      `,
      )
      .order("created_at", { ascending: false })
      .limit(500);
    // Partner zewnętrzny: tylko otwarta pula — lead z rozpoczętym wnioskiem
    // (application_started_at) jest sprawą klienta FY, nie towarem, a lead
    // przypięty do innego partnera z aktywną wyłącznością (claim_expires_at)
    // jest dla pozostałych niewidoczny. Duplikuje reguły RLS (obrona w głąb).
    if (!staff) {
      q = q
        .is("application_started_at", null)
        .or(
          `assigned_to.is.null,assigned_to.eq.${context.userId},claim_expires_at.lte.${new Date().toISOString()}`,
        );
    }
    if (assignedLeadIds) q = q.in("id", assignedLeadIds);
    if (data.type !== "all") q = q.eq("type", data.type);
    if (data.source) q = q.eq("source", data.source);
    if (data.status) q = q.eq("status", data.status);
    if (data.search) {
      const s = `%${data.search}%`;
      q = q.or(
        `first_name.ilike.${s},last_name.ilike.${s},email.ilike.${s},phone_normalized.ilike.${s}`,
      );
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as any[];

    const ids = list.map((l) => l.id);
    const phones = Array.from(
      new Set(list.map((l) => l.phone_normalized).filter(Boolean)),
    ) as string[];
    const emailsLower = Array.from(
      new Set(list.map((l) => (l.email ?? "").toLowerCase()).filter(Boolean)),
    ) as string[];

    type BrokerCall = { id: string; name?: string | null; count: number; lastAt: string };
    type Reveal = { id: string; name?: string | null; count: number; lastAt: string };
    type InboundAttachment = {
      name: string;
      mime?: string;
      size?: number;
      path?: string;
      at: string;
    };
    type Comm = {
      calls: number;
      sms: number;
      emails: number;
      messenger: number;
      notes: number;
      inboundCalls: number;
      inboundSms: number;
      inboundMessenger: number;
      inboundEmails: number;
      lastInboundAt: string | null;
      lastInboundEmailAt: string | null;
      lastInboundEmailSubject: string | null;
      inboundAttachments: InboundAttachment[];
      messengerAttachments: InboundAttachment[];
      loanAttachments: InboundAttachment[];
      lastAt: string | null;
      lastChannel: string | null;
      lastCallAt: string | null;
      lastCallById: string | null;
      lastCallByName?: string | null;
      lastNoteAt: string | null;
      lastNoteContent: string | null;
      lastNoteById: string | null;
      lastNoteByName?: string | null;
      brokerCalls?: BrokerCall[];
      reveals?: { phone: Reveal[]; email: Reveal[]; messenger: Reveal[] };
    };
    const commsByLead: Record<string, Comm> = {};
    const brokerByLead: Record<string, Record<string, { count: number; lastAt: string }>> = {};
    const revealsByLead: Record<
      string,
      {
        phone: Record<string, { count: number; lastAt: string }>;
        email: Record<string, { count: number; lastAt: string }>;
        messenger: Record<string, { count: number; lastAt: string }>;
      }
    > = {};
    const ensure = (id: string): Comm =>
      (commsByLead[id] ??= {
        calls: 0,
        sms: 0,
        emails: 0,
        messenger: 0,
        notes: 0,
        inboundCalls: 0,
        inboundSms: 0,
        inboundMessenger: 0,
        inboundEmails: 0,
        lastInboundAt: null,
        lastInboundEmailAt: null,
        lastInboundEmailSubject: null,
        inboundAttachments: [],
        messengerAttachments: [],
        loanAttachments: [],
        lastAt: null,
        lastChannel: null,
        lastCallAt: null,
        lastCallById: null,
        lastNoteAt: null,
        lastNoteContent: null,
        lastNoteById: null,
      });

    // Index leads by lowercase email for case-insensitive matching (inbound emails often differ in case).
    const leadsByEmailLower: Record<string, any[]> = {};
    for (const l of list) {
      const k = (l.email ?? "").toLowerCase();
      if (!k) continue;
      (leadsByEmailLower[k] ??= []).push(l);
    }

    const COLS =
      "lead_id, phone_normalized, email, channel, direction, subject, created_at, created_by, content, attachments, metadata";
    // Liczniki kontaktu czytamy SERVICE-ROLEM (endpoint jest już za assertAdmin) —
    // dzięki temu panel pokazuje realną liczbę maili/SMS/telefonów niezależnie od
    // tego, jakie wiersze lead_communications widzi sesja operatora przez RLS.
    // Chunk .in() clauses — 500 UUIDs w jednym GET-cie potrafi przekroczyć limit
    // długości URL PostgREST-a, przez co licznik komunikacji dostaje pustą odpowiedź.
    const chunk = <T>(arr: T[], n: number): T[][] => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
      return out;
    };
    const queries: Promise<any>[] = [];
    for (const c of chunk(ids, 100)) {
      queries.push(
        Promise.resolve(
          supabaseAdmin.from("lead_communications").select(COLS).in("lead_id", c).limit(20000),
        ),
      );
    }
    for (const c of chunk(phones, 100)) {
      queries.push(
        Promise.resolve(
          supabaseAdmin
            .from("lead_communications")
            .select(COLS)
            .in("phone_normalized", c)
            .limit(20000),
        ),
      );
    }
    for (const c of chunk(emailsLower, 100)) {
      const orExpr = c.map((e) => `email.ilike.${e}`).join(",");
      queries.push(
        Promise.resolve(
          supabaseAdmin.from("lead_communications").select(COLS).or(orExpr).limit(20000),
        ),
      );
    }
    const results = await Promise.all(queries);

    const seen = new Set<string>();
    for (const r of results) {
      for (const ev of (r.data ?? []) as any[]) {
        const evEmailLower = (ev.email ?? "").toLowerCase();
        const key = `${ev.lead_id ?? ""}|${ev.phone_normalized ?? ""}|${evEmailLower}|${ev.channel}|${ev.direction ?? ""}|${ev.created_at}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const matched = new Set<any>();
        if (ev.lead_id) for (const l of list) if (l.id === ev.lead_id) matched.add(l);
        if (ev.phone_normalized)
          for (const l of list) if (l.phone_normalized === ev.phone_normalized) matched.add(l);
        if (evEmailLower && leadsByEmailLower[evEmailLower])
          for (const l of leadsByEmailLower[evEmailLower]) matched.add(l);
        const matching = Array.from(matched);
        for (const l of matching) {
          const s = ensure(l.id);
          const isInbound = ev.direction === "inbound";
          if (ev.channel === "voicebot_call" || ev.channel === "call") {
            s.calls++;
            if (isInbound) s.inboundCalls++;
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
          } else if (ev.channel === "sms") {
            s.sms++;
            if (isInbound) s.inboundSms++;
          } else if (
            ev.channel === "messenger" ||
            ev.channel === "instagram" ||
            ev.channel === "whatsapp"
          ) {
            s.messenger++;
            if (isInbound) s.inboundMessenger++;
            if (Array.isArray(ev.attachments)) {
              for (const a of ev.attachments as any[]) {
                if (!a) continue;
                s.messengerAttachments.push({
                  name: a.name ?? a.file_name ?? "załącznik",
                  mime: a.mime ?? a.content_type ?? undefined,
                  size: typeof a.size === "number" ? a.size : undefined,
                  path: a.path ?? undefined,
                  at: ev.created_at,
                });
              }
            }
          } else if (ev.channel === "email") {
            s.emails++;
            if (isInbound) {
              s.inboundEmails++;
              if (
                !s.lastInboundEmailAt ||
                new Date(ev.created_at) > new Date(s.lastInboundEmailAt)
              ) {
                s.lastInboundEmailAt = ev.created_at;
                s.lastInboundEmailSubject = ev.subject ?? null;
              }
              if (Array.isArray(ev.attachments)) {
                for (const a of ev.attachments as any[]) {
                  if (!a) continue;
                  s.inboundAttachments.push({
                    name: a.name ?? a.file_name ?? "załącznik",
                    mime: a.mime ?? a.content_type ?? undefined,
                    size: typeof a.size === "number" ? a.size : undefined,
                    path: a.path ?? undefined,
                    at: ev.created_at,
                  });
                }
              }
            }
          } else if (ev.channel === "manual_note") {
            s.notes++;
            if (!s.lastNoteAt || new Date(ev.created_at) > new Date(s.lastNoteAt)) {
              s.lastNoteAt = ev.created_at;
              s.lastNoteContent = ev.content ?? null;
              s.lastNoteById = ev.created_by ?? null;
            }
          } else if (ev.channel === "reveal" && ev.created_by) {
            const field = (ev.metadata?.field as string) || "phone";
            if (field === "phone" || field === "email" || field === "messenger") {
              const rMap = (revealsByLead[l.id] ??= { phone: {}, email: {}, messenger: {} });
              const bucket = rMap[field as "phone" | "email" | "messenger"];
              const entry = (bucket[ev.created_by] ??= { count: 0, lastAt: ev.created_at });
              entry.count++;
              if (new Date(ev.created_at) > new Date(entry.lastAt)) entry.lastAt = ev.created_at;
            }
          }
          if (!s.lastAt || new Date(ev.created_at) > new Date(s.lastAt)) {
            s.lastAt = ev.created_at;
            s.lastChannel = ev.channel;
          }
          if (
            isInbound &&
            (!s.lastInboundAt || new Date(ev.created_at) > new Date(s.lastInboundAt))
          ) {
            s.lastInboundAt = ev.created_at;
          }
        }
      }
    }

    const brokerIds = Array.from(
      new Set(Object.values(brokerByLead).flatMap((m) => Object.keys(m))),
    );
    const revealIds = Array.from(
      new Set(
        Object.values(revealsByLead).flatMap((m) => [
          ...Object.keys(m.phone),
          ...Object.keys(m.email),
          ...Object.keys(m.messenger),
        ]),
      ),
    );
    const callerIds = Array.from(
      new Set([
        ...Object.values(commsByLead)
          .map((c) => c.lastCallById)
          .filter(Boolean),
        ...Object.values(commsByLead)
          .map((c) => c.lastNoteById)
          .filter(Boolean),
        ...brokerIds,
        ...revealIds,
      ]),
    ) as string[];
    const callerNames: Record<string, string> = {};
    if (callerIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("user_id, first_name, last_name, email")
        .in("user_id", callerIds);
      for (const p of (profs ?? []) as any[]) {
        callerNames[p.user_id] =
          [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || "Pośrednik";
      }
    }
    for (const [leadId, c] of Object.entries(commsByLead)) {
      c.lastCallByName = c.lastCallById ? (callerNames[c.lastCallById] ?? "Pośrednik") : null;
      c.lastNoteByName = c.lastNoteById ? (callerNames[c.lastNoteById] ?? "Pośrednik") : null;
      const bMap = brokerByLead[leadId];
      if (bMap) {
        c.brokerCalls = Object.entries(bMap)
          .map(([id, v]) => ({
            id,
            name: callerNames[id] ?? "Pośrednik",
            count: v.count,
            lastAt: v.lastAt,
          }))
          .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
      }
      const rMap = revealsByLead[leadId];
      if (rMap) {
        const toArr = (bucket: Record<string, { count: number; lastAt: string }>) =>
          Object.entries(bucket)
            .map(([id, v]) => ({
              id,
              name: callerNames[id] ?? "Pośrednik",
              count: v.count,
              lastAt: v.lastAt,
            }))
            .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
        c.reveals = {
          phone: toArr(rMap.phone),
          email: toArr(rMap.email),
          messenger: toArr(rMap.messenger),
        };
      }
    }

    // Liczba dokumentów per wniosek — do „kluczowych faktów" na liście (KW/media).
    const loanIds = Array.from(new Set(list.map((l) => l.loan?.id).filter(Boolean))) as string[];
    const docCountByLoan: Record<string, number> = {};
    const loanAttsByLoan: Record<string, InboundAttachment[]> = {};
    if (loanIds.length) {
      const { data: docs } = await supabaseAdmin
        .from("documents")
        .select("loan_application_id, file_name, file_path, mime_type, file_size, created_at")
        .in("loan_application_id", loanIds)
        .order("created_at", { ascending: false });
      for (const d of (docs ?? []) as any[]) {
        if (!d.loan_application_id) continue;
        docCountByLoan[d.loan_application_id] = (docCountByLoan[d.loan_application_id] ?? 0) + 1;
        (loanAttsByLoan[d.loan_application_id] ??= []).push({
          name: d.file_name ?? "dokument",
          mime: d.mime_type ?? undefined,
          size: typeof d.file_size === "number" ? d.file_size : undefined,
          path: d.file_path ?? undefined,
          at: d.created_at,
        });
      }
    }
    // Zdjęcia nieruchomości z wniosku
    for (const l of list) {
      if (!l.loan?.id) continue;
      const props = (l.loan.properties ?? []) as any[];
      for (const p of props) {
        const photos = Array.isArray(p?.photos) ? p.photos : [];
        for (const ph of photos) {
          const path = typeof ph === "string" ? ph : (ph?.path ?? ph?.file_path);
          if (!path) continue;
          (loanAttsByLoan[l.loan.id] ??= []).push({
            name:
              (typeof ph === "object" && (ph.name ?? ph.file_name)) ||
              path.split("/").pop() ||
              "zdjęcie",
            mime: (typeof ph === "object" && ph.mime) || undefined,
            path,
            at: l.loan.created_at ?? l.created_at,
          });
        }
      }
    }
    for (const l of list) {
      const s = commsByLead[l.id];
      if (!s || !l.loan?.id) continue;
      const arr = loanAttsByLoan[l.loan.id];
      if (arr && arr.length) s.loanAttachments.push(...arr);
    }

    const enriched = list.map((l) => {
      const comms =
        commsByLead[l.id] ??
        ({
          calls: 0,
          sms: 0,
          emails: 0,
          notes: 0,
          lastAt: null,
          lastChannel: null,
          lastInboundAt: null,
        } as any);
      // Sort key = tylko aktywność ze strony leada (inbound) lub utworzenie leada.
      // Ignorujemy outbound (nasze maile/telefony) i updated_at (edycje po naszej stronie).
      const times = [comms.lastInboundAt, l.created_at]
        .filter(Boolean)
        .map((t: string) => new Date(t).getTime());
      const lastActivityAt = times.length ? Math.max(...times) : 0;
      return {
        ...l,
        comms,
        docCount: l.loan?.id ? (docCountByLoan[l.loan.id] ?? 0) : 0,
        lastActivityAt,
      };
    });
    enriched.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
    return enriched;
  });

export const getLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { staff } = await assertAdmin(context.supabase, context.userId);
    // Auto-provision stub loan_application dla leada, żeby sekwencja maili
    // startowała już od momentu pojawienia się leada (a nie dopiero po wniosku).
    try {
      const { ensureLoanApplicationForLead } = await import("./lead-comms.server");
      await ensureLoanApplicationForLead(data.id);
    } catch (e) {
      console.error("[getLead] ensureLoanApplicationForLead", e);
    }
    // RLS sesji partnera i tak ukrywa leady z rozpoczętym wnioskiem oraz
    // cudzą aktywną wyłączność — jawny filtr utrzymuje tę samą regułę,
    // gdyby zapytanie kiedyś przeszło na service-role.
    let leadQuery = context.supabase.from("leads").select("*").eq("id", data.id);
    if (!staff) {
      leadQuery = leadQuery
        .is("application_started_at", null)
        .or(
          `assigned_to.is.null,assigned_to.eq.${context.userId},claim_expires_at.lte.${new Date().toISOString()}`,
        );
    }
    const { data: lead, error } = await leadQuery.maybeSingle();
    if (error) throw new Error(error.message);
    if (!lead) throw new Error("Lead nie istnieje");

    // Treść komunikacji (transkrypcje voicebota, maile, SMS) czytamy SERVICE-ROLEM
    // (endpoint jest za assertAdmin), żeby pośrednik/operator widział pełny podgląd
    // niezależnie od RLS swojej sesji. Dopasowanie po lead_id + telefonie + mailu leada.
    const orParts: string[] = [`lead_id.eq.${data.id}`];
    if ((lead as any).phone_normalized)
      orParts.push(`phone_normalized.eq.${(lead as any).phone_normalized}`);
    if ((lead as any).email) orParts.push(`email.ilike.${(lead as any).email}`);
    const { data: comms } = await supabaseAdmin
      .from("lead_communications")
      .select("*")
      .or(orParts.join(","))
      .order("created_at", { ascending: false });

    const commAuthorIds = Array.from(
      new Set(((comms ?? []) as any[]).map((c) => c.created_by).filter(Boolean)),
    ) as string[];
    const commAuthorNames: Record<string, string> = {};
    if (commAuthorIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("user_id, first_name, last_name, email")
        .in("user_id", commAuthorIds);
      for (const p of (profs ?? []) as any[]) {
        commAuthorNames[p.user_id] =
          [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || "Pośrednik";
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
        .select(
          "id, created_at, completeness_percent, status, reminder_email_count, reminder_email_first_sent_at, reminder_email_last_sent_at, reminder_email_unsubscribed, reminder_email_unsubscribed_at",
        )
        .eq("id", lead.loan_application_id)
        .maybeSingle();

      const { data: sends } = await context.supabase
        .from("loan_reminder_email_sends")
        .select(
          "id, subject, sent_at, sent_hour_warsaw, opened_at, open_count, clicked_at, click_count, error_message, variant_id, variant:loan_reminder_email_variants(sequence_index, day_index, slot, phase)",
        )
        .eq("loan_application_id", lead.loan_application_id)
        .order("sent_at", { ascending: false });

      // Ile aktywnych szablonów jest w sekwencji (np. 120). Sekwencja cyklu­je,
      // więc „następny" numer zawijamy modulo — nurture nigdy się nie kończy.
      const { data: seqRows } = await context.supabase
        .from("loan_reminder_email_variants")
        .select("sequence_index")
        .eq("active", true)
        .not("sequence_index", "is", null)
        .order("sequence_index", { ascending: true });
      const seqList = (seqRows ?? []).map((r: any) => Number(r.sequence_index));
      const totalVariants = seqList.length || 150;
      const sentSoFar = loanRow?.reminder_email_count ?? 0;
      const wrappedIndex = seqList.length ? seqList[sentSoFar % seqList.length] : sentSoFar + 1;
      const { data: nextVariant } = await context.supabase
        .from("loan_reminder_email_variants")
        .select("id, subject, preview_text, body_html, sequence_index, day_index, slot, phase")
        .eq("sequence_index", wrappedIndex)
        .maybeSingle();

      emailSequence = {
        loan: loanRow,
        sends: sends ?? [],
        nextVariant,
        totalVariants,
        cycle: seqList.length ? Math.floor(sentSoFar / seqList.length) + 1 : 1,
      };
    }
    return { lead, communications: commsWithAuthor, documents, emailSequence };
  });

export const updateLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
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
      })
      .parse(i),
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
    z
      .object({
        leadId: z.string().uuid(),
        phone: z.string().optional().nullable(),
      })
      .parse(i),
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

export const logLeadReveal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        leadId: z.string().uuid(),
        field: z.enum(["phone", "email", "messenger"]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const label =
      data.field === "phone"
        ? "Pośrednik odsłonił numer telefonu"
        : data.field === "email"
          ? "Pośrednik odsłonił adres e-mail"
          : "Pośrednik odsłonił kanał Messenger/IG/WA";
    const { error } = await context.supabase.from("lead_communications").insert({
      lead_id: data.leadId,
      channel: "reveal",
      direction: "outbound",
      status: "revealed",
      content: label,
      created_by: context.userId,
      metadata: { source: "broker_reveal_click", field: data.field },
    });
    if (error) throw new Error(error.message);
    return { ok: true, at: new Date().toISOString() };
  });

export const addManualNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        leadId: z.string().uuid(),
        content: z.string().min(1).max(5000),
      })
      .parse(i),
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
