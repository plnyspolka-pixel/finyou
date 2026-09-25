// Server functions modułu „Analityka" panelu inwestora.
//
// Pipeline analityczny (pobranie KW → właściciele → analiza KW → analiza
// ryzyka) to ten sam silnik, którym posługuje się panel admina
// (lib/analysis-pipeline/engine.server + cron tick). Tu inwestor dostaje:
//  • listę okazji/wniosków, do których ma dostęp, ze stanem przebiegu,
//  • szczegóły: treść KW, właściciele, raport analizy KW, prognoza wartości,
//  • uruchomienie przebiegu na żądanie (limit: 1 przebieg / wniosek / 24 h).
//
// Zakres dostępu (serwer, niezależnie od UI) — wyłącznie wnioski wybrane dla
// tego inwestora, nigdy cała pula Finance You:
//  (a) okazja ujawniona w cyklu Zlecenia (status rezerwacja/transakcja),
//  (b) wniosek, do którego inwestor złożył ofertę,
//  (c) wniosek przekazany mu przez zespół (wysłana dystrybucja oferty).
// Pełny dostęp (abonament) NIE otwiera analityki wszystkich wniosków
// dopuszczonych do inwestorów — analityka to narzędzie inwestora do jego
// spraw, a nie wgląd w portfel platformy.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { compactKwNumber, formatKwNumber, normalizeKwNumber } from "@/lib/kw";
import type { CoOwnersAnalysis } from "@/lib/coowners/types";
import type { KwAnalysisResult } from "@/lib/kw-analysis/types";
import type { PropertyAnalysisResult } from "@/lib/property-analysis/types";
import type { InvestmentRiskAssessment } from "@/lib/risk-assessment/types";
import type {
  AnalyticsCoOwners,
  AnalyticsDetail,
  AnalyticsListItem,
  AnalyticsResultFlags,
  AnalyticsRun,
  AnalyticsSource,
} from "./types";

/** Minimalny odstęp między przebiegami zlecanymi z panelu inwestora. */
const RUN_COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** Statusy dystrybucji, w których wniosek faktycznie trafił do inwestora. */
const UNSENT_DISTRIBUTION_STATUSES = ["szkic", "gotowe_do_wysylki"];

const loose = (c: unknown) => c as any;

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return loose(supabaseAdmin);
}

const APP_SELECT =
  "id, loan_amount, preferred_period_months, annual_investor_rate, estimated_ltv, available_to_investors, visibility_level, deleted_at, created_at, location_potential_score, properties(property_type, city, voivodeship, estimated_value, area_sqm, land_register_number)";

interface Scope {
  offerAppIds: Set<string>;
  sharedAppIds: Set<string>;
  matchByApp: Map<string, { projectRef: string | null }>;
}

/** Zakres wniosków inwestora: ujawnione okazje + jego oferty + wnioski mu przekazane. */
async function loadScope(db: any, userId: string): Promise<Scope> {
  const [{ data: inv }, { data: orders }] = await Promise.all([
    db.from("investors").select("id").eq("user_id", userId).maybeSingle(),
    db.from("investor_orders").select("id").eq("user_id", userId),
  ]);

  const offerAppIds = new Set<string>();
  const sharedAppIds = new Set<string>();
  if (inv?.id) {
    const [{ data: offers }, { data: distributions }] = await Promise.all([
      db.from("investor_offers").select("loan_application_id").eq("investor_id", inv.id),
      db
        .from("offer_distributions")
        .select("loan_application_id, distribution_status")
        .eq("investor_id", inv.id)
        .not("distribution_status", "in", `(${UNSENT_DISTRIBUTION_STATUSES.join(",")})`),
    ]);
    for (const o of (offers ?? []) as { loan_application_id: string | null }[]) {
      if (o.loan_application_id) offerAppIds.add(o.loan_application_id);
    }
    for (const d of (distributions ?? []) as { loan_application_id: string | null }[]) {
      if (d.loan_application_id) sharedAppIds.add(d.loan_application_id);
    }
  }

  const matchByApp = new Map<string, { projectRef: string | null }>();
  const orderIds = ((orders ?? []) as { id: string }[]).map((o) => o.id);
  if (orderIds.length > 0) {
    // Dane identyfikujące projekt inwestor ma dopiero po Ujawnieniu
    // (status rezerwacja/transakcja) — wcześniej analityka byłaby wyciekiem.
    const { data: matches } = await db
      .from("investor_order_matches")
      .select("application_id, project_ref, status, created_at")
      .in("order_id", orderIds)
      .in("status", ["rezerwacja", "transakcja"])
      .order("created_at", { ascending: false });
    for (const m of (matches ?? []) as { application_id: string; project_ref: string | null }[]) {
      if (!matchByApp.has(m.application_id)) {
        matchByApp.set(m.application_id, { projectRef: m.project_ref ?? null });
      }
    }
  }

  return { offerAppIds, sharedAppIds, matchByApp };
}

function isInvestorVisible(app: any): boolean {
  return (
    Boolean(app?.available_to_investors) &&
    app?.visibility_level === "zanonimizowane" &&
    app?.deleted_at == null
  );
}

/** Źródło dostępu do wniosku albo null, gdy inwestor nie ma do niego prawa. */
function sourceFor(scope: Scope, app: any): AnalyticsSource | null {
  if (!app || app.deleted_at != null) return null;
  if (scope.matchByApp.has(app.id)) return "okazja";
  if (scope.offerAppIds.has(app.id)) return "oferta";
  if (scope.sharedAppIds.has(app.id)) return "przekazany";
  return null;
}

function toRun(r: any): AnalyticsRun | null {
  if (!r) return null;
  return {
    id: String(r.id),
    kwNumber: String(r.kw_number ?? ""),
    status: r.status === "done" ? "done" : r.status === "error" ? "error" : "running",
    steps: (r.steps ?? {}) as AnalyticsRun["steps"],
    triggerReason: r.trigger_reason ?? null,
    error: r.error ?? null,
    startedAt: String(r.started_at),
    finishedAt: r.finished_at ?? null,
  };
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function propertyOf(app: any): any {
  const p = app?.properties;
  return Array.isArray(p) ? (p[0] ?? null) : (p ?? null);
}

interface ResultIndex {
  runByApp: Map<string, any>;
  kwAnalysisByApp: Map<string, { overall_status: string; created_at: string }>;
  coownersApps: Set<string>;
  riskApps: Set<string>;
  collateralApps: Set<string>;
  kwFetchedCompact: Set<string>;
}

/** Jednym zestawem zapytań: najnowszy przebieg i flagi wyników dla wielu wniosków. */
async function loadResultIndex(db: any, apps: any[]): Promise<ResultIndex> {
  const ids = apps.map((a) => a.id);
  const compacts = [
    ...new Set(
      apps
        .map((a) => compactKwNumber(propertyOf(a)?.land_register_number ?? ""))
        .filter((c): c is string => Boolean(c)),
    ),
  ];
  const empty = { data: [] as any[] };
  const [runs, kwa, co, risk, coll, kwDocs] = await Promise.all([
    ids.length
      ? db
          .from("analysis_pipeline_runs")
          .select(
            "id, loan_application_id, kw_number, status, steps, trigger_reason, error, started_at, finished_at",
          )
          .in("loan_application_id", ids)
          .order("started_at", { ascending: false })
      : empty,
    ids.length
      ? db
          .from("kw_land_register_analyses")
          .select("loan_application_id, overall_status, created_at")
          .in("loan_application_id", ids)
          .order("created_at", { ascending: false })
      : empty,
    ids.length
      ? db.from("coowner_registry_checks").select("application_id").in("application_id", ids)
      : empty,
    ids.length
      ? db.from("investment_risk_assessments").select("application_id").in("application_id", ids)
      : empty,
    ids.length
      ? db.from("property_analyses").select("application_id").in("application_id", ids)
      : empty,
    compacts.length
      ? db.from("kw_documents").select("kw_number, status, fetched_at").in("kw_number", compacts)
      : empty,
  ]);

  const runByApp = new Map<string, any>();
  for (const r of (runs.data ?? []) as any[]) {
    if (!runByApp.has(r.loan_application_id)) runByApp.set(r.loan_application_id, r);
  }
  const kwAnalysisByApp = new Map<string, { overall_status: string; created_at: string }>();
  for (const r of (kwa.data ?? []) as any[]) {
    if (!kwAnalysisByApp.has(r.loan_application_id)) {
      kwAnalysisByApp.set(r.loan_application_id, {
        overall_status: r.overall_status,
        created_at: r.created_at,
      });
    }
  }
  const kwFetchedCompact = new Set<string>();
  for (const d of (kwDocs.data ?? []) as any[]) {
    if (d.status === "ready" || d.fetched_at) kwFetchedCompact.add(String(d.kw_number));
  }
  return {
    runByApp,
    kwAnalysisByApp,
    coownersApps: new Set(((co.data ?? []) as any[]).map((r) => String(r.application_id))),
    riskApps: new Set(((risk.data ?? []) as any[]).map((r) => String(r.application_id))),
    collateralApps: new Set(((coll.data ?? []) as any[]).map((r) => String(r.application_id))),
    kwFetchedCompact,
  };
}

function buildItem(app: any, source: AnalyticsSource, scope: Scope, idx: ResultIndex) {
  const p = propertyOf(app);
  const kwRaw = String(p?.land_register_number ?? "");
  const kwNorm = normalizeKwNumber(kwRaw);
  const compact = compactKwNumber(kwRaw);
  const kwa = idx.kwAnalysisByApp.get(app.id) ?? null;
  const results: AnalyticsResultFlags = {
    kwFetched: Boolean(compact && idx.kwFetchedCompact.has(compact)),
    kwAnalysisStatus: (kwa?.overall_status as AnalyticsResultFlags["kwAnalysisStatus"]) ?? null,
    coowners: idx.coownersApps.has(app.id),
    risk: idx.riskApps.has(app.id),
    collateral: idx.collateralApps.has(app.id),
  };
  const item: AnalyticsListItem = {
    id: String(app.id),
    source,
    projectRef: scope.matchByApp.get(app.id)?.projectRef ?? null,
    loanAmount: num(app.loan_amount),
    periodMonths: num(app.preferred_period_months),
    annualRate: num(app.annual_investor_rate),
    ltv: num(app.estimated_ltv),
    propertyType: p?.property_type ?? null,
    city: p?.city ?? null,
    voivodeship: p?.voivodeship ?? null,
    estimatedValue: num(p?.estimated_value),
    areaSqm: num(p?.area_sqm),
    kwNumber: kwNorm ? (formatKwNumber(kwNorm) ?? kwNorm) : null,
    locationScore: num(app.location_potential_score),
    availableToInvestors: isInvestorVisible(app),
    createdAt: String(app.created_at),
    run: toRun(idx.runByApp.get(app.id)),
    results,
  };
  return item;
}

const SOURCE_ORDER: Record<AnalyticsSource, number> = { okazja: 0, oferta: 1, przekazany: 2 };

/** Lista wniosków w zasięgu inwestora ze stanem pipeline'u analitycznego. */
export const listMyAnalyticsApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AnalyticsListItem[]> => {
    const userId = context.userId as string;
    const db = await adminDb();
    const scope = await loadScope(db, userId);

    const ids = [
      ...new Set([...scope.matchByApp.keys(), ...scope.offerAppIds, ...scope.sharedAppIds]),
    ];
    const { data } = ids.length
      ? await db.from("loan_applications").select(APP_SELECT).in("id", ids)
      : { data: [] as any[] };

    // Jak w dawnej wyszukiwarce: tylko wnioski z nieruchomością i sensowną kwotą.
    const apps = ((data ?? []) as any[]).filter((a) => {
      const p = propertyOf(a);
      return Boolean(p?.property_type) && Number(a.loan_amount) > 0;
    });

    const idx = await loadResultIndex(db, apps);
    const items: AnalyticsListItem[] = [];
    for (const app of apps) {
      const source = sourceFor(scope, app);
      if (!source) continue;
      items.push(buildItem(app, source, scope, idx));
    }
    items.sort(
      (a, b) =>
        SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] ||
        Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
    return items;
  });

/** Wniosek w zasięgu inwestora albo błąd — wspólna bramka szczegółów i uruchomienia. */
async function loadAccessibleApp(db: any, userId: string, applicationId: string) {
  const scope = await loadScope(db, userId);
  const { data: app, error } = await db
    .from("loan_applications")
    .select(APP_SELECT)
    .eq("id", applicationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const source = sourceFor(scope, app);
  if (!source) throw new Error("Brak dostępu do analityki tego wniosku.");
  return { scope, app, source };
}

function runGate(
  run: AnalyticsRun | null,
  kwValid: boolean,
): { ok: boolean; reason: string | null } {
  if (!kwValid) {
    return { ok: false, reason: "Wniosek nie ma poprawnego numeru księgi wieczystej." };
  }
  if (run?.status === "running") {
    return { ok: false, reason: "Przebieg pipeline'u jest w toku — wyniki pojawią się poniżej." };
  }
  if (run && Date.now() - Date.parse(run.startedAt) < RUN_COOLDOWN_MS) {
    const next = new Date(Date.parse(run.startedAt) + RUN_COOLDOWN_MS);
    return {
      ok: false,
      reason: `Analizę uruchamiano w ciągu ostatnich 24 h. Kolejny przebieg możliwy od ${next.toLocaleString("pl-PL")}.`,
    };
  }
  return { ok: true, reason: null };
}

function reduceCoOwners(r: CoOwnersAnalysis | null | undefined): AnalyticsCoOwners | null {
  if (!r || !r.available) return null;
  const flagLabels: Record<string, string> = {
    liquidation: "likwidacja",
    bankruptcy: "upadłość",
    restructuring: "restrukturyzacja",
  };
  return {
    totalOwnersInKw: Number(r.totalOwnersInKw ?? 0),
    summary: String(r.summary ?? ""),
    warnings: Array.isArray(r.warnings) ? r.warnings.map(String) : [],
    generatedAt: String(r.generatedAt ?? ""),
    owners: (r.checked ?? []).map((c) => ({
      fullName: c.fullName ?? null,
      share: c.share ?? null,
      coOwnershipType: c.coOwnershipType ?? null,
      isPrimaryClient: Boolean(c.isPrimaryClient),
      businessStatus:
        c.ceidg && c.ceidg.available && c.ceidg.queried !== "none"
          ? c.ceidg.isEntrepreneur
            ? `działalność gospodarcza: ${c.ceidg.status}`
            : "brak aktywnej działalności w CEIDG"
          : null,
      krs: (c.krs?.hits ?? []).map((h) => ({
        companyName: h.companyName,
        role: h.role ?? null,
        flags: Object.entries(h.flags ?? {})
          .filter(([, v]) => Boolean(v))
          .map(([k]) => flagLabels[k] ?? k),
      })),
      notes: Array.isArray(c.notes) ? c.notes.map(String) : [],
    })),
  };
}

/** Szczegóły pipeline'u dla jednego wniosku: KW, właściciele, analiza KW, ryzyko. */
export const getMyAnalyticsDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<AnalyticsDetail> => {
    const userId = context.userId as string;
    const db = await adminDb();
    const { scope, app, source } = await loadAccessibleApp(db, userId, data.applicationId);
    const idx = await loadResultIndex(db, [app]);
    const item = buildItem(app, source, scope, idx);

    const compact = compactKwNumber(propertyOf(app)?.land_register_number ?? "");
    const { decodeMaybeBase64 } = await import("@/lib/kw-fetch.server");

    const [kwDoc, kwa, co, risk, coll] = await Promise.all([
      compact
        ? db
            .from("kw_documents")
            .select(
              "status, okladka, dzial_1o, dzial_1s, dzial_2, dzial_3, dzial_4, fetched_at, last_error",
            )
            .eq("kw_number", compact)
            .maybeSingle()
        : { data: null },
      db
        .from("kw_land_register_analyses")
        .select("result_json, created_at")
        .eq("loan_application_id", app.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("coowner_registry_checks")
        .select("result_json")
        .eq("application_id", app.id)
        .maybeSingle(),
      db
        .from("investment_risk_assessments")
        .select("result_json")
        .eq("application_id", app.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("property_analyses")
        .select("result_json")
        .eq("application_id", app.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const d = kwDoc.data;
    const sections = d
      ? {
          okladka: decodeMaybeBase64(d.okladka),
          dzial_1o: decodeMaybeBase64(d.dzial_1o),
          dzial_1s: decodeMaybeBase64(d.dzial_1s),
          dzial_2: decodeMaybeBase64(d.dzial_2),
          dzial_3: decodeMaybeBase64(d.dzial_3),
          dzial_4: decodeMaybeBase64(d.dzial_4),
        }
      : null;
    const hasContent = Boolean(sections && Object.values(sections).some(Boolean));
    const kwDocument = d
      ? {
          // Raz pobrana treść nie znika przez nieudane odświeżenie (jak w getKwForApplication).
          status: hasContent && d.status !== "processing" ? "ready" : String(d.status),
          fetchedAt: d.fetched_at ?? null,
          lastError: d.last_error ?? null,
          sections: sections!,
        }
      : null;

    let valuation: AnalyticsDetail["valuation"] = null;
    const riskJson = risk.data?.result_json as InvestmentRiskAssessment | undefined;
    if (riskJson) {
      const { buildInvestorValuationSummary } =
        await import("@/lib/risk-assessment/risk-assessment.functions");
      valuation = buildInvestorValuationSummary(riskJson);
    }

    const gate = runGate(item.run, Boolean(item.kwNumber));
    return {
      item,
      kwDocument,
      kwAnalysis: kwa.data?.result_json
        ? {
            result: kwa.data.result_json as KwAnalysisResult,
            createdAt: String(kwa.data.created_at),
          }
        : null,
      coowners: reduceCoOwners(co.data?.result_json as CoOwnersAnalysis | null),
      valuation,
      collateral: (coll.data?.result_json as PropertyAnalysisResult | undefined) ?? null,
      canRequestRun: gate.ok,
      runBlockedReason: gate.reason,
    };
  });

/**
 * Uruchomienie pipeline'u na żądanie inwestora. Przebieg zakłada się w tej
 * samej tabeli co automat i re-run z panelu admina — dokończy go cron tick
 * (co 15 min). Limit: jeden przebieg na wniosek na 24 h.
 */
export const requestInvestorAnalysisRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true; status: "queued" | "running" }> => {
    const userId = context.userId as string;
    const db = await adminDb();
    const { app } = await loadAccessibleApp(db, userId, data.applicationId);

    const kwNumber = normalizeKwNumber(String(propertyOf(app)?.land_register_number ?? ""));
    const { data: latest } = await db
      .from("analysis_pipeline_runs")
      .select("id, kw_number, status, started_at")
      .eq("loan_application_id", app.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const gate = runGate(toRun(latest), Boolean(kwNumber));
    if (!gate.ok) {
      if (latest?.status === "running") return { ok: true, status: "running" };
      throw new Error(gate.reason ?? "Nie można uruchomić analizy.");
    }

    const { error } = await db.from("analysis_pipeline_runs").insert({
      loan_application_id: app.id,
      kw_number: kwNumber,
      status: "running",
      steps: {},
      trigger_reason: "inwestor: na żądanie z modułu Analityka",
    });
    if (error) throw new Error(error.message);
    return { ok: true, status: "queued" };
  });
