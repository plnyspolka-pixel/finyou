// Analizy: księgi wieczyste, ryzyko inwestycyjne, lokalizacja, pipeline.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { fail, handle, ok, oneOf, requireTeam, requireUser } from "../_helpers";
import { defineListTool, text, uuid } from "../_list-tool";

const KW_LIGHT =
  "id, kw_number, application_id, legal_risk_score, risk_flags, investor_summary, analysis_warning, owners_json, property_json, created_at, updated_at";

export const getKwAnalysis = defineTool({
  name: "get_kw_analysis",
  title: "Get land register (KW) analysis",
  description:
    "Analiza księgi wieczystej po numerze KW albo po wniosku: właściciele, dane nieruchomości, flagi ryzyka, ocena ryzyka prawnego, podsumowanie dla inwestora. `full=true` dołącza surowe działy I–IV. Widoczność wg RLS.",
  inputSchema: {
    kw_number: z.string().min(5).optional().describe("Numer KW, np. WA1M/00123456/7."),
    application_id: z.string().uuid().optional().describe("Albo id wniosku."),
    full: z.boolean().default(false).describe("Dołączyć surowe działy I–IV (duże)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ kw_number, application_id, full }, ctx: ToolContext) =>
    handle(async () => {
      if (!kw_number && !application_id) return fail("Podaj kw_number albo application_id.");
      const s = requireUser(ctx);
      let q = s.from("kw_analysis").select(full ? "*" : KW_LIGHT);
      q = kw_number
        ? q.eq("kw_number", kw_number.trim().toUpperCase())
        : q.eq("application_id", application_id);
      const row = await oneOf(q.order("created_at", { ascending: false }).limit(1), "kw_analysis");
      if (!row) return fail("Brak analizy KW dla podanych parametrów.");
      return ok(row);
    }),
});

export const getKwFindings = defineTool({
  name: "get_kw_findings",
  title: "Get KW findings (rule engine)",
  description:
    "Wynik silnika reguł na treści KW: status ogólny, liczba nierozstrzygniętych ustaleń, aktywne wzmianki i lista ustaleń (result_json). Po numerze KW albo wniosku. Widoczność wg RLS.",
  inputSchema: {
    kw_number: z.string().min(5).optional(),
    loan_application_id: z.string().uuid().optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ kw_number, loan_application_id }, ctx: ToolContext) =>
    handle(async () => {
      if (!kw_number && !loan_application_id)
        return fail("Podaj kw_number albo loan_application_id.");
      const s = requireUser(ctx);
      let q = s
        .from("kw_land_register_analyses")
        .select(
          "id, kw_number, loan_application_id, ruleset_version, overall_status, active_mention_count, unresolved_finding_count, result_json, snapshot_fetched_at, created_at",
        );
      q = kw_number
        ? q.eq("kw_number", kw_number.trim().toUpperCase())
        : q.eq("loan_application_id", loan_application_id);
      const row = await oneOf(
        q.order("created_at", { ascending: false }).limit(1),
        "kw_land_register_analyses",
      );
      if (!row) return fail("Brak analizy reguł KW dla podanych parametrów.");
      return ok(row);
    }),
});

export const getRiskAssessment = defineTool({
  name: "get_risk_assessment",
  title: "Get investment risk assessment",
  description:
    "Najnowsza ocena ryzyka inwestycyjnego wniosku: klasa ryzyka, score inwestycyjny, zbywalność, rekomendacja, próg sprzedaży wymuszonej, ostrzeżenia, pełny wynik. Widoczność wg RLS.",
  inputSchema: { application_id: z.string().uuid() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ application_id }, ctx: ToolContext) =>
    handle(async () => {
      const s = requireUser(ctx);
      const row = await oneOf(
        s
          .from("investment_risk_assessments")
          .select("*")
          .eq("application_id", application_id)
          .order("created_at", { ascending: false })
          .limit(1),
        "investment_risk_assessments",
      );
      if (!row) return fail("Brak oceny ryzyka dla tego wniosku.");
      return ok(row);
    }),
});

export const getLocationScore = defineTool({
  name: "get_location_score",
  title: "Get location score",
  description:
    "Ocena potencjału lokalizacji nieruchomości (model po prefiksie KW): prawdopodobieństwa (centrum miasta, obszar funkcjonalny, dobra lokalizacja, obszar odległy), oczekiwana atrakcyjność, pewność, decyzja i wyjaśnienie. Widoczność wg RLS.",
  inputSchema: { loan_application_id: z.string().uuid() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ loan_application_id }, ctx: ToolContext) =>
    handle(async () => {
      const s = requireUser(ctx);
      const row = await oneOf(
        s
          .from("location_scoring_results")
          .select(
            "id, loan_application_id, masked_kw_number, property_type, probability_urban_core, probability_urban_or_suburban, probability_fua, probability_good_location, probability_remote_area, expected_location_attractiveness, analysis_priority_score, confidence_score, attractiveness_median, decision, explanation, court_name, model_version, status, calculated_at",
          )
          .eq("loan_application_id", loan_application_id)
          .order("calculated_at", { ascending: false })
          .limit(1),
        "location_scoring_results",
      );
      if (!row) return fail("Brak oceny lokalizacji dla tego wniosku.");
      return ok(row);
    }),
});

export const listAnalysisRuns = defineListTool({
  name: "list_analysis_runs",
  title: "List analysis pipeline runs",
  description:
    "Biegi pipeline'u analitycznego (KW → właściciele → analiza KW → ryzyko): status, kroki, powód uruchomienia, błąd, czasy. Tylko administrator/operator.",
  table: "analysis_pipeline_runs",
  columns:
    "id, loan_application_id, kw_number, status, steps, trigger_reason, error, started_at, finished_at",
  resultKey: "runs",
  access: "team",
  order: { column: "started_at", ascending: false },
  filters: {
    status: text("status", "Status biegu (np. running, done, failed)."),
    loan_application_id: uuid("loan_application_id", "Tylko dla tego wniosku."),
  },
});

export const listKwDocuments = defineListTool({
  name: "list_kw_documents",
  title: "List fetched KW documents",
  description:
    "Pobrane odpisy ksiąg wieczystych: numer, status pobrania, kiedy zamówiono i pobrano, błąd. Tylko administrator/operator.",
  table: "kw_documents",
  columns: "id, kw_number, status, ordered_at, fetched_at, last_error, created_at, updated_at",
  resultKey: "documents",
  access: "team",
  order: { column: "updated_at", ascending: false },
  filters: {
    status: text("status", "Status pobrania."),
    kw_number: text("kw_number", "Konkretny numer KW."),
  },
});

export const analysisTools = [
  getKwAnalysis,
  getKwFindings,
  getRiskAssessment,
  getLocationScore,
  listAnalysisRuns,
  listKwDocuments,
];
