// Operacje i system: automatyzacje, błędy API, audyt, pamięć i historia
// asystenta panelu, dokumenty, przypomnienia, stan platformy, KPI.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  countBy,
  daysAgo,
  handle,
  isoDate,
  ok,
  requireTeam,
  rowsOf,
  section,
  snippet,
} from "../_helpers";
import { defineListTool, search, since, text, uuid } from "../_list-tool";

const ADMIN_ONLY = ["administrator"] as const;

export const listAutomationEvents = defineListTool({
  name: "list_automation_events",
  title: "List automation events",
  description:
    "Zdarzenia automatyzacji (webhooki, scenariusze, ticki): typ, status, wniosek, błąd. Do diagnozy „czy automat zadziałał”. Tylko administrator/operator.",
  table: "automation_events",
  columns: "id, automation_type, status, loan_application_id, error_message, created_at",
  resultKey: "events",
  access: "team",
  filters: {
    automation_type: text("automation_type", "Typ automatyzacji."),
    status: text("status", "Status (np. ok, error)."),
    loan_application_id: uuid("loan_application_id", "Tylko dla tego wniosku."),
    since: since("created_at"),
  },
});

export const listExternalApiErrors = defineListTool({
  name: "list_external_api_calls",
  title: "List external API calls (errors)",
  description:
    "Wywołania zewnętrznych API (KW, GUS, KRS, CRBR, RCN, NBP…): dostawca, typ i wartość zapytania, powodzenie, kod błędu, czas odpowiedzi. Domyślnie tylko nieudane. Tylko administrator/operator.",
  table: "external_api_logs",
  columns:
    "id, provider, query_type, query_value, success, error_code, response_time_ms, created_at",
  resultKey: "calls",
  access: "team",
  filters: {
    provider: text("provider", "Dostawca API."),
    only_failed: {
      schema: z.boolean().default(true).describe("Tylko nieudane wywołania (domyślnie tak)."),
      apply: (q, v) => (v ? q.eq("success", false) : q),
    },
    since: since("created_at"),
  },
});

export const listAuditLogs = defineListTool({
  name: "list_audit_logs",
  title: "List audit logs",
  description:
    "Dziennik audytu panelu: akcja, typ i id obiektu, kto, wartości przed/po. Tylko administrator.",
  table: "audit_logs",
  columns: "id, action, object_type, object_id, user_id, previous_value, new_value, created_at",
  resultKey: "logs",
  access: ADMIN_ONLY,
  filters: {
    action: text("action", "Nazwa akcji."),
    object_type: text("object_type", "Typ obiektu (np. lead, loan_application)."),
    object_id: text("object_id", "Id obiektu."),
    user_id: uuid("user_id", "Tylko działania tego użytkownika."),
    since: since("created_at"),
  },
});

export const searchAdminAssistantHistory = defineListTool({
  name: "search_admin_assistant_history",
  title: "Search panel assistant history",
  description:
    "Szukanie w rozmowach z asystentem panelu (bot administratora w /admin): fraza, rola, data — z tytułem rozmowy. Pozwala kontynuować w czacie to, co ustalono w panelu. Tylko administrator.",
  table: "ai_admin_messages",
  columns: "id, conversation_id, role, content, created_at",
  resultKey: "messages",
  access: ADMIN_ONLY,
  filters: {
    query: search(["content"], "Fraza w treści wiadomości."),
    role: text("role", "Rola (user / assistant)."),
    conversation_id: uuid("conversation_id", "Tylko z tej rozmowy."),
    since: since("created_at"),
  },
  attach: [
    {
      key: "conversation_id",
      table: "ai_admin_conversations",
      columns: "id, title, summary",
      as: "conversation",
    },
  ],
  map: (r) => ({ ...r, content: snippet(r.content, 800) }),
});

export const listAdminMemory = defineListTool({
  name: "list_admin_memory",
  title: "List panel assistant memory",
  description:
    "Pamięć długotrwała asystenta panelu (ustalenia, preferencje, fakty o firmie): tytuł, treść, rodzaj, przypięte, waga. Tylko administrator.",
  table: "ai_admin_memory",
  columns: "id, kind, title, content, pinned, weight, uses, last_used_at, updated_at",
  resultKey: "memories",
  access: ADMIN_ONLY,
  order: { column: "updated_at", ascending: false },
  filters: {
    kind: text("kind", "Rodzaj wpisu."),
    query: search(["title", "content"], "Fraza w tytule lub treści."),
    include_archived: {
      schema: z.boolean().default(false).describe("Dołączyć wpisy zarchiwizowane."),
      apply: (q, v) => (v ? q : q.eq("archived", false)),
    },
  },
});

export const listGeneratedDocuments = defineListTool({
  name: "list_generated_documents",
  title: "List generated documents",
  description:
    "Dokumenty wygenerowane z szablonów (umowy, oświadczenia): szablon, powiązany lead / wniosek / oferta, pliki PDF/DOCX, rozmiar, kto wygenerował. Widoczność wg RLS.",
  table: "generated_documents",
  columns:
    "id, template_name, template_slug, lead_id, loan_application_id, investor_offer_id, pdf_path, docx_path, file_size_bytes, created_by, created_at",
  resultKey: "documents",
  filters: {
    lead_id: uuid("lead_id", "Tylko dla tego leada."),
    loan_application_id: uuid("loan_application_id", "Tylko dla tego wniosku."),
    template_slug: text("template_slug", "Slug szablonu."),
    since: since("created_at"),
  },
});

export const listDocumentTemplates = defineListTool({
  name: "list_document_templates",
  title: "List document templates",
  description:
    "Szablony dokumentów w kreatorze: nazwa, slug, kategoria, zastosowanie, format wyjściowy, opis, grupa odbiorców. Treść szablonu nie jest zwracana.",
  table: "document_templates",
  columns:
    "id, name, slug, category, use_case, output_format, description, audience, placeholders, sort_order, updated_at",
  resultKey: "templates",
  order: { column: "sort_order", ascending: true },
  filters: {
    category: text("category", "Kategoria."),
    use_case: text("use_case", "Zastosowanie."),
    query: search(["name", "description"], "Fraza: nazwa lub opis."),
  },
});

export const listLoanReminderSends = defineListTool({
  name: "list_loan_reminder_sends",
  title: "List loan reminder e-mail sends",
  description:
    "Wysłane maile przypominające klientom o dokończeniu wniosku (drip): adresat, temat, numer w sekwencji, godzina, otwarcia i kliknięcia, błąd. Tylko administrator/operator.",
  table: "loan_reminder_email_sends",
  columns:
    "id, loan_application_id, recipient_email, subject, sequence_number, variant_id, sent_at, sent_hour_warsaw, opened_at, open_count, clicked_at, click_count, error_message",
  resultKey: "sends",
  access: "team",
  order: { column: "sent_at", ascending: false },
  filters: {
    loan_application_id: uuid("loan_application_id", "Tylko dla tego wniosku."),
    recipient_email: text("recipient_email", "Dokładny adres odbiorcy."),
    since: since("sent_at", "wysyłki"),
  },
});

async function countRows(q: any, table: string): Promise<number> {
  const { count, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

export const getPlatformHealth = defineTool({
  name: "get_platform_health",
  title: "Get platform health",
  description:
    "Stan operacyjny platformy z ostatnich 24 h w jednym wywołaniu: automatyzacje (po statusie i typie), nieudane wywołania API (po dostawcy), zaległe follow-upy, wątki czekające na odpowiedź, nieudane biegi analiz, wnioski niekompletne z ostatnich 30 dni, propozycje auto-dystrybucji i follow-upy braków po statusie. Tylko administrator/operator.",
  inputSchema: {
    hours: z
      .number()
      .int()
      .min(1)
      .max(168)
      .default(24)
      .describe("Ile godzin wstecz (domyślnie 24)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ hours }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeam(ctx);
      const since = new Date(Date.now() - hours * 3_600_000).toISOString();
      const now = new Date().toISOString();
      const errors: string[] = [];
      const [
        automation,
        apiFailures,
        overdueFollowUps,
        awaiting,
        failedRuns,
        incomplete,
        proposals,
        missingInfo,
      ] = await Promise.all([
        section(errors, "automation_events", async () => {
          const rows = await rowsOf(
            s
              .from("automation_events")
              .select("automation_type, status")
              .gte("created_at", since)
              .limit(2000),
            "automation_events",
          );
          return {
            total: rows.length,
            by_status: countBy(rows, "status"),
            by_type: countBy(rows, "automation_type"),
          };
        }),
        section(errors, "external_api_logs", async () => {
          const rows = await rowsOf(
            s
              .from("external_api_logs")
              .select("provider, error_code")
              .eq("success", false)
              .gte("created_at", since)
              .limit(2000),
            "external_api_logs",
          );
          return {
            total: rows.length,
            by_provider: countBy(rows, "provider"),
            by_error: countBy(rows, "error_code"),
          };
        }),
        section(errors, "lead_follow_up_schedule", () =>
          countRows(
            s
              .from("lead_follow_up_schedule")
              .select("id", { count: "exact", head: true })
              .eq("status", "pending")
              .lt("scheduled_at", now),
            "lead_follow_up_schedule",
          ),
        ),
        section(errors, "skrzynka", async () => {
          const { listCommsThreads } = await import("@/lib/comms-agent.server");
          const r = await listCommsThreads({ onlyAwaitingReply: true, days: 14, limit: 60 });
          return {
            awaiting_reply: r.threads.length,
            oldest: r.threads.slice(-5).map((t) => ({
              who: t.who,
              channel: t.last_channel,
              last_at: t.last_at,
              lead_id: t.lead_id,
            })),
          };
        }),
        section(errors, "analysis_pipeline_runs", () =>
          countRows(
            s
              .from("analysis_pipeline_runs")
              .select("id", { count: "exact", head: true })
              .eq("status", "failed")
              .gte("started_at", since),
            "analysis_pipeline_runs",
          ),
        ),
        section(errors, "loan_applications", () =>
          countRows(
            s
              .from("loan_applications")
              .select("id", { count: "exact", head: true })
              .is("deleted_at", null)
              .is("archived_at", null)
              .lt("completeness_percent", 100)
              .gte("created_at", daysAgo(30)),
            "loan_applications",
          ),
        ),
        section(errors, "auto_distribution_proposals", async () => {
          const rows = await rowsOf(
            s
              .from("auto_distribution_proposals")
              .select("status")
              .gte("proposed_at", daysAgo(7))
              .limit(2000),
            "auto_distribution_proposals",
          );
          return countBy(rows, "status");
        }),
        section(errors, "missing_info_follow_ups", async () => {
          const rows = await rowsOf(
            s.from("missing_info_follow_ups").select("status, paused").limit(2000),
            "missing_info_follow_ups",
          );
          return {
            by_status: countBy(rows, "status"),
            paused: rows.filter((r) => r.paused).length,
          };
        }),
      ]);
      return ok({
        window_hours: hours,
        since,
        automation,
        api_failures: apiFailures,
        overdue_follow_ups: overdueFollowUps,
        inbox: awaiting,
        failed_analysis_runs: failedRuns,
        incomplete_applications_30d: incomplete,
        auto_distribution_proposals_7d: proposals,
        missing_info_follow_ups: missingInfo,
        errors,
      });
    }),
});

export const getKpiReport = defineTool({
  name: "get_kpi_report",
  title: "Get KPI report (period vs previous)",
  description:
    "Raport KPI za okres (domyślnie 7 dni) z porównaniem do poprzedniego okresu tej samej długości: nowe leady, wnioski, wiadomości przychodzące, oferty inwestorów, odpowiedzi instytucji, opłacone dostępy i przychód. Tylko administrator/operator.",
  inputSchema: {
    period_days: z.number().int().min(1).max(90).default(7),
    until: z.string().optional().describe("Koniec okresu (domyślnie teraz)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ period_days, until }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeam(ctx);
      const end = new Date(isoDate(until, "data do") ?? new Date().toISOString());
      const mid = new Date(end.getTime() - period_days * 86_400_000);
      const start = new Date(mid.getTime() - period_days * 86_400_000);
      const { collectActivitySince } = await import("@/lib/activity-digest.server");
      const [current, previous] = await Promise.all([
        collectActivitySince({ since: mid, until: end, limitPerSection: 1 }),
        collectActivitySince({ since: start, until: mid, limitPerSection: 1 }),
      ]);
      const revenue = async (from: Date, to: Date) => {
        const rows = await rowsOf<{ paid_amount_grosz: number | null }>(
          s
            .from("access_payments")
            .select("paid_amount_grosz")
            .eq("status", "paid")
            .gte("processed_at", from.toISOString())
            .lt("processed_at", to.toISOString())
            .limit(5000),
          "access_payments",
        );
        return rows.reduce((a, r) => a + (r.paid_amount_grosz ?? 0), 0) / 100;
      };
      const [revCurrent, revPrevious] = await Promise.all([revenue(mid, end), revenue(start, mid)]);
      const delta = (a: number, b: number) => ({
        current: a,
        previous: b,
        change: a - b,
        change_pct: b === 0 ? null : Math.round(((a - b) / b) * 1000) / 10,
      });
      const keys = Object.keys(current.counts) as Array<keyof typeof current.counts>;
      const metrics: Record<string, ReturnType<typeof delta>> = {};
      for (const k of keys) metrics[k] = delta(current.counts[k], previous.counts[k]);
      metrics.revenue_pln = delta(revCurrent, revPrevious);
      return ok({
        period_days,
        current_period: { since: mid.toISOString(), until: end.toISOString() },
        previous_period: { since: start.toISOString(), until: mid.toISOString() },
        metrics,
        errors: [...current.errors, ...previous.errors],
      });
    }),
});

export const opsTools = [
  listAutomationEvents,
  listExternalApiErrors,
  listAuditLogs,
  searchAdminAssistantHistory,
  listAdminMemory,
  listGeneratedDocuments,
  listDocumentTemplates,
  listLoanReminderSends,
  getPlatformHealth,
  getKpiReport,
];
