// Server functions pełnej karty projektu i propozycji finansowania.
//
// Pełną kartę (szczegóły + analiza ryzyka + kalkulator) widzi WYŁĄCZNIE
// inwestor z aktywnym przypisaniem w statusie `interested` (po „Interesuje
// mnie"). Wszystkie wyliczenia kalkulatora są przeliczane ponownie po stronie
// serwera przed zapisem. Propozycja po złożeniu jest niezmienna (trigger),
// wersjonowana i powiązana z konkretną wersją projektu. Złożenie propozycji
// NIE jest zawarciem umowy pożyczki.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";
import { db, assertApprovedInvestor, getModuleSettings } from "./guards.server";
import { projectAudit } from "./audit.server";
import { analyzeProjectRisk, computeLtv } from "./risk";
import { computeProposal, type ProposalParams } from "./proposal-calc";
import {
  PROPERTY_TYPE_LABELS,
  PROJECT_STATUS_LABELS,
  type ProjectPropertyType,
  type ProjectPoolStatus,
} from "./module-types";

const PHOTO_BUCKETS = [CLIENT_FILES_BUCKET, "documents", "property-photos"] as const;

async function signPath(path: string, expiresIn: number): Promise<string | null> {
  if (/^https?:\/\//i.test(path)) return path;
  for (const bucket of PHOTO_BUCKETS) {
    const { data } = await db.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (data?.signedUrl) return data.signedUrl as string;
  }
  return null;
}

/** Statusy projektu, przy których pełna karta pozostaje dostępna. */
const FULL_CARD_PROJECT_STATUSES = ["initial_interest", "full_offer_review", "offer_submitted"];

/**
 * Wspólna bramka pełnej karty: właściciel przypisania + status `interested`
 * + termin propozycji + zgodność wersji projektu + status projektu.
 */

async function requireInterestedAssignment(userId: string, assignmentId: string) {
  const { data: assignment, error } = await db
    .from("project_assignments")
    .select("*")
    .eq("id", assignmentId)
    .eq("investor_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!assignment) throw new Error("Nie znaleziono przypisania.");
  if (assignment.status !== "interested") {
    throw new Error("Pełna karta projektu jest dostępna po wyrażeniu zainteresowania.");
  }

  const { data: project, error: projErr } = await db
    .from("investment_projects")
    .select("*")
    .eq("id", assignment.project_id)
    .maybeSingle();
  if (projErr) throw new Error(projErr.message);
  if (!project) throw new Error("Projekt nie jest już dostępny.");
  if (!FULL_CARD_PROJECT_STATUSES.includes(project.status)) {
    throw new Error("Projekt nie jest już dostępny (został wycofany lub zmienił status).");
  }
  if (project.version !== assignment.project_version) {
    throw new Error(
      "Istotne parametry projektu uległy zmianie — dotychczasowe przypisanie jest nieaktualne.",
    );
  }

  const hasSubmitted = await hasActiveProposal(assignmentId);
  if (
    !hasSubmitted &&
    assignment.proposal_deadline_at &&
    new Date(assignment.proposal_deadline_at).getTime() < Date.now()
  ) {
    throw new Error("Termin na złożenie propozycji upłynął — projekt nie jest już dostępny.");
  }

  return { assignment, project };
}

async function hasActiveProposal(assignmentId: string): Promise<boolean> {
  const { data } = await db
    .from("project_proposals")
    .select("id")
    .eq("assignment_id", assignmentId)
    .not("status", "in", '("draft","withdrawn")')
    .limit(1);
  return Boolean((data ?? []).length);
}

async function investorWatermark(userId: string) {
  const { data } = await db
    .from("profiles")
    .select("first_name,last_name")
    .eq("user_id", userId)
    .maybeSingle();
  const name = [data?.first_name, data?.last_name].filter(Boolean).join(" ").trim();
  return {
    name: name || "Inwestor Finance You",
    accountId: userId,
    date: new Date().toISOString(),
  };
}

/**
 * Pełna karta projektu: nagłówek + szczegóły + analiza ryzyka + kontekst
 * kalkulatora + ewentualna istniejąca propozycja.
 */
export const getFullProjectCard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ assignmentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const userId = context.userId as string;
    const access = await assertApprovedInvestor(userId);
    const { assignment, project } = await requireInterestedAssignment(userId, data.assignmentId);
    const settings = await getModuleSettings();

    const prefs = access.preferences as { maxLtvPercent?: number };
    const risk = analyzeProjectRisk(project, settings.ltv_bands, prefs?.maxLtvPercent ?? null);

    const { data: proposals } = await db
      .from("project_proposals")
      .select(
        "id, status, version, params, computed, submitted_at, valid_until, counteroffer, decision_reason",
      )
      .eq("assignment_id", assignment.id)
      .order("version", { ascending: false });

    const documents = (
      Array.isArray(project.available_documents)
        ? (project.available_documents as { label?: string; path?: string }[])
        : []
    )
      .filter((d) => d?.path)
      .map((d) => ({ label: d.label ?? "Dokument", path: d.path as string }));

    return {
      serverNow: new Date().toISOString(),
      assignment: {
        id: assignment.id,
        status: assignment.status,
        proposalDeadlineAt: assignment.proposal_deadline_at,
      },
      header: {
        photoUrl: project.main_photo_path ? await signPath(project.main_photo_path, 900) : null,
        amount: Number(project.amount),
        propertyType: project.property_type,
        propertyTypeLabel:
          PROPERTY_TYPE_LABELS[project.property_type as ProjectPropertyType] ??
          project.property_type,
        city: project.city,
        statusLabel: PROJECT_STATUS_LABELS[project.status as ProjectPoolStatus] ?? project.status,
      },
      details: {
        amount: Number(project.amount),
        financingPurpose: project.financing_purpose,
        periodMonths: project.period_months,
        propertyType: project.property_type,
        city: project.city,
        voivodeship: project.voivodeship,
        propertyValue: project.property_value != null ? Number(project.property_value) : null,
        valuationSource: project.valuation_source,
        valuationDate: project.valuation_date,
        ltvPercent:
          project.ltv_percent != null
            ? Number(project.ltv_percent)
            : computeLtv(Number(project.amount), Number(project.property_value) || null),
        securityType: project.security_type,
        mortgagePosition: project.mortgage_position,
        otherEncumbrances: project.other_encumbrances,
        borrowerBusinessForm: project.borrower_business_form,
        borrowerBusinessSince: project.borrower_business_since,
        repaymentSource: project.repayment_source,
        repaymentType: project.repayment_type,
        interestRatePercent:
          project.interest_rate_percent != null ? Number(project.interest_rate_percent) : null,
        docsComplete: project.docs_complete,
        docsCompletenessNote: project.docs_completeness_note,
        documents: documents.map((d) => ({ label: d.label, path: d.path })),
      },
      risk,
      calculator: {
        expectedAmount: Number(project.amount),
        defaultPeriodMonths: project.period_months ?? 12,
        defaultInterestRatePercent:
          project.interest_rate_percent != null ? Number(project.interest_rate_percent) : 12,
        minPeriodMonths: settings.min_period_months,
        maxPeriodMonths: settings.max_period_months,
        maxLtvPercent: Math.min(
          settings.max_ltv_percent,
          prefs?.maxLtvPercent ?? settings.max_ltv_percent,
        ),
        propertyValue: project.property_value != null ? Number(project.property_value) : null,
      },
      proposals: proposals ?? [],
      watermark: await investorWatermark(userId),
    };
  });

const proposalParamsSchema = z.object({
  amount: z.number().positive(),
  disbursedAmount: z.number().positive().optional(),
  periodMonths: z.number().int().min(1).max(360),
  interestRatePercent: z.number().min(0).max(100),
  commission: z.number().min(0),
  repaymentMode: z.enum(["raty", "balon"]),
  maxMonthlyPayment: z.number().positive().optional(),
  disbursementDate: z.string().optional(),
  requiredSecurities: z.array(z.string()).min(1),
  requiredDocuments: z.array(z.string()),
  additionalConditions: z.string().max(4000).optional(),
  validUntil: z.string().optional(),
});

/** Górny limit odsetek: odsetki maksymalne = 2 × (stopa referencyjna NBP + 3,5 p.p.). */
async function maxLegalInterestPercent(): Promise<number> {
  try {
    const { getNbpRatesCached } = await import("@/lib/nbp-rates.server");
    const rates = await getNbpRatesCached();
    return 2 * (rates.referenceRate + 3.5);
  } catch {
    return 2 * (5.75 + 3.5);
  }
}

async function validateProposal(
  params: ProposalParams,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  project: any,
  investorMaxLtv: number | null,
): Promise<string[]> {
  const settings = await getModuleSettings();
  const errors: string[] = [];
  if (params.amount <= 0) errors.push("Kwota musi być większa od zera.");
  if (
    params.periodMonths < settings.min_period_months ||
    params.periodMonths > settings.max_period_months
  ) {
    errors.push(
      `Okres musi mieścić się w zakresie ${settings.min_period_months}–${settings.max_period_months} miesięcy.`,
    );
  }
  const maxRate = await maxLegalInterestPercent();
  if (params.interestRatePercent > maxRate) {
    errors.push(
      `Oprocentowanie przekracza odsetki maksymalne (${maxRate.toFixed(2)}% w skali roku).`,
    );
  }
  if (params.commission > params.amount * 0.2) {
    errors.push("Prowizja przekracza dopuszczalny limit (20% kwoty pożyczki).");
  }
  const ltv = computeLtv(params.amount, Number(project.property_value) || null);
  const ltvLimit = Math.min(settings.max_ltv_percent, investorMaxLtv ?? Infinity);
  if (ltv != null && ltv > ltvLimit) {
    errors.push(`LTV proponowanej kwoty (${ltv}%) przekracza limit ${ltvLimit}%.`);
  }
  if (params.validUntil && new Date(params.validUntil).getTime() < Date.now()) {
    errors.push("Termin ważności propozycji nie może być w przeszłości.");
  }
  return errors;
}

/** Przeliczenie kalkulatora po stronie serwera (live w UI + przed zapisem). */
export const computeProposalServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ assignmentId: z.string().uuid(), params: proposalParamsSchema }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId as string;
    await assertApprovedInvestor(userId);
    const { project } = await requireInterestedAssignment(userId, data.assignmentId);
    const computed = computeProposal(
      data.params as ProposalParams,
      Number(project.amount),
      Number(project.property_value) || null,
    );
    return { computed, serverNow: new Date().toISOString() };
  });

const REQUIRED_STATEMENTS = [
  "risk_analysis_read",
  "analysis_is_auxiliary",
  "independent_decision",
  "not_a_loan_agreement",
  "forward_for_negotiation",
] as const;

export const PROPOSAL_STATEMENT_LABELS: Record<(typeof REQUIRED_STATEMENTS)[number], string> = {
  risk_analysis_read: "Zapoznałem się z analizą ryzyka",
  analysis_is_auxiliary: "Rozumiem, że analiza ma charakter pomocniczy",
  independent_decision: "Podejmuję decyzję samodzielnie",
  not_a_loan_agreement: "Propozycja nie jest jeszcze umową pożyczki",
  forward_for_negotiation: "Akceptuję przekazanie propozycji do dalszych negocjacji",
};

/**
 * Złożenie propozycji finansowania: pełna serwerowa walidacja + ponowne
 * przeliczenie, niezmienny zapis (wersja, snapshot ryzyka, oświadczenia),
 * projekt → offer_submitted (stop dalszego dopasowywania), powiadomienie
 * administratora.
 */
export const submitProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        assignmentId: z.string().uuid(),
        params: proposalParamsSchema,
        statements: z.array(z.enum(REQUIRED_STATEMENTS)),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId as string;
    const access = await assertApprovedInvestor(userId);
    const { assignment, project } = await requireInterestedAssignment(userId, data.assignmentId);

    if (await hasActiveProposal(assignment.id)) {
      return { ok: false as const, code: "already_submitted" as const, errors: [] };
    }

    const missingStatements = REQUIRED_STATEMENTS.filter((s) => !data.statements.includes(s));
    if (missingStatements.length) {
      return {
        ok: false as const,
        code: "statements_missing" as const,
        errors: ["Zaakceptuj wszystkie wymagane oświadczenia."],
      };
    }

    const prefs = access.preferences as { maxLtvPercent?: number };
    const errors = await validateProposal(
      data.params as ProposalParams,
      project,
      prefs?.maxLtvPercent ?? null,
    );
    if (errors.length) return { ok: false as const, code: "validation" as const, errors };

    // Serwer przelicza wszystko od zera — wyniki klienta są tylko poglądowe.
    const computed = computeProposal(
      data.params as ProposalParams,
      Number(project.amount),
      Number(project.property_value) || null,
    );
    const settings = await getModuleSettings();
    const risk = analyzeProjectRisk(project, settings.ltv_bands, prefs?.maxLtvPercent ?? null);

    const { data: prior } = await db
      .from("project_proposals")
      .select("version")
      .eq("assignment_id", assignment.id)
      .order("version", { ascending: false })
      .limit(1);
    const version = ((prior?.[0]?.version as number | undefined) ?? 0) + 1;

    const nowIso = new Date().toISOString();
    const { data: proposal, error } = await db
      .from("project_proposals")
      .insert({
        project_id: project.id,
        project_version: project.version,
        assignment_id: assignment.id,
        investor_id: userId,
        version,
        status: "submitted",
        params: data.params,
        computed,
        statements: REQUIRED_STATEMENTS.map((kind) => ({ kind, accepted_at: nowIso })),
        risk_snapshot: risk,
        valid_until: data.params.validUntil ?? null,
        submitted_at: nowIso,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Projekt → offer_submitted, o ile nikt go w międzyczasie nie wycofał.
    const { error: projectErr } = await db
      .from("investment_projects")
      .update({ status: "offer_submitted" })
      .eq("id", project.id)
      .in("status", ["initial_interest", "full_offer_review"]);
    if (projectErr) console.error("[projects] project status update failed:", projectErr.message);

    await projectAudit({
      actorId: userId,
      subjectUserId: userId,
      entityType: "proposal",
      entityId: proposal.id,
      action: "proposal_submitted",
      newStatus: "submitted",
      details: { project_id: project.id, project_version: project.version, version },
    });

    // Powiadomienie administratora Finance You (best-effort).
    try {
      const { notifyAdminProjectReview } = await import("./lifecycle.server");
      const adminEmail = process.env.PROJECTS_ADMIN_EMAIL || process.env.RESEND_FROM_ADDRESS;
      if (adminEmail) {
        const { sendResendEmail } = await import("@/lib/resend-send.server");
        await sendResendEmail({
          to: adminEmail,
          subject: "Finance You — nowa propozycja finansowania w module projektów",
          text: `Inwestor złożył propozycję finansowania (propozycja ${proposal.id}). Otwórz panel administratora, aby ją rozpatrzyć.`,
        });
      } else {
        void notifyAdminProjectReview;
      }
    } catch (e) {
      console.error("[projects] admin proposal notify failed:", e);
    }

    return { ok: true as const, code: "ok" as const, proposalId: proposal.id, errors: [] };
  });

/** Wycofanie propozycji przez inwestora (przed decyzją Finance You). */
export const withdrawProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ proposalId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const userId = context.userId as string;
    await assertApprovedInvestor(userId);
    const { data: proposal, error } = await db
      .from("project_proposals")
      .select("id, status, project_id, assignment_id")
      .eq("id", data.proposalId)
      .eq("investor_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!proposal) throw new Error("Nie znaleziono propozycji.");
    if (
      !["submitted", "under_review", "additional_information_required", "counteroffer"].includes(
        proposal.status,
      )
    ) {
      throw new Error("Tej propozycji nie można już wycofać.");
    }

    const { error: updErr } = await db
      .from("project_proposals")
      .update({ status: "withdrawn", decided_at: new Date().toISOString() })
      .eq("id", proposal.id);
    if (updErr) throw new Error(updErr.message);

    // Projekt wraca do stanu wstępnego zainteresowania (termin nadal biegnie).
    await db
      .from("investment_projects")
      .update({ status: "initial_interest" })
      .eq("id", proposal.project_id)
      .eq("status", "offer_submitted");

    await projectAudit({
      actorId: userId,
      subjectUserId: userId,
      entityType: "proposal",
      entityId: proposal.id,
      action: "proposal_withdrawn",
      previousStatus: proposal.status,
      newStatus: "withdrawn",
    });
    return { ok: true as const };
  });

/** „Moje propozycje" — status + parametry własnych propozycji. */
export const listMyProposals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId as string;
    await assertApprovedInvestor(userId);
    const { data: rows, error } = await db
      .from("project_proposals")
      .select(
        "id, project_id, assignment_id, version, status, params, computed, submitted_at, valid_until, decision_reason, counteroffer, created_at",
      )
      .eq("investor_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const proposals = (rows ?? []) as { project_id: string }[];

    const projectIds = Array.from(new Set(proposals.map((p) => p.project_id)));
    const { data: projects } = projectIds.length
      ? await db
          .from("investment_projects")
          .select("id, amount, property_type, city")
          .in("id", projectIds)
      : { data: [] };
    const byId = new Map(
      (
        (projects ?? []) as { id: string; amount: number; property_type: string; city: string }[]
      ).map((p) => [
        p.id,
        {
          amount: Number(p.amount),
          propertyTypeLabel:
            PROPERTY_TYPE_LABELS[p.property_type as ProjectPropertyType] ?? p.property_type,
          city: p.city,
        },
      ]),
    );
    return {
      proposals: proposals.map((p) => ({ ...p, project: byId.get(p.project_id) ?? null })),
    };
  });

/** „Poproś o dodatkowe informacje" — pytanie trafia do obsługi Finance You. */
export const createInfoRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ assignmentId: z.string().uuid(), question: z.string().min(5).max(4000) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId as string;
    await assertApprovedInvestor(userId);
    const { assignment, project } = await requireInterestedAssignment(userId, data.assignmentId);

    const { data: row, error } = await db
      .from("project_info_requests")
      .insert({
        project_id: project.id,
        assignment_id: assignment.id,
        investor_id: userId,
        question: data.question,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await projectAudit({
      actorId: userId,
      subjectUserId: userId,
      entityType: "info_request",
      entityId: row.id,
      action: "info_request_created",
      details: { project_id: project.id },
    });

    const adminEmail = process.env.PROJECTS_ADMIN_EMAIL || process.env.RESEND_FROM_ADDRESS;
    if (adminEmail) {
      const { sendResendEmail } = await import("@/lib/resend-send.server");
      void sendResendEmail({
        to: adminEmail,
        subject: "Finance You — pytanie inwestora o projekt",
        text: `Inwestor poprosił o dodatkowe informacje do projektu (zgłoszenie ${row.id}). Treść pytania dostępna w panelu administratora.`,
      }).catch(() => undefined);
    }
    return { ok: true as const, requestId: row.id };
  });

/**
 * Krótkotrwały signed URL dokumentu projektu — wyłącznie dla dokumentów
 * z listy projektu, po pełnej weryfikacji przypisania; każde otwarcie jest
 * logowane (project_document_access_log).
 */
export const getProjectDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ assignmentId: z.string().uuid(), path: z.string().min(1) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId as string;
    await assertApprovedInvestor(userId);
    const { assignment, project } = await requireInterestedAssignment(userId, data.assignmentId);

    const documents = (
      Array.isArray(project.available_documents)
        ? (project.available_documents as { path?: string }[])
        : []
    ).map((d) => d?.path);
    if (!documents.includes(data.path)) {
      throw new Error("Dokument nie należy do tego projektu.");
    }

    const url = await signPath(data.path, 300);
    if (!url) throw new Error("Nie udało się otworzyć dokumentu.");

    await db.from("project_document_access_log").insert({
      project_id: project.id,
      assignment_id: assignment.id,
      investor_id: userId,
      document_path: data.path,
      action: "view",
    });
    await projectAudit({
      actorId: userId,
      subjectUserId: userId,
      entityType: "document",
      entityId: data.path,
      action: "document_opened",
      details: { project_id: project.id },
    });

    return { url, watermark: await investorWatermark(userId) };
  });
