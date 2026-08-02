// Server functions przepływu dostępu do zamkniętego modułu projektów:
// aplikacja (jeden klik) → KYC Didit → screening Dilisense (sankcje/PEP)
// → akceptacja umowy dostępu, NDA i ostrzeżenia o ryzyku → ostateczna
// aktywacja przez Finance You (admin.functions.ts).
//
// Zakup szkolenia NIE daje dostępu. Pozytywne KYC NIE aktywuje dostępu
// automatycznie. Każda zmiana zostawia wpis w nieusuwalnym logu audytowym.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { db, getModuleAccessRow, type ModuleAccessRow } from "./guards.server";
import { projectAudit } from "./audit.server";
import {
  ACCEPTANCE_KINDS,
  MODULE_DOCUMENT_VERSION,
  type AcceptanceKind,
  type ModuleKycStatus,
  type ModuleScreeningResult,
} from "./module-types";

/** Mapowanie statusu sesji Didit → status KYC modułu. */
export function mapDiditStatus(status: string | null | undefined): ModuleKycStatus {
  switch ((status ?? "").toLowerCase()) {
    case "approved":
      return "approved";
    case "declined":
      return "rejected";
    case "in review":
      return "manual_review";
    case "expired":
    case "abandoned":
      return "expired";
    case "not started":
    case "in progress":
    case "pending":
    case "kyc":
      return "pending";
    default:
      return "pending";
  }
}

/**
 * Klasyfikacja surowego wyniku Dilisense. Potwierdzenie trafienia sankcyjnego
 * to ZAWSZE decyzja człowieka (admin ustawia confirmed_sanctions_match w
 * panelu) — automat klasyfikuje tylko do analizy.
 */
export function classifyScreening(records: unknown[]): ModuleScreeningResult {
  if (!records.length) return "clear";
  let pep = false;
  let sanction = false;
  for (const rec of records) {
    const r = rec as { source_type?: string; pep_type?: string };
    const t = String(r.source_type ?? "").toUpperCase();
    if (t.includes("SANCTION")) sanction = true;
    if (t.includes("PEP") || r.pep_type) pep = true;
  }
  if (sanction) return "possible_match";
  if (pep) return "pep_review_required";
  return "manual_review";
}

async function getProfileName(
  userId: string,
): Promise<{ name: string; email: string | null } | null> {
  const { data } = await db
    .from("profiles")
    .select("first_name,last_name,email")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  const name = [data.first_name, data.last_name].filter(Boolean).join(" ").trim();
  return name ? { name, email: data.email ?? null } : null;
}

/**
 * Po pozytywnym KYC uruchamia screening Dilisense (sankcje, PEP, rodzina PEP,
 * współpracownicy PEP i pozostałe listy Dilisense — checkIndividual odpytuje
 * wszystkie źródła). Surowe trafienia trafiają do project_module_screenings
 * (widoczne tylko dla personelu).
 */
async function runScreening(access: ModuleAccessRow, fullName: string, dob?: string) {
  const { checkIndividual } = await import("@/lib/aml/dilisense.server");
  let result: ModuleScreeningResult;
  let raw: unknown = null;
  let totalHits = 0;
  try {
    const res = await checkIndividual({ names: fullName, dob });
    raw = res.raw;
    totalHits = res.totalHits;
    result = classifyScreening(res.foundRecords);
  } catch (e) {
    // Błąd API nie może po cichu przepuścić użytkownika — kierujemy do ręcznej analizy.
    raw = { error: e instanceof Error ? e.message : String(e) };
    result = "manual_review";
  }

  const { data: row, error } = await db
    .from("project_module_screenings")
    .insert({
      user_id: access.user_id,
      application_id: access.application_id,
      subject_name: fullName,
      dob: dob ?? null,
      query: { names: fullName, dob: dob ?? null },
      raw_result: raw,
      total_hits: totalHits,
      result,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await db
    .from("project_module_access")
    .update({
      screening_id: row.id,
      screening_result: result,
      screening_updated_at: new Date().toISOString(),
      status: "compliance_review",
    })
    .eq("id", access.id);

  await projectAudit({
    actorId: null,
    subjectUserId: access.user_id,
    entityType: "screening",
    entityId: row.id,
    action: "screening_completed",
    previousStatus: access.status,
    newStatus: "compliance_review",
    details: { result, total_hits: totalHits },
  });
  return result;
}

/**
 * Synchronizuje status KYC z didit_verifications (webhook mógł już dostarczyć
 * decyzję). Po przejściu na `approved` automatycznie uruchamia screening.
 */
async function syncKyc(access: ModuleAccessRow): Promise<ModuleAccessRow> {
  if (!access.kyc_session_id || access.status !== "kyc_pending") return access;

  const { data: ver } = await db
    .from("didit_verifications")
    .select("status, decision, decided_at, updated_at")
    .eq("session_id", access.kyc_session_id)
    .maybeSingle();
  if (!ver) return access;

  const mapped = mapDiditStatus(ver.status);
  if (mapped === access.kyc_status) return access;

  const patch: Record<string, unknown> = {
    kyc_status: mapped,
    kyc_updated_at: new Date().toISOString(),
    // Minimalizacja danych: zapisujemy wynik i ostrzeżenia, nie kopie dokumentów.
    kyc_result: { status: ver.status, decided_at: ver.decided_at },
  };
  if (mapped === "approved" || mapped === "rejected" || mapped === "expired") {
    patch.kyc_completed_at = ver.decided_at ?? new Date().toISOString();
  }
  await db.from("project_module_access").update(patch).eq("id", access.id);
  await projectAudit({
    subjectUserId: access.user_id,
    entityType: "kyc",
    entityId: access.kyc_session_id,
    action: "kyc_status_changed",
    previousStatus: access.kyc_status,
    newStatus: mapped,
  });

  const updated = { ...access, ...patch } as ModuleAccessRow;

  // Pozytywne KYC → automatyczny screening (jeśli jeszcze nie było).
  if (mapped === "approved" && !access.screening_id) {
    const profile = await getProfileName(access.user_id);
    const decision = (ver.decision ?? {}) as Record<string, unknown>;
    const idv = (decision["id_verification"] ?? {}) as Record<string, unknown>;
    const diditName = [idv["first_name"], idv["last_name"]].filter(Boolean).join(" ").trim();
    const fullName = diditName || profile?.name || "";
    const dob =
      typeof idv["date_of_birth"] === "string" ? (idv["date_of_birth"] as string) : undefined;
    if (fullName) {
      updated.screening_result = await runScreening(updated, fullName, dob);
      updated.status = "compliance_review";
    }
  }
  return updated;
}

/** Kształt stanu modułu zwracany do UI (bez surowych trafień screeningu). */
function publicState(access: ModuleAccessRow | null) {
  return {
    status: access?.status ?? ("course_user" as const),
    kycStatus: (access?.kyc_status ?? "not_started") as ModuleKycStatus,
    kycStartedAt: access?.kyc_started_at ?? null,
    kycCompletedAt: access?.kyc_completed_at ?? null,
    screeningResult: (access?.screening_result ?? null) as ModuleScreeningResult | null,
    approvedAt: access?.approved_at ?? null,
    accessExpiresAt: access?.access_expires_at ?? null,
    suspendedReason: access?.suspended_reason ?? null,
    revokedReason: access?.revoked_reason ?? null,
    // JSON z jsonb — rzutujemy na luźny Record, żeby spełnić ograniczenie
    // serializowalności zwrotu server function (unknown je łamie).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    preferences: (access?.preferences ?? {}) as Record<string, any>,
    profileCompletedAt: access?.profile_completed_at ?? null,
    serverNow: new Date().toISOString(),
  };
}

/** Stan modułu dla zalogowanego użytkownika (+ lazy-sync KYC/screeningu). */
export const getModuleState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId as string;
    let access = await getModuleAccessRow(userId);
    if (access) access = await syncKyc(access);

    const [{ data: application }, { data: acceptances }] = await Promise.all([
      access?.application_id
        ? db
            .from("project_module_applications")
            .select("*")
            .eq("id", access.application_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      db
        .from("project_module_acceptances")
        .select("kind, version, accepted_at")
        .eq("user_id", userId)
        .eq("version", MODULE_DOCUMENT_VERSION),
    ]);

    const acceptedKinds = new Set(((acceptances ?? []) as { kind: string }[]).map((a) => a.kind));
    return {
      ...publicState(access),
      application: application
        ? {
            id: application.id,
            status: application.status,
            createdAt: application.created_at,
            adminNote: application.admin_note,
            decisionReason: application.decision_reason,
          }
        : null,
      requiredDocuments: ACCEPTANCE_KINDS.map((d) => ({
        kind: d.kind,
        label: d.label,
        version: MODULE_DOCUMENT_VERSION,
        accepted: acceptedKinds.has(d.kind),
      })),
      allDocumentsAccepted: ACCEPTANCE_KINDS.every((d) => acceptedKinds.has(d.kind)),
    };
  });

/**
 * Uproszczona aplikacja o dostęp do modułu — bez formularza preferencji.
 * Złożenie od razu otwiera ścieżkę: KYC (Didit) → screening sankcyjny/PEP →
 * akceptacja umowy dostępu, NDA i ostrzeżenia o ryzyku → ostateczna decyzja
 * Finance You (aktywacja w admin.functions.ts). Nie gwarantuje dostępu.
 */
export const submitModuleApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId as string;

    const access = await getModuleAccessRow(userId);
    if (access && !["course_user", "module_application_rejected"].includes(access.status)) {
      throw new Error("Masz już aktywną aplikację albo dostęp do modułu.");
    }

    const { data: app, error } = await db
      .from("project_module_applications")
      .insert({
        user_id: userId,
        // Automatyczna kwalifikacja do KYC — ostateczna decyzja pozostaje po
        // stronie Finance You przy aktywacji dostępu.
        status: "conditionally_qualified",
        decided_at: new Date().toISOString(),
        decision_reason: "Kwalifikacja automatyczna — uproszczony proces aplikacji.",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { error: upErr } = await db.from("project_module_access").upsert(
      {
        user_id: userId,
        status: "kyc_pending",
        application_id: app.id,
      },
      { onConflict: "user_id" },
    );
    if (upErr) throw new Error(upErr.message);

    await projectAudit({
      actorId: userId,
      subjectUserId: userId,
      entityType: "application",
      entityId: app.id,
      action: "application_submitted",
      previousStatus: access?.status ?? "course_user",
      newStatus: "kyc_pending",
    });

    return { ok: true as const, applicationId: app.id };
  });

/**
 * Akceptacja kompletu dokumentów modułu (umowa dostępu, NDA, poufność,
 * przetwarzanie danych, ostrzeżenie o ryzyku, samodzielność decyzji, zakaz
 * udostępniania konta) — w bieżącej wersji. Wymagana przed aktywacją.
 */
export const acceptModuleDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        kinds: z.array(
          z.enum(ACCEPTANCE_KINDS.map((d) => d.kind) as [AcceptanceKind, ...AcceptanceKind[]]),
        ),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId as string;
    const request = getRequest();
    const ip =
      request?.headers.get("cf-connecting-ip") ||
      request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;
    const userAgent = request?.headers.get("user-agent") ?? null;

    const rows = data.kinds.map((kind) => ({
      user_id: userId,
      kind,
      version: MODULE_DOCUMENT_VERSION,
      ip,
      user_agent: userAgent,
    }));
    const { error } = await db
      .from("project_module_acceptances")
      .upsert(rows, { onConflict: "user_id,kind,version", ignoreDuplicates: true });
    if (error) throw new Error(error.message);

    await projectAudit({
      actorId: userId,
      subjectUserId: userId,
      entityType: "access",
      action: "documents_accepted",
      details: { kinds: data.kinds, version: MODULE_DOCUMENT_VERSION },
    });
    return { ok: true as const };
  });

/**
 * Start weryfikacji KYC przez Didit — dostępny dopiero po warunkowym
 * zakwalifikowaniu aplikacji przez administratora (status kyc_pending).
 */
export const startModuleKyc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ callbackBase: z.string().url().optional() }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const userId = context.userId as string;
    const { hasDiditConfig, createDiditSession, selectWorkflowId, diditAppUrl } =
      await import("@/lib/didit.server");
    if (!hasDiditConfig()) return { status: "not_configured" as const };

    const access = await getModuleAccessRow(userId);
    if (!access || access.status !== "kyc_pending") {
      throw new Error("Weryfikacja KYC nie jest na tym etapie dostępna.");
    }
    if (access.kyc_status === "approved") {
      return { status: "already_approved" as const };
    }

    const workflowId = selectWorkflowId("kyc");
    if (!workflowId) return { status: "not_configured" as const };

    const profile = await getProfileName(userId);
    const base = (data.callbackBase ?? diditAppUrl()).replace(/\/+$/, "");
    const session = await createDiditSession({
      workflowId,
      vendorData: `project-module:${userId}`,
      callback: `${base}/inwestor?didit=return`,
      language: "pl",
      contactDetails: profile?.email ? { email: profile.email } : undefined,
      metadata: { module: "investment-projects", user_id: userId },
    });

    // Wiersz w didit_verifications → istniejący webhook Didit zaktualizuje
    // status po session_id bez żadnych zmian po jego stronie.
    const { error: insErr } = await db.from("didit_verifications").insert({
      user_id: userId,
      vendor_data: `project-module:${userId}`,
      session_id: session.sessionId,
      session_number: session.sessionNumber,
      workflow_id: session.workflowId,
      workflow_type: "kyc",
      status: session.status,
      verification_url: session.url,
      metadata: { module: "investment-projects" },
    });
    if (insErr) throw new Error(insErr.message);

    const { error: updErr } = await db
      .from("project_module_access")
      .update({
        kyc_session_id: session.sessionId,
        kyc_status: "pending",
        kyc_started_at: new Date().toISOString(),
        kyc_updated_at: new Date().toISOString(),
      })
      .eq("id", access.id);
    if (updErr) throw new Error(updErr.message);

    await projectAudit({
      actorId: userId,
      subjectUserId: userId,
      entityType: "kyc",
      entityId: session.sessionId,
      action: "kyc_started",
      newStatus: "pending",
    });

    return { status: "ok" as const, url: session.url };
  });

/** Ręczne odświeżenie decyzji Didit (fallback dla webhooka) + sync modułu. */
export const refreshModuleKyc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId as string;
    const access = await getModuleAccessRow(userId);
    if (!access?.kyc_session_id) throw new Error("Brak rozpoczętej weryfikacji KYC.");

    const { hasDiditConfig, getDiditDecision } = await import("@/lib/didit.server");
    if (hasDiditConfig()) {
      try {
        const decision = await getDiditDecision(access.kyc_session_id);
        const decided = ["Approved", "Declined", "In Review"].includes(decision.status);
        await db
          .from("didit_verifications")
          .update({
            status: decision.status,
            decision: decision.decision as never,
            warnings: decision.warnings as never,
            decided_at: decided ? new Date().toISOString() : null,
          })
          .eq("session_id", access.kyc_session_id);
      } catch (e) {
        console.error("[projects] refresh Didit decision failed:", e);
      }
    }
    const updated = await syncKyc(access);
    return { ok: true as const, kycStatus: updated.kyc_status, status: updated.status };
  });

const profileSchema = z.object({
  availableCapital: z.number().min(0),
  minInvestment: z.number().min(0),
  maxInvestment: z.number().min(0),
  maxLtvPercent: z.number().min(1).max(100),
  propertyTypes: z.array(z.string()).min(1),
  locations: z.array(z.string()).min(1),
  periodMonthsMin: z.number().int().min(1).max(360),
  periodMonthsMax: z.number().int().min(1).max(360),
  expectedReturnPercent: z.number().min(0).max(100),
  preferredSecurities: z.array(z.string()).min(1),
  riskProfile: z.string().min(1).max(200),
});

export type InvestorProfileInput = z.infer<typeof profileSchema>;

/**
 * Profil preferencji inwestora — uzupełniany po pierwszym wejściu do modułu,
 * później edytowalny. Zmiana wpływa wyłącznie na przyszłe dopasowania.
 */
export const updateInvestorProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => profileSchema.parse(i))
  .handler(async ({ data, context }) => {
    const userId = context.userId as string;
    const { assertApprovedInvestor } = await import("./guards.server");
    const access = await assertApprovedInvestor(userId);

    if (data.minInvestment > data.maxInvestment) {
      throw new Error("Minimalna kwota nie może przekraczać maksymalnej.");
    }
    if (data.periodMonthsMin > data.periodMonthsMax) {
      throw new Error("Minimalny okres nie może przekraczać maksymalnego.");
    }

    const { error } = await db
      .from("project_module_access")
      .update({
        preferences: data,
        profile_completed_at: access.profile_completed_at ?? new Date().toISOString(),
      })
      .eq("id", access.id);
    if (error) throw new Error(error.message);

    await projectAudit({
      actorId: userId,
      subjectUserId: userId,
      entityType: "access",
      action: "profile_updated",
      details: { preferences: data },
    });
    return { ok: true as const };
  });
