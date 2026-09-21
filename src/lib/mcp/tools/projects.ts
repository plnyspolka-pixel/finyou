// Moduł projektów inwestycyjnych: pula projektów, przydziały, propozycje,
// pytania inwestorów.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { fail, handle, ok, oneOf, requireUser, rowsOf, section } from "../_helpers";
import { defineListTool, gte, lte, search, since, text, uuid } from "../_list-tool";

export const listInvestmentProjects = defineListTool({
  name: "list_investment_projects",
  title: "List investment projects",
  description:
    "Pula projektów inwestycyjnych (anonimizowane wnioski dla inwestorów): kwota, typ i lokalizacja nieruchomości, okres, oprocentowanie, wartość i LTV, zabezpieczenie, kompletność dokumentów, liczba odrzuceń. Widoczność wg RLS (inwestor widzi przydzielone).",
  table: "investment_projects",
  columns:
    "id, status, version, loan_application_id, amount, property_type, city, voivodeship, financing_purpose, period_months, interest_rate_percent, property_value, ltv_percent, security_type, mortgage_position, docs_complete, rejection_count, last_assigned_at, paused_reason, created_at, updated_at",
  resultKey: "projects",
  filters: {
    status: text("status", "Status projektu."),
    property_type: text("property_type", "Typ nieruchomości."),
    city: search(["city", "voivodeship"], "Fraza: miasto lub województwo."),
    min_amount: gte("amount", z.number().optional().describe("Minimalna kwota (PLN).")),
    max_amount: lte("amount", z.number().optional().describe("Maksymalna kwota (PLN).")),
    since: since("created_at"),
  },
});

export const getInvestmentProject = defineTool({
  name: "get_investment_project",
  title: "Get investment project",
  description:
    "Projekt inwestycyjny w całości: karta projektu, przydziały do inwestorów (status, termin, decyzja), propozycje (parametry, status, kontroferta), pytania inwestorów z odpowiedziami, wersje. Widoczność wg RLS.",
  inputSchema: { id: z.string().uuid() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ id }, ctx: ToolContext) =>
    handle(async () => {
      const s = requireUser(ctx);
      const project = await oneOf(
        s.from("investment_projects").select("*").eq("id", id),
        "investment_projects",
      );
      if (!project) return fail("Nie znaleziono projektu (albo brak uprawnień).");
      const errors: string[] = [];
      const [assignments, proposals, requests, versions] = await Promise.all([
        section(errors, "project_assignments", () =>
          rowsOf(
            s
              .from("project_assignments")
              .select(
                "id, investor_id, project_version, status, match_score, assignment_reason, assigned_at, expires_at, opened_at, decision_at, decision_type, proposal_deadline_at, closed_at, closed_reason",
              )
              .eq("project_id", id)
              .order("assigned_at", { ascending: false })
              .limit(100),
            "project_assignments",
          ),
        ),
        section(errors, "project_proposals", () =>
          rowsOf(
            s
              .from("project_proposals")
              .select(
                "id, investor_id, assignment_id, version, parent_proposal_id, status, params, computed, valid_until, submitted_at, decided_at, decision_reason, counteroffer, admin_note, created_at",
              )
              .eq("project_id", id)
              .order("created_at", { ascending: false })
              .limit(100),
            "project_proposals",
          ),
        ),
        section(errors, "project_info_requests", () =>
          rowsOf(
            s
              .from("project_info_requests")
              .select(
                "id, investor_id, assignment_id, question, status, answer, answered_at, created_at",
              )
              .eq("project_id", id)
              .order("created_at", { ascending: false })
              .limit(100),
            "project_info_requests",
          ),
        ),
        section(errors, "investment_project_versions", () =>
          rowsOf(
            s
              .from("investment_project_versions")
              .select("id, version, reason, created_by, created_at")
              .eq("project_id", id)
              .order("version", { ascending: false })
              .limit(50),
            "investment_project_versions",
          ),
        ),
      ]);
      return ok({
        project,
        assignments: assignments ?? [],
        proposals: proposals ?? [],
        info_requests: requests ?? [],
        versions: versions ?? [],
        errors,
      });
    }),
});

export const listProjectProposals = defineListTool({
  name: "list_project_proposals",
  title: "List project proposals",
  description:
    "Propozycje inwestorów do projektów: status, parametry, ważność, decyzja, kontroferta, notatka administratora. Widoczność wg RLS.",
  table: "project_proposals",
  columns:
    "id, project_id, investor_id, assignment_id, version, status, params, valid_until, submitted_at, decided_at, decision_reason, admin_note, created_at",
  resultKey: "proposals",
  filters: {
    status: text("status", "Status propozycji."),
    project_id: uuid("project_id", "Tylko dla tego projektu."),
    investor_id: uuid("investor_id", "Tylko od tego inwestora."),
    since: since("created_at"),
  },
});

export const listProjectInfoRequests = defineListTool({
  name: "list_project_info_requests",
  title: "List project info requests",
  description:
    "Pytania inwestorów do projektów (otwarte i odpowiedziane): treść, status, odpowiedź, kto i kiedy odpowiedział. Widoczność wg RLS.",
  table: "project_info_requests",
  columns:
    "id, project_id, investor_id, assignment_id, question, status, answer, answered_by, answered_at, created_at",
  resultKey: "requests",
  filters: {
    status: text("status", "Status (np. open, answered)."),
    project_id: uuid("project_id", "Tylko dla tego projektu."),
    since: since("created_at"),
  },
});

export const projectsTools = [
  listInvestmentProjects,
  getInvestmentProject,
  listProjectProposals,
  listProjectInfoRequests,
];
