// CRM: leady, follow-upy, kolejka telefonów, wyszukiwanie w korespondencji,
// notatki i przypisania. Narzędzia zespołowe (administrator / operator).
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  clampLimit,
  countBy,
  daysAgo,
  fail,
  handle,
  isoDate,
  ok,
  oneOf,
  personLabel,
  requireTeam,
  rowsOf,
  snippet,
} from "../_helpers";
import { defineListTool, flag, search, since, text, until, uuid } from "../_list-tool";

const LEAD_COLUMNS =
  "id, first_name, last_name, email, phone_raw, type, status, source, assigned_to, quality_tier, quality_score, marked_bad_lead, loan_application_id, client_id, created_at, updated_at";

export const listLeads = defineListTool({
  name: "list_leads",
  title: "List leads (filters)",
  description:
    "Lista leadów z filtrami: status, typ, źródło, operator, jakość, fraza, zakres dat. Domyślnie bez leadów oznaczonych jako złe. Najnowsze pierwsze, stronicowanie `limit`/`offset`, w odpowiedzi `total`. Tylko administrator/operator (pośrednik używa `list_my_leads`).",
  table: "leads",
  columns: LEAD_COLUMNS,
  resultKey: "leads",
  access: "team",
  filters: {
    status: text("status", "Status leada (np. nowy, w_kontakcie, wniosek, zamkniety)."),
    type: text("type", "Typ leada (np. klient, inwestor, posrednik)."),
    source: text("source", "Źródło leada (np. landing, messenger, meta, telefon, chat)."),
    assigned_to: uuid("assigned_to", "Id operatora, do którego lead jest przypisany."),
    quality_tier: text("quality_tier", "Poziom jakości ze scoringu (np. A/B/C)."),
    query: search(
      ["first_name", "last_name", "email", "phone_raw", "phone_normalized"],
      "Fraza: imię, nazwisko, e-mail lub telefon.",
    ),
    since: since("created_at"),
    until: until("created_at"),
    include_bad: {
      schema: z
        .boolean()
        .default(false)
        .describe("Czy dołączyć leady oznaczone jako złe (domyślnie nie)."),
      apply: (q, v) => (v ? q : q.not("marked_bad_lead", "is", true)),
    },
  },
  map: (r) => ({ ...r, who: personLabel(r), url: `/operator/leady/${r.id}` }),
});

export const getLeadTimeline = defineTool({
  name: "get_lead_timeline",
  title: "Get lead timeline",
  description:
    "Wszystko o jednym leadzie w jednym wywołaniu: dane leada, historia komunikacji (wszystkie kanały), zaplanowane follow-upy, atrybucja (UTM, kampania), powiązany wniosek i linki skrócone z klikami. Tylko administrator/operator.",
  inputSchema: {
    lead_id: z.string().uuid(),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe("Ile ostatnich wiadomości (domyślnie 60)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ lead_id, limit }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeam(ctx);
      const lead = await oneOf(s.from("leads").select("*").eq("id", lead_id), "leads");
      if (!lead) return fail("Nie znaleziono leada.");
      const n = clampLimit(limit, 60, 200);
      const errors: string[] = [];
      const safe = async <T>(label: string, fn: () => Promise<T>): Promise<T | null> => {
        try {
          return await fn();
        } catch (e) {
          errors.push(`${label}: ${(e as Error).message}`);
          return null;
        }
      };
      const [communications, followUps, attributions, links, application] = await Promise.all([
        safe("komunikacja", async () =>
          (
            await rowsOf(
              s
                .from("lead_communications")
                .select(
                  "id, channel, direction, status, subject, content, duration_seconds, created_at",
                )
                .eq("lead_id", lead_id)
                .order("created_at", { ascending: false })
                .limit(n),
              "lead_communications",
            )
          )
            .reverse()
            .map((m) => ({ ...m, content: snippet(m.content, 1200) })),
        ),
        safe("follow-upy", () =>
          rowsOf(
            s
              .from("lead_follow_up_schedule")
              .select(
                "id, channel, step_index, status, scheduled_at, sent_at, attempts, error_message",
              )
              .eq("lead_id", lead_id)
              .order("scheduled_at", { ascending: true })
              .limit(50),
            "lead_follow_up_schedule",
          ),
        ),
        safe("atrybucja", () =>
          rowsOf(
            s
              .from("lead_attributions")
              .select(
                "id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, campaign_id, landing_url, referrer, created_at",
              )
              .eq("lead_id", lead_id)
              .order("created_at", { ascending: false })
              .limit(10),
            "lead_attributions",
          ),
        ),
        safe("linki", () =>
          rowsOf(
            s
              .from("short_links")
              .select(
                "code, source, target_url, click_count, last_clicked_at, expires_at, created_at",
              )
              .eq("lead_id", lead_id)
              .order("created_at", { ascending: false })
              .limit(20),
            "short_links",
          ),
        ),
        safe("wniosek", async () =>
          lead.loan_application_id
            ? oneOf(
                s
                  .from("loan_applications")
                  .select(
                    "id, status, loan_amount, preferred_period_months, completeness_percent, risk_level, next_contact_at, created_at, updated_at",
                  )
                  .eq("id", lead.loan_application_id),
                "loan_applications",
              )
            : null,
        ),
      ]);
      return ok({
        lead: { ...lead, who: personLabel(lead), url: `/operator/leady/${lead.id}` },
        application,
        communications: communications ?? [],
        follow_ups: followUps ?? [],
        attributions: attributions ?? [],
        short_links: links ?? [],
        errors,
      });
    }),
});

export const getLeadStats = defineTool({
  name: "get_lead_stats",
  title: "Get lead statistics",
  description:
    "Statystyki leadów w okresie: liczba, rozkład po statusie, źródle, typie, jakości i po dniach. Domyślnie ostatnie 30 dni. Tylko administrator/operator.",
  inputSchema: {
    since: z
      .string()
      .optional()
      .describe("Od kiedy (ISO 8601 lub YYYY-MM-DD; domyślnie 30 dni wstecz)."),
    until: z.string().optional().describe("Do kiedy (domyślnie teraz)."),
    include_bad: z.boolean().default(false).describe("Czy liczyć leady oznaczone jako złe."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ since, until, include_bad }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeam(ctx);
      const from = isoDate(since, "data od") ?? daysAgo(30);
      const to = isoDate(until, "data do") ?? new Date().toISOString();
      let q = s
        .from("leads")
        .select("status, source, type, quality_tier, marked_bad_lead, created_at")
        .gte("created_at", from)
        .lt("created_at", to)
        .limit(5000);
      if (!include_bad) q = q.not("marked_bad_lead", "is", true);
      const rows = await rowsOf(q, "leads");
      const byDay: Record<string, number> = {};
      for (const r of rows) {
        const d = String(r.created_at).slice(0, 10);
        byDay[d] = (byDay[d] ?? 0) + 1;
      }
      return ok({
        since: from,
        until: to,
        total: rows.length,
        truncated: rows.length >= 5000,
        by_status: countBy(rows, "status"),
        by_source: countBy(rows, "source"),
        by_type: countBy(rows, "type"),
        by_quality_tier: countBy(rows, "quality_tier"),
        by_day: Object.fromEntries(Object.entries(byDay).sort()),
      });
    }),
});

export const listFollowUps = defineListTool({
  name: "list_follow_ups",
  title: "List scheduled follow-ups",
  description:
    "Zaplanowane i wysłane follow-upy do leadów (kadencja mail/SMS/telefon): status, kanał, termin, liczba prób, błąd. Z danymi leada. Tylko administrator/operator.",
  table: "lead_follow_up_schedule",
  columns:
    "id, lead_id, channel, step_index, status, scheduled_at, sent_at, attempts, error_message, created_at",
  resultKey: "follow_ups",
  access: "team",
  order: { column: "scheduled_at", ascending: false },
  filters: {
    status: text("status", "Status wpisu (np. pending, sent, failed, cancelled)."),
    channel: text("channel", "Kanał (email, sms, phone)."),
    lead_id: uuid("lead_id", "Tylko dla tego leada."),
    scheduled_after: since("scheduled_at", "zaplanowania"),
    scheduled_before: until("scheduled_at", "zaplanowania"),
  },
  attach: [
    {
      key: "lead_id",
      table: "leads",
      columns: "id, first_name, last_name, email, phone_raw, status",
      as: "lead",
    },
  ],
});

export const listCallQueue = defineListTool({
  name: "list_call_queue",
  title: "List call queue",
  description:
    "Kolejka połączeń voicebota (Ania): numer, status, termin, próby, wynik rozmowy, powiązany klient/wniosek. Tylko administrator/operator.",
  table: "call_queue",
  columns:
    "id, phone_normalized, status, source, scheduled_at, started_at, finished_at, attempts, result_summary, sms_sent_at, client_id, loan_application_id, meta_lead_id, created_at",
  resultKey: "calls",
  access: "team",
  order: { column: "scheduled_at", ascending: false },
  filters: {
    status: text("status", "Status (np. pending, in_progress, done, failed)."),
    source: text("source", "Źródło wpisu w kolejce."),
    loan_application_id: uuid("loan_application_id", "Tylko dla tego wniosku."),
    since: since("scheduled_at", "zaplanowania"),
    until: until("scheduled_at", "zaplanowania"),
  },
});

export const searchCommunications = defineListTool({
  name: "search_communications",
  title: "Search communications",
  description:
    "Wyszukiwanie w treści całej korespondencji (e-mail, Messenger, czat, SMS, notatki z rozmów) po frazie, kanale, kierunku, leadzie i dacie. Zwraca skróty treści z danymi leada; pełny wątek daje `read_inbox_thread`. Tylko administrator/operator.",
  table: "lead_communications",
  columns:
    "id, lead_id, channel, direction, status, subject, content, email, phone_normalized, duration_seconds, created_at",
  resultKey: "messages",
  access: "team",
  filters: {
    query: search(["subject", "content"], "Fraza w temacie lub treści."),
    channel: text(
      "channel",
      "Kanał: email, messenger, instagram, chat, chat_inwestor, sms, whatsapp, voicebot_call, note.",
    ),
    direction: eqDirection(),
    lead_id: uuid("lead_id", "Tylko dla tego leada."),
    since: since("created_at"),
    until: until("created_at"),
  },
  attach: [
    {
      key: "lead_id",
      table: "leads",
      columns: "id, first_name, last_name, email, phone_raw",
      as: "lead",
    },
  ],
  map: (r) => ({ ...r, content: snippet(r.content, 400) }),
});

function eqDirection() {
  return {
    schema: z.enum(["inbound", "outbound"]).optional().describe("Kierunek wiadomości."),
    apply: (q: any, v: string) => q.eq("direction", v),
  };
}

export const getCallTranscript = defineTool({
  name: "get_call_transcript",
  title: "Get call transcript",
  description:
    "Transkrypcja i nagranie rozmowy telefonicznej voicebota / operatora po id wpisu komunikacji (kanał voicebot_call). Tylko administrator/operator.",
  inputSchema: { communication_id: z.string().uuid() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ communication_id }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeam(ctx);
      const row = await oneOf(
        s
          .from("lead_communications")
          .select(
            "id, lead_id, channel, direction, status, subject, content, transcript, recording_url, duration_seconds, agent_id, elevenlabs_conversation_id, metadata, created_at",
          )
          .eq("id", communication_id),
        "lead_communications",
      );
      if (!row) return fail("Nie znaleziono wpisu komunikacji.");
      return ok(row);
    }),
});

export const addLeadNote = defineTool({
  name: "add_lead_note",
  title: "Add lead note",
  description:
    "Dopisuje notatkę (z datą i autorem) do pola notatek leada. Nie wysyła żadnej wiadomości do klienta. Tylko administrator/operator.",
  inputSchema: {
    lead_id: z.string().uuid(),
    note: z.string().min(1).max(4000),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: ({ lead_id, note }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeam(ctx);
      const lead = await oneOf(s.from("leads").select("id, notes").eq("id", lead_id), "leads");
      if (!lead) return fail("Nie znaleziono leada.");
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const line = `[${stamp} MCP ${ctx.getUserId()}] ${note.trim()}`;
      const notes = lead.notes ? `${lead.notes}\n${line}` : line;
      const { error } = await s.from("leads").update({ notes }).eq("id", lead_id);
      if (error) throw new Error(`leads: ${error.message}`);
      return ok({ ok: true, lead_id, added: line });
    }),
});

export const assignLead = defineTool({
  name: "assign_lead",
  title: "Assign lead to operator",
  description:
    "Przypisuje leada do operatora (id użytkownika z `list_team_members`) albo zdejmuje przypisanie (`user_id` = null). Tylko administrator/operator.",
  inputSchema: {
    lead_id: z.string().uuid(),
    user_id: z
      .string()
      .uuid()
      .nullable()
      .describe("Id użytkownika-operatora; null = brak przypisania."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: ({ lead_id, user_id }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeam(ctx);
      if (user_id) {
        const roles = await rowsOf(
          s.from("user_roles").select("role").eq("user_id", user_id),
          "user_roles",
        );
        const isTeam = roles.some((r) =>
          ["administrator", "operator", "operator_wewnetrzny"].includes(r.role),
        );
        if (!isTeam) return fail("Wskazany użytkownik nie jest członkiem zespołu.");
      }
      const { data, error } = await s
        .from("leads")
        .update({ assigned_to: user_id })
        .eq("id", lead_id)
        .select("id, assigned_to")
        .maybeSingle();
      if (error) throw new Error(`leads: ${error.message}`);
      if (!data) return fail("Nie znaleziono leada.");
      return ok({ ok: true, ...data });
    }),
});

export const listTeamMembers = defineTool({
  name: "list_team_members",
  title: "List team members",
  description:
    "Członkowie zespołu Finance You (administratorzy, operatorzy, księgowość) z rolami i danymi z profilu — do przypisywania leadów i wniosków. Tylko administrator/operator.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (_i, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeam(ctx);
      const roles = await rowsOf<{ user_id: string; role: string }>(
        s
          .from("user_roles")
          .select("user_id, role")
          .in("role", ["administrator", "operator", "operator_wewnetrzny", "ksiegowosc"]),
        "user_roles",
      );
      const ids = [...new Set(roles.map((r) => r.user_id))];
      const profiles = ids.length
        ? await rowsOf<Record<string, any>>(
            s
              .from("profiles")
              .select("user_id, first_name, last_name, email, job_title, phone")
              .in("user_id", ids),
            "profiles",
          )
        : [];
      const byUser = new Map(profiles.map((p) => [p.user_id, p]));
      const members = ids.map((id) => ({
        user_id: id,
        roles: roles.filter((r) => r.user_id === id).map((r) => r.role),
        ...(byUser.get(id) ?? {}),
      }));
      return ok({ members });
    }),
});

export const crmExtraTools = [
  listLeads,
  getLeadTimeline,
  getLeadStats,
  listFollowUps,
  listCallQueue,
  searchCommunications,
  getCallTranscript,
  addLeadNote,
  assignLead,
  listTeamMembers,
];
