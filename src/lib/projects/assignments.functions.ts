// Server functions cyklu życia kart projektów: „Dobierz projekty dla mnie",
// lista kart (teaser: zdjęcie + kwota + typ + miejscowość), decyzje
// (odrzucenie / zainteresowanie), jednorazowe przedłużenie, statystyki.
//
// Wszystkie przejścia statusów wykonują atomowe funkcje SQL (SECURITY DEFINER,
// service_role) z blokadą wierszy — patrz migracja 20260722102000. Serwer jest
// jedynym źródłem czasu; operacje są idempotentne (bezpieczne wielokrotne
// kliknięcia i ponowienia po utracie sieci).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";
import { db, assertApprovedInvestor, getModuleSettings } from "./guards.server";
import { rankProjects, type MatchPreferences, type MatchableProject } from "./matching";
import { projectAudit } from "./audit.server";
import {
  ACTIVE_CARD_STATUSES,
  PROPERTY_TYPE_LABELS,
  type ProjectTeaser,
  type ProjectPropertyType,
} from "./module-types";

const PHOTO_BUCKETS = [CLIENT_FILES_BUCKET, "documents", "property-photos"] as const;

/** Podpisuje ścieżkę zdjęcia (service_role, krótkie TTL) — bez publicznych URL-i. */
async function signPhoto(path: string | null, expiresIn = 900): Promise<string | null> {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  for (const bucket of PHOTO_BUCKETS) {
    const { data } = await db.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (data?.signedUrl) return data.signedUrl as string;
  }
  return null;
}

/** Odsetek terminowych decyzji inwestora (do rankingu). */
async function onTimeDecisionRate(userId: string): Promise<number> {
  const { data } = await db
    .from("project_assignments")
    .select("status")
    .eq("investor_id", userId)
    .in("status", ["rejected", "interested", "expired"])
    .limit(200);
  const rows = (data ?? []) as { status: string }[];
  if (!rows.length) return 1;
  const decided = rows.filter((r) => r.status !== "expired").length;
  return decided / rows.length;
}

/**
 * „Dobierz projekty dla mnie". Serwer: (1) sprawdza status approved_investor,
 * (2) kompletność profilu, (3) limit aktywnych przypisań, (4) analizuje pulę,
 * (5) wybiera najlepiej dopasowane, (6) tworzy przypisania ATOMOWO
 * (project_claim_assignment z blokadą wiersza), (7) dopiero wtedy karty są
 * widoczne. Inwestor nigdy nie dostaje całej puli.
 */
export const matchProjectsForMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId as string;
    const access = await assertApprovedInvestor(userId);

    if (!access.profile_completed_at) {
      return { ok: false as const, code: "profile_incomplete" as const, created: 0 };
    }
    const settings = await getModuleSettings();

    const { data: activeRows, error: activeErr } = await db
      .from("project_assignments")
      .select("id, project_id")
      .eq("investor_id", userId)
      .in("status", ACTIVE_CARD_STATUSES);
    if (activeErr) throw new Error(activeErr.message);
    const active = (activeRows ?? []) as { id: string; project_id: string }[];
    const slots = settings.max_active_assignments - active.length;
    if (slots <= 0) {
      return { ok: false as const, code: "limit_reached" as const, created: 0 };
    }

    // Projekty, z którymi inwestor już miał styczność (dowolny status) — nie
    // pokazujemy ich ponownie automatycznie.
    const { data: historyRows } = await db
      .from("project_assignments")
      .select("project_id")
      .eq("investor_id", userId);
    const seenProjects = new Set(
      ((historyRows ?? []) as { project_id: string }[]).map((r) => r.project_id),
    );

    // Pula wewnętrzna: wyłącznie available_internal_pool z zaakceptowanym zdjęciem.
    const { data: poolRows, error: poolErr } = await db
      .from("investment_projects")
      .select(
        "id, amount, property_type, city, voivodeship, ltv_percent, period_months, interest_rate_percent, security_type, last_assigned_at, rejection_count, main_photo_path, photo_approved, status",
      )
      .eq("status", "available_internal_pool")
      .eq("photo_approved", true)
      .not("main_photo_path", "is", null)
      .limit(500);
    if (poolErr) throw new Error(poolErr.message);

    const candidates = ((poolRows ?? []) as MatchableProject[]).filter(
      (p) => !seenProjects.has(p.id),
    );
    if (!candidates.length) {
      return { ok: true as const, code: "no_projects" as const, created: 0 };
    }

    const prefs = (access.preferences ?? {}) as MatchPreferences;
    const ranked = rankProjects(candidates, prefs, {
      activeAssignments: active.length,
      onTimeDecisionRate: await onTimeDecisionRate(userId),
      now: new Date(),
    });
    if (!ranked.length) {
      return { ok: true as const, code: "no_projects" as const, created: 0 };
    }

    let created = 0;
    for (const match of ranked) {
      if (created >= slots) break;
      // Atomowy claim — przy równoległych kliknięciach dwóch inwestorów projekt
      // dostanie tylko jeden z nich (blokada wiersza + partial-unique index).
      const { data: assignmentId, error } = await db.rpc("project_claim_assignment", {
        _project_id: match.projectId,
        _investor_id: userId,
        _score: match.score,
        _reason: match.reasons.join("; "),
        _created_by: userId,
      });
      if (error) {
        console.error("[projects] claim failed:", error.message);
        continue;
      }
      if (assignmentId) created += 1;
    }

    return {
      ok: true as const,
      code: created > 0 ? ("ok" as const) : ("no_projects" as const),
      created,
    };
  });

/**
 * Aktywne karty inwestora — WYŁĄCZNIE teaser (zdjęcie, kwota, rodzaj
 * nieruchomości, miejscowość) + czasy. Żadnych danych pożyczkobiorcy, adresu,
 * KW, oprocentowania, LTV, wartości nieruchomości ani dokumentów.
 */
export const listMyProjectCards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId as string;
    await assertApprovedInvestor(userId);
    const nowIso = new Date().toISOString();

    const { data: rows, error } = await db
      .from("project_assignments")
      .select("id, project_id, status, assigned_at, expires_at, extended_at, opened_at")
      .eq("investor_id", userId)
      .in("status", ACTIVE_CARD_STATUSES)
      .gt("expires_at", nowIso)
      .order("expires_at", { ascending: true });
    if (error) throw new Error(error.message);
    const assignments = (rows ?? []) as {
      id: string;
      project_id: string;
      status: ProjectTeaser["status"];
      assigned_at: string;
      expires_at: string;
      extended_at: string | null;
      opened_at: string | null;
    }[];
    if (!assignments.length) return { cards: [] as ProjectTeaser[], serverNow: nowIso };

    const projectIds = assignments.map((a) => a.project_id);
    const { data: projects, error: projErr } = await db
      .from("investment_projects")
      .select("id, amount, property_type, city, main_photo_path, status")
      .in("id", projectIds);
    if (projErr) throw new Error(projErr.message);
    const byId = new Map(
      (
        (projects ?? []) as {
          id: string;
          amount: number;
          property_type: string;
          city: string;
          main_photo_path: string | null;
          status: string;
        }[]
      ).map((p) => [p.id, p]),
    );

    const cards: ProjectTeaser[] = [];
    for (const a of assignments) {
      const p = byId.get(a.project_id);
      // Projekt wycofany/wstrzymany w trakcie otwartej karty → nie pokazujemy;
      // sprzątnie go tick albo następna akcja użytkownika.
      if (!p || !["temporarily_assigned"].includes(p.status)) continue;
      cards.push({
        assignmentId: a.id,
        status: a.status,
        photoUrl: await signPhoto(p.main_photo_path),
        amount: Number(p.amount),
        propertyType: p.property_type,
        propertyTypeLabel:
          PROPERTY_TYPE_LABELS[p.property_type as ProjectPropertyType] ?? p.property_type,
        city: p.city,
        assignedAt: a.assigned_at,
        expiresAt: a.expires_at,
        extendedAt: a.extended_at,
        serverNow: nowIso,
      });
    }
    return { cards, serverNow: nowIso };
  });

/** Oznaczenie karty jako otwartej (pierwsze wyświetlenie) — idempotentne. */
export const openAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ assignmentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const userId = context.userId as string;
    await assertApprovedInvestor(userId);
    const { data: res, error } = await db.rpc("project_assignment_open", {
      _assignment_id: data.assignmentId,
      _investor_id: userId,
    });
    if (error) throw new Error(error.message);
    return res as { ok: boolean; code: string };
  });

/**
 * Decyzja inwestora dla karty: swipe w lewo / „Odrzuć" → rejected (projekt
 * natychmiast wraca do puli), swipe w prawo / „Interesuje mnie" → interested
 * (projekt zablokowany, otwiera się pełna karta). Idempotentna; po wygaśnięciu
 * serwer odrzuca akcję.
 */
export const decideAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        assignmentId: z.string().uuid(),
        decision: z.enum(["interested", "rejected"]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId as string;
    await assertApprovedInvestor(userId);
    const { data: res, error } = await db.rpc("project_assignment_decide", {
      _assignment_id: data.assignmentId,
      _investor_id: userId,
      _decision: data.decision,
    });
    if (error) throw new Error(error.message);
    const out = res as {
      ok: boolean;
      code: string;
      review_triggered?: boolean;
      proposal_deadline_at?: string;
    };
    if (out.review_triggered) {
      // Projekt przekroczył próg odrzuceń — admin dostaje sygnał (lifecycle
      // wyśle e-mail; wpis audytowy powstał już w funkcji SQL).
      const { notifyAdminProjectReview } = await import("./lifecycle.server");
      void notifyAdminProjectReview(data.assignmentId).catch((e) =>
        console.error("[projects] admin notify failed:", e),
      );
    }
    return out;
  });

/** „Potrzebuję więcej czasu" — jednorazowe przedłużenie o 12 h (maks. 36 h). */
export const extendAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ assignmentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const userId = context.userId as string;
    await assertApprovedInvestor(userId);
    const { data: res, error } = await db.rpc("project_assignment_extend", {
      _assignment_id: data.assignmentId,
      _investor_id: userId,
    });
    if (error) throw new Error(error.message);
    return res as { ok: boolean; code: string; expires_at?: string };
  });

/** Zbiorcze statystyki inwestora — bez ujawniania rozmiaru puli. */
export const getMyProjectStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId as string;
    await assertApprovedInvestor(userId);
    const { data, error } = await db
      .from("project_assignments")
      .select("status, opened_at")
      .eq("investor_id", userId);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { status: string; opened_at: string | null }[];
    return {
      viewed: rows.filter((r) => r.opened_at != null).length,
      rejected: rows.filter((r) => r.status === "rejected").length,
      interested: rows.filter((r) => r.status === "interested").length,
      active: rows.filter((r) => ACTIVE_CARD_STATUSES.includes(r.status as never)).length,
    };
  });

/** „Powiadom mnie o nowych projektach" — flaga w preferencjach profilu. */
export const requestNewProjectsNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId as string;
    const access = await assertApprovedInvestor(userId);
    const prefs = { ...(access.preferences ?? {}), notifyNewProjects: true };
    const { error } = await db
      .from("project_module_access")
      .update({ preferences: prefs })
      .eq("id", access.id);
    if (error) throw new Error(error.message);
    await projectAudit({
      actorId: userId,
      subjectUserId: userId,
      entityType: "access",
      action: "notify_new_projects_enabled",
    });
    return { ok: true as const };
  });
