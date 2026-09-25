// Silnik szybkiej analizy KW dla wniosku spoza Finance You (moduł Analityka).
//
// Trzy pierwsze kroki pipeline'u analitycznego (lib/analysis-pipeline) —
// pobranie KW → właściciele → analiza KW — ale bez wniosku w CRM: wszystko
// żyje w wierszu investor_kw_checks. Kroku ryzyka nie ma (wymaga pełnego
// wniosku). Błąd jednego kroku nie blokuje pozostałych, jak w pipelinie.
// Przebieg przesuwa: start (od razu), odczyt szczegółów przez inwestora
// (gdy przebieg stoi) oraz cron tick analysis-pipeline-tick.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { compactKwNumber } from "@/lib/kw";
import type { AnalyticsStepState, KwCheckStepKey } from "./types";

/** Maksymalna liczba prób pobrania KW (EKW udostępnia dokument z opóźnieniem). */
const MAX_KW_WAIT_TICKS = 20;

const STEP_ORDER: KwCheckStepKey[] = ["kw", "coowners", "kw_analysis"];

type CheckSteps = Record<KwCheckStepKey, AnalyticsStepState & { waits?: number }>;

export interface KwCheckRow {
  id: string;
  user_id: string;
  kw_number: string;
  loan_amount: number | string | null;
  property_value: number | string | null;
  status: string;
  steps: Partial<CheckSteps> | null;
}

const db = supabaseAdmin as any;

export function freshKwCheckSteps(): CheckSteps {
  return {
    kw: { status: "pending" },
    coowners: { status: "pending" },
    kw_analysis: { status: "pending" },
  };
}

function markStep(
  steps: CheckSteps,
  key: KwCheckStepKey,
  status: "done" | "error",
  error?: string,
): void {
  steps[key] = { status, error, finished_at: new Date().toISOString() };
}

async function save(id: string, patch: Record<string, unknown>): Promise<void> {
  await db
    .from("investor_kw_checks")
    .update({ ...patch, last_advanced_at: new Date().toISOString() })
    .eq("id", id);
}

/**
 * Jeden krok naprzód. Zwraca "finished", gdy wszystkie kroki są
 * rozstrzygnięte, inaczej "waiting" (KW jeszcze się pobiera).
 */
export async function advanceKwCheck(
  row: KwCheckRow,
  opts: { pollMaxMs?: number } = {},
): Promise<"finished" | "waiting"> {
  const steps: CheckSteps = { ...freshKwCheckSteps(), ...(row.steps ?? {}) };
  const compact = compactKwNumber(row.kw_number);
  if (!compact) {
    await save(row.id, {
      status: "error",
      error: "Nieprawidłowy numer księgi wieczystej.",
      finished_at: new Date().toISOString(),
    });
    return "finished";
  }

  // ── Krok 1: pobranie treści KW (wspólny cache kw_documents) ────────────────
  if (steps.kw.status === "pending" || steps.kw.status === "running") {
    const { fetchAndStoreKw } = await import("@/lib/kw-fetch.server");
    const outcome = await fetchAndStoreKw(compact, {
      orderedBy: row.user_id,
      pollMaxMs: opts.pollMaxMs ?? 45_000,
    });
    if (outcome.ok) {
      markStep(steps, "kw", "done");
    } else if (outcome.status === "processing") {
      const waits = (steps.kw.waits ?? 0) + 1;
      if (waits >= MAX_KW_WAIT_TICKS) {
        markStep(steps, "kw", "error", "Pobieranie KW nie zakończyło się w rozsądnym czasie.");
      } else {
        steps.kw = { status: "running", waits };
        await save(row.id, { steps });
        return "waiting";
      }
    } else if (outcome.status === "not_found") {
      markStep(steps, "kw", "error", "Nie znaleziono księgi o tym numerze w EKW.");
    } else {
      markStep(steps, "kw", "error", outcome.error ?? `status: ${outcome.status}`);
    }
    await save(row.id, { steps });
  }

  const kwAvailable = steps.kw.status === "done";
  const patch: Record<string, unknown> = {};

  // ── Krok 2: właściciele (dział II + CEIDG/KRS) ─────────────────────────────
  if (steps.coowners.status === "pending") {
    if (!kwAvailable) {
      markStep(steps, "coowners", "error", "Brak treści KW — nie sprawdzono właścicieli.");
    } else {
      try {
        const { analyzeCoOwners } = await import("@/lib/coowners/analyze.server");
        patch.coowners_json = await analyzeCoOwners({ kwNumber: compact });
        markStep(steps, "coowners", "done");
      } catch (e: any) {
        markStep(steps, "coowners", "error", e?.message ?? "błąd sprawdzenia właścicieli");
      }
    }
    await save(row.id, { ...patch, steps });
  }

  // ── Krok 3: analiza KW (silnik reguł) ──────────────────────────────────────
  if (steps.kw_analysis.status === "pending") {
    if (!kwAvailable) {
      markStep(steps, "kw_analysis", "error", "Brak treści KW — analiza niemożliwa.");
    } else {
      try {
        const amount = Number(row.loan_amount ?? 0) || 0;
        const value = row.property_value != null ? Number(row.property_value) : null;
        const { runKwLandRegisterAnalysisCore } = await import("@/lib/kw-analysis.functions");
        // Parametry jak w pipelinie: podana kwota jako gotówka/ekspozycja/suma
        // hipoteki (zachowawczo); bez kwoty — sama ocena stanu księgi.
        const analysis = await runKwLandRegisterAnalysisCore(
          supabaseAdmin as any,
          {
            kwNumber: compact,
            loanApplicationId: null,
            caseId: `investor-kw-check:${row.id}`,
            transactionType: "CASH_LOAN",
            requestedCashAmount: amount,
            newLoanExposure: amount,
            requestedMortgageSum: amount,
            acceptedPropertyValue: value != null && Number.isFinite(value) ? value : null,
            borrower: null,
            declaredCollateralProviders: [],
            seniorCreditorCertificate: null,
          },
          row.user_id,
        );
        if (!analysis.ok) throw new Error(analysis.message ?? "analiza KW nie powiodła się");
        patch.kw_analysis_json = analysis.result;
        markStep(steps, "kw_analysis", "done");
      } catch (e: any) {
        markStep(steps, "kw_analysis", "error", e?.message ?? "błąd analizy KW");
      }
    }
    await save(row.id, { ...patch, steps });
  }

  const unresolved = STEP_ORDER.some(
    (k) => steps[k].status === "pending" || steps[k].status === "running",
  );
  if (unresolved) return "waiting";

  const failed = STEP_ORDER.filter((k) => steps[k].status === "error");
  await save(row.id, {
    steps,
    // Brak treści KW = nic nie przeanalizowano → błąd; inaczej wynik jest
    // użyteczny nawet z błędem pojedynczego kroku (opis w `error`).
    status: kwAvailable ? "done" : "error",
    error: failed.length ? failed.map((k) => `${k}: ${steps[k].error}`).join("; ") : null,
    finished_at: new Date().toISOString(),
  });
  return "finished";
}

/** Bezpieczne przesunięcie — błąd nieoczekiwany zamyka sprawdzenie zamiast wisieć. */
export async function advanceKwCheckSafe(
  row: KwCheckRow,
  opts: { pollMaxMs?: number } = {},
): Promise<void> {
  try {
    await advanceKwCheck(row, opts);
  } catch (e: any) {
    console.error("[investor-kw-check] error", row.id, e?.message);
    await save(row.id, {
      status: "error",
      error: e?.message ?? "błąd",
      finished_at: new Date().toISOString(),
    });
  }
}

/** Cron: przesuwa trwające sprawdzenia (najstarsze najpierw). */
export async function processInvestorKwChecks(): Promise<{ processed: number }> {
  const { data, error } = await db
    .from("investor_kw_checks")
    .select("id, user_id, kw_number, loan_amount, property_value, status, steps")
    .eq("status", "running")
    .order("created_at", { ascending: true })
    .limit(10);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as KwCheckRow[];
  for (const row of rows) await advanceKwCheckSafe(row);
  return { processed: rows.length };
}
