// Automatyczny pipeline analityczny: pobierz KW → właściciele → analiza KW →
// analiza ryzyka. Odpala się RAZ dla wniosku KOMPLETNEGO (pusty brief braków)
// z poprawnym numerem KW i potencjałem lokalizacyjnym > progu (decyzja
// właściciela: 50; dopiero po skompletowaniu wniosku — koszty pobrań KW).
// Ponowny przebieg tylko przy zmianie numeru KW albo ręcznie z panelu.
// Błąd jednego kroku nie blokuje pozostałych — raport dostaje status kroku.
// Krok 4 (ocena ryzyka) ma zajęcie (claim) — liczy go jeden wołający naraz:
// panel inwestora zaraz po krokach 1–3, MCP, a zapasowo cron tick (reguły
// czasu i zajęcia: step-timing.ts).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeLoanStatus } from "@/lib/loan-status";
import { CANDIDATE_DB_STATUSES } from "@/lib/auto-distribution/engine.server";
import {
  canClaimRiskStep,
  claimedRiskStep,
  INTERACTIVE_KW_POLL_MS,
  lastStepActivityAt,
  nextKwWait,
  orderForTick,
  pastDeadline,
  riskStepRequestStatus,
  shouldAdvanceOnRead,
  TICK_BUDGET_MS,
  withRiskClaimConditions,
  withStepSaveGuard,
  type RiskStepRequestStatus,
  type StepSaveGuard,
} from "./step-timing";

/** Minimalny potencjał lokalizacyjny uruchamiający pipeline (0–100). */
export const PIPELINE_MIN_LOCATION_SCORE = 50;
/** Pauza, gdy ocenę ryzyka liczy właśnie ktoś inny (poza cron tickiem). */
const RISK_BUSY_PAUSE_MS = 3_000;

export type StepKey = "kw" | "coowners" | "kw_analysis" | "risk";
export type StepStatus = "pending" | "running" | "done" | "error";

export interface StepState {
  status: StepStatus;
  finished_at?: string;
  error?: string;
  /** Licznik prób bez wyniku (krok KW czeka na EKW). */
  waits?: number;
  /** Krok KW: pierwsza i ostatnia próba przy czekaniu na EKW. */
  waiting_since?: string;
  checked_at?: string;
  /** Krok 4: kiedy przebieg zajął ocenę ryzyka (status `running`). */
  claimed_at?: string;
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
  "braki_w_dokumentach",
  "do_kontaktu",
  "w_follow_upie",
  "wniosek_kompletny",
  "do_analizy",
  "rokuje",
  "wyslany_do_inwestorow",
]);

export interface PipelineSyncResult {
  scanned: number;
  started: number;
  skipped_existing: number;
}

/** Kwalifikacja wniosków i zakładanie przebiegów. */
export async function syncAnalysisPipelineRuns(): Promise<PipelineSyncResult> {
  const result: PipelineSyncResult = { scanned: 0, started: 0, skipped_existing: 0 };

  // Filtr statusu w SQL + najnowsze najpierw — okno limitu nie może zapychać
  // się zamkniętymi wnioskami (te same statusy co auto-dystrybucja).
  const { data: loans, error } = await supabaseAdmin
    .from("loan_applications")
    .select("id, status, loan_amount, location_potential_score, deleted_at")
    .is("deleted_at", null)
    .not("loan_amount", "is", null)
    .gt("location_potential_score", PIPELINE_MIN_LOCATION_SCORE)
    .in("status", CANDIDATE_DB_STATUSES as any)
    .order("created_at", { ascending: false })
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

/**
 * Przesuwa do przodu trwające przebiegi (sekwencyjnie per przebieg) w
 * budżecie czasu cron ticku: po `deadline` nie zaczynamy kolejnego
 * przebiegu ani oceny ryzyka (reszta w następnym ticku, za 5 min). Najpierw
 * przebiegi czekające tylko na ocenę ryzyka, potem pozostałe — w grupie
 * najstarsze najpierw. Każdy przebieg czytamy świeżo tuż przed krokiem —
 * lista z początku ticku bywa sprzed minut (odczyt szczegółów, panel).
 */
export async function processAnalysisPipelineRuns(
  opts: { deadline?: number } = {},
): Promise<PipelineProcessResult> {
  const result: PipelineProcessResult = { processed: 0, finished: 0, waiting: 0, errors: 0 };
  const deadline = opts.deadline ?? Date.now() + TICK_BUDGET_MS;

  const { data: runs, error } = await (supabaseAdmin as any)
    .from("analysis_pipeline_runs")
    .select("id, loan_application_id, kw_number, steps, started_at")
    .eq("status", "running")
    .order("started_at", { ascending: true })
    .limit(25);
  if (error) throw new Error(error.message);

  for (const listed of orderForTick((runs ?? []) as any[])) {
    if (pastDeadline(deadline)) break;
    // null = przebieg zamknięty w międzyczasie (albo błąd odczytu — następny tick).
    const run = await loadRunningRun(listed.id).catch((e: any) => {
      console.error("[analysis-pipeline] run reload", listed.id, e?.message);
      return null;
    });
    if (!run) continue;
    result.processed += 1;
    try {
      const outcome = await advanceRun(run, { riskDeadline: deadline });
      if (outcome === "finished") result.finished += 1;
      else result.waiting += 1;
    } catch (e: any) {
      console.error("[analysis-pipeline] run error", run.id, e?.message);
      result.errors += 1;
      await failRun(run.id, e?.message ?? "błąd");
    }
  }
  return result;
}

/** Trwający przebieg w świeżym stanie (null = nie istnieje albo już zamknięty). */
async function loadRunningRun(runId: string): Promise<any | null> {
  const { data: run, error } = await (supabaseAdmin as any)
    .from("analysis_pipeline_runs")
    .select("id, loan_application_id, kw_number, steps, status")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return run && run.status === "running" ? run : null;
}

/** Błąd kroku zamyka trwający przebieg (zamkniętego — np. ponowionego ręcznie — nie ruszamy). */
async function failRun(runId: string, message: string): Promise<void> {
  await (supabaseAdmin as any)
    .from("analysis_pipeline_runs")
    .update({ status: "error", error: message, finished_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("status", "running");
}

/**
 * Ręczne uruchomienie pipeline'u dla wniosku (panel, MCP): zamyka trwający
 * przebieg i otwiera nowy. Rzuca, gdy wniosek nie ma poprawnego numeru KW.
 */
export async function startAnalysisPipelineRunCore(
  applicationId: string,
  triggerReason: string,
): Promise<{ id: string; kw_number: string }> {
  const { normalizeKwNumber } = await import("@/lib/kw-fetch.server");
  const { data: prop } = await supabaseAdmin
    .from("properties")
    .select("land_register_number")
    .eq("loan_application_id", applicationId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const kwNumber = normalizeKwNumber(String(prop?.land_register_number ?? ""));
  if (!kwNumber) throw new Error("Wniosek nie ma poprawnego numeru KW.");

  await (supabaseAdmin as any)
    .from("analysis_pipeline_runs")
    .update({
      status: "error",
      error: "Przerwane ręcznym ponowieniem",
      finished_at: new Date().toISOString(),
    })
    .eq("loan_application_id", applicationId)
    .eq("status", "running");

  const { data, error } = await (supabaseAdmin as any)
    .from("analysis_pipeline_runs")
    .insert({
      loan_application_id: applicationId,
      kw_number: kwNumber,
      status: "running",
      steps: freshSteps(),
      trigger_reason: triggerReason,
    })
    .select("id, kw_number")
    .single();
  if (error) throw new Error(error.message);
  return data as { id: string; kw_number: string };
}

/**
 * Jeden krok naprzód dla wskazanego przebiegu (poza cron tickiem — np. MCP
 * czeka na wynik). Błąd kroku zamyka przebieg tak samo jak w ticku.
 */
export async function advanceAnalysisPipelineRunById(
  runId: string,
  opts: AdvanceRunOpts = {},
): Promise<"finished" | "waiting" | "not_running"> {
  const run = await loadRunningRun(runId);
  if (!run) return "not_running";
  try {
    return await advanceRun(run, opts);
  } catch (e: any) {
    await failRun(run.id, e?.message ?? "błąd");
    throw e;
  }
}

/** Najnowszy przebieg wniosku (ten, który pokazuje panel inwestora). */
async function loadLatestRun(applicationId: string): Promise<any | null> {
  const { data, error } = await (supabaseAdmin as any)
    .from("analysis_pipeline_runs")
    .select("id, status, steps, started_at")
    .eq("loan_application_id", applicationId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

/**
 * Advance-on-read (panel inwestora: szczegóły w Analityce, raport Projektu
 * w „Moich zleceniach"): najnowszy przebieg z otwartymi krokami 1–3 i bez
 * ruchu od ≥ 45 s dostaje krok naprzód w tym żądaniu — EKW udostępnia księgę
 * z opóźnieniem, nie czekamy na cron. Bez oceny ryzyka (tę panel zleca
 * osobno). Zwraca, czy przebieg był popchnięty; błąd nie psuje odczytu.
 */
export async function advanceLatestRunOnRead(applicationId: string): Promise<boolean> {
  try {
    const run = await loadLatestRun(applicationId);
    const last = lastStepActivityAt(run?.started_at, run?.steps);
    if (!run || !shouldAdvanceOnRead(run.status, run.steps, last)) return false;
    await advanceAnalysisPipelineRunById(run.id, {
      pollMaxMs: INTERACTIVE_KW_POLL_MS,
      skipRisk: true,
    });
    return true;
  } catch (e: any) {
    console.error("[analysis-pipeline] advance on read", applicationId, e?.message);
    return false;
  }
}

/**
 * Ocena ryzyka na żądanie panelu inwestora: krok 4 najnowszego przebiegu
 * wniosku liczony od razu, w tym żądaniu (30–50 s, jak w MCP) — tylko gdy
 * kroki 1–3 są rozstrzygnięte, a zajęcie się powiedzie. Bezpieczne do
 * wielokrotnego wołania: zajęty albo rozstrzygnięty krok zwraca tylko stan.
 */
export async function runRiskStepForApplication(
  applicationId: string,
): Promise<RiskStepRequestStatus> {
  const run = await loadLatestRun(applicationId);
  if (!run) return "not_running";
  if (run.status !== "running" || !canClaimRiskStep(run.steps)) {
    return riskStepRequestStatus(run.status, run.steps);
  }
  try {
    await advanceAnalysisPipelineRunById(run.id, { pollMaxMs: INTERACTIVE_KW_POLL_MS });
  } catch (e: any) {
    console.error("[analysis-pipeline] risk on request", run.id, e?.message);
  }
  const { data: after } = await (supabaseAdmin as any)
    .from("analysis_pipeline_runs")
    .select("status, steps")
    .eq("id", run.id)
    .maybeSingle();
  return riskStepRequestStatus(after?.status ?? null, after?.steps);
}

/**
 * Zapis kroków ze strażnikiem (step-timing: withStepSaveGuard — compare-and-set
 * na poprzednim stanie zapisywanego kroku i na kroku 4). false = stan w bazie
 * poszedł dalej (ktoś domknął ten krok, zajął albo rozstrzygnął ocenę ryzyka,
 * przebieg zamknięto) — wołający przerywa, nie nadpisuje cudzej pracy.
 */
async function saveSteps(runId: string, steps: RunSteps, guard: StepSaveGuard): Promise<boolean> {
  const q = (supabaseAdmin as any).from("analysis_pipeline_runs").update({ steps }).eq("id", runId);
  const { data, error } = await withStepSaveGuard(q, guard).select("id");
  if (error) {
    console.error("[analysis-pipeline] save steps", runId, error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

/**
 * Zajęcie kroku 4 warunkowym UPDATE-em (compare-and-set na stanie kroku,
 * który widzieliśmy). Zwraca `claimed_at` albo null, gdy ktoś był pierwszy.
 */
async function claimRiskStep(runId: string, steps: RunSteps): Promise<string | null> {
  const claimed = claimedRiskStep();
  const q = (supabaseAdmin as any)
    .from("analysis_pipeline_runs")
    .update({ steps: { ...steps, risk: claimed } })
    .eq("id", runId)
    .eq("status", "running");
  const { data, error } = await withRiskClaimConditions(q, steps.risk).select("id");
  if (error) {
    console.error("[analysis-pipeline] risk claim", runId, error.message);
    return null;
  }
  return (data ?? []).length > 0 ? claimed.claimed_at : null;
}

function markStep(steps: RunSteps, key: StepKey, status: StepStatus, error?: string): void {
  steps[key] = {
    ...steps[key],
    status,
    error: error ?? undefined,
    finished_at: status === "done" || status === "error" ? new Date().toISOString() : undefined,
    // Zajęcie kroku 4 kończy się razem z wynikiem.
    claimed_at: undefined,
  };
}

export interface AdvanceRunOpts {
  /** Limit czekania na EKW (domyślnie 45 s — cron tick). */
  pollMaxMs?: number;
  /**
   * Zatrzymaj się przed oceną ryzyka — żądanie z przeglądarki robi kroki
   * 1–3, ocenę panel zleca osobno (runRiskStepForApplication), zapasowo cron.
   */
  skipRisk?: boolean;
  /**
   * Budżet cron ticku: po tym czasie (epoch ms) nie zaczynamy oceny ryzyka.
   * Sprawdzane tuż przed krokiem 4, na świeżym stanie kroków 1–3.
   */
  riskDeadline?: number;
}

/**
 * Analiza KW silnikiem reguł dla wniosku z przebiegu. Wartość nieruchomości:
 * z wniosku, a gdy jej brak — `fallbackValue` (wycena rynkowa z oceny
 * ryzyka). Zwraca, czy użyto wartości zastępczej.
 */
async function runPipelineKwAnalysis(
  run: { loan_application_id: string; kw_number: string },
  fallbackValue: number | null,
): Promise<boolean> {
  const [{ data: loan }, { data: prop }] = await Promise.all([
    supabaseAdmin
      .from("loan_applications")
      .select("id, loan_amount")
      .eq("id", run.loan_application_id)
      .maybeSingle(),
    supabaseAdmin
      .from("properties")
      .select("estimated_value")
      .eq("loan_application_id", run.loan_application_id)
      .maybeSingle(),
  ]);
  const declared = prop?.estimated_value != null ? Number(prop.estimated_value) : null;
  // Wartość zadeklarowana ma pierwszeństwo — przeliczamy tylko, gdy jej brak.
  if (fallbackValue != null && declared != null && declared > 0) return false;
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
      acceptedPropertyValue: declared != null && declared > 0 ? declared : fallbackValue,
      borrower: null,
      declaredCollateralProviders: [],
      seniorCreditorCertificate: null,
    },
    null,
  );
  if (!analysis.ok) throw new Error(analysis.message ?? "analiza KW nie powiodła się");
  return fallbackValue != null;
}

/**
 * Jeden krok naprzód dla przebiegu. Zwraca "finished", gdy wszystkie kroki
 * są rozstrzygnięte (done/error), inaczej "waiting" (kolejny tick dokończy).
 */
async function advanceRun(
  run: {
    id: string;
    loan_application_id: string;
    kw_number: string;
    steps: RunSteps;
  },
  opts: AdvanceRunOpts = {},
): Promise<"finished" | "waiting"> {
  const steps: RunSteps = { ...freshSteps(), ...(run.steps ?? {}) };
  // Stan w bazie, który widzieliśmy — każdy zapis kroku to compare-and-set na nim.
  let stored: Partial<RunSteps> = { ...(run.steps ?? {}) };
  const save = async (step: StepKey): Promise<boolean> => {
    if (!(await saveSteps(run.id, steps, { step, was: stored[step]?.status }))) return false;
    stored = { ...steps };
    return true;
  };

  // ── Krok 1: pobranie treści KW ─────────────────────────────────────────────
  if (steps.kw.status === "pending" || steps.kw.status === "running") {
    const { fetchAndStoreKw } = await import("@/lib/kw-fetch.server");
    const outcome = await fetchAndStoreKw(run.kw_number, { pollMaxMs: opts.pollMaxMs ?? 45_000 });
    if (outcome.ok) {
      markStep(steps, "kw", "done");
    } else if (outcome.status === "processing") {
      // Limit czasem, nie liczbą prób — próby są częste (odczyt, cron co 5 min).
      const wait = nextKwWait(steps.kw);
      if (wait.expired) {
        markStep(steps, "kw", "error", "Pobieranie KW nie zakończyło się w rozsądnym czasie.");
      } else {
        steps.kw = wait.state;
        await save("kw");
        return "waiting";
      }
    } else {
      markStep(steps, "kw", "error", outcome.error ?? `status: ${outcome.status}`);
    }
    if (!(await save("kw"))) return "waiting";
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
            .select("id, client_id, nip")
            .eq("id", run.loan_application_id)
            .maybeSingle(),
          supabaseAdmin
            .from("properties")
            .select("city, voivodeship")
            .eq("loan_application_id", run.loan_application_id)
            .maybeSingle(),
        ]);
        let primaryClientName: string | null = null;
        let primaryClientNip: string | null = (app as any)?.nip ?? null;
        if (app?.client_id) {
          const { data: c } = await supabaseAdmin
            .from("clients")
            .select("first_name, last_name, nip")
            .eq("id", app.client_id)
            .maybeSingle();
          primaryClientName =
            [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim() || null;
          primaryClientNip = c?.nip || primaryClientNip;
        }
        const { analyzeCoOwners } = await import("@/lib/coowners/analyze.server");
        const coResult = await analyzeCoOwners({
          kwNumber: run.kw_number,
          primaryClientName,
          primaryClientNip,
          city: prop?.city ?? null,
          voivodeship: prop?.voivodeship ?? null,
        });
        const { error: saveErr } = await (supabaseAdmin as any)
          .from("coowner_registry_checks")
          .upsert(
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
    if (!(await save("coowners"))) return "waiting";
  }

  // ── Krok 3: analiza KW (silnik reguł) ──────────────────────────────────────
  if (steps.kw_analysis.status === "pending") {
    if (!kwAvailable) {
      markStep(steps, "kw_analysis", "error", "Brak treści KW — analiza niemożliwa.");
    } else {
      try {
        await runPipelineKwAnalysis(run, null);
        markStep(steps, "kw_analysis", "done");
      } catch (e: any) {
        markStep(steps, "kw_analysis", "error", e?.message ?? "błąd analizy KW");
      }
    }
    if (!(await save("kw_analysis"))) return "waiting";
  }

  // ── Krok 4: analiza ryzyka ─────────────────────────────────────────────────
  // Gotowość na świeżym stanie kroków 1–3 (mogły domknąć się wyżej). Ocenę
  // liczy ten, kto ją zajmie — pozostali wołający czekają na wynik.
  if (steps.risk.status === "pending" || steps.risk.status === "running") {
    if (opts.skipRisk || pastDeadline(opts.riskDeadline)) return "waiting";
    if (!canClaimRiskStep(steps)) {
      // Ocenę liczy ktoś inny. Poza cronem krótka pauza — pętla czekająca na
      // wynik (MCP run_analysis_pipeline) nie kręci się w miejscu.
      if (opts.riskDeadline == null) await new Promise((r) => setTimeout(r, RISK_BUSY_PAUSE_MS));
      return "waiting";
    }
    const claimedAt = await claimRiskStep(run.id, steps);
    if (!claimedAt) return "waiting";
    steps.risk = { status: "running", claimed_at: claimedAt };
    try {
      const { runInvestmentRiskAssessmentCore } =
        await import("@/lib/risk-assessment/risk-assessment.functions");
      // Nowy przebieg = nowa ocena (bez force ocena zwracałaby zapisany wynik).
      const risk = await runInvestmentRiskAssessmentCore(
        supabaseAdmin as any,
        run.loan_application_id,
        { force: true },
      );
      markStep(steps, "risk", "done");
      // Wniosek bez wartości nieruchomości: analiza KW z kroku 3 nie policzyła
      // LTV/CLTV — przeliczamy ją z wartością z wyceny rynkowej (silnik reguł
      // jest deterministyczny i bez płatnych źródeł).
      const marketValue = risk.masterValuation?.estimatedValueMidPln ?? null;
      if (steps.kw_analysis.status === "done" && marketValue && marketValue > 0) {
        try {
          await runPipelineKwAnalysis(run, marketValue);
        } catch (e: any) {
          console.error("[analysis-pipeline] kw re-analysis with valuation", run.id, e?.message);
        }
      }
    } catch (e: any) {
      markStep(steps, "risk", "error", e?.message ?? "błąd analizy ryzyka");
    }
    // Zajęcie przejęte (praca trwała dłużej niż RISK_CLAIM_STALE_MS) — wynik zapisze
    // przejmujący; przebieg zamknięty w międzyczasie (ręczne ponowienie) zostaje zamknięty.
    if (!(await saveSteps(run.id, steps, { claimedAt }))) return "waiting";
  }

  // ── Domknięcie przebiegu ───────────────────────────────────────────────────
  const unresolved = STEP_ORDER.some(
    (k) => steps[k].status === "pending" || steps[k].status === "running",
  );
  if (unresolved) return "waiting";

  const hasErrors = STEP_ORDER.some((k) => steps[k].status === "error");
  // Tylko trwający przebieg — zamknięty w międzyczasie (ręczne ponowienie) zostaje zamknięty.
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
    .eq("id", run.id)
    .eq("status", "running");
  return "finished";
}
