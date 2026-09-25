// Księgi wieczyste: pobranie treści KW (CMD KW Engine → cache kw_documents)
// oraz uruchamianie pipeline'u analitycznego (właściciele → silnik reguł KW →
// ocena ryzyka, plus potencjał lokalizacji). Wszystko tylko dla zespołu —
// każde pobranie z CMD zużywa grupowy limit konta.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  actorId,
  fail,
  handle,
  ok,
  oneOf,
  requireTeam,
  requireTeamAdmin,
  section,
} from "../_helpers";
import { compactKwNumber, formatKwNumber } from "@/lib/kw";

const SECTION_KEYS = ["okladka", "dzial_1o", "dzial_1s", "dzial_2", "dzial_3", "dzial_4"] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

const SECTION_LABELS: Record<SectionKey, string> = {
  okladka: "Okładka",
  dzial_1o: "Dział I-O — oznaczenie nieruchomości",
  dzial_1s: "Dział I-Sp — spis praw związanych z własnością",
  dzial_2: "Dział II — własność i użytkowanie wieczyste",
  dzial_3: "Dział III — prawa, roszczenia i ograniczenia",
  dzial_4: "Dział IV — hipoteki",
};

/** Maks. czas czekania na CMD w jednym wywołaniu narzędzia (klienci MCP ucinają długie wywołania). */
const MAX_WAIT_S = 50;

const kwInput = {
  kw_number: z
    .string()
    .min(5)
    .optional()
    .describe("Numer KW w dowolnym zapisie, np. WA1M/00123456/7 albo WA1M001234567."),
  application_id: z
    .string()
    .uuid()
    .optional()
    .describe("Albo id wniosku — numer KW z jego nieruchomości."),
};

/** HTML działu EKW → czytelny tekst z zachowaniem wierszy tabel. */
export function kwHtmlToText(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(td|th)>/gi, " | ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(tr|p|div|li|h[1-6]|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((l) =>
      l
        .replace(/[ \t]+/g, " ")
        .replace(/(\s*\|\s*)+$/, "")
        .replace(/^(\s*\|\s*)+/, "")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
  return text || null;
}

/** Numer KW (forma kompaktowa, jak w kw_documents) z parametrów narzędzia. */
async function resolveKw(
  s: SupabaseClient,
  kw_number: string | undefined,
  application_id: string | undefined,
): Promise<string> {
  if (kw_number) {
    const c = compactKwNumber(kw_number);
    if (!c) throw new Error(`Nieprawidłowy numer KW: ${kw_number}`);
    return c;
  }
  if (!application_id) throw new Error("Podaj kw_number albo application_id.");
  const prop = await oneOf<{ land_register_number: string | null }>(
    s
      .from("properties")
      .select("land_register_number")
      .eq("loan_application_id", application_id)
      .order("created_at", { ascending: true })
      .limit(1),
    "properties",
  );
  const c = compactKwNumber(prop?.land_register_number);
  if (!c) throw new Error("Wniosek nie ma poprawnego numeru KW na nieruchomości.");
  return c;
}

type KwRow = {
  kw_number: string;
  status: string;
  fetched_at: string | null;
  ordered_at: string | null;
  last_error: string | null;
} & Partial<Record<SectionKey, string | null>>;

async function loadKwRow(s: SupabaseClient, compact: string): Promise<KwRow | null> {
  const { decodeMaybeBase64 } = await import("@/lib/kw-fetch.server");
  const row = await oneOf<KwRow>(
    s
      .from("kw_documents")
      .select(
        "kw_number, status, fetched_at, ordered_at, last_error, okladka, dzial_1o, dzial_1s, dzial_2, dzial_3, dzial_4",
      )
      .eq("kw_number", compact),
    "kw_documents",
  );
  if (!row) return null;
  for (const k of SECTION_KEYS) row[k] = decodeMaybeBase64(row[k]);
  return row;
}

function hasContent(row: KwRow | null): boolean {
  return Boolean(row && SECTION_KEYS.some((k) => row[k]));
}

const formatSchema = z
  .enum(["text", "html", "structured"])
  .default("text")
  .describe(
    "text — działy jako czytelny tekst (domyślnie); html — surowy HTML z EKW; structured — tylko wyciąg (właściciele, hipoteki, adres) bez treści działów.",
  );
const sectionsSchema = z
  .array(z.enum(SECTION_KEYS))
  .optional()
  .describe("Ogranicz treść do wybranych działów (domyślnie wszystkie).");

/** Treść KW do wyniku narzędzia: status, wyciąg strukturalny i działy w wybranym formacie. */
async function kwContentPayload(
  row: KwRow,
  format: "text" | "html" | "structured",
  sections: readonly SectionKey[] | undefined,
) {
  const { kwDocumentToExtraction } = await import("@/lib/kw-extraction");
  const content = hasContent(row);
  const extraction = content ? kwDocumentToExtraction({ kwNumber: row.kw_number, ...row }) : null;
  const out: Record<string, unknown> = {
    kw_number: formatKwNumber(row.kw_number) ?? row.kw_number,
    // Pobrana raz treść jest ważna mimo błędu późniejszego odświeżenia.
    status: content ? "ready" : row.status,
    fetched_at: row.fetched_at,
    last_error: row.last_error,
    extraction,
  };
  if (content && format !== "structured") {
    const wanted = sections?.length ? sections : SECTION_KEYS;
    out.sections = Object.fromEntries(
      wanted.map((k) => [
        k,
        {
          label: SECTION_LABELS[k],
          content: format === "html" ? (row[k] ?? null) : kwHtmlToText(row[k]),
        },
      ]),
    );
  }
  return out;
}

/** Pobiera KW z CMD (albo zwraca cache) i czeka maks. `waitS` sekund. */
async function ensureKwFetched(
  compact: string,
  opts: { force: boolean; waitS: number; orderedBy: string | null },
) {
  const { fetchAndStoreKw } = await import("@/lib/kw-fetch.server");
  return fetchAndStoreKw(compact, {
    force: opts.force,
    orderedBy: opts.orderedBy,
    pollMaxMs: Math.max(5, Math.min(MAX_WAIT_S, opts.waitS)) * 1000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────

export const fetchKwContent = defineTool({
  name: "fetch_kw_content",
  title: "Fetch land register (KW) content",
  description:
    "Pobiera treść księgi wieczystej z EKW (przez CMD KW Engine) i zapisuje ją w cache kw_documents; gdy księga jest już w cache, zwraca ją bez nowego zapytania (force=true wymusza odświeżenie). Zwraca okładkę i działy I-O, I-Sp, II, III, IV oraz wyciąg: właściciele z PESEL, hipoteki, adres, działki. Pobranie trwa zwykle 20–90 s — gdy nie zdąży w `wait_seconds`, zwraca status `processing`; wywołaj ponownie (bez force) albo `get_kw_content`. Każde pobranie zużywa grupowy limit CMD. Tylko administrator/operator.",
  inputSchema: {
    ...kwInput,
    force: z
      .boolean()
      .default(false)
      .describe("Wymuś ponowne pobranie z EKW mimo treści w cache (zużywa limit CMD)."),
    wait_seconds: z
      .number()
      .int()
      .min(5)
      .max(MAX_WAIT_S)
      .default(45)
      .describe("Ile sekund czekać na wynik z CMD w tym wywołaniu."),
    format: formatSchema,
    sections: sectionsSchema,
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  handler: (
    { kw_number, application_id, force, wait_seconds, format, sections },
    ctx: ToolContext,
  ) =>
    handle(async () => {
      const s = await requireTeam(ctx);
      const compact = await resolveKw(s, kw_number, application_id);
      const outcome = await ensureKwFetched(compact, {
        force,
        waitS: wait_seconds,
        orderedBy: actorId(ctx),
      });
      const row = await loadKwRow(s, compact);
      if (row && hasContent(row)) {
        return ok({
          ...(await kwContentPayload(row, format, sections)),
          from_cache: outcome.cached,
          refresh_error: outcome.ok ? null : (outcome.error ?? null),
        });
      }
      if (outcome.status === "processing") {
        return ok({
          kw_number: formatKwNumber(compact),
          status: "processing",
          message:
            "CMD KW Engine jeszcze pobiera księgę. Wywołaj fetch_kw_content ponownie za ok. 30–60 s (bez force) albo sprawdź get_kw_content.",
        });
      }
      return fail(`KW ${formatKwNumber(compact)}: ${outcome.error ?? `status ${outcome.status}`}`);
    }),
});

export const getKwContent = defineTool({
  name: "get_kw_content",
  title: "Get cached KW content",
  description:
    "Treść księgi wieczystej z cache (kw_documents) bez odpytywania EKW i bez zużycia limitu CMD: status pobrania, działy I-O, I-Sp, II, III, IV i wyciąg (właściciele, hipoteki, adres). Gdy księgi nie ma w cache — użyj `fetch_kw_content`. Tylko administrator/operator.",
  inputSchema: { ...kwInput, format: formatSchema, sections: sectionsSchema },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ kw_number, application_id, format, sections }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeam(ctx);
      const compact = await resolveKw(s, kw_number, application_id);
      const row = await loadKwRow(s, compact);
      if (!row) {
        return fail(
          `KW ${formatKwNumber(compact)} nie ma w cache — pobierz ją narzędziem fetch_kw_content.`,
        );
      }
      return ok(await kwContentPayload(row, format, sections));
    }),
});

// ── Analiza ──────────────────────────────────────────────────────────────────

type Finding = {
  id: string;
  ruleId: string;
  category: string;
  status: string;
  title: string;
  plainLanguageSummary: string;
  whyItMatters: string;
  expectedFromClient: string;
  requestedDocuments: { code: string; label: string }[];
  proposedResolution: string;
  agreementCondition?: string | null;
  payoutCondition?: string | null;
  resolutionState: string;
};

/** Skrót wyniku silnika reguł — pomija ustalenia BRAK_PROBLEMU, chyba że full. */
function summarizeRuleEngine(result: any, full: boolean) {
  if (!result) return null;
  if (full) return result;
  const findings = ((result.findings ?? []) as Finding[])
    .filter((f) => f.status !== "BRAK_PROBLEMU")
    .map((f) => ({
      id: f.id,
      rule: f.ruleId,
      category: f.category,
      status: f.status,
      title: f.title,
      summary: f.plainLanguageSummary,
      why_it_matters: f.whyItMatters,
      expected_from_client: f.expectedFromClient,
      requested_documents: (f.requestedDocuments ?? []).map((d) => d.label),
      proposed_resolution: f.proposedResolution,
      agreement_condition: f.agreementCondition ?? null,
      payout_condition: f.payoutCondition ?? null,
      resolution_state: f.resolutionState,
    }));
  return {
    overall_status: result.overallStatus,
    ruleset_version: result.rulesetVersion,
    unresolved_finding_count: result.unresolvedFindingCount,
    active_mention_count: result.activeMentionCount,
    no_problem_checks: ((result.findings ?? []) as Finding[]).filter(
      (f) => f.status === "BRAK_PROBLEMU",
    ).length,
    findings,
    mortgage_priority: result.priority
      ? {
          determinable: result.priority.determinable,
          expected_investor_rank: result.priority.expectedInvestorRank ?? null,
          explanation: result.priority.explanation,
          required_conditions: result.priority.requiredConditions,
        }
      : null,
    ltv: result.ltv ?? null,
    disclaimer: result.disclaimer,
  };
}

function summarizeRisk(r: any, full: boolean) {
  if (!r) return null;
  if (full) return r;
  return {
    generated_at: r.generatedAt,
    investment_score: r.investmentScore,
    risk_grade: r.riskGrade,
    recommendation: r.recommendation,
    executive_summary: r.executiveSummary,
    key_risks: r.keyRisks,
    key_strengths: r.keyStrengths,
    warnings: r.warnings,
    component_scores: r.componentScores,
    master_valuation: r.masterValuation,
    forced_sale: r.forcedSale,
    kw_legal: r.kwLegal
      ? {
          legal_risk_score: r.kwLegal.legalRiskScore,
          summary: r.kwLegal.summary,
          warnings: r.kwLegal.warnings,
        }
      : null,
  };
}

function summarizeCoOwners(c: any, full: boolean) {
  if (!c) return null;
  if (full) return c;
  return {
    available: c.available,
    total_owners_in_kw: c.totalOwnersInKw,
    summary: c.summary,
    warnings: c.warnings,
    owners: (c.checked ?? []).map((o: any) => ({
      name: o.fullName,
      share: o.share ?? null,
      co_ownership_type: o.coOwnershipType ?? null,
      pesel_masked: o.peselMasked,
      age: o.age,
      is_primary_client: o.isPrimaryClient,
      ceidg: o.ceidg,
      krs: o.krs,
      notes: o.notes,
    })),
  };
}

function summarizeLocation(r: any) {
  if (!r) return null;
  return {
    decision: r.decision,
    expected_location_attractiveness: r.expectedLocationAttractiveness,
    analysis_priority_score: r.analysisPriorityScore,
    confidence_score: r.confidenceScore,
    probability_urban_core: r.probabilityUrbanCore,
    probability_urban_or_suburban: r.probabilityUrbanOrSuburban,
    probability_good_location: r.probabilityGoodLocation,
    probability_remote_area: r.probabilityRemoteArea,
    explanation: r.explanation,
  };
}

const TRANSACTION_TYPES = [
  "CASH_LOAN",
  "REFINANCING",
  "PURCHASE_FINANCING",
  "BRIDGE",
  "OTHER",
] as const;

export const analyzeKw = defineTool({
  name: "analyze_kw",
  title: "Analyze land register (KW) — full pipeline",
  description:
    "Pełna analiza księgi wieczystej w jednym wywołaniu, dla numeru KW albo wniosku: (1) pobranie treści z EKW, jeśli nie ma jej w cache; (2) wyciąg i ocena stanu prawnego z parsera działów (właściciele, służebności, egzekucje, hipoteki, legal risk score); (3) silnik reguł KW — status ogólny (STOP / WSTRZYMANE / WARUNKOWO_DOPUSZCZALNE / …), ustalenia z wymaganymi dokumentami, miejsce hipoteki inwestora, LTV/CLTV (wynik zapisany jak z panelu); (4) sprawdzenie właścicieli z działu II w CEIDG i KRS; (5) potencjał lokalizacji po prefiksie KW; (6) przy `application_id` — ocena ryzyka inwestycyjnego wniosku. Kwoty transakcji domyślnie z wniosku. Błąd jednego kroku nie przerywa pozostałych (lista `errors`). Tylko administrator/operator.",
  inputSchema: {
    ...kwInput,
    fetch_if_missing: z
      .boolean()
      .default(true)
      .describe("Pobierz treść z EKW, gdy nie ma jej w cache (zużywa limit CMD)."),
    force_refresh: z.boolean().default(false).describe("Pobierz świeży odpis z EKW mimo cache."),
    loan_amount: z
      .number()
      .positive()
      .optional()
      .describe("Kwota pożyczki (PLN) do analizy hipoteki i LTV; domyślnie kwota z wniosku."),
    property_value: z
      .number()
      .positive()
      .optional()
      .describe("Przyjęta wartość nieruchomości (PLN); domyślnie wartość szacunkowa z wniosku."),
    transaction_type: z.enum(TRANSACTION_TYPES).default("CASH_LOAN"),
    check_owners: z
      .boolean()
      .default(true)
      .describe("Sprawdź właścicieli z działu II w CEIDG i KRS."),
    score_location: z.boolean().default(true).describe("Policz potencjał lokalizacji."),
    risk_assessment: z
      .boolean()
      .default(true)
      .describe("Przy application_id: policz ocenę ryzyka inwestycyjnego."),
    force_risk: z
      .boolean()
      .default(false)
      .describe("Przelicz ocenę ryzyka mimo zapisanej (domyślnie zwraca zapisaną)."),
    full: z.boolean().default(false).describe("Pełne wyniki modułów zamiast skrótów (duże)."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: (args, ctx: ToolContext) =>
    handle(async () => {
      const admin = await requireTeamAdmin(ctx);
      const userId = actorId(ctx);
      const compact = await resolveKw(admin, args.kw_number, args.application_id);
      const kwLabel = formatKwNumber(compact) ?? compact;
      const errors: string[] = [];
      const appId = args.application_id ?? null;

      // Dane wniosku: kwota, wartość, klient, lokalizacja.
      type LoanRow = {
        loan_amount: number | null;
        client_id: string | null;
        nip: string | null;
      };
      type PropRow = {
        estimated_value: number | null;
        city: string | null;
        voivodeship: string | null;
        property_type: string | null;
      };
      let loan: LoanRow | null = null;
      let prop: PropRow | null = null;
      if (appId) {
        [loan, prop] = await Promise.all([
          oneOf<LoanRow>(
            admin.from("loan_applications").select("loan_amount, client_id, nip").eq("id", appId),
            "loan_applications",
          ),
          oneOf<PropRow>(
            admin
              .from("properties")
              .select("estimated_value, city, voivodeship, property_type")
              .eq("loan_application_id", appId)
              .order("created_at", { ascending: true })
              .limit(1),
            "properties",
          ),
        ]);
        if (!loan) return fail("Wniosek nie znaleziony.");
      }

      // (1) Treść KW.
      let row = await loadKwRow(admin, compact);
      let fetchInfo: Record<string, unknown> = { from_cache: hasContent(row) };
      if (args.force_refresh || (!hasContent(row) && args.fetch_if_missing)) {
        const outcome = await ensureKwFetched(compact, {
          force: args.force_refresh,
          waitS: MAX_WAIT_S,
          orderedBy: userId,
        });
        fetchInfo = { from_cache: outcome.cached, status: outcome.status, error: outcome.error };
        row = await loadKwRow(admin, compact);
      }
      if (!hasContent(row)) {
        const status = (fetchInfo.status as string) ?? row?.status ?? "not_fetched";
        return ok({
          kw_number: kwLabel,
          status,
          fetch: fetchInfo,
          message:
            status === "processing"
              ? "CMD KW Engine jeszcze pobiera księgę — wywołaj analyze_kw ponownie za ok. minutę."
              : `Brak treści KW — analiza niemożliwa.${row?.last_error ? ` Ostatni błąd: ${row.last_error}` : ""}`,
        });
      }

      // (2) Wyciąg + parser prawny.
      const { kwDocumentToExtraction } = await import("@/lib/kw-extraction");
      const extraction = kwDocumentToExtraction({ kwNumber: row!.kw_number, ...row! });
      const legal = await section(errors, "parser prawny", async () => {
        const { analyzeKwLegal } = await import("@/lib/risk-assessment/kw-parser.server");
        return analyzeKwLegal({ kwNumber: compact });
      });

      const amount = args.loan_amount ?? Number(loan?.loan_amount ?? 0);
      const value =
        args.property_value ??
        (prop?.estimated_value != null ? Number(prop.estimated_value) : null);

      // (3)–(5) niezależne kroki równolegle.
      const [ruleEngine, coOwners, location] = await Promise.all([
        section(errors, "silnik reguł KW", async () => {
          const { runKwLandRegisterAnalysisCore } = await import("@/lib/kw-analysis.functions");
          const r = await runKwLandRegisterAnalysisCore(
            admin,
            {
              kwNumber: compact,
              loanApplicationId: appId,
              caseId: appId ?? compact,
              transactionType: args.transaction_type,
              requestedCashAmount: amount,
              newLoanExposure: amount,
              requestedMortgageSum: amount,
              acceptedPropertyValue: value,
              borrower: null,
              declaredCollateralProviders: [],
              seniorCreditorCertificate: null,
            },
            userId,
          );
          if (!r.ok) throw new Error(r.message);
          return { analysis_id: r.analysisId, result: r.result };
        }),
        args.check_owners
          ? section(errors, "właściciele (CEIDG/KRS)", async () => {
              let primaryClientName: string | null = null;
              let primaryClientNip: string | null = loan?.nip ?? null;
              if (loan?.client_id) {
                const c = await oneOf<{
                  first_name: string | null;
                  last_name: string | null;
                  nip: string | null;
                }>(
                  admin
                    .from("clients")
                    .select("first_name, last_name, nip")
                    .eq("id", loan.client_id),
                  "clients",
                );
                primaryClientName =
                  [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim() || null;
                primaryClientNip = c?.nip || primaryClientNip;
              }
              const { analyzeCoOwners } = await import("@/lib/coowners/analyze.server");
              const co = await analyzeCoOwners({
                kwNumber: compact,
                primaryClientName,
                primaryClientNip,
                city: prop?.city ?? null,
                voivodeship: prop?.voivodeship ?? null,
              });
              if (appId) {
                const { error } = await admin.from("coowner_registry_checks").upsert(
                  {
                    application_id: appId,
                    kw_number: co.kwNumber,
                    result_json: co as any,
                    warnings: co.warnings,
                    created_by: userId,
                  },
                  { onConflict: "application_id" },
                );
                if (error) errors.push(`zapis sprawdzenia właścicieli: ${error.message}`);
              }
              return co;
            })
          : Promise.resolve(null),
        args.score_location
          ? section(errors, "potencjał lokalizacji", async () => {
              const { scoreApplicationCore } = await import("@/lib/location-scoring.functions");
              const r = await scoreApplicationCore(
                admin,
                {
                  applicationId: appId,
                  kwNumber: formatKwNumber(compact) ?? compact,
                  propertyType: prop?.property_type ?? null,
                },
                userId,
              );
              if (!r.ok) throw new Error(r.message ?? "scoring lokalizacji nie powiódł się");
              return r.result ?? null;
            })
          : Promise.resolve(null),
      ]);

      // (6) Ocena ryzyka — na końcu, korzysta z zapisanych wyników KW.
      const risk =
        appId && args.risk_assessment
          ? await section(errors, "ocena ryzyka", async () => {
              const { runInvestmentRiskAssessmentCore } =
                await import("@/lib/risk-assessment/risk-assessment.functions");
              return runInvestmentRiskAssessmentCore(admin as any, appId, {
                force: args.force_risk,
              });
            })
          : null;

      return ok({
        kw_number: kwLabel,
        application_id: appId,
        fetched_at: row!.fetched_at,
        fetch: fetchInfo,
        transaction: {
          type: args.transaction_type,
          loan_amount: amount || null,
          property_value: value,
        },
        extraction,
        legal: legal
          ? args.full
            ? legal
            : {
                legal_risk_score: legal.legalRiskScore,
                summary: legal.summary,
                warnings: legal.warnings,
                address: legal.address,
                property_params: legal.propertyParams,
                owners: legal.owners,
                encumbrances: legal.encumbrances,
                mortgages: legal.mortgages,
                total_mortgage_amount_pln: legal.totalMortgageAmountPln,
                has_enforcement: legal.hasEnforcement,
                has_usufruct: legal.hasUsufruct,
              }
          : null,
        rule_engine: ruleEngine
          ? {
              analysis_id: ruleEngine.analysis_id,
              ...summarizeRuleEngine(ruleEngine.result, args.full),
            }
          : null,
        co_owners: summarizeCoOwners(coOwners, args.full),
        location: args.full ? location : summarizeLocation(location),
        risk: summarizeRisk(risk, args.full),
        errors,
      });
    }),
});

// ── Pipeline analityczny wniosku (analysis_pipeline_runs) ────────────────────

const RUN_COLUMNS =
  "id, loan_application_id, kw_number, status, steps, trigger_reason, error, started_at, finished_at";

/** Raport z wyników modułów zapisanych przez pipeline dla wniosku. */
async function pipelineReport(admin: SupabaseClient, run: any, full: boolean) {
  const errors: string[] = [];
  const appId = run.loan_application_id as string;
  const [kwDoc, rules, co, risk, location] = await Promise.all([
    section(errors, "kw_documents", () =>
      oneOf(
        admin
          .from("kw_documents")
          .select("status, fetched_at, last_error")
          .eq("kw_number", compactKwNumber(run.kw_number) ?? run.kw_number),
        "kw_documents",
      ),
    ),
    section(errors, "kw_land_register_analyses", () =>
      oneOf(
        admin
          .from("kw_land_register_analyses")
          .select("id, result_json, created_at")
          .eq("loan_application_id", appId)
          .order("created_at", { ascending: false })
          .limit(1),
        "kw_land_register_analyses",
      ),
    ),
    section(errors, "coowner_registry_checks", () =>
      oneOf(
        admin
          .from("coowner_registry_checks")
          .select("result_json, created_at")
          .eq("application_id", appId)
          .limit(1),
        "coowner_registry_checks",
      ),
    ),
    section(errors, "investment_risk_assessments", () =>
      oneOf(
        admin
          .from("investment_risk_assessments")
          .select("result_json, created_at")
          .eq("application_id", appId)
          .order("created_at", { ascending: false })
          .limit(1),
        "investment_risk_assessments",
      ),
    ),
    section(errors, "location_scoring_results", () =>
      oneOf(
        admin
          .from("location_scoring_results")
          .select(
            "decision, expected_location_attractiveness, confidence_score, probability_urban_core, probability_good_location, probability_remote_area, explanation, calculated_at",
          )
          .eq("loan_application_id", appId)
          .order("calculated_at", { ascending: false })
          .limit(1),
        "location_scoring_results",
      ),
    ),
  ]);
  return {
    run: { ...run, kw_number: formatKwNumber(run.kw_number) ?? run.kw_number },
    kw_document: kwDoc,
    rule_engine: rules
      ? {
          analysis_id: (rules as any).id,
          created_at: (rules as any).created_at,
          ...summarizeRuleEngine((rules as any).result_json, full),
        }
      : null,
    co_owners: co ? summarizeCoOwners((co as any).result_json, full) : null,
    risk: risk ? summarizeRisk((risk as any).result_json, full) : null,
    location,
    errors,
  };
}

export const runAnalysisPipeline = defineTool({
  name: "run_analysis_pipeline",
  title: "Run analysis pipeline for application",
  description:
    "Uruchamia pipeline analityczny wniosku, ten sam co automat i przycisk w panelu: pobranie KW → właściciele (CEIDG/KRS) → analiza KW (silnik reguł) → ocena ryzyka. Zamyka trwający przebieg i otwiera nowy. Przy `wait=true` od razu przesuwa kroki (do ok. `wait_seconds`); czego nie zdąży, dokończy cron tick — stan sprawdzisz przez `get_analysis_pipeline_run`. Zwraca stan kroków i raport z wyników. Tylko administrator/operator.",
  inputSchema: {
    application_id: z.string().uuid(),
    wait: z.boolean().default(true).describe("Wykonaj kroki od razu zamiast czekać na cron."),
    wait_seconds: z
      .number()
      .int()
      .min(10)
      .max(120)
      .default(90)
      .describe("Budżet czasu na kroki w tym wywołaniu."),
    full: z.boolean().default(false).describe("Pełne wyniki modułów zamiast skrótów."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: ({ application_id, wait, wait_seconds, full }, ctx: ToolContext) =>
    handle(async () => {
      const admin = await requireTeamAdmin(ctx);
      const who = ctx.getUserEmail() ?? actorId(ctx);
      const { startAnalysisPipelineRunCore, advanceAnalysisPipelineRunById } =
        await import("@/lib/analysis-pipeline/engine.server");
      const started = await startAnalysisPipelineRunCore(application_id, `ręcznie z MCP (${who})`);

      let outcome: string = "waiting";
      if (wait) {
        const deadline = Date.now() + wait_seconds * 1000;
        // Krok z pobraniem KW czeka do ~45 s na CMD — kolejny tylko, gdy
        // zmieści się w budżecie.
        do {
          outcome = await advanceAnalysisPipelineRunById(started.id);
        } while (outcome === "waiting" && Date.now() + 45_000 <= deadline);
      }
      const run = await oneOf(
        admin.from("analysis_pipeline_runs").select(RUN_COLUMNS).eq("id", started.id),
        "analysis_pipeline_runs",
      );
      return ok({
        finished: outcome === "finished" || (run as any)?.status !== "running",
        note:
          (run as any)?.status === "running"
            ? "Przebieg trwa (zwykle czeka na pobranie KW z CMD) — dokończy go cron; sprawdź get_analysis_pipeline_run."
            : null,
        ...(await pipelineReport(admin, run, full)),
      });
    }),
});

export const getAnalysisPipelineRun = defineTool({
  name: "get_analysis_pipeline_run",
  title: "Get analysis pipeline run and results",
  description:
    "Stan przebiegu pipeline'u analitycznego (po `run_id` albo najnowszy dla wniosku) razem z raportem z wyników: status pobrania KW, silnik reguł KW (status ogólny, ustalenia, miejsce hipoteki, LTV), właściciele (CEIDG/KRS), ocena ryzyka, potencjał lokalizacji. Tylko administrator/operator.",
  inputSchema: {
    run_id: z.string().uuid().optional(),
    application_id: z.string().uuid().optional(),
    full: z.boolean().default(false).describe("Pełne wyniki modułów zamiast skrótów."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ run_id, application_id, full }, ctx: ToolContext) =>
    handle(async () => {
      if (!run_id && !application_id) return fail("Podaj run_id albo application_id.");
      const admin = await requireTeamAdmin(ctx);
      let q = admin.from("analysis_pipeline_runs").select(RUN_COLUMNS);
      q = run_id ? q.eq("id", run_id) : q.eq("loan_application_id", application_id!);
      const run = await oneOf(
        q.order("started_at", { ascending: false }).limit(1),
        "analysis_pipeline_runs",
      );
      if (!run) return fail("Brak przebiegu pipeline'u dla podanych parametrów.");
      return ok(await pipelineReport(admin, run, full));
    }),
});

export const kwTools = [
  fetchKwContent,
  getKwContent,
  analyzeKw,
  runAnalysisPipeline,
  getAnalysisPipelineRun,
];
