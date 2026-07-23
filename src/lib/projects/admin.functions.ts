// Server functions panelu administratora zamkniętego modułu projektów.
// Każda akcja: bramka is_internal_staff + wpis w nieusuwalnym logu audytowym
// (kto, kiedy, poprzedni status, nowy status, powód).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";
import { db, assertModuleStaff, getModuleSettings } from "./guards.server";
import { projectAudit } from "./audit.server";
import { MODULE_DOCUMENT_VERSION, ACCEPTANCE_KINDS } from "./module-types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

async function usersById(
  ids: string[],
): Promise<Map<string, { name: string; email: string | null }>> {
  const map = new Map<string, { name: string; email: string | null }>();
  if (!ids.length) return map;
  const { data } = await db
    .from("profiles")
    .select("user_id, first_name, last_name, email")
    .in("user_id", ids);
  for (const p of (data ?? []) as Row[]) {
    map.set(p.user_id, {
      name: [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.user_id,
      email: p.email ?? null,
    });
  }
  return map;
}

// ===========================================================================
// Aplikacje + dostęp użytkowników
// ===========================================================================

export const adminListModuleUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertModuleStaff(context.userId);
    const [{ data: access }, { data: applications }] = await Promise.all([
      db
        .from("project_module_access")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(500),
      db
        .from("project_module_applications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    const userIds = Array.from(
      new Set([
        ...((access ?? []) as Row[]).map((a) => a.user_id),
        ...((applications ?? []) as Row[]).map((a) => a.user_id),
      ]),
    );
    const users = await usersById(userIds);
    return {
      access: ((access ?? []) as Row[]).map((a) => ({ ...a, user: users.get(a.user_id) ?? null })),
      applications: ((applications ?? []) as Row[]).map((a) => ({
        ...a,
        user: users.get(a.user_id) ?? null,
      })),
    };
  });

export const adminGetModuleUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertModuleStaff(context.userId);
    const [{ data: access }, { data: applications }, { data: screenings }, { data: acceptances }] =
      await Promise.all([
        db.from("project_module_access").select("*").eq("user_id", data.userId).maybeSingle(),
        db
          .from("project_module_applications")
          .select("*")
          .eq("user_id", data.userId)
          .order("created_at", { ascending: false }),
        db
          .from("project_module_screenings")
          .select("*")
          .eq("user_id", data.userId)
          .order("created_at", { ascending: false }),
        db
          .from("project_module_acceptances")
          .select("*")
          .eq("user_id", data.userId)
          .order("accepted_at", { ascending: false }),
      ]);
    const kycSession = (access as Row)?.kyc_session_id
      ? (
          await db
            .from("didit_verifications")
            .select("session_id, status, decided_at, warnings, created_at")
            .eq("session_id", (access as Row).kyc_session_id)
            .maybeSingle()
        ).data
      : null;
    const users = await usersById([data.userId]);
    return {
      user: users.get(data.userId) ?? null,
      access: access ?? null,
      applications: applications ?? [],
      screenings: screenings ?? [],
      acceptances: acceptances ?? [],
      kycSession,
      requiredDocumentVersion: MODULE_DOCUMENT_VERSION,
    };
  });

/** Decyzja o aplikacji: kwalifikacja warunkowa / odrzucenie / uzupełnienie / dodatkowa analiza. */
export const adminDecideApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        applicationId: z.string().uuid(),
        decision: z.enum([
          "conditionally_qualified",
          "rejected",
          "needs_more_info",
          "additional_review",
        ]),
        reason: z.string().min(2).max(2000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const adminId = context.userId as string;
    await assertModuleStaff(adminId);

    const { data: app, error } = await db
      .from("project_module_applications")
      .select("*")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!app) throw new Error("Nie znaleziono aplikacji.");

    const { error: updErr } = await db
      .from("project_module_applications")
      .update({
        status: data.decision,
        decided_by: adminId,
        decided_at: new Date().toISOString(),
        decision_reason: data.reason,
      })
      .eq("id", app.id);
    if (updErr) throw new Error(updErr.message);

    // Status użytkownika w module.
    const accessStatus =
      data.decision === "conditionally_qualified"
        ? "kyc_pending"
        : data.decision === "rejected"
          ? "module_application_rejected"
          : "module_application_pending";
    await db
      .from("project_module_access")
      .update({ status: accessStatus })
      .eq("user_id", app.user_id);

    await projectAudit({
      actorId: adminId,
      subjectUserId: app.user_id,
      entityType: "application",
      entityId: app.id,
      action: `application_${data.decision}`,
      previousStatus: app.status,
      newStatus: data.decision,
      reason: data.reason,
    });
    return { ok: true as const };
  });

/** Ręczna analiza trafienia screeningu (sankcje / PEP). */
export const adminReviewScreening = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        screeningId: z.string().uuid(),
        result: z.enum([
          "clear",
          "possible_match",
          "manual_review",
          "confirmed_sanctions_match",
          "pep_review_required",
        ]),
        note: z.string().min(2).max(4000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const adminId = context.userId as string;
    await assertModuleStaff(adminId);

    const { data: screening, error } = await db
      .from("project_module_screenings")
      .select("*")
      .eq("id", data.screeningId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!screening) throw new Error("Nie znaleziono screeningu.");

    const { error: updErr } = await db
      .from("project_module_screenings")
      .update({
        result: data.result,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        review_note: data.note,
      })
      .eq("id", screening.id);
    if (updErr) throw new Error(updErr.message);

    await db
      .from("project_module_access")
      .update({ screening_result: data.result, screening_updated_at: new Date().toISOString() })
      .eq("user_id", screening.user_id)
      .eq("screening_id", screening.id);

    await projectAudit({
      actorId: adminId,
      subjectUserId: screening.user_id,
      entityType: "screening",
      entityId: screening.id,
      action: "screening_reviewed",
      previousStatus: screening.result,
      newStatus: data.result,
      reason: data.note,
    });
    return { ok: true as const };
  });

/**
 * Aktywacja dostępu (ostateczna decyzja Finance You). Wymaga: KYC approved,
 * screeningu bez potwierdzonego trafienia sankcyjnego i bez nierozstrzygniętej
 * analizy oraz kompletu zaakceptowanych dokumentów w bieżącej wersji.
 */
export const adminActivateAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        userId: z.string().uuid(),
        reason: z.string().min(2).max(2000),
        accessExpiresAt: z.string().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const adminId = context.userId as string;
    await assertModuleStaff(adminId);

    const { data: access, error } = await db
      .from("project_module_access")
      .select("*")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!access) throw new Error("Użytkownik nie ma wiersza dostępu w module.");

    if (access.kyc_status !== "approved") {
      throw new Error("KYC nie jest zakończone pozytywnie — nie można aktywować dostępu.");
    }
    if (access.screening_result === "confirmed_sanctions_match") {
      throw new Error("Potwierdzone trafienie sankcyjne blokuje dostęp.");
    }
    if (access.screening_result !== "clear") {
      throw new Error(
        "Screening wymaga rozstrzygnięcia (ustaw wynik „clear” po ręcznej analizie), zanim aktywujesz dostęp.",
      );
    }

    const { data: acceptances } = await db
      .from("project_module_acceptances")
      .select("kind, version, accepted_at")
      .eq("user_id", data.userId)
      .eq("version", MODULE_DOCUMENT_VERSION);
    const acceptedKinds = new Set(((acceptances ?? []) as Row[]).map((a) => a.kind));
    const missing = ACCEPTANCE_KINDS.filter((d) => !acceptedKinds.has(d.kind));
    if (missing.length) {
      throw new Error(
        `Użytkownik nie zaakceptował wszystkich dokumentów: ${missing.map((m) => m.label).join(", ")}.`,
      );
    }

    const nowIso = new Date().toISOString();
    const { error: updErr } = await db
      .from("project_module_access")
      .update({
        status: "approved_investor",
        approved_by: adminId,
        approved_at: nowIso,
        approval_reason: data.reason,
        access_starts_at: nowIso,
        access_expires_at: data.accessExpiresAt ?? null,
        suspended_at: null,
        suspended_reason: null,
        accepted_documents: acceptances ?? [],
      })
      .eq("id", access.id);
    if (updErr) throw new Error(updErr.message);

    await projectAudit({
      actorId: adminId,
      subjectUserId: data.userId,
      entityType: "access",
      entityId: access.id,
      action: "access_activated",
      previousStatus: access.status,
      newStatus: "approved_investor",
      reason: data.reason,
      details: {
        access_expires_at: data.accessExpiresAt ?? null,
        documents_version: MODULE_DOCUMENT_VERSION,
      },
    });
    return { ok: true as const };
  });

/** Zawieszenie / cofnięcie / przywrócenie dostępu (dostęp jest imienny i odwoływalny). */
export const adminSetAccessState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        userId: z.string().uuid(),
        action: z.enum(["suspend", "revoke", "reinstate"]),
        reason: z.string().min(2).max(2000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const adminId = context.userId as string;
    await assertModuleStaff(adminId);

    const { data: access, error } = await db
      .from("project_module_access")
      .select("*")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!access) throw new Error("Użytkownik nie ma wiersza dostępu w module.");

    const nowIso = new Date().toISOString();
    let patch: Record<string, unknown>;
    let newStatus: string;
    if (data.action === "suspend") {
      newStatus = "access_suspended";
      patch = { status: newStatus, suspended_at: nowIso, suspended_reason: data.reason };
    } else if (data.action === "revoke") {
      newStatus = "access_revoked";
      patch = { status: newStatus, revoked_at: nowIso, revoked_reason: data.reason };
    } else {
      if (!["access_suspended"].includes(access.status)) {
        throw new Error("Przywrócić można tylko dostęp zawieszony.");
      }
      newStatus = "approved_investor";
      patch = { status: newStatus, suspended_at: null, suspended_reason: null };
    }

    const { error: updErr } = await db
      .from("project_module_access")
      .update(patch)
      .eq("id", access.id);
    if (updErr) throw new Error(updErr.message);

    await projectAudit({
      actorId: adminId,
      subjectUserId: data.userId,
      entityType: "access",
      entityId: access.id,
      action: `access_${data.action}`,
      previousStatus: access.status,
      newStatus,
      reason: data.reason,
    });
    return { ok: true as const };
  });

// ===========================================================================
// Projekty (pula wewnętrzna)
// ===========================================================================

const projectSchema = z.object({
  amount: z.number().positive(),
  propertyType: z.string().min(1),
  city: z.string().min(1),
  voivodeship: z.string().optional(),
  loanApplicationId: z.string().uuid().optional().nullable(),
  financingPurpose: z.string().optional(),
  periodMonths: z.number().int().positive().optional().nullable(),
  interestRatePercent: z.number().min(0).max(100).optional().nullable(),
  propertyValue: z.number().positive().optional().nullable(),
  valuationSource: z.string().optional(),
  valuationDate: z.string().optional().nullable(),
  securityType: z.string().optional(),
  mortgagePosition: z.string().optional(),
  otherEncumbrances: z.string().optional(),
  legalStatusNote: z.string().optional(),
  borrowerBusinessForm: z.string().optional(),
  borrowerBusinessSince: z.string().optional().nullable(),
  repaymentSource: z.string().optional(),
  repaymentType: z.string().optional(),
  borrowerHistory: z.string().optional(),
  additionalConditions: z.string().optional(),
  docsComplete: z.boolean().optional(),
  docsCompletenessNote: z.string().optional(),
  availableDocuments: z.array(z.object({ label: z.string(), path: z.string() })).optional(),
  missingInformation: z.array(z.string()).optional(),
});

function projectPatch(d: z.infer<typeof projectSchema>): Record<string, unknown> {
  const ltv =
    d.propertyValue && d.propertyValue > 0
      ? Math.round((d.amount / d.propertyValue) * 1000) / 10
      : null;
  return {
    amount: d.amount,
    property_type: d.propertyType,
    city: d.city,
    voivodeship: d.voivodeship ?? null,
    loan_application_id: d.loanApplicationId ?? null,
    financing_purpose: d.financingPurpose ?? null,
    period_months: d.periodMonths ?? null,
    interest_rate_percent: d.interestRatePercent ?? null,
    property_value: d.propertyValue ?? null,
    valuation_source: d.valuationSource ?? null,
    valuation_date: d.valuationDate ?? null,
    ltv_percent: ltv,
    security_type: d.securityType ?? null,
    mortgage_position: d.mortgagePosition ?? null,
    other_encumbrances: d.otherEncumbrances ?? null,
    legal_status_note: d.legalStatusNote ?? null,
    borrower_business_form: d.borrowerBusinessForm ?? null,
    borrower_business_since: d.borrowerBusinessSince ?? null,
    repayment_source: d.repaymentSource ?? null,
    repayment_type: d.repaymentType ?? null,
    borrower_history: d.borrowerHistory ?? null,
    additional_conditions: d.additionalConditions ?? null,
    docs_complete: d.docsComplete ?? false,
    docs_completeness_note: d.docsCompletenessNote ?? null,
    available_documents: d.availableDocuments ?? [],
    missing_information: d.missingInformation ?? [],
  };
}

export const adminListProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertModuleStaff(context.userId);
    const { data: projects, error } = await db
      .from("investment_projects")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const ids = ((projects ?? []) as Row[]).map((p) => p.id);
    const { data: assignments } = ids.length
      ? await db
          .from("project_assignments")
          .select("id, project_id, investor_id, status, expires_at, proposal_deadline_at")
          .in("project_id", ids)
          .in("status", ["created", "opened", "extended", "interested"])
      : { data: [] };
    const activeByProject = new Map<string, Row>();
    for (const a of (assignments ?? []) as Row[]) activeByProject.set(a.project_id, a);

    return {
      projects: ((projects ?? []) as Row[]).map((p) => ({
        ...p,
        activeAssignment: activeByProject.get(p.id) ?? null,
      })),
    };
  });

export const adminUpsertProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ projectId: z.string().uuid().optional(), project: projectSchema }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const adminId = context.userId as string;
    await assertModuleStaff(adminId);
    const patch = projectPatch(data.project);

    if (!data.projectId) {
      const { data: created, error } = await db
        .from("investment_projects")
        .insert({ ...patch, status: "draft", created_by: adminId, updated_by: adminId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      await projectAudit({
        actorId: adminId,
        entityType: "project",
        entityId: created.id,
        action: "project_created",
        newStatus: "draft",
      });
      return { ok: true as const, projectId: created.id, versionBumped: false };
    }

    const { data: existing, error: exErr } = await db
      .from("investment_projects")
      .select("*")
      .eq("id", data.projectId)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (!existing) throw new Error("Nie znaleziono projektu.");

    // Zmiana ISTOTNYCH parametrów (kwota, LTV/wartość, zabezpieczenie, okres,
    // nieruchomość) przy projekcie już eksponowanym → nowa wersja + unieważnienie
    // aktywnych przypisań. Nie zmieniamy po cichu warunków przedstawionych inwestorowi.
    const material =
      Number(existing.amount) !== data.project.amount ||
      (existing.property_value != null ? Number(existing.property_value) : null) !==
        (data.project.propertyValue ?? null) ||
      (existing.security_type ?? null) !== (data.project.securityType ?? null) ||
      (existing.period_months ?? null) !== (data.project.periodMonths ?? null) ||
      (existing.property_type ?? null) !== data.project.propertyType ||
      (existing.city ?? null) !== data.project.city;

    const exposed = !["draft", "under_review"].includes(existing.status);
    let versionBumped = false;

    if (material && exposed) {
      // Snapshot bieżącej wersji.
      const { error: verErr } = await db.from("investment_project_versions").insert({
        project_id: existing.id,
        version: existing.version,
        snapshot: existing,
        reason: "material_change",
        created_by: adminId,
      });
      if (verErr && !String(verErr.message).includes("duplicate")) {
        throw new Error(verErr.message);
      }
      // Unieważnij aktywne przypisania i wróć do przeglądu.
      await db.rpc("project_release_assignments", {
        _project_id: existing.id,
        _closed_reason: "project_update",
        _actor: adminId,
      });
      const { error: updErr } = await db
        .from("investment_projects")
        .update({
          ...patch,
          version: existing.version + 1,
          status: "under_review",
          updated_by: adminId,
        })
        .eq("id", existing.id);
      if (updErr) throw new Error(updErr.message);
      versionBumped = true;
    } else {
      const { error: updErr } = await db
        .from("investment_projects")
        .update({ ...patch, updated_by: adminId })
        .eq("id", existing.id);
      if (updErr) throw new Error(updErr.message);
    }

    await projectAudit({
      actorId: adminId,
      entityType: "project",
      entityId: existing.id,
      action: versionBumped ? "project_new_version" : "project_updated",
      previousStatus: existing.status,
      newStatus: versionBumped ? "under_review" : existing.status,
      details: { version: versionBumped ? existing.version + 1 : existing.version },
    });
    return { ok: true as const, projectId: existing.id, versionBumped };
  });

/** Zmiana statusu projektu (publikacja do puli, pauza, wycofanie, finansowanie…). */
export const adminSetProjectStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        projectId: z.string().uuid(),
        status: z.enum([
          "draft",
          "under_review",
          "available_internal_pool",
          "paused",
          "withdrawn",
          "financed",
          "closed",
        ]),
        reason: z.string().min(2).max(2000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const adminId = context.userId as string;
    await assertModuleStaff(adminId);

    const { data: project, error } = await db
      .from("investment_projects")
      .select("*")
      .eq("id", data.projectId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!project) throw new Error("Nie znaleziono projektu.");

    if (data.status === "available_internal_pool") {
      // Projekt bez zaakceptowanego zdjęcia głównego NIE wchodzi do puli.
      if (!project.main_photo_path || !project.photo_approved) {
        throw new Error(
          "Projekt wymaga uzupełnienia: brak zaakceptowanego zdjęcia głównego. Nie używamy zdjęć zastępczych.",
        );
      }
    }

    const patch: Record<string, unknown> = { status: data.status, updated_by: adminId };
    if (data.status === "paused") patch.paused_reason = data.reason;
    if (data.status === "withdrawn") patch.withdrawn_reason = data.reason;
    if (data.status === "available_internal_pool") patch.rejection_count = 0;

    // Wycofanie / pauza / zamknięcie przy aktywnych przypisaniach → zamknij je
    // i poinformuj inwestorów (bez ujawniania szczegółów).
    let notifiedInvestors: string[] = [];
    if (["withdrawn", "paused", "closed", "financed"].includes(data.status)) {
      const { data: released } = await db.rpc("project_release_assignments", {
        _project_id: project.id,
        _closed_reason:
          data.status === "withdrawn" ? "project_withdrawn" : `project_${data.status}`,
        _actor: adminId,
      });
      notifiedInvestors = ((released?.investors ?? []) as string[]) || [];
    }

    const { error: updErr } = await db
      .from("investment_projects")
      .update(patch)
      .eq("id", project.id);
    if (updErr) throw new Error(updErr.message);

    await projectAudit({
      actorId: adminId,
      entityType: "project",
      entityId: project.id,
      action: "project_status_changed",
      previousStatus: project.status,
      newStatus: data.status,
      reason: data.reason,
    });

    if (notifiedInvestors.length) {
      const { sendResendEmail } = await import("@/lib/resend-send.server");
      const users = await usersById(notifiedInvestors);
      for (const uid of notifiedInvestors) {
        const email = users.get(uid)?.email;
        if (!email) continue;
        void sendResendEmail({
          to: email,
          subject: "Finance You — przypisany projekt nie jest już dostępny",
          text: "Jeden z przypisanych Ci projektów został wycofany lub zaktualizowany i nie jest już dostępny. Zaloguj się do panelu, aby dobrać kolejne projekty.",
        }).catch(() => undefined);
      }
    }
    return { ok: true as const };
  });

/** Upload zdjęcia głównego (service_role → prywatny bucket, bez publicznych URL-i). */
export const adminUploadProjectPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        projectId: z.string().uuid(),
        fileName: z.string().min(1),
        contentType: z.string().min(3),
        base64: z.string().min(10),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const adminId = context.userId as string;
    await assertModuleStaff(adminId);
    if (!/^image\//.test(data.contentType)) throw new Error("Dozwolone są tylko obrazy.");
    const bytes = Buffer.from(data.base64, "base64");
    if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("Zdjęcie przekracza 10 MB.");

    const ext = (data.fileName.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `projects/${data.projectId}/main-${Date.now()}.${ext}`;
    const { error } = await db.storage
      .from(CLIENT_FILES_BUCKET)
      .upload(path, bytes, { contentType: data.contentType, upsert: true });
    if (error) throw new Error(error.message);

    const { error: updErr } = await db
      .from("investment_projects")
      .update({ main_photo_path: path, photo_approved: false, updated_by: adminId })
      .eq("id", data.projectId);
    if (updErr) throw new Error(updErr.message);

    await projectAudit({
      actorId: adminId,
      entityType: "project",
      entityId: data.projectId,
      action: "photo_uploaded",
      details: { path },
    });
    return { ok: true as const, path };
  });

export const adminApproveProjectPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ projectId: z.string().uuid(), approved: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const adminId = context.userId as string;
    await assertModuleStaff(adminId);
    const { error } = await db
      .from("investment_projects")
      .update({ photo_approved: data.approved, updated_by: adminId })
      .eq("id", data.projectId);
    if (error) throw new Error(error.message);
    await projectAudit({
      actorId: adminId,
      entityType: "project",
      entityId: data.projectId,
      action: data.approved ? "photo_approved" : "photo_rejected",
    });
    return { ok: true as const };
  });

/** Podpisany podgląd zdjęcia/dokumentu dla panelu admina. */
export const adminSignProjectFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ path: z.string().min(1) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertModuleStaff(context.userId);
    for (const bucket of [CLIENT_FILES_BUCKET, "documents", "property-photos"]) {
      const { data: signed } = await db.storage.from(bucket).createSignedUrl(data.path, 900);
      if (signed?.signedUrl) return { url: signed.signedUrl as string };
    }
    throw new Error("Nie udało się podpisać pliku.");
  });

// ===========================================================================
// Przypisania + propozycje + pytania + logi + ustawienia
// ===========================================================================

export const adminListAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertModuleStaff(context.userId);
    const { data: rows, error } = await db
      .from("project_assignments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const assignments = (rows ?? []) as Row[];
    const users = await usersById(Array.from(new Set(assignments.map((a) => a.investor_id))));
    const projectIds = Array.from(new Set(assignments.map((a) => a.project_id)));
    const { data: projects } = projectIds.length
      ? await db
          .from("investment_projects")
          .select("id, city, property_type, amount, status")
          .in("id", projectIds)
      : { data: [] };
    const projById = new Map(((projects ?? []) as Row[]).map((p) => [p.id, p]));
    return {
      assignments: assignments.map((a) => ({
        ...a,
        investor: users.get(a.investor_id) ?? null,
        project: projById.get(a.project_id) ?? null,
      })),
    };
  });

export const adminCancelAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ assignmentId: z.string().uuid(), reason: z.string().min(2).max(2000) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const adminId = context.userId as string;
    await assertModuleStaff(adminId);
    const { data: res, error } = await db.rpc("project_admin_cancel_assignment", {
      _assignment_id: data.assignmentId,
      _admin_id: adminId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return res as { ok: boolean; code: string };
  });

export const adminExtendAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        assignmentId: z.string().uuid(),
        hours: z.number().int().min(1).max(336),
        reason: z.string().min(2).max(2000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const adminId = context.userId as string;
    await assertModuleStaff(adminId);
    const { data: res, error } = await db.rpc("project_admin_extend_assignment", {
      _assignment_id: data.assignmentId,
      _admin_id: adminId,
      _hours: data.hours,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return res as { ok: boolean; code: string; new_deadline?: string };
  });

export const adminListProposals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertModuleStaff(context.userId);
    const { data: rows, error } = await db
      .from("project_proposals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const proposals = (rows ?? []) as Row[];
    const users = await usersById(Array.from(new Set(proposals.map((p) => p.investor_id))));
    const projectIds = Array.from(new Set(proposals.map((p) => p.project_id)));
    const { data: projects } = projectIds.length
      ? await db
          .from("investment_projects")
          .select("id, city, property_type, amount, status, version")
          .in("id", projectIds)
      : { data: [] };
    const projById = new Map(((projects ?? []) as Row[]).map((p) => [p.id, p]));
    return {
      proposals: proposals.map((p) => ({
        ...p,
        investor: users.get(p.investor_id) ?? null,
        project: projById.get(p.project_id) ?? null,
      })),
    };
  });

/** Decyzje administratora o propozycji (w tym kontrpropozycja). */
export const adminSetProposalStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        proposalId: z.string().uuid(),
        status: z.enum([
          "under_review",
          "additional_information_required",
          "presented_to_borrower",
          "accepted_for_negotiation",
          "counteroffer",
          "rejected",
          "expired",
          "accepted",
          "converted_to_transaction",
        ]),
        reason: z.string().min(2).max(4000),
        counteroffer: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const adminId = context.userId as string;
    await assertModuleStaff(adminId);

    const { data: proposal, error } = await db
      .from("project_proposals")
      .select("*")
      .eq("id", data.proposalId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!proposal) throw new Error("Nie znaleziono propozycji.");
    if (["withdrawn", "converted_to_transaction"].includes(proposal.status)) {
      throw new Error("Propozycja jest już zamknięta.");
    }
    if (data.status === "counteroffer" && !data.counteroffer) {
      throw new Error("Kontrpropozycja wymaga parametrów.");
    }

    const { error: updErr } = await db
      .from("project_proposals")
      .update({
        status: data.status,
        decided_at: new Date().toISOString(),
        decided_by: adminId,
        decision_reason: data.reason,
        counteroffer: data.counteroffer ?? proposal.counteroffer,
        admin_note: data.reason,
      })
      .eq("id", proposal.id);
    if (updErr) throw new Error(updErr.message);

    // Odrzucona/wygasła propozycja → projekt wraca do stanu zainteresowania
    // (o dalszym losie projektu decyduje admin w zakładce Projekty).
    if (["rejected", "expired"].includes(data.status)) {
      await db
        .from("investment_projects")
        .update({ status: "initial_interest" })
        .eq("id", proposal.project_id)
        .eq("status", "offer_submitted");
    }
    if (data.status === "accepted_for_negotiation" || data.status === "presented_to_borrower") {
      await db
        .from("investment_projects")
        .update({ status: "full_offer_review" })
        .eq("id", proposal.project_id)
        .in("status", ["offer_submitted", "initial_interest"]);
    }

    await projectAudit({
      actorId: adminId,
      subjectUserId: proposal.investor_id,
      entityType: "proposal",
      entityId: proposal.id,
      action: "proposal_status_changed",
      previousStatus: proposal.status,
      newStatus: data.status,
      reason: data.reason,
    });
    return { ok: true as const };
  });

export const adminListInfoRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertModuleStaff(context.userId);
    const { data: rows, error } = await db
      .from("project_info_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    const requests = (rows ?? []) as Row[];
    const users = await usersById(Array.from(new Set(requests.map((r) => r.investor_id))));
    return {
      requests: requests.map((r) => ({ ...r, investor: users.get(r.investor_id) ?? null })),
    };
  });

export const adminAnswerInfoRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ requestId: z.string().uuid(), answer: z.string().min(2).max(8000) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const adminId = context.userId as string;
    await assertModuleStaff(adminId);
    const { data: row, error } = await db
      .from("project_info_requests")
      .update({
        answer: data.answer,
        status: "answered",
        answered_by: adminId,
        answered_at: new Date().toISOString(),
      })
      .eq("id", data.requestId)
      .select("id, investor_id")
      .single();
    if (error) throw new Error(error.message);
    await projectAudit({
      actorId: adminId,
      subjectUserId: row.investor_id,
      entityType: "info_request",
      entityId: row.id,
      action: "info_request_answered",
    });
    return { ok: true as const };
  });

export const adminListAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        subjectUserId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(1000).optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertModuleStaff(context.userId);
    let q = db
      .from("project_module_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 300);
    if (data.entityType) q = q.eq("entity_type", data.entityType);
    if (data.entityId) q = q.eq("entity_id", data.entityId);
    if (data.subjectUserId) q = q.eq("subject_user_id", data.subjectUserId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { entries: rows ?? [] };
  });

export const adminGetModuleSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertModuleStaff(context.userId);
    return { settings: await getModuleSettings() };
  });

export const adminUpdateModuleSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        maxActiveAssignments: z.number().int().min(1).max(50),
        maxExtendedAssignments: z.number().int().min(1).max(50),
        assignmentHours: z
          .number()
          .int()
          .min(1)
          .max(24 * 14),
        extensionHours: z
          .number()
          .int()
          .min(0)
          .max(24 * 14),
        proposalHours: z
          .number()
          .int()
          .min(1)
          .max(24 * 30),
        rejectionReviewThreshold: z.number().int().min(1).max(100),
        ltvBands: z.object({
          conservative: z.number().min(1).max(100),
          acceptable: z.number().min(1).max(100),
          elevated: z.number().min(1).max(100),
        }),
        minPeriodMonths: z.number().int().min(1).max(360),
        maxPeriodMonths: z.number().int().min(1).max(360),
        maxLtvPercent: z.number().min(1).max(100),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const adminId = context.userId as string;
    await assertModuleStaff(adminId);
    const { error } = await db
      .from("project_module_settings")
      .update({
        max_active_assignments: data.maxActiveAssignments,
        max_extended_assignments: data.maxExtendedAssignments,
        assignment_hours: data.assignmentHours,
        extension_hours: data.extensionHours,
        proposal_hours: data.proposalHours,
        rejection_review_threshold: data.rejectionReviewThreshold,
        ltv_bands: data.ltvBands,
        min_period_months: data.minPeriodMonths,
        max_period_months: data.maxPeriodMonths,
        max_ltv_percent: data.maxLtvPercent,
        updated_by: adminId,
      })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    await projectAudit({
      actorId: adminId,
      entityType: "settings",
      action: "settings_updated",
      details: data as never,
    });
    return { ok: true as const };
  });
