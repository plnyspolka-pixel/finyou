// Automatyczny pipeline analityczny: pobierz KW → właściciele → analiza KW →
// analiza ryzyka. Odpala się RAZ dla wniosku KOMPLETNEGO (pusty brief braków)
// z poprawnym numerem KW i potencjałem lokalizacyjnym > progu (decyzja
// właściciela: 50; dopiero po skompletowaniu wniosku — koszty pobrań KW).
// Ponowny przebieg tylko przy zmianie numeru KW albo ręcznie z panelu.
// Błąd jednego kroku nie blokuje pozostałych — raport dostaje status kroku.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeLoanStatus } from "@/lib/loan-status";

/** Minimalny potencjał lokalizacyjny uruchamiający pipeline (0–100). */
export const PIPELINE_MIN_LOCATION_SCORE = 50;
/** Maksymalna liczba ticków czekania na pobranie KW zanim uznamy błąd. */
const MAX_KW_WAIT_TICKS = 20;

export type StepKey = "kw" | "coowners" | "kw_analysis" | "risk";
export type StepStatus = "pending" | "running" | "done" | "error";

export interface StepState {
  status: StepStatus;
  finished_at?: string;
  error?: string;
  /** Licznik ticków oczekiwania (krok KW czeka na CMD KW Engine). */
  waits?: number;
}

export type RunSteps = Record<StepKey, StepState>;

const STEP_ORDER: StepKey[] = ["kw", "coowners", "kw_analysis", "risk"];

function freshSteps(): RunSteps {
  return {
    kw: { status: "pending" },
    coowners: { status: "pending" },
    kw_analysis: { status: "pending" },
    risk: { status: "pending" },
  };
}

/** Statusy wniosku, w których pipeline ma sens. */
const CANDIDATE_STATUSES = new Set([
  "brak_kwoty",
  "brak_kw",
  "brak_zdjec_dokumentow",
  "kontakt",
  "kompletowanie_danych",
  "szukamy_inwestora",
]);

export interface PipelineSyncResult {
  scanned: number;
  started: number;
  skipped_existing: number;
}

/** Kwalifikacja wniosków i zakładanie przebiegów. */
export async function syncAnalysisPipelineRuns(): Promise<PipelineSyncResult> {
  const result: PipelineSyncResult = { scanned: 0, started: 0, skipped_existing: 0 };

  const { data: loans, error } = await supabaseAdmin
    .from("loan_applications")
    .select("id, status, loan_amount, location_potential_score, deleted_at")
    .is("deleted_at", null)
    .not("loan_amount", "is", null)
    .gt("location_potential_score", PIPELINE_MIN_LOCATION_SCORE)
    .limit(300);
  if (error) throw new Error(error.message);

  const candidates = (loans ?? []).filter((l: any) =>
    CANDIDATE_STATUSES.has(normalizeLoanStatus(l.status)),
  );
  result.scanned = candidates.length;
  if (candidates.length === 0) return result;

  // Kompletność: pusty brief braków (ten sam silnik co follow-upy/auto-dystrybucja).
  const { buildBriefBundles } = await import("@/lib/missing-info-follow-up/engine.server");
  const bundles = await buildBriefBundles(candidates.map((l: any) => l.id));

  const { normalizeKwNumber } = await import("@/lib/kw-fetch.server");

  for (const loan of candidates as any[]) {
    const brief = bundles.get(loan.id)?.brief;
    if (!brief || brief.items.length > 0) continue;

    const { data: prop } = await supabaseAdmin
      .from("properties")
      .select("land_register_number")
      .eq("loan_application_id", loan.id)
      .maybeSingle();
    const kwNumber = normalizeKwNumber(String(prop?.land_register_number ?? ""));
    if (!kwNumber) continue;

    // Raz na wniosek+KW: istniejący przebieg (running/done) dla tego samego
    // numeru KW blokuje kolejny; zmiana numeru KW otwiera nowy przebieg.
    const { data: existing } = await (supabaseAdmin as any)
      .from("analysis_pipeline_runs")
      .select("id, kw_number, status")
      .eq("loan_application_id", loan.id)
      .in("status", ["running", "done"])
      .eq("kw_number", kwNumber)
      .limit(1)
      .maybeSingle();
    if (existing) {
      result.skipped_existing += 1;
      continue;
    }

    const { error: insErr } = await (supabaseAdmin as any).from("analysis_pipeline_runs").insert({
      loan_application_id: loan.id,
      kw_number: kwNumber,
      status: "running",
      steps: freshSteps(),
      trigger_reason: `auto: kompletny wniosek, score ${Math.round(Number(loan.location_potential_score))} > ${PIPELINE_MIN_LOCATION_SCORE}`,
    });
    if (!insErr) result.started += 1;
  }
  return result;
}

export interface PipelineProcessResult {
  processed: number;
  finished: number;
  waiting: number;
  errors: number;
}

/** Przesuwa do przodu wszystkie trwające przebiegi (sekwencyjnie per przebieg). */
export async function processAnalysisPipelineRuns(): Promise<PipelineProcessResult> {
  const result: PipelineProcessResult = { processed: 0, finished: 0, waiting: 0, errors: 0 };

  const { data: runs, error } = await (supabaseAdmin as any)
    .from("analysis_pipeline_runs")
    .select("id, loan_application_id, kw_number, steps, started_at")
    .eq("status", "running")
    .order("started_at", { ascending: true })
    .limit(10);
  if (error) throw new Error(error.message);

  for (const run of (runs ?? []) as any[]) {
    result.processed += 1;
    try {
      const outcome = await advanceRun(run);
      if (outcome === "finished") result.finished += 1;
      else result.waiting += 1;
    } catch (e: any) {
      console.error("[analysis-pipeline] run error", run.id, e?.message);
      result.errors += 1;
      await (supabaseAdmin as any)
        .from("analysis_pipeline_runs")
        .update({ status: "error", error: e?.message ?? "błąd", finished_at: new Date().toISOString() })
        .eq("id", run.id);
    }
  }
  return result;
}

async function saveSteps(runId: string, steps: RunSteps): Promise<void> {
  await (supabaseAdmin as any).from("analysis_pipeline_runs").update({ steps }).eq("id", runId);
}

function markStep(steps: RunSteps, key: StepKey, status: StepStatus, error?: string): void {
  steps[key] = {
    ...steps[key],
    status,
    error: error ?? undefined,
    finished_at: status === "done" || status === "error" ? new Date().toISOString() : undefined,
  };
}

/**
 * Jeden krok naprzód dla przebiegu. Zwraca "finished", gdy wszystkie kroki
 * są rozstrzygnięte (done/error), inaczej "waiting" (kolejny tick dokończy).
 */
async function advanceRun(run: {
  id: string;
  loan_application_id: string;
  kw_number: string;
  steps: RunSteps;
}): Promise<"finished" | "waiting"> {
  const steps: RunSteps = { ...freshSteps(), ...(run.steps ?? {}) };

  // ── Krok 1: pobranie treści KW ─────────────────────────────────────────────
  if (steps.kw.status === "pending" || steps.kw.status === "running") {
    const { fetchAndStoreKw } = await import("@/lib/kw-fetch.server");
    const outcome = await fetchAndStoreKw(run.kw_number, { pollMaxMs: 45_000 });
    if (outcome.ok) {
      markStep(steps, "kw", "done");
    } else if (outcome.status === "processing") {
      const waits = (steps.kw.waits ?? 0) + 1;
      if (waits >= MAX_KW_WAIT_TICKS) {
        markStep(steps, "kw", "error", "Pobieranie KW nie zakończyło się w rozsądnym czasie.");
      } else {
        steps.kw = { status: "running", waits };
        await saveSteps(run.id, steps);
        return "waiting";
      }
    } else {
      markStep(steps, "kw", "error", outcome.error ?? `status: ${outcome.status}`);
    }
    await saveSteps(run.id, steps);
  }

  const kwAvailable = steps.kw.status === "done";

  // ── Krok 2: właściciele (dział II + rejestry) ──────────────────────────────
  if (steps.coowners.status === "pending") {
    if (!kwAvailable) {
      markStep(steps, "coowners", "error", "Brak treści KW — nie sprawdzono właścicieli.");
    } else {
      try {
        const [{ data: app }, { data: prop }] = await Promise.all([
          supabaseAdmin
            .from("loan_applications")
            .select("id, client_id")
            .eq("id", run.loan_application_id)
            .maybeSingle(),
          supabaseAdmin
            .from("properties")
            .select("city, voivodeship")
            .eq("loan_application_id", run.loan_application_id)
            .maybeSingle(),
        ]);
        let primaryClientName: string | null = null;
        if (app?.client_id) {
          const { data: c } = await supabaseAdmin
            .from("clients")
            .select("first_name, last_name")
            .eq("id", app.client_id)
            .maybeSingle();
          primaryClientName =
            [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim() || null;
        }
        const { analyzeCoOwners } = await import("@/lib/coowners/analyze.server");
        const coResult = await analyzeCoOwners({
          kwNumber: run.kw_number,
          primaryClientName,
          city: prop?.city ?? null,
          voivodeship: prop?.voivodeship ?? null,
        });
        const { error: saveErr } = await (supabaseAdmin as any).from("coowner_registry_checks").upsert(
          {
            application_id: run.loan_application_id,
            kw_number: coResult.kwNumber,
            result_json: coResult as any,
            warnings: coResult.warnings,
            created_by: null,
          },
          { onConflict: "application_id" },
        );
        if (saveErr) throw new Error(saveErr.message);
        markStep(steps, "coowners", "done");
      } catch (e: any) {
        markStep(steps, "coowners", "error", e?.message ?? "błąd sprawdzenia właścicieli");
      }
    }
    await saveSteps(run.id, steps);
  }

  // ── Krok 3: analiza KW (silnik reguł) ──────────────────────────────────────
  if (steps.kw_analysis.status === "pending") {
    if (!kwAvailable) {
      markStep(steps, "kw_analysis", "error", "Brak treści KW — analiza niemożliwa.");
    } else {
      try {
        const { data: loan } = await supabaseAdmin
          .from("loan_applications")
          .select("id, loan_amount")
          .eq("id", run.loan_application_id)
          .maybeSingle();
        const { data: prop } = await supabaseAdmin
          .from("properties")
          .select("estimated_value")
          .eq("loan_application_id", run.loan_application_id)
          .maybeSingle();
        const amount = Number(loan?.loan_amount ?? 0);
        const { runKwLandRegisterAnalysisCore } = await import("@/lib/kw-analysis.functions");
        // Parametry transakcji jak przy ręcznym uruchomieniu bez doprecyzowania:
        // kwota wniosku jako gotówka/ekspozycja/suma hipoteki (zachowawczo).
        const analysis = await runKwLandRegisterAnalysisCore(
          supabaseAdmin as any,
          {
            kwNumber: run.kw_number,
            loanApplicationId: run.loan_application_id,
            caseId: run.loan_application_id,
            transactionType: "CASH_LOAN",
            requestedCashAmount: amount,
            newLoanExposure: amount,
            requestedMortgageSum: amount,
            acceptedPropertyValue: prop?.estimated_value != null ? Number(prop.estimated_value) : null,
            borrower: null,
            declaredCollateralProviders: [],
            seniorCreditorCertificate: null,
          },
          null,
        );
        if (!analysis.ok) throw new Error(analysis.message ?? "analiza KW nie powiodła się");
        markStep(steps, "kw_analysis", "done");
      } catch (e: any) {
        markStep(steps, "kw_analysis", "error", e?.message ?? "błąd analizy KW");
      }
    }
    await saveSteps(run.id, steps);
  }

  // ── Krok 4: analiza ryzyka ─────────────────────────────────────────────────
  if (steps.risk.status === "pending") {
    try {
      const { runInvestmentRiskAssessmentCore } = await import(
        "@/lib/risk-assessment/risk-assessment.functions"
      );
      await runInvestmentRiskAssessmentCore(supabaseAdmin as any, run.loan_application_id, {});
      markStep(steps, "risk", "done");
    } catch (e: any) {
      markStep(steps, "risk", "error", e?.message ?? "błąd analizy ryzyka");
    }
    await saveSteps(run.id, steps);
  }

  // ── Domknięcie przebiegu ───────────────────────────────────────────────────
  const unresolved = STEP_ORDER.some(
    (k) => steps[k].status === "pending" || steps[k].status === "running",
  );
  if (unresolved) return "waiting";

  const hasErrors = STEP_ORDER.some((k) => steps[k].status === "error");
  await (supabaseAdmin as any)
    .from("analysis_pipeline_runs")
    .update({
      status: "done",
      finished_at: new Date().toISOString(),
      error: hasErrors
        ? STEP_ORDER.filter((k) => steps[k].status === "error")
            .map((k) => `${k}: ${steps[k].error}`)
            .join("; ")
        : null,
    })
    .eq("id", run.id);
  return "finished";
}
