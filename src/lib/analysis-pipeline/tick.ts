// Kolejność i izolacja błędów cron ticku analysis-pipeline-tick (co 5 min,
// pg_net czeka do 240 s). Kroki dostajemy z zewnątrz — tick da się
// przetestować bez bazy.
//  1. Szybkie analizy KW inwestorów (investor_kw_checks) — najpierw, bo na
//     ich ocenę ryzyka czeka inwestor; ich błąd nie zatrzymuje reszty.
//  2. Kwalifikacja nowych wniosków (sync) — co 15 minut, jak dotąd.
//  3. Trwające przebiegi wniosków (w tym Analityka i raporty Projektów).
// Wspólny budżet: po TICK_BUDGET_MS od startu nie zaczynamy kolejnego
// przebiegu ani oceny ryzyka.
import { shouldSyncPipelineThisTick, TICK_BUDGET_MS } from "./step-timing";

export interface PipelineTickSteps<S, P> {
  processInvestorKwChecks: (opts: { deadline: number }) => Promise<{ processed: number }>;
  syncAnalysisPipelineRuns: () => Promise<S>;
  processAnalysisPipelineRuns: (opts: { deadline: number }) => Promise<P>;
}

export interface PipelineTickResult<S, P> {
  ok: boolean;
  kwChecks: { processed: number; error?: string };
  /** null = kwalifikacja pominięta w tym ticku (jest co 15 min) albo błąd. */
  sync: S | null;
  processing: P | null;
  errors: string[];
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function runAnalysisPipelineTick<S, P>(
  steps: PipelineTickSteps<S, P>,
  now: () => number = Date.now,
): Promise<PipelineTickResult<S, P>> {
  const startedAt = now();
  const deadline = startedAt + TICK_BUDGET_MS;
  const errors: string[] = [];

  let kwChecks: PipelineTickResult<S, P>["kwChecks"];
  try {
    kwChecks = await steps.processInvestorKwChecks({ deadline });
  } catch (e) {
    // Błąd sprawdzeń inwestorów nie może zatrzymać pipeline'u wniosków.
    kwChecks = { processed: 0, error: message(e) };
  }

  let sync: S | null = null;
  if (shouldSyncPipelineThisTick(new Date(startedAt))) {
    try {
      sync = await steps.syncAnalysisPipelineRuns();
    } catch (e) {
      errors.push(`sync: ${message(e)}`);
    }
  }

  let processing: P | null = null;
  try {
    processing = await steps.processAnalysisPipelineRuns({ deadline });
  } catch (e) {
    errors.push(`processing: ${message(e)}`);
  }

  return { ok: errors.length === 0, kwChecks, sync, processing, errors };
}
