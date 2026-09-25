// Server functions szybkiej analizy KW — wniosek spoza Finance You.
//
// Inwestor może użyć Analityki do własnego tematu z zewnątrz: podaje numer
// KW i rodzaj nieruchomości (opcjonalnie nazwę, kwotę, wartość i okres), a
// automat wykonuje cztery kroki pipeline'u z pełną oceną ryzyka
// (kw-checks.server.ts). Sprawdzenie jest prywatne — widzi je
// tylko jego autor, nie powstaje z niego wniosek w CRM ani dostęp do
// jakichkolwiek wniosków Finance You.
//
// Każde nowe sprawdzenie to potencjalnie płatne pobranie KW — limit
// KW_CHECK_DAILY_LIMIT na 24 h (rozliczenia dojdą osobno).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { compactKwNumber, validateKwNumber } from "@/lib/kw";
import type { CoOwnersAnalysis } from "@/lib/coowners/types";
import type { KwAnalysisResult } from "@/lib/kw-analysis/types";
import type { InvestmentRiskAssessment } from "@/lib/risk-assessment/types";
import { loadKwDocumentView, reduceCoOwners } from "./analytics.functions";
import {
  KW_CHECK_DAILY_LIMIT,
  KW_CHECK_PROPERTY_TYPES,
  type KwCheckDetail,
  type KwCheckItem,
  type KwCheckStepKey,
  type AnalyticsStepState,
} from "./types";

/** Po jakim czasie od ostatniego kroku odczyt szczegółów sam popycha przebieg. */
const ADVANCE_ON_READ_AFTER_MS = 45_000;
/** Limit oczekiwania na EKW w żądaniu inwestora (dłużej czeka cron tick). */
const INTERACTIVE_POLL_MS = 20_000;

const LIST_SELECT =
  "id, user_id, kw_number, label, property_type, loan_amount, property_value, period_months, status, steps, kw_analysis_json, error, last_advanced_at, created_at, finished_at";
const ROW_SELECT = `${LIST_SELECT}, coowners_json, risk_json`;

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toItem(r: any): KwCheckItem {
  const kwa = r.kw_analysis_json as KwAnalysisResult | null;
  return {
    id: String(r.id),
    kwNumber: String(r.kw_number),
    label: r.label ?? null,
    propertyType: r.property_type ?? null,
    loanAmount: num(r.loan_amount),
    propertyValue: num(r.property_value),
    periodMonths: num(r.period_months),
    status: r.status === "done" ? "done" : r.status === "error" ? "error" : "running",
    steps: (r.steps ?? {}) as Partial<Record<KwCheckStepKey, AnalyticsStepState>>,
    error: r.error ?? null,
    kwAnalysisStatus: kwa?.overallStatus ?? null,
    createdAt: String(r.created_at),
    finishedAt: r.finished_at ?? null,
  };
}

/** Narzędzie inwestora — rola inwestora albo zespół (podgląd panelu). */
async function assertInvestorOrStaff(userId: string): Promise<void> {
  const { getUserRoles, isInternalStaff } = await import("@/lib/access/guards.server");
  const [roles, staff] = await Promise.all([getUserRoles(userId), isInternalStaff(userId)]);
  if (!staff && !roles.includes("inwestor")) {
    throw new Error("Szybka analiza KW jest dostępna w panelu inwestora.");
  }
}

async function loadOwnRow(db: any, userId: string, id: string): Promise<any> {
  const { data, error } = await db
    .from("investor_kw_checks")
    .select(ROW_SELECT)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Nie znaleziono sprawdzenia.");
  return data;
}

/** Sprawdzenia KW inwestora (najnowsze najpierw). */
export const listMyKwChecks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<KwCheckItem[]> => {
    const db = await adminDb();
    const { data, error } = await db
      .from("investor_kw_checks")
      .select(LIST_SELECT)
      .eq("user_id", context.userId as string)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map(toItem);
  });

/** Nowe sprawdzenie KW dla wniosku spoza systemu. */
export const startMyKwCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        kwNumber: z.string().min(3).max(40),
        label: z.string().trim().max(120).nullish(),
        propertyType: z.enum(KW_CHECK_PROPERTY_TYPES),
        periodMonths: z.number().int().min(1).max(600).nullish(),
        loanAmount: z.number().nonnegative().max(1_000_000_000).nullish(),
        propertyValue: z.number().nonnegative().max(1_000_000_000).nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ id: string; reused: boolean }> => {
    const userId = context.userId as string;
    await assertInvestorOrStaff(userId);

    const kw = validateKwNumber(data.kwNumber);
    if (!kw.ok) throw new Error(kw.message);

    const db = await adminDb();
    // Ten sam numer w toku — wracamy do istniejącego zamiast pobierać drugi raz.
    const { data: running } = await db
      .from("investor_kw_checks")
      .select("id")
      .eq("user_id", userId)
      .eq("kw_number", kw.value)
      .eq("status", "running")
      .limit(1)
      .maybeSingle();
    if (running) return { id: String(running.id), reused: true };

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await db
      .from("investor_kw_checks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since);
    if ((count ?? 0) >= KW_CHECK_DAILY_LIMIT) {
      throw new Error(
        `Limit ${KW_CHECK_DAILY_LIMIT} nowych analiz KW na 24 h został wykorzystany. Spróbuj później.`,
      );
    }

    const { freshKwCheckSteps, advanceKwCheckSafe } = await import("./kw-checks.server");
    const { data: row, error } = await db
      .from("investor_kw_checks")
      .insert({
        user_id: userId,
        kw_number: kw.value,
        label: data.label || null,
        property_type: data.propertyType,
        period_months: data.periodMonths ?? null,
        loan_amount: data.loanAmount ?? null,
        property_value: data.propertyValue ?? null,
        status: "running",
        steps: freshKwCheckSteps(),
      })
      .select(
        "id, user_id, kw_number, property_type, loan_amount, property_value, period_months, status, steps",
      )
      .single();
    if (error) throw new Error(error.message);

    // Kroki 1–3 od razu (przy KW z cache kończą się w tym żądaniu); ocenę
    // ryzyka — minuty pracy — wykonuje w tle cron tick.
    await advanceKwCheckSafe(row, { pollMaxMs: INTERACTIVE_POLL_MS, skipRisk: true });
    return { id: String(row.id), reused: false };
  });

/**
 * Szczegóły sprawdzenia. Gdy przebieg trwa, a ostatni krok był dawno,
 * odczyt popycha go o krok (EKW udostępnia dokument z opóźnieniem) — nie
 * trzeba czekać na cron tick.
 */
export const getMyKwCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<KwCheckDetail> => {
    const userId = context.userId as string;
    const db = await adminDb();
    let row = await loadOwnRow(db, userId, data.id);

    const last = Date.parse(row.last_advanced_at ?? row.created_at);
    if (row.status === "running" && Date.now() - last >= ADVANCE_ON_READ_AFTER_MS) {
      const { advanceKwCheckSafe } = await import("./kw-checks.server");
      await advanceKwCheckSafe(row, { pollMaxMs: INTERACTIVE_POLL_MS, skipRisk: true });
      row = await loadOwnRow(db, userId, data.id);
    }

    const item = toItem(row);
    const kwDocument = await loadKwDocumentView(db, compactKwNumber(row.kw_number));
    return {
      item,
      kwDocument,
      coowners: reduceCoOwners(row.coowners_json as CoOwnersAnalysis | null),
      kwAnalysis: row.kw_analysis_json
        ? {
            result: row.kw_analysis_json as KwAnalysisResult,
            createdAt: String(row.steps?.kw_analysis?.finished_at ?? row.created_at),
          }
        : null,
      risk: (row.risk_json as InvestmentRiskAssessment | null) ?? null,
    };
  });
