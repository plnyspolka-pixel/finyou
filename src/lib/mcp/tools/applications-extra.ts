// Wnioski pożyczkowe: wyszukiwanie, pełna karta, braki, historia statusów,
// dokumenty, follow-up braków, auto-dystrybucja, wątki z instytucjami,
// kreator pożyczki.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  attach,
  clampLimit,
  fail,
  handle,
  ilikeAny,
  isoDate,
  ok,
  oneOf,
  personLabel,
  requireTeam,
  requireUser,
  rowsOf,
  section,
  snippet,
} from "../_helpers";
import { defineListTool, flag, search, since, text, until, uuid } from "../_list-tool";

const APP_COLUMNS =
  "id, client_id, status, loan_amount, preferred_period_months, max_monthly_payment, completeness_percent, current_form_step, source, risk_level, initial_score, interest_score, estimated_ltv, available_to_investors, investor_interest_count, assigned_operator, admin_decision, next_contact_at, last_contact_at, archived_at, created_at, updated_at";
const CLIENT_COLUMNS = "id, first_name, last_name, email, phone, company_name, nip, city";

export const searchApplications = defineTool({
  name: "search_applications",
  title: "Search loan applications",
  description:
    "Wyszukiwanie wniosków pożyczkowych po kliencie (imię, nazwisko, e-mail, telefon, NIP), statusie, kwocie, kompletności, operatorze, widoczności dla inwestorów, ryzyku i dacie. Z danymi klienta. Tylko administrator/operator.",
  inputSchema: {
    query: z
      .string()
      .min(2)
      .optional()
      .describe("Fraza: klient (imię, nazwisko, e-mail, telefon, NIP, firma)."),
    status: z
      .string()
      .optional()
      .describe(
        "Status wniosku (np. nowy_lead, wniosek_kompletny, do_analizy, rokuje, wyslany_do_inwestorow, oferta_od_inwestora, do_umowy).",
      ),
    min_amount: z.number().optional().describe("Minimalna kwota pożyczki (PLN)."),
    max_amount: z.number().optional().describe("Maksymalna kwota pożyczki (PLN)."),
    min_completeness: z.number().int().min(0).max(100).optional(),
    max_completeness: z.number().int().min(0).max(100).optional(),
    assigned_operator: z.string().uuid().optional(),
    available_to_investors: z.boolean().optional(),
    risk_level: z.string().optional(),
    since: z.string().optional().describe("Utworzone od (ISO 8601 lub YYYY-MM-DD)."),
    until: z.string().optional().describe("Utworzone do."),
    include_deleted: z.boolean().default(false),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeam(ctx);
      const limit = clampLimit(a.limit, 20, 100);
      const offset = a.offset ?? 0;
      let q = s.from("loan_applications").select(APP_COLUMNS, { count: "exact" });
      if (!a.include_deleted) q = q.is("deleted_at", null);
      if (a.query) {
        const clients = await rowsOf<{ id: string }>(
          s
            .from("clients")
            .select("id")
            .or(
              ilikeAny(
                [
                  "first_name",
                  "last_name",
                  "email",
                  "phone",
                  "phone_normalized",
                  "nip",
                  "company_name",
                ],
                a.query,
              ),
            )
            .limit(500),
          "clients",
        );
        const ids = clients.map((c) => c.id);
        if (ids.length === 0) return ok({ applications: [], total: 0, limit, offset });
        q = q.in("client_id", ids);
      }
      if (a.status) q = q.eq("status", a.status);
      if (a.min_amount !== undefined) q = q.gte("loan_amount", a.min_amount);
      if (a.max_amount !== undefined) q = q.lte("loan_amount", a.max_amount);
      if (a.min_completeness !== undefined) q = q.gte("completeness_percent", a.min_completeness);
      if (a.max_completeness !== undefined) q = q.lte("completeness_percent", a.max_completeness);
      if (a.assigned_operator) q = q.eq("assigned_operator", a.assigned_operator);
      if (a.available_to_investors !== undefined)
        q = q.eq("available_to_investors", a.available_to_investors);
      if (a.risk_level) q = q.eq("risk_level", a.risk_level);
      const from = isoDate(a.since, "data od");
      const to = isoDate(a.until, "data do");
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lt("created_at", to);
      const { data, error, count } = await q
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw new Error(`loan_applications: ${error.message}`);
      const rows = await attach(s, (data ?? []) as Record<string, any>[], {
        key: "client_id",
        table: "clients",
        columns: CLIENT_COLUMNS,
        as: "client",
      });
      return ok({
        applications: rows.map((r) => ({ ...r, url: `/operator/wnioski/${r.id}` })),
        total: count ?? rows.length,
        limit,
        offset,
      });
    }),
});

export const getApplicationDetails = defineTool({
  name: "get_application_details",
  title: "Get application details (full card)",
  description:
    "Pełna karta wniosku w jednym wywołaniu: wniosek, klient, nieruchomości, dokumenty, historia statusów, oferty inwestorów, dystrybucja do instytucji, analizy (wycena nieruchomości, ryzyko inwestycyjne, KW, lokalizacja) i follow-up braków. Dla klienta (RLS) — własny wniosek; dla zespołu — każdy.",
  inputSchema: { id: z.string().uuid() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ id }, ctx: ToolContext) =>
    handle(async () => {
      const s = requireUser(ctx);
      const app = await oneOf(
        s.from("loan_applications").select("*").eq("id", id),
        "loan_applications",
      );
      if (!app) return fail("Nie znaleziono wniosku (albo brak uprawnień).");
      const errors: string[] = [];
      const latest = (
        table: string,
        columns: string,
        col = "application_id",
        order = "created_at",
      ) =>
        section(errors, table, () =>
          oneOf(
            s.from(table).select(columns).eq(col, id).order(order, { ascending: false }).limit(1),
            table,
          ),
        );
      const [
        client,
        properties,
        documents,
        history,
        offers,
        distributions,
        propertyAnalysis,
        risk,
        kw,
        location,
        missingInfo,
      ] = await Promise.all([
        section(errors, "clients", () =>
          oneOf(s.from("clients").select(CLIENT_COLUMNS).eq("id", app.client_id), "clients"),
        ),
        section(errors, "properties", () =>
          rowsOf(s.from("properties").select("*").eq("loan_application_id", id), "properties"),
        ),
        section(errors, "documents", () =>
          rowsOf(
            s
              .from("documents")
              .select(
                "id, document_type, file_name, status, visibility_level, property_id, created_at",
              )
              .eq("loan_application_id", id)
              .order("created_at", { ascending: false })
              .limit(100),
            "documents",
          ),
        ),
        section(errors, "loan_status_history", () =>
          rowsOf(
            s
              .from("loan_status_history")
              .select("old_status, new_status, changed_by, changed_at")
              .eq("loan_application_id", id)
              .order("changed_at", { ascending: false })
              .limit(30),
            "loan_status_history",
          ),
        ),
        section(errors, "investor_offers", () =>
          rowsOf(
            s
              .from("investor_offers")
              .select(
                "id, investor_id, offer_status, proposed_amount, period_months, expected_yearly_yield, estimated_monthly_payment, estimated_total_cost, commission, counter_offer, submitted_at, client_decision_at, created_at",
              )
              .eq("loan_application_id", id)
              .order("created_at", { ascending: false }),
            "investor_offers",
          ),
        ),
        section(errors, "offer_distributions", () =>
          rowsOf(
            s
              .from("offer_distributions")
              .select(
                "id, investor_id, distribution_status, email_status, sent_at, responded_at, response_summary, additional_info_request",
              )
              .eq("loan_application_id", id)
              .order("created_at", { ascending: false }),
            "offer_distributions",
          ),
        ),
        latest(
          "property_analyses",
          "id, status, estimated_value_pln, ltv_percent, collateral_score, collateral_category, main_source, warnings, created_at",
        ),
        latest(
          "investment_risk_assessments",
          "id, risk_grade, investment_score, saleability_score, recommendation, forced_sale_floor_pln, master_valuation_status, warnings, created_at",
        ),
        latest(
          "kw_analysis",
          "id, kw_number, legal_risk_score, risk_flags, investor_summary, analysis_warning, created_at",
        ),
        latest(
          "location_scoring_results",
          "id, masked_kw_number, property_type, decision, expected_location_attractiveness, confidence_score, probability_good_location, probability_urban_core, probability_remote_area, calculated_at",
          "loan_application_id",
          "calculated_at",
        ),
        latest(
          "missing_info_follow_ups",
          "id, status, paused, attempt_count, last_channel, last_sent_at, next_send_at, last_error",
          "loan_application_id",
          "updated_at",
        ),
      ]);
      return ok({
        application: { ...app, url: `/operator/wnioski/${app.id}` },
        client: client ? { ...client, who: personLabel(client) } : null,
        properties: properties ?? [],
        documents: documents ?? [],
        status_history: history ?? [],
        offers: offers ?? [],
        institution_distributions: distributions ?? [],
        analyses: {
          property: propertyAnalysis,
          risk,
          kw,
          location,
        },
        missing_info_follow_up: missingInfo,
        errors,
      });
    }),
});

export const listIncompleteApplications = defineListTool({
  name: "list_incomplete_applications",
  title: "List incomplete applications",
  description:
    "Wnioski niekompletne (kompletność poniżej progu, domyślnie 100%) z listą braków, ostatnim i następnym kontaktem oraz licznikami przypomnień. Z danymi klienta. Tylko administrator/operator.",
  table: "loan_applications",
  columns:
    "id, client_id, status, loan_amount, completeness_percent, current_form_step, missing_fields, missing_documents_snapshot, last_contact_at, next_contact_at, reminder_email_count, reminder_sms_count, reminder_paused, source, created_at, updated_at",
  resultKey: "applications",
  access: "team",
  base: (q) => q.is("deleted_at", null).is("archived_at", null),
  filters: {
    max_completeness: {
      schema: z
        .number()
        .int()
        .min(0)
        .max(100)
        .default(99)
        .describe("Próg kompletności (domyślnie poniżej 100%)."),
      apply: (q, v) => q.lte("completeness_percent", v),
    },
    status: text("status", "Status wniosku."),
    since: since("created_at"),
    until: until("created_at"),
  },
  attach: [{ key: "client_id", table: "clients", columns: CLIENT_COLUMNS, as: "client" }],
  map: (r) => ({ ...r, url: `/operator/wnioski/${r.id}` }),
});

export const listApplicationDocuments = defineListTool({
  name: "list_application_documents",
  title: "List documents",
  description:
    "Dokumenty wgrane do wniosku lub nieruchomości: typ, nazwa pliku, status weryfikacji, widoczność. Widoczność wg RLS (klient widzi swoje).",
  table: "documents",
  columns:
    "id, loan_application_id, property_id, document_type, file_name, status, visibility_level, uploaded_by, created_at, updated_at",
  resultKey: "documents",
  filters: {
    loan_application_id: uuid("loan_application_id", "Tylko dla tego wniosku."),
    property_id: uuid("property_id", "Tylko dla tej nieruchomości."),
    document_type: text("document_type", "Typ dokumentu."),
    status: text("status", "Status weryfikacji."),
  },
});

export const getApplicationStatusHistory = defineListTool({
  name: "get_application_status_history",
  title: "Get application status history",
  description: "Historia zmian statusu wniosku (kto, kiedy, z czego na co). Widoczność wg RLS.",
  table: "loan_status_history",
  columns: "id, loan_application_id, old_status, new_status, changed_by, changed_at",
  resultKey: "history",
  order: { column: "changed_at", ascending: false },
  filters: {
    loan_application_id: {
      schema: z.string().uuid().describe("Id wniosku."),
      apply: (q, v) => q.eq("loan_application_id", v),
    },
  },
});

export const listMissingInfoFollowUps = defineListTool({
  name: "list_missing_info_follow_ups",
  title: "List missing-info follow-ups",
  description:
    "Stan modułu „follow-up braków”: które wnioski są w kadencji dopytywania o braki, ile prób, jakim kanałem, kiedy następna wysyłka, błędy. Tylko administrator/operator.",
  table: "missing_info_follow_ups",
  columns:
    "id, loan_application_id, status, paused, attempt_count, last_channel, last_sent_at, next_send_at, last_error, created_at, updated_at",
  resultKey: "follow_ups",
  access: "team",
  order: { column: "updated_at", ascending: false },
  filters: {
    status: text("status", "Status (np. active, done, stopped)."),
    paused: flag("paused", "Tylko wstrzymane / tylko aktywne."),
    loan_application_id: uuid("loan_application_id", "Tylko dla tego wniosku."),
  },
});

export const listAutoDistributionProposals = defineListTool({
  name: "list_auto_distribution_proposals",
  title: "List auto-distribution proposals",
  description:
    "Propozycje auto-dystrybucji wniosków do instytucji finansujących: dopasowania, kwalifikacja, status (do zatwierdzenia / wysłane / odrzucone), wynik wysyłki. Tylko administrator/operator.",
  table: "auto_distribution_proposals",
  columns:
    "id, loan_application_id, status, eligibility, matches, proposed_at, decided_by, decided_at, sent_result, error",
  resultKey: "proposals",
  access: "team",
  order: { column: "proposed_at", ascending: false },
  filters: {
    status: text("status", "Status propozycji (np. pending, approved, sent, rejected)."),
    loan_application_id: uuid("loan_application_id", "Tylko dla tego wniosku."),
  },
});

export const listInstitutionThreads = defineTool({
  name: "list_institution_threads",
  title: "List institution threads",
  description:
    "Wątki mailowe z instytucjami finansującymi (dystrybucja oferty konkretnego wniosku): kto dostał ofertę, status, kiedy odpowiedział, ostatnie wiadomości. Tylko administrator/operator.",
  inputSchema: {
    loan_application_id: z.string().uuid().optional(),
    investor_id: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ loan_application_id, investor_id, limit }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const { listOfferThreads } = await import("@/lib/comms-agent.server");
      const result = await listOfferThreads({
        applicationId: loan_application_id,
        investorId: investor_id,
        limit: limit ?? 20,
      });
      return ok(result);
    }),
});

export const readInstitutionThread = defineListTool({
  name: "read_institution_thread",
  title: "Read institution thread",
  description:
    "Wszystkie wiadomości wymienione z instytucjami w sprawie jednego wniosku (chronologicznie): kierunek, nadawca, temat, treść. Tylko administrator/operator.",
  table: "offer_distribution_messages",
  columns:
    "id, distribution_id, investor_id, direction, from_email, to_email, subject, content, in_reply_to, created_at",
  resultKey: "messages",
  access: "team",
  order: { column: "created_at", ascending: true },
  defaultLimit: 60,
  maxLimit: 200,
  filters: {
    loan_application_id: {
      schema: z.string().uuid().describe("Id wniosku."),
      apply: (q, v) => q.eq("loan_application_id", v),
    },
    investor_id: uuid("investor_id", "Tylko z tą instytucją."),
  },
  map: (r) => ({ ...r, content: snippet(r.content, 3000) }),
});

export const listInstitutionQuestions = defineListTool({
  name: "list_institution_questions",
  title: "List institution questions",
  description:
    "Pytania instytucji finansujących do klientów (pętla pytanie → klient → odpowiedź → instytucje): status, kanał, odpowiedź klienta, kiedy przekazano. Tylko administrator/operator.",
  table: "institution_qa_threads",
  columns:
    "id, loan_application_id, questions, status, client_channel, last_client_message_at, client_answer, forwarded_at, created_at, updated_at",
  resultKey: "threads",
  access: "team",
  order: { column: "updated_at", ascending: false },
  filters: {
    status: text("status", "Status wątku pytań."),
    loan_application_id: uuid("loan_application_id", "Tylko dla tego wniosku."),
  },
});

export const listLoanProposals = defineListTool({
  name: "list_loan_proposals",
  title: "List loan proposals (kreator)",
  description:
    "Propozycje pożyczek z kreatora (kwota, okres, oprocentowanie, rata nominalna i ograniczona, prowizja, koszt całkowity) z danymi klienta. Tylko administrator/operator.",
  table: "loan_proposals",
  columns:
    "id, client_name, client_email, client_phone, amount, months, annual_rate, nominal_rata, capped_rata, max_payment, balloon, commission_pct, commission_pln, total_interest, total_cost, total_to_repay, status, is_public, source_application_id, note, created_at",
  resultKey: "proposals",
  access: "team",
  filters: {
    status: text("status", "Status propozycji."),
    query: search(["client_name", "client_email", "client_phone"], "Fraza: klient."),
    source_application_id: uuid("source_application_id", "Tylko dla tego wniosku."),
    since: since("created_at"),
  },
});

export const applicationsExtraTools = [
  searchApplications,
  getApplicationDetails,
  listIncompleteApplications,
  listApplicationDocuments,
  getApplicationStatusHistory,
  listMissingInfoFollowUps,
  listAutoDistributionProposals,
  listInstitutionThreads,
  readInstitutionThread,
  listInstitutionQuestions,
  listLoanProposals,
];
