// Server functions modułu „Analiza księgi wieczystej".
//
// Warstwa serwerowa spina istniejące pobieranie KW (kw_documents) z
// deterministycznym silnikiem reguł (src/lib/kw-analysis). Decyzje STOP/
// WSTRZYMANE/WARUNKOWO podejmuje silnik — tu jedynie autoryzacja, odczyt
// snapshotu, uruchomienie analizy, persystencja i audyt.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { decodeMaybeBase64 } from "@/lib/kw-fetch.server";
import { compactKwNumber, normalizeKwNumber } from "@/lib/kw";
import { runKwAnalysis } from "@/lib/kw-analysis/engine";
import type { KwDocumentSections } from "@/lib/kw-analysis/normalize";
import type { KwAnalysisInput, Party, PartyRole } from "@/lib/kw-analysis/types";

// Numer KW w formacie kompaktowym (13 znaków) — tak przechowuje go kw_documents
// (i tak samo zapisujemy go w kw_land_register_analyses.kw_number).
const compactKw = compactKwNumber;

async function requireOperator(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const allowed = (roles ?? []).some((r) => r.role === "administrator" || r.role === "operator");
  if (!allowed) throw new Error("Brak uprawnień (wymagana rola administrator/operator).");
}

async function loadSections(
  supabase: SupabaseClient,
  compact: string,
): Promise<{ sections: KwDocumentSections; status: string; fetchedAt: string | null } | null> {
  const { data: row, error } = await supabase
    .from("kw_documents")
    .select("kw_number, status, okladka, dzial_1o, dzial_1s, dzial_2, dzial_3, dzial_4, fetched_at")
    .eq("kw_number", compact)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;
  return {
    status: row.status,
    fetchedAt: row.fetched_at,
    sections: {
      kwNumber: row.kw_number,
      okladka: decodeMaybeBase64(row.okladka),
      dzial_1o: decodeMaybeBase64(row.dzial_1o),
      dzial_1s: decodeMaybeBase64(row.dzial_1s),
      dzial_2: decodeMaybeBase64(row.dzial_2),
      dzial_3: decodeMaybeBase64(row.dzial_3),
      dzial_4: decodeMaybeBase64(row.dzial_4),
      fetchedAt: row.fetched_at,
    },
  };
}

// ── Walidacja wejścia analizy (strony + parametry transakcji). ───────────────
const partySchema = z.object({
  role: z.string(),
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
  companyName: z.string().nullish(),
  pesel: z.string().nullish(),
  krs: z.string().nullish(),
  regon: z.string().nullish(),
  declaredShare: z.string().nullish(),
  isDeceased: z.boolean().nullish(),
  isMinor: z.boolean().nullish(),
});

const certSchema = z.object({
  creditorName: z.string(),
  contractRef: z.string().nullish(),
  outstandingPrincipal: z.number(),
  accruedInterestAndCosts: z.number().nullish(),
  totalPayoffAmount: z.number().nullish(),
  isRevolving: z.boolean(),
  maxPossibleExposure: z.number().nullish(),
  hasDefaultOrEnforcement: z.boolean().nullish(),
  payoffAccount: z.string().nullish(),
  issuedAt: z.string().nullish(),
});

const runInputSchema = z.object({
  kwNumber: z.string().min(3),
  loanApplicationId: z.string().uuid().nullish(),
  caseId: z.string().nullish(),
  transactionType: z
    .enum(["REFINANCING", "CASH_LOAN", "PURCHASE_FINANCING", "BRIDGE", "OTHER"])
    .default("CASH_LOAN"),
  requestedCashAmount: z.number().default(0),
  newLoanExposure: z.number().default(0),
  requestedMortgageSum: z.number().default(0),
  acceptedPropertyValue: z.number().nullish(),
  borrower: partySchema.nullish(),
  declaredCollateralProviders: z.array(partySchema).default([]),
  seniorCreditorCertificate: certSchema.nullish(),
});

function toParty(p: z.infer<typeof partySchema>, fallbackRole: PartyRole): Party {
  return {
    role: (p.role as PartyRole) ?? fallbackRole,
    firstName: p.firstName ?? null,
    lastName: p.lastName ?? null,
    companyName: p.companyName ?? null,
    pesel: p.pesel ?? null,
    krs: p.krs ?? null,
    regon: p.regon ?? null,
    declaredShare: p.declaredShare ?? null,
    isDeceased: p.isDeceased ?? null,
    isMinor: p.isMinor ?? null,
  };
}

/**
 * Uruchamia analizę KW dla podanego numeru: czyta snapshot z kw_documents,
 * odpala deterministyczny silnik reguł i zapisuje wynik. Wymaga roli
 * administrator/operator. Nie pobiera KW z EKW — używa istniejącego cache
 * (pobieranie zleca osobny przepływ fetchKwForApplication / panel KW).
 */
export const runKwLandRegisterAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => runInputSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOperator(supabase, userId);
    return runKwLandRegisterAnalysisCore(supabase as unknown as SupabaseClient, data, userId);
  });

export type RunKwAnalysisInput = z.infer<typeof runInputSchema>;

/**
 * Rdzeń analizy KW — bez autoryzacji; używany przez server fn (operator)
 * oraz automatyczny pipeline analityczny (service_role).
 */
export async function runKwLandRegisterAnalysisCore(
  supabase: SupabaseClient,
  data: RunKwAnalysisInput,
  userId: string | null,
) {
  {
    const compact = compactKw(data.kwNumber);
    if (!compact) throw new Error("Nieprawidłowy numer księgi wieczystej.");

    const loaded = await loadSections(supabase, compact);
    if (!loaded) {
      return {
        ok: false as const,
        status: "not_fetched" as const,
        message: "Treść KW nie została jeszcze pobrana. Pobierz odpis KW przed analizą.",
      };
    }
    // Analizujemy zapisaną treść, jeśli tylko istnieje — nieudane odświeżenie
    // (status "error" z last_error) nie unieważnia wcześniej pobranych działów.
    const s = loaded.sections;
    const hasContent = Boolean(
      s.okladka || s.dzial_1o || s.dzial_1s || s.dzial_2 || s.dzial_4 || s.dzial_3,
    );
    if (loaded.status !== "ready" && !hasContent) {
      return {
        ok: false as const,
        status: loaded.status,
        message: "Treść KW nie jest gotowa (status: " + loaded.status + ").",
      };
    }

    const fetchedAt = loaded.fetchedAt ?? new Date().toISOString();
    let borrower: Party = data.borrower
      ? toParty(data.borrower, "BORROWER")
      : { role: "BORROWER", firstName: null, lastName: null, pesel: null };
    // UI analizy nie zna stron transakcji — dane klienta wniosku są domyślnym
    // pożyczkobiorcą, dzięki czemu dopasowanie tożsamości do Działu II
    // (potwierdzenia, literówki, rozbieżności PESEL) działa na realnych danych.
    if (!data.borrower && data.loanApplicationId) {
      const { data: app } = await supabase
        .from("loan_applications")
        .select("client_id")
        .eq("id", data.loanApplicationId)
        .maybeSingle();
      if (app?.client_id) {
        const { data: c } = await supabase
          .from("clients")
          .select("first_name, last_name, pesel")
          .eq("id", app.client_id)
          .maybeSingle();
        if (c && (c.first_name || c.last_name || c.pesel)) {
          borrower = {
            role: "BORROWER",
            firstName: c.first_name ?? null,
            lastName: c.last_name ?? null,
            pesel: c.pesel ?? null,
          };
        }
      }
    }

    const input: KwAnalysisInput = {
      caseId: data.caseId ?? data.loanApplicationId ?? compact,
      kwNumber: normalizeKwNumber(data.kwNumber) ?? data.kwNumber,
      fetchedAt,
      sourceProvider: "CMD_KW_ENGINE",
      rawKwData: null,
      borrower,
      declaredCollateralProviders: data.declaredCollateralProviders.map((p) =>
        toParty(p, "COLLATERAL_PROVIDER"),
      ),
      transactionType: data.transactionType,
      requestedCashAmount: data.requestedCashAmount,
      newLoanExposure: data.newLoanExposure || data.requestedCashAmount,
      requestedMortgageSum: data.requestedMortgageSum,
      acceptedPropertyValue: data.acceptedPropertyValue ?? null,
      seniorCreditorCertificate: data.seniorCreditorCertificate ?? null,
    };

    const result = runKwAnalysis(input, loaded.sections);

    // Persystencja wyniku (nowa tabela — typy generowane osobno; cast do any).
    const { data: inserted, error } = await (supabase as unknown as SupabaseClient)
      .from("kw_land_register_analyses")
      .insert({
        kw_number: compactKw(result.kwNumber) ?? compact,
        loan_application_id: data.loanApplicationId ?? null,
        ruleset_version: result.rulesetVersion,
        overall_status: result.overallStatus,
        snapshot_fetched_at: fetchedAt,
        active_mention_count: result.activeMentionCount,
        unresolved_finding_count: result.unresolvedFindingCount,
        result_json: result as unknown as Record<string, unknown>,
        created_by: userId,
      })
      .select("id, created_at")
      .maybeSingle();
    if (error) throw new Error(error.message);

    return {
      ok: true as const,
      status: "ready" as const,
      analysisId: inserted?.id ?? null,
      result,
    };
  }
}

/** Zwraca najnowszą analizę KW dla numeru albo wniosku. */
export const getKwLandRegisterAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({ kwNumber: z.string().nullish(), loanApplicationId: z.string().uuid().nullish() })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOperator(supabase, userId);
    const client = supabase as unknown as SupabaseClient;
    let q = client
      .from("kw_land_register_analyses")
      .select(
        "id, kw_number, overall_status, ruleset_version, snapshot_fetched_at, active_mention_count, unresolved_finding_count, result_json, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(1);
    if (data.loanApplicationId) q = q.eq("loan_application_id", data.loanApplicationId);
    else if (data.kwNumber)
      // Kolumna kw_number przechowuje formę kompaktową (patrz compactKw wyżej).
      q = q.eq("kw_number", compactKw(data.kwNumber) ?? data.kwNumber);
    else return { found: false as const };
    const { data: row, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { found: false as const };

    const resolutions = await client
      .from("kw_finding_resolutions")
      .select(
        "finding_id, resolution_state, note, is_override, override_justification, changed_by, changed_at",
      )
      .eq("analysis_id", row.id)
      .order("changed_at", { ascending: false });
    return { found: true as const, analysis: row, resolutions: resolutions.data ?? [] };
  });

/** Zapisuje zmianę stanu rozwiązania alertu / override do audytu (insert-only). */
export const resolveKwFinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        analysisId: z.string().uuid(),
        findingId: z.string().min(1),
        resolutionState: z.enum([
          "UNRESOLVED",
          "DOCUMENTS_REQUESTED",
          "DOCUMENTS_RECEIVED",
          "VERIFIED",
          "REJECTED",
          "OVERRIDDEN",
        ]),
        note: z.string().nullish(),
        isOverride: z.boolean().default(false),
        overrideJustification: z.string().nullish(),
        extractedFields: z.record(z.string(), z.unknown()).nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOperator(supabase, userId);
    if (data.isOverride && !(data.overrideJustification ?? "").trim()) {
      throw new Error("Override wymaga uzasadnienia.");
    }
    const { error } = await (supabase as unknown as SupabaseClient)
      .from("kw_finding_resolutions")
      .insert({
        analysis_id: data.analysisId,
        finding_id: data.findingId,
        resolution_state: data.resolutionState,
        note: data.note ?? null,
        is_override: data.isOverride,
        override_justification: data.overrideJustification ?? null,
        extracted_fields: data.extractedFields ?? null,
        changed_by: userId,
      });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
