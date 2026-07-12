// Orkiestrator „Wycena i ocena ryzyka inwestycji".
// Pipeline: OCR → KW (stan prawny) → właściciel (PESEL, trwanie życia) →
// korespondencja → dane rządowe/analiza zabezpieczenia → nadrzędna wycena Perplexity.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runPropertyCollateralAnalysisCore } from "@/lib/property-analysis/property-collateral-analysis.functions";
import type { DataSourceUsage } from "@/lib/property-analysis/types";
import { ocrDocuments } from "./document-ocr.server";
import { analyzeKwLegal } from "./kw-parser.server";
import { analyzeOwner } from "./owner-analysis.server";
import { analyzeCorrespondence } from "./correspondence-intel.server";
import { perplexityMasterValuation } from "./perplexity-master.server";
import { combineRiskAssessment } from "./risk-scoring";
import type { InvestmentRiskAssessment } from "./types";
import { recommendationLabel } from "./types";

// Tabela investment_risk_assessments nie jest jeszcze w wygenerowanych typach —
// dostęp przez rzutowanie (typy regenerują się w pipeline Supabase/Lovable).
const db = supabaseAdmin as unknown as {
  from: (t: string) => any;
};

async function assertAdminOrOperator(userId: string) {
  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const allowed = (roles ?? []).some((r) => r.role === "administrator" || r.role === "operator");
  if (!allowed) throw new Error("Brak uprawnień (wymagana rola administrator/operator).");
}

export const runInvestmentRiskAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdminOrOperator(context.userId);
    return runInvestmentRiskAssessmentCore(data.applicationId);
  });

export async function runInvestmentRiskAssessmentCore(applicationId: string): Promise<InvestmentRiskAssessment> {
  const generatedAt = new Date().toISOString();
  const warnings: string[] = [];

  // 0) Wczytaj wniosek, właściciela (client_id), nieruchomość, dokumenty.
  const [{ data: app }, { data: props }, { data: docs }] = await Promise.all([
    supabaseAdmin.from("loan_applications").select("*").eq("id", applicationId).maybeSingle(),
    supabaseAdmin.from("properties").select("*").eq("loan_application_id", applicationId),
    supabaseAdmin.from("documents").select("id, file_name, document_type, file_url").eq("loan_application_id", applicationId),
  ]);
  if (!app) throw new Error("Wniosek nie znaleziony.");
  const property = props?.[0] ?? null;
  const clientId = (app as any).client_id ?? null;
  const loanTermYears = app.preferred_period_months ? Math.round((app.preferred_period_months / 12) * 10) / 10 : null;
  const declaredValue = property?.estimated_value ?? null;
  const loanAmount = app.loan_amount ?? null;

  // 1) Analiza zabezpieczenia (reuse: wycena Perplexity + lokalizacja + powódź + scoring).
  //    Nie przerywamy oceny, gdy padnie — degradujemy się miękko.
  let collateral = null as InvestmentRiskAssessment["collateralAnalysis"];
  try {
    collateral = await runPropertyCollateralAnalysisCore(applicationId);
  } catch (e: any) {
    warnings.push(`Analiza zabezpieczenia nie powiodła się: ${e?.message ?? "błąd"}.`);
  }

  // 2) OCR dokumentów, 3) KW (stan prawny), 5) korespondencja — równolegle.
  const documents = (docs ?? []).map((d) => ({ id: d.id, url: d.file_url, type: d.document_type, name: d.file_name }));
  const [ocr, kwLegal, correspondence] = await Promise.all([
    ocrDocuments({ applicationId, documents }),
    analyzeKwLegal({
      kwNumber: property?.land_register_number ?? null,
      hasCoOwners: property?.has_co_owners ?? null,
      hasMortgageFlag: property?.has_mortgage ?? null,
    }),
    analyzeCorrespondence({ applicationId, clientId, declaredValue, loanAmount, city: property?.city ?? null }),
  ]);

  // 4) Właściciel — potrzebuje wyników KW do porównania nazwiska.
  const owner = await analyzeOwner({ clientId, loanTermYears, kwLegal });
  warnings.push(...owner.notes.filter((n) => /nieprawidłowy|niezgod|brak PESEL|brak powiązanego/i.test(n)));

  // 6) Nadrzędna wycena Perplexity — „naładowana" pełnym dossier.
  const areaM2 = property?.area_sqm ?? null;
  const master = await perplexityMasterValuation({
    propertyType: property?.property_type ?? "inna",
    address: property?.address ?? null,
    city: property?.city ?? null,
    voivodeship: property?.voivodeship ?? null,
    areaM2,
    landAreaHa: null,
    declaredValuePln: declaredValue,
    requestedLoanPln: loanAmount,
    collateral,
    owner,
    kwLegal,
    correspondence,
    ocr,
  });
  if (master.status !== "success") warnings.push(`Nadrzędna wycena Perplexity: ${master.errorMessage ?? "brak danych"}.`);

  // 7) Zbiorczy scoring.
  const combined = combineRiskAssessment({ collateral, owner, kwLegal, correspondence, ocr, master });

  // 8) Rejestr wykorzystanych źródeł danych.
  const dataSources = buildDataSources({ ocr, kwLegal, owner, correspondence, collateral, master });

  // 9) Executive summary.
  const valueStr = master.estimatedValueMidPln
    ? `${master.estimatedValueLowPln?.toLocaleString("pl-PL") ?? "—"}–${master.estimatedValueHighPln?.toLocaleString("pl-PL") ?? "—"} PLN`
    : (collateral?.valuationBenchmark?.conservativeLowPln
        ? `${collateral.valuationBenchmark.conservativeLowPln.toLocaleString("pl-PL")}–${collateral.valuationBenchmark.conservativeHighPln?.toLocaleString("pl-PL") ?? "—"} PLN`
        : "brak wiarygodnej wyceny");
  const executiveSummary =
    `Ocena inwestycji: ${combined.investmentScore}/100 (klasa ${combined.riskGrade}) — ${recommendationLabel(combined.recommendation)}. ` +
    `Szacowana wartość nieruchomości: ${valueStr}. ` +
    (master.suggestedMaxLoanAmountPln ? `Sugerowana maks. kwota pożyczki: ${master.suggestedMaxLoanAmountPln.toLocaleString("pl-PL")} PLN (LTV do ${master.suggestedLtvCapPercent ?? "—"}%). ` : "") +
    (combined.keyRisks.length ? `Główne ryzyka: ${combined.keyRisks.slice(0, 3).join("; ")}.` : "Nie zidentyfikowano krytycznych ryzyk.");

  const result: InvestmentRiskAssessment = {
    success: true,
    applicationId,
    generatedAt,
    investmentScore: combined.investmentScore,
    riskGrade: combined.riskGrade,
    recommendation: combined.recommendation,
    owner,
    kwLegal,
    correspondence,
    ocr,
    masterValuation: master,
    collateralAnalysis: collateral,
    componentScores: combined.componentScores,
    keyRisks: combined.keyRisks,
    keyStrengths: combined.keyStrengths,
    warnings: dedupeStr(warnings),
    dataSources,
    executiveSummary,
  };

  // 10) Zapis.
  try {
    await db.from("investment_risk_assessments").upsert(
      {
        application_id: applicationId,
        property_id: property?.id ?? null,
        client_id: clientId,
        investment_score: combined.investmentScore,
        risk_grade: combined.riskGrade,
        recommendation: combined.recommendation,
        result_json: result,
        data_sources: dataSources,
        warnings,
        master_valuation_status: master.status,
      },
      { onConflict: "application_id" },
    );
  } catch (e: any) {
    // Zapis nie może wywrócić całej oceny.
    console.error("[risk-assessment] save failed:", e?.message ?? e);
  }

  return result;
}

function buildDataSources(a: {
  ocr: InvestmentRiskAssessment["ocr"];
  kwLegal: InvestmentRiskAssessment["kwLegal"];
  owner: InvestmentRiskAssessment["owner"];
  correspondence: InvestmentRiskAssessment["correspondence"];
  collateral: InvestmentRiskAssessment["collateralAnalysis"];
  master: InvestmentRiskAssessment["masterValuation"];
}): DataSourceUsage[] {
  const sources: DataSourceUsage[] = [];

  sources.push({
    source: "Skany dokumentów (OCR — Gemini)",
    used: a.ocr.documentsProcessed > 0 && a.ocr.status !== "no_data",
    purpose: "odczyt operatów, wypisów, umów i zaświadczeń",
    dataLevel: `${a.ocr.documentsProcessed} dokumentów`,
    period: "",
    status: a.ocr.status,
  });
  sources.push({
    source: "Księga wieczysta (EKW / CMD KW Engine)",
    used: a.kwLegal.available,
    purpose: "stan prawny: własność (dz. II), obciążenia (dz. III), hipoteki (dz. IV)",
    dataLevel: a.kwLegal.kwNumber ? `KW ${a.kwLegal.kwNumber}` : "—",
    period: "",
    status: a.kwLegal.available ? "success" : "no_data",
  });
  sources.push({
    source: "Analiza właściciela (PESEL + tablice trwania życia GUS)",
    used: a.owner.peselValid,
    purpose: "wiek/płeć właściciela i aktuarialne ryzyko dożycia/sukcesji",
    dataLevel: a.owner.age != null ? `wiek ${a.owner.age}, e(x) ${a.owner.lifeExpectancy.remainingYears ?? "—"} lat` : "brak PESEL",
    period: "GUS 2022",
    status: a.owner.peselValid ? "success" : "no_data",
  });
  sources.push({
    source: "Korespondencja z klientem (e-mail / DM / transkrypcje)",
    used: a.correspondence.available,
    purpose: "analiza behawioralna, sygnały ostrzegawcze i niespójności",
    dataLevel: `${a.correspondence.messagesAnalyzed} wiadomości${a.correspondence.channels.length ? " (" + a.correspondence.channels.join(", ") + ")" : ""}`,
    period: "",
    status: a.correspondence.available ? "success" : a.correspondence.messagesAnalyzed > 0 ? "partial" : "no_data",
  });

  // Źródła z analizy zabezpieczenia (Google Maps, ISOK/Wody Polskie, Perplexity wstępna) — przenieś, by uniknąć duplikatów.
  if (a.collateral?.dataSourcesUsed?.length) {
    for (const s of a.collateral.dataSourcesUsed) {
      if (/perplexity/i.test(s.source)) continue; // wycenę nadrzędną raportujemy osobno
      sources.push(s);
    }
  }

  sources.push({
    source: "Perplexity (sonar-pro) — nadrzędna wycena i opinia o ryzyku",
    used: a.master.status === "success",
    purpose: "domknięcie wyceny i rekomendacji na bazie pełnego dossier + rynku",
    dataLevel: a.master.citations.length ? `${a.master.citations.length} źródeł online` : "—",
    period: "ostatnie 12 mies.",
    status: a.master.status === "success" ? "success" : a.master.status === "no_data" ? "no_data" : "error",
    note: a.master.status === "success" ? recommendationLabel(a.master.recommendation) : a.master.errorMessage,
  });

  return sources;
}

function dedupeStr(arr: string[]): string[] {
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))];
}

export const getInvestmentRiskAssessment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    try {
      const { data: row } = await db
        .from("investment_risk_assessments")
        .select("*")
        .eq("application_id", data.applicationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return row ?? null;
    } catch {
      // Tabela może jeszcze nie istnieć (migracja niezastosowana) — degraduj miękko.
      return null;
    }
  });
