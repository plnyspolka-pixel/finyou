// „Moje zlecenia" — Projekty do Zleceń inwestora (Etap U2, bez klikania admina).
//
// Dla każdego przyjętego Zlecenia pokazujemy Projekty (wnioski) w kwocie do
// kwoty Zlecenia, utworzone nie wcześniej niż 3 dni przed złożeniem Zlecenia,
// razem ze zdjęciami/dokumentami, potencjałem lokalizacyjnym i zamaskowaną KW.
// Inwestor zamawia raport analityczny (pipeline; gotowy przebieg jest
// reużywany — księga nie jest pobierana ponownie) i jednym przyciskiem
// pobiera dane kontaktowe i rezerwuje Projekt (Dopasowanie → Karta Leada →
// Karta Transferu → Ujawnienie → rezerwacja).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { InvestmentRiskAssessment } from "@/lib/risk-assessment/types";
import type { InvestorValuationSummary } from "@/lib/risk-assessment/risk-assessment.functions";
import {
  ACTIVE_MATCH_STATUSES,
  TEASER_VISIBLE_MATCH_STATUSES,
  amountMatchesOrder,
  consumerKaraStatement,
  orderLimitsFromSettings,
  reservationDeadline,
} from "./order-cycle-core";
import {
  insertMatch,
  issueTransferCard,
  logCycleEvent,
  requestMeta,
  transition,
} from "./order-cycle.functions";
import { getModuleSettings } from "@/lib/projects/guards.server";

const loose = (c: unknown) => c as any;

/** Okno „świeżości" Projektu względem złożenia Zlecenia. */
export const PROJECT_WINDOW_DAYS_BEFORE_ORDER = 3;

export interface OrderProjectFile {
  url: string;
  name: string;
}

export interface OrderProjectReport {
  status: "none" | "running" | "done" | "error";
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  locationScore: number | null;
  kwAnalysis: {
    createdAt: string | null;
    overallStatus: string;
    unresolvedCount: number;
    findings: Array<{ title: string; status: string; category: string; investorMessage: string }>;
  } | null;
  owners: { totalInKw: number | null; summary: string | null; warnings: string[] } | null;
  valuation: InvestorValuationSummary | null;
}

export interface OrderProjectContact {
  name: string | null;
  phone: string | null;
  email: string | null;
}

export interface OrderProject {
  applicationId: string;
  orderId: string;
  createdAt: string;
  loanAmount: number | null;
  periodMonths: number | null;
  annualRate: number | null;
  ltv: number | null;
  propertyType: string | null;
  city: string | null;
  voivodeship: string | null;
  estimatedValue: number | null;
  areaSqm: number | null;
  description: string | null;
  locationScore: number | null;
  kwMasked: string | null;
  hasKw: boolean;
  photos: OrderProjectFile[];
  files: OrderProjectFile[];
  report: OrderProjectReport;
  match: {
    id: string;
    projectRef: string;
    status: string;
    reservationExpiresAt: string | null;
  } | null;
  /** Dane kontaktowe — tylko po Ujawnieniu (rezerwacja / transakcja). */
  contact: OrderProjectContact | null;
}

export interface MyOrderProjectsResult {
  orders: Array<{
    id: string;
    orderSeq: number;
    amountPln: number;
    status: string;
    submittedAt: string | null;
    expiresAt: string | null;
    projects: OrderProject[];
  }>;
  isConsumer: boolean;
  limits: ReturnType<typeof orderLimitsFromSettings>;
}

const APP_SELECT =
  "id, created_at, loan_amount, preferred_period_months, annual_investor_rate, estimated_ltv, situation_description, investor_description, location_potential_score, client_id, status, deleted_at, properties(property_type, city, voivodeship, estimated_value, area_sqm, land_register_number, photos, created_at)";

function propertyOf(app: any): any | null {
  const list = Array.isArray(app?.properties) ? app.properties : app?.properties ? [app.properties] : [];
  if (list.length === 0) return null;
  return [...list].sort((a, b) =>
    String(a?.created_at ?? "").localeCompare(String(b?.created_at ?? "")),
  )[0];
}

const DISCLOSED_STATUSES = ["rezerwacja", "transakcja"];

async function myAcceptedOrder(db: any, userId: string, orderId: string) {
  const { data: order } = await loose(db)
    .from("investor_orders")
    .select("id, order_seq, user_id, amount_pln, status, expires_at, submitted_at")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.user_id !== userId) throw new Error("Nie znaleziono Zlecenia.");
  if (order.status !== "przyjete") throw new Error("Zlecenie nie jest przyjęte.");
  if (order.expires_at && new Date(order.expires_at).getTime() < Date.now()) {
    throw new Error("Zlecenie wygasło.");
  }
  return order;
}

function windowStart(order: { submitted_at?: string | null }): Date {
  const base = order.submitted_at ? new Date(order.submitted_at) : new Date();
  return new Date(base.getTime() - PROJECT_WINDOW_DAYS_BEFORE_ORDER * 24 * 3600 * 1000);
}

/** Czy Projekt kwalifikuje się do Zlecenia (kwota + okno czasowe). */
function appFitsOrder(order: any, app: any): boolean {
  if (!amountMatchesOrder(Number(order.amount_pln), Number(app.loan_amount ?? 0))) return false;
  return new Date(app.created_at).getTime() >= windowStart(order).getTime();
}

/** Zdjęcia i pliki klienta — podpisane po stronie serwera (bucket prywatny). */
async function loadProjectFiles(
  db: any,
  appId: string,
  photoPaths: string[] | null,
): Promise<{ photos: OrderProjectFile[]; files: OrderProjectFile[] }> {
  const { data: docRows } = await loose(db)
    .from("documents")
    .select("file_path, file_url, file_name")
    .eq("loan_application_id", appId)
    .order("created_at", { ascending: true });
  const { collectClientFileRefs, isShowablePropertyPhoto, IMAGE_EXT } =
    await import("@/lib/property-photos");
  const { CLIENT_FILES_BUCKET } = await import("@/lib/storage-buckets");
  const refs = collectClientFileRefs(photoPaths ?? null, docRows ?? []);

  const urlByPath = new Map<string, string>();
  let unsigned = refs.map((f) => f.src).filter((s) => !/^https?:\/\//i.test(s));
  refs.forEach((f) => {
    if (/^https?:\/\//i.test(f.src)) urlByPath.set(f.src, f.src);
  });
  for (const bucket of [CLIENT_FILES_BUCKET, "documents", "property-photos"]) {
    if (unsigned.length === 0) break;
    const { data: signed } = await db.storage.from(bucket).createSignedUrls(unsigned, 6 * 3600);
    (signed ?? []).forEach((s: { path?: string | null; signedUrl?: string | null }) => {
      if (s?.path && s?.signedUrl) urlByPath.set(s.path, s.signedUrl);
    });
    unsigned = unsigned.filter((path) => !urlByPath.has(path));
  }

  const photos: OrderProjectFile[] = [];
  const files: OrderProjectFile[] = [];
  for (const f of refs) {
    const url = urlByPath.get(f.src);
    if (!url) continue;
    const isPhoto =
      (IMAGE_EXT.test(f.name) || IMAGE_EXT.test(f.src)) && isShowablePropertyPhoto(f.src);
    (isPhoto ? photos : files).push({ url, name: f.name });
  }
  return { photos, files };
}

/** Raport analityczny Projektu: stan przebiegu + wyniki kroków pipeline'u. */
async function loadProjectReport(
  db: any,
  appId: string,
  locationScore: number | null,
): Promise<OrderProjectReport> {
  const [{ data: run }, { data: kwAn }, { data: coRow }, { data: raRow }] = await Promise.all([
    loose(db)
      .from("analysis_pipeline_runs")
      .select("id, status, error, started_at, finished_at")
      .eq("loan_application_id", appId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    loose(db)
      .from("kw_land_register_analyses")
      .select("created_at, overall_status, unresolved_finding_count, result_json")
      .eq("loan_application_id", appId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    loose(db)
      .from("coowner_registry_checks")
      .select("result_json, warnings")
      .eq("application_id", appId)
      .maybeSingle(),
    loose(db)
      .from("investment_risk_assessments")
      .select("result_json")
      .eq("application_id", appId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let valuation: InvestorValuationSummary | null = null;
  const riskJson = raRow?.result_json as InvestmentRiskAssessment | undefined;
  if (riskJson) {
    const { buildInvestorValuationSummary } =
      await import("@/lib/risk-assessment/risk-assessment.functions");
    valuation = buildInvestorValuationSummary(riskJson);
  }
  const co = coRow?.result_json as any;
  const hasResults = Boolean(kwAn?.result_json || co || valuation);
  const status: OrderProjectReport["status"] = run
    ? run.status === "running"
      ? "running"
      : run.status === "done" || hasResults
        ? "done"
        : "error"
    : hasResults
      ? "done"
      : "none";

  return {
    status,
    startedAt: run?.started_at ?? null,
    finishedAt: run?.finished_at ?? null,
    error: status === "error" ? (run?.error ?? null) : null,
    locationScore,
    kwAnalysis: kwAn?.result_json
      ? {
          createdAt: kwAn.created_at ?? null,
          overallStatus: String(kwAn.overall_status ?? "OK"),
          unresolvedCount: Number(kwAn.unresolved_finding_count ?? 0),
          findings: ((kwAn.result_json?.findings ?? []) as any[]).map((f) => ({
            title: String(f.title ?? ""),
            status: String(f.status ?? ""),
            category: String(f.category ?? ""),
            investorMessage: String(f.investorMessage ?? f.plainLanguageSummary ?? ""),
          })),
        }
      : null,
    owners: co
      ? {
          totalInKw: co.totalOwnersInKw ?? null,
          summary: co.summary ?? null,
          warnings: ((coRow?.warnings ?? co.warnings ?? []) as string[]).map(String),
        }
      : null,
    valuation,
  };
}

async function loadContact(db: any, clientId: string | null): Promise<OrderProjectContact | null> {
  if (!clientId) return null;
  const { data: c } = await loose(db)
    .from("clients")
    .select("first_name, last_name, phone, email")
    .eq("id", clientId)
    .maybeSingle();
  if (!c) return null;
  return {
    name: [c.first_name, c.last_name].filter(Boolean).join(" ") || null,
    phone: c.phone ?? null,
    email: c.email ?? null,
  };
}

/** Wniosek istnieje tylko z pełnymi danymi klienta — bez imienia, nazwiska
 *  i telefonu Projekt nie trafia na listę ani do rezerwacji. */
function contactComplete(c: OrderProjectContact | null): boolean {
  return Boolean(c && c.name && c.name.includes(" ") && c.phone);
}

async function loadContactsByClient(
  db: any,
  clientIds: string[],
): Promise<Map<string, OrderProjectContact>> {
  const out = new Map<string, OrderProjectContact>();
  const ids = [...new Set(clientIds.filter(Boolean))];
  if (ids.length === 0) return out;
  const { data } = await loose(db)
    .from("clients")
    .select("id, first_name, last_name, phone, email")
    .in("id", ids);
  for (const c of data ?? []) {
    out.set(c.id, {
      name: [c.first_name, c.last_name].filter(Boolean).join(" ") || null,
      phone: c.phone ?? null,
      email: c.email ?? null,
    });
  }
  return out;
}

async function buildProject(
  db: any,
  order: any,
  app: any,
  match: any | null,
): Promise<OrderProject> {
  const p = propertyOf(app);
  const { maskKwRaw } = await import("@/lib/location-scoring/masking");
  const kwRaw = String(p?.land_register_number ?? "").trim();
  const locationScore =
    app.location_potential_score != null ? Number(app.location_potential_score) : null;
  const disclosed = Boolean(match && DISCLOSED_STATUSES.includes(match.status));
  const [{ photos, files }, report, contact] = await Promise.all([
    loadProjectFiles(db, app.id, (p?.photos as string[] | null) ?? null),
    loadProjectReport(db, app.id, locationScore),
    disclosed ? loadContact(db, app.client_id ?? null) : Promise.resolve(null),
  ]);
  return {
    applicationId: app.id,
    orderId: order.id,
    createdAt: app.created_at,
    loanAmount: app.loan_amount != null ? Number(app.loan_amount) : null,
    periodMonths: app.preferred_period_months != null ? Number(app.preferred_period_months) : null,
    annualRate: app.annual_investor_rate != null ? Number(app.annual_investor_rate) : null,
    ltv: app.estimated_ltv != null ? Number(app.estimated_ltv) : null,
    propertyType: p?.property_type ?? null,
    city: p?.city ?? null,
    voivodeship: p?.voivodeship ?? null,
    estimatedValue: p?.estimated_value != null ? Number(p.estimated_value) : null,
    areaSqm: p?.area_sqm != null ? Number(p.area_sqm) : null,
    description: app.investor_description ?? app.situation_description ?? null,
    locationScore,
    kwMasked: kwRaw ? maskKwRaw(kwRaw) : null,
    hasKw: Boolean(kwRaw),
    photos,
    files,
    report,
    match: match
      ? {
          id: match.id,
          projectRef: match.project_ref,
          status: match.status,
          reservationExpiresAt: match.reservation_expires_at ?? null,
        }
      : null,
    contact,
  };
}

/** Projekty do moich przyjętych Zleceń (okno 3 dni przed Zleceniem + już dopasowane). */
export const getMyOrderProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyOrderProjectsResult> => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { CANDIDATE_DB_STATUSES } = await import("@/lib/auto-distribution/engine.server");

    const [{ data: orders }, { data: investor }] = await Promise.all([
      loose(supabaseAdmin)
        .from("investor_orders")
        .select("id, order_seq, amount_pln, status, expires_at, submitted_at")
        .eq("user_id", userId)
        .order("submitted_at", { ascending: false }),
      loose(supabaseAdmin)
        .from("investors")
        .select("is_consumer")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    const limits = orderLimitsFromSettings(await getModuleSettings());
    const now = Date.now();
    const accepted = (orders ?? []).filter(
      (o: any) =>
        o.status === "przyjete" && (!o.expires_at || new Date(o.expires_at).getTime() >= now),
    );
    const orderIds = (orders ?? []).map((o: any) => o.id);

    // Dopasowania moich Zleceń + Projekty zajęte przez innych zleceniodawców.
    const [{ data: myMatches }, { data: busy }] = await Promise.all([
      orderIds.length > 0
        ? loose(supabaseAdmin)
            .from("investor_order_matches")
            .select("id, order_id, application_id, project_ref, status, reservation_expires_at")
            .in("order_id", orderIds)
            .in("status", TEASER_VISIBLE_MATCH_STATUSES)
        : Promise.resolve({ data: [] }),
      loose(supabaseAdmin)
        .from("investor_order_matches")
        .select("application_id, order_id")
        .in("status", ACTIVE_MATCH_STATUSES),
    ]);
    const myOrderIdSet = new Set(orderIds);
    const busyElsewhere = new Set(
      (busy ?? []).filter((m: any) => !myOrderIdSet.has(m.order_id)).map((m: any) => m.application_id),
    );

    // Kandydaci: od najwcześniejszego okna wśród przyjętych Zleceń.
    let apps: any[] = [];
    const matchedAppIds = new Set((myMatches ?? []).map((m: any) => m.application_id));
    if (accepted.length > 0) {
      const earliest = accepted
        .map((o: any) => windowStart(o).getTime())
        .reduce((a: number, b: number) => Math.min(a, b));
      const { data } = await loose(supabaseAdmin)
        .from("loan_applications")
        .select(APP_SELECT)
        .in("status", CANDIDATE_DB_STATUSES)
        .is("deleted_at", null)
        .gte("created_at", new Date(earliest).toISOString())
        .order("created_at", { ascending: false })
        .limit(300);
      apps = data ?? [];
    }
    // Projekty już dopasowane (także spoza okna / statusów kandydata).
    const missing = [...matchedAppIds].filter((id) => !apps.some((a) => a.id === id));
    if (missing.length > 0) {
      const { data } = await loose(supabaseAdmin)
        .from("loan_applications")
        .select(APP_SELECT)
        .in("id", missing);
      apps = [...apps, ...(data ?? [])];
    }

    // Tylko wnioski z kompletem danych klienta (imię, nazwisko, telefon).
    const contacts = await loadContactsByClient(
      supabaseAdmin,
      apps.map((a) => a.client_id as string),
    );
    apps = apps.filter((a) => contactComplete(contacts.get(a.client_id) ?? null));

    const result: MyOrderProjectsResult["orders"] = [];
    for (const o of orders ?? []) {
      const projects: OrderProject[] = [];
      if (accepted.includes(o)) {
        const seen = new Set<string>();
        for (const app of apps) {
          if (app.deleted_at || seen.has(app.id)) continue;
          const match =
            (myMatches ?? []).find(
              (m: any) => m.order_id === o.id && m.application_id === app.id,
            ) ?? null;
          if (!match) {
            if (!appFitsOrder(o, app) || busyElsewhere.has(app.id)) continue;
            // Projekt aktywny w innym moim Zleceniu — pokazujemy tylko tam.
            if ((myMatches ?? []).some((m: any) => m.application_id === app.id)) continue;
          }
          seen.add(app.id);
          projects.push(await buildProject(supabaseAdmin, o, app, match));
        }
      }
      result.push({
        id: o.id,
        orderSeq: Number(o.order_seq),
        amountPln: Number(o.amount_pln),
        status: o.status,
        submittedAt: o.submitted_at ?? null,
        expiresAt: o.expires_at ?? null,
        projects,
      });
    }
    return { orders: result, isConsumer: Boolean(investor?.is_consumer), limits };
  });

async function eligibleApp(db: any, order: any, applicationId: string) {
  const { data: app } = await loose(db)
    .from("loan_applications")
    .select(APP_SELECT)
    .eq("id", applicationId)
    .maybeSingle();
  if (!app || app.deleted_at) throw new Error("Nie znaleziono Projektu.");
  if (!contactComplete(await loadContact(db, app.client_id ?? null))) {
    throw new Error("Projekt nie ma kompletu danych klienta (imię, nazwisko, telefon).");
  }
  const { data: match } = await loose(db)
    .from("investor_order_matches")
    .select("*")
    .eq("order_id", order.id)
    .eq("application_id", applicationId)
    .in("status", TEASER_VISIBLE_MATCH_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!match && !appFitsOrder(order, app)) {
    throw new Error("Ten Projekt nie mieści się w kwocie albo oknie czasowym Zlecenia.");
  }
  return { app, match: match ?? null };
}

/**
 * Zamówienie raportu analitycznego dla Projektu. Jeśli dla tego numeru KW
 * istnieje już przebieg (w toku lub zakończony), nie uruchamiamy nowego —
 * księga i rejestry nie są pobierane ponownie.
 */
export const orderProjectReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ orderId: z.string().uuid(), applicationId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ report: OrderProjectReport; reused: boolean }> => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const order = await myAcceptedOrder(supabaseAdmin, userId, data.orderId);
    const { app } = await eligibleApp(supabaseAdmin, order, data.applicationId);
    const locationScore =
      app.location_potential_score != null ? Number(app.location_potential_score) : null;

    const { normalizeKwNumber } = await import("@/lib/kw-fetch.server");
    const kwNumber = normalizeKwNumber(String(propertyOf(app)?.land_register_number ?? ""));
    if (!kwNumber) throw new Error("Projekt nie ma poprawnego numeru KW — raport niedostępny.");

    const { data: existing } = await loose(supabaseAdmin)
      .from("analysis_pipeline_runs")
      .select("id, status")
      .eq("loan_application_id", app.id)
      .eq("kw_number", kwNumber)
      .in("status", ["running", "done"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    let reused = Boolean(existing);
    if (!existing) {
      const { startAnalysisPipelineRunCore, advanceAnalysisPipelineRunById } =
        await import("@/lib/analysis-pipeline/engine.server");
      const run = await startAnalysisPipelineRunCore(
        app.id,
        `inwestor: raport do Zlecenia FY-Z-${order.order_seq}`,
      );
      try {
        // Kroki KW → właściciele → analiza KW od razu; ocenę ryzyka dokańcza cron.
        await advanceAnalysisPipelineRunById(run.id, { pollMaxMs: 20_000, skipRisk: true });
      } catch (e) {
        console.error("[order-projects] advance failed", e);
      }
      await logCycleEvent(supabaseAdmin, {
        orderId: order.id,
        type: "raport_zamowiony",
        payload: { application_id: app.id, run_id: run.id },
        actor: userId,
        actorKind: "inwestor",
      });
      reused = false;
    }
    return { report: await loadProjectReport(supabaseAdmin, app.id, locationScore), reused };
  });

/**
 * Jeden przycisk: „Pobierz dane kontaktowe i rezerwuj". Tworzy Dopasowanie
 * (jeśli brak), przyjmuje Kartę Leada (Konsument: + Kara Obejściowa),
 * wystawia Kartę Transferu Danych i uruchamia Ujawnienie z rezerwacją.
 */
export const reserveOrderProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        orderId: z.string().uuid(),
        applicationId: z.string().uuid(),
        // § 15 ust. 7: zgoda zawsze zaznaczana ręcznie.
        kartaLeadaConfirmed: z.literal(true),
        karaConfirmed: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const order = await myAcceptedOrder(supabaseAdmin, userId, data.orderId);
    const { app } = await eligibleApp(supabaseAdmin, order, data.applicationId);

    // Bramka: komplet dokumentów pakietu (kroki 1–5).
    const { data: complete } = await loose(supabaseAdmin).rpc("investor_legal_pack_complete", {
      _user_id: userId,
    });
    if (!complete)
      throw new Error("Najpierw zaakceptuj komplet dokumentów pakietu (/inwestor/umowy).");
    const { data: investor } = await loose(supabaseAdmin)
      .from("investors")
      .select("is_consumer")
      .eq("user_id", userId)
      .maybeSingle();
    const isConsumer = Boolean(investor?.is_consumer);
    if (isConsumer && !data.karaConfirmed) {
      throw new Error(
        "Jako Konsument musisz odrębnie potwierdzić indywidualne uzgodnienie Kary Obejściowej.",
      );
    }

    const matchFor = async () => {
      const { data: m } = await loose(supabaseAdmin)
        .from("investor_order_matches")
        .select("*")
        .eq("order_id", order.id)
        .eq("application_id", app.id)
        .in("status", TEASER_VISIBLE_MATCH_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return m ?? null;
    };
    let m = await matchFor();
    if (!m) {
      await insertMatch(supabaseAdmin, {
        orderId: order.id,
        applicationId: app.id,
        releaseTeaser: true,
        actorId: userId,
        actorKind: "system",
      });
      m = await matchFor();
      if (!m) throw new Error("Nie udało się utworzyć Dopasowania.");
    }

    const { ip, userAgent } = requestMeta();
    if (m.status === "dopasowane") {
      await transition(supabaseAdmin, m, "teaser", { teaser_released_at: new Date().toISOString() });
      m = await matchFor();
    }
    if (m.status === "teaser") {
      const now = new Date().toISOString();
      const karaStatement = isConsumer
        ? consumerKaraStatement(Number(m.teaser?.loan_amount ?? app.loan_amount ?? 100_000))
        : null;
      await transition(supabaseAdmin, m, "karta_leada", {
        karta_leada_accepted_at: now,
        karta_leada_ip: ip,
        karta_leada_user_agent: userAgent,
        kara_consumer_statement: karaStatement,
        kara_consumer_accepted_at: isConsumer ? now : null,
      });
      await logCycleEvent(supabaseAdmin, {
        matchId: m.id,
        orderId: m.order_id,
        type: "karta_leada_zaakceptowana",
        payload: { ip, user_agent: userAgent, kara_konsument: karaStatement },
        actor: userId,
        actorKind: "inwestor",
      });
      m = await matchFor();
    }
    await issueTransferCard(supabaseAdmin, m, { actorId: null, actorKind: "system" });
    if (m.status === "karta_leada") {
      const limits = orderLimitsFromSettings(await getModuleSettings());
      const now = new Date();
      const expires = reservationDeadline(now, limits.assignmentHours);
      await transition(supabaseAdmin, m, "rezerwacja", {
        disclosed_at: now.toISOString(),
        reservation_expires_at: expires.toISOString(),
      });
      await logCycleEvent(supabaseAdmin, {
        matchId: m.id,
        orderId: m.order_id,
        type: "ujawnienie_identyfikujace",
        payload: { reservation_expires_at: expires.toISOString(), ip, user_agent: userAgent },
        actor: userId,
        actorKind: "inwestor",
      });
      m = await matchFor();
    }
    if (!DISCLOSED_STATUSES.includes(m.status)) {
      throw new Error(`Dopasowanie ma status ${m.status} — rezerwacja niemożliwa.`);
    }
    return {
      ok: true,
      matchId: m.id as string,
      applicationId: app.id as string,
      reservationExpiresAt: (m.reservation_expires_at as string | null) ?? null,
      contact: await loadContact(supabaseAdmin, app.client_id ?? null),
    };
  });
