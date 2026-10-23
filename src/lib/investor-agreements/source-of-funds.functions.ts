// Krok 5 pipeline'u inwestora — oświadczenie o źródle pochodzenia środków
// (AML) składane z panelu oraz decyzje compliance w panelu administratora.
//
// Zasady:
//  - oświadczenie zapisujemy w całości (treść + wersja + IP + user-agent) do
//    tabeli append-only; profil inwestora trzyma tylko status najnowszego;
//  - bez sygnałów ryzyka krok zamyka się sam (`zlozone`); każdy sygnał kieruje
//    oświadczenie do człowieka (`do_weryfikacji`) i wstrzymuje umowy i Zlecenie;
//  - decyzje (akceptacja / prośba o dokumenty / odrzucenie) podejmuje personel
//    (administrator lub operator) z obowiązkowym uzasadnieniem — trafiają do
//    nieusuwalnego logu audytowego modułu screeningu.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  SOF_DECLARATION_TEXT,
  SOF_DECLARATION_TEXT_VERSION,
  SOF_DONE_STATUSES,
  SourceOfFundsInput,
  assessSourceOfFunds,
  type SofRiskFlag,
  type SourceOfFundsStatus,
} from "@/lib/investor-plan/source-of-funds";

// Typy wygenerowane dla Supabase nie znają jeszcze tabel tej migracji.
const loose = (c: unknown) => c as any;

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return loose(supabaseAdmin);
}

const INVESTOR_COLUMNS =
  "id, user_id, entity_variant, first_name, last_name, company_name, email, " +
  "lender_data_completed_at, screening_result, sof_declaration_id, sof_status, sof_declared_at, sof_reviewed_at";

const DECLARATION_COLUMNS =
  "id, investor_id, user_id, sources, other_description, description, funds_country, planned_scale, " +
  "statements, risk_flags, declaration_text_version, signed_at, channel, review_status, reviewed_by, " +
  "reviewed_at, review_note";

async function myInvestor(db: any, userId: string) {
  const { data } = await db
    .from("investors")
    .select(INVESTOR_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

async function kycApproved(db: any, userId: string): Promise<boolean> {
  const { data } = await db
    .from("didit_verifications")
    .select("status")
    .eq("vendor_data", `investor:${userId}`)
    .eq("status", "Approved")
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

/** Jawny, serializowalny kształt oświadczenia dla panelu inwestora i administratora. */
export interface SourceOfFundsDeclarationView {
  id: string;
  sources: string[];
  other_description: string | null;
  description: string | null;
  funds_country: string;
  planned_scale: string;
  risk_flags: SofRiskFlag[];
  declaration_text_version: string;
  signed_at: string;
  channel: string;
  review_status: SourceOfFundsStatus;
  reviewed_at: string | null;
  /** Dla inwestora wypełniona tylko przy statusie `do_uzupelnienia` (co ma dostarczyć). */
  review_note: string | null;
}

function toView(row: any, opts: { forInvestor: boolean }): SourceOfFundsDeclarationView {
  const status = row.review_status as SourceOfFundsStatus;
  return {
    id: row.id,
    sources: (row.sources ?? []) as string[],
    other_description: row.other_description ?? null,
    description: row.description ?? null,
    funds_country: row.funds_country,
    planned_scale: row.planned_scale,
    risk_flags: (row.risk_flags ?? []) as SofRiskFlag[],
    declaration_text_version: row.declaration_text_version,
    signed_at: row.signed_at,
    channel: row.channel,
    review_status: status,
    reviewed_at: row.reviewed_at ?? null,
    review_note:
      opts.forInvestor && status !== "do_uzupelnienia" ? null : (row.review_note ?? null),
  };
}

function requestMeta(request: Request | undefined | null): {
  ip: string | null;
  userAgent: string | null;
} {
  const ip =
    request?.headers.get("cf-connecting-ip") ||
    request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null;
  return { ip, userAgent: request?.headers.get("user-agent")?.slice(0, 500) ?? null };
}

// ── Panel inwestora ─────────────────────────────────────────────────────────

export interface MySourceOfFundsState {
  hasInvestor: boolean;
  entityVariant: "osoba_fizyczna" | "jdg" | "osoba_prawna" | null;
  /** Krok 5 jest dostępny po pozytywnym KYC (krok 3). */
  kycApproved: boolean;
  status: SourceOfFundsStatus | null;
  latest: SourceOfFundsDeclarationView | null;
  declarationText: string;
}

/** Najnowsze oświadczenie zalogowanego inwestora + treść do wyświetlenia. */
export const getMySourceOfFundsDeclaration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MySourceOfFundsState> => {
    const db = await adminDb();
    const investor = await myInvestor(db, context.userId);
    if (!investor) {
      return {
        hasInvestor: false,
        entityVariant: null,
        kycApproved: false,
        status: null,
        latest: null,
        declarationText: SOF_DECLARATION_TEXT,
      };
    }
    const [{ data: latest }, kyc] = await Promise.all([
      db
        .from("investor_source_of_funds_declarations")
        .select(DECLARATION_COLUMNS)
        .eq("user_id", context.userId)
        .order("signed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      kycApproved(db, context.userId),
    ]);
    return {
      hasInvestor: true,
      entityVariant: (investor.entity_variant ?? null) as MySourceOfFundsState["entityVariant"],
      kycApproved: kyc,
      status: (investor.sof_status ?? null) as SourceOfFundsStatus | null,
      latest: latest ? toView(latest, { forInvestor: true }) : null,
      declarationText: SOF_DECLARATION_TEXT,
    };
  });

/** Złożenie oświadczenia. Wymaga danych pożyczkodawcy (krok 1) i pozytywnego KYC (krok 3). */
export const submitMySourceOfFundsDeclaration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SourceOfFundsInput.parse(d))
  .handler(async ({ data, context }) => {
    if (data.declaration_text_version !== SOF_DECLARATION_TEXT_VERSION) {
      throw new Error(
        "Treść oświadczenia została zaktualizowana — odśwież stronę i złóż oświadczenie ponownie.",
      );
    }
    const db = await adminDb();
    const investor = await myInvestor(db, context.userId);
    if (!investor?.lender_data_completed_at) {
      throw new Error("Najpierw uzupełnij krok 1 — dane pożyczkodawcy.");
    }
    if (!(await kycApproved(db, context.userId))) {
      throw new Error(
        "Oświadczenie o źródle środków składasz po pozytywnej weryfikacji tożsamości (krok 3).",
      );
    }
    if (investor.sof_status === "odrzucone") {
      throw new Error(
        "Poprzednie oświadczenie zostało odrzucone przez compliance Finance You — nowe możesz złożyć po kontakcie z nami.",
      );
    }

    const assessment = assessSourceOfFunds(data);
    const meta = requestMeta(getRequest());
    const nowIso = new Date().toISOString();

    const { data: row, error } = await db
      .from("investor_source_of_funds_declarations")
      .insert({
        user_id: context.userId,
        investor_id: investor.id,
        sources: data.sources,
        other_description: data.sources.includes("inne")
          ? data.other_description?.trim() || null
          : null,
        description: data.description?.trim() || null,
        funds_country: data.funds_country,
        planned_scale: data.planned_scale,
        statements: { ...data.statements, truth_confirmed: true },
        risk_flags: assessment.flags,
        declaration_text_version: SOF_DECLARATION_TEXT_VERSION,
        declaration_text: SOF_DECLARATION_TEXT,
        signed_at: nowIso,
        ip: meta.ip,
        user_agent: meta.userAgent,
        channel: "investor_pipeline",
        review_status: assessment.status,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Nie zapisano oświadczenia: ${error.message}`);

    const { error: updErr } = await db
      .from("investors")
      .update({
        sof_declaration_id: row.id,
        sof_status: assessment.status,
        sof_declared_at: nowIso,
        sof_reviewed_at: null,
      })
      .eq("id", investor.id);
    if (updErr) throw new Error(updErr.message);

    const { screeningAudit } = await import("@/lib/screening/db.server");
    await screeningAudit({
      eventType: "sof_declaration.signed",
      entityType: "declaration",
      entityId: row.id,
      actorId: context.userId,
      details: {
        kind: "source_of_funds",
        investorId: investor.id,
        status: assessment.status,
        flags: assessment.flags,
        version: SOF_DECLARATION_TEXT_VERSION,
        channel: "investor_pipeline",
      },
    });

    // Sygnały ryzyka → osoba odpowiedzialna za AML. Błąd poczty nie cofa zapisu.
    if (assessment.status === "do_weryfikacji") {
      try {
        const [{ getScreeningSettings }, { notifySourceOfFundsReview }] = await Promise.all([
          import("@/lib/screening/db.server"),
          import("@/lib/screening/notify.server"),
        ]);
        await notifySourceOfFundsReview(await getScreeningSettings(), {
          investorId: investor.id,
          flags: assessment.flags,
        });
      } catch (e) {
        console.error("[sof] powiadomienie compliance nie wyszło:", e);
      }
    }

    return { ok: true as const, id: row.id, status: assessment.status, flags: assessment.flags };
  });

// ── Panel administratora (compliance) ───────────────────────────────────────

async function requireStaff(db: any, userId: string) {
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role as string);
  if (!roles.includes("administrator") && !roles.includes("operator")) {
    throw new Error("Brak uprawnień (administrator/operator).");
  }
}

export interface InvestorSourceOfFundsAdminView {
  investor: {
    id: string;
    sof_status: SourceOfFundsStatus | null;
    sof_declared_at: string | null;
    sof_reviewed_at: string | null;
    sof_declaration_id: string | null;
    screening_result: string | null;
  } | null;
  declarations: SourceOfFundsDeclarationView[];
}

/** Historia oświadczeń inwestora (najnowsze pierwsze) — panel administratora. */
export const listInvestorSourceOfFunds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ investorId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<InvestorSourceOfFundsAdminView> => {
    const db = await adminDb();
    await requireStaff(db, context.userId);
    const [{ data: investor }, { data: rows }] = await Promise.all([
      db
        .from("investors")
        .select(
          "id, sof_status, sof_declared_at, sof_reviewed_at, sof_declaration_id, screening_result",
        )
        .eq("id", data.investorId)
        .maybeSingle(),
      db
        .from("investor_source_of_funds_declarations")
        .select(DECLARATION_COLUMNS)
        .eq("investor_id", data.investorId)
        .order("signed_at", { ascending: false })
        .limit(50),
    ]);
    return {
      investor: investor
        ? {
            id: investor.id,
            sof_status: (investor.sof_status ?? null) as SourceOfFundsStatus | null,
            sof_declared_at: investor.sof_declared_at ?? null,
            sof_reviewed_at: investor.sof_reviewed_at ?? null,
            sof_declaration_id: investor.sof_declaration_id ?? null,
            screening_result: investor.screening_result ?? null,
          }
        : null,
      declarations: ((rows ?? []) as any[]).map((r) => toView(r, { forInvestor: false })),
    };
  });

export const SofDecision = z.enum(["zaakceptowane", "do_uzupelnienia", "odrzucone"]);
export type SofDecision = z.infer<typeof SofDecision>;

/**
 * Decyzja compliance dla NAJNOWSZEGO oświadczenia inwestora. Uzasadnienie
 * obowiązkowe; przy `do_uzupelnienia` jego treść widzi inwestor w panelu.
 */
export const decideInvestorSourceOfFunds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        declarationId: z.string().uuid(),
        decision: SofDecision,
        note: z.string().trim().min(10, "Uzasadnienie decyzji: co najmniej 10 znaków.").max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await adminDb();
    await requireStaff(db, context.userId);

    const { data: decl } = await db
      .from("investor_source_of_funds_declarations")
      .select("id, investor_id, review_status")
      .eq("id", data.declarationId)
      .maybeSingle();
    if (!decl) throw new Error("Nie znaleziono oświadczenia.");

    const { data: investor } = await db
      .from("investors")
      .select("id, sof_declaration_id")
      .eq("id", decl.investor_id)
      .maybeSingle();
    if (!investor) throw new Error("Nie znaleziono inwestora.");
    if (investor.sof_declaration_id !== decl.id) {
      throw new Error(
        "Decyzję można podjąć tylko dla najnowszego oświadczenia — inwestor złożył już nowe.",
      );
    }

    const nowIso = new Date().toISOString();
    const { error } = await db
      .from("investor_source_of_funds_declarations")
      .update({
        review_status: data.decision,
        reviewed_by: context.userId,
        reviewed_at: nowIso,
        review_note: data.note,
      })
      .eq("id", decl.id);
    if (error) throw new Error(error.message);

    const { error: updErr } = await db
      .from("investors")
      .update({ sof_status: data.decision, sof_reviewed_at: nowIso })
      .eq("id", investor.id);
    if (updErr) throw new Error(updErr.message);

    const { screeningAudit } = await import("@/lib/screening/db.server");
    await screeningAudit({
      eventType: "sof_declaration.decided",
      entityType: "declaration",
      entityId: decl.id,
      actorId: context.userId,
      details: {
        kind: "source_of_funds",
        investorId: investor.id,
        from: decl.review_status,
        to: data.decision,
        note: data.note,
      },
    });

    return {
      ok: true as const,
      status: data.decision,
      unlocksPipeline: SOF_DONE_STATUSES.includes(data.decision),
    };
  });
