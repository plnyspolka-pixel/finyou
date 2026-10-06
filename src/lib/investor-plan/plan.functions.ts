// Dostęp inwestora (jeden poziom, abonament) + rejestr HISTORYCZNYCH opłat
// sukcesu w panelu administratora.
//
// Od 2026-09 (Umowa ramowa v7) nie ma pakietu PRO, opłaty sukcesu ani
// odblokowań pojedynczych okazji; od 2026-09-30 Inwestor płaci wyłącznie
// Opłatę Abonamentową (7 000 zł / 365 dni; od 2026-10-06 tylko roczny).
// `investorTier` zwraca jeden poziom, `assertInvestorPro` sprawdza aktywny
// abonament; `confirmZal6` nie nalicza niczego inwestorowi.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SUCCESS_FEE_BPS, tierHasFeature, type InvestorFeature, type InvestorTier } from "./plans";

const loose = (c: unknown) => c as any;

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return loose(supabaseAdmin);
}

/** Poziom dostępu inwestora — zawsze 'podstawowy' (SQL `investor_tier`). */
export async function investorTier(_userId: string): Promise<InvestorTier> {
  return "podstawowy";
}

/** Bramka modułów panelu — aktywny abonament inwestora (albo personel). */
export async function assertInvestorPro(userId: string, feature: InvestorFeature): Promise<void> {
  const tier = await investorTier(userId);
  if (!tierHasFeature(tier, feature)) throw new Error("Funkcja niedostępna.");
  const { assertInvestorFullAccess } = await import("@/lib/access/guards.server");
  await assertInvestorFullAccess(userId);
}

export interface InvestorPlanState {
  tier: InvestorTier;
  /** Zawsze 0 — opłata sukcesu zniesiona. */
  successFeeBps: number;
  /** Historyczne opłaty sukcesu inwestora (sprzed v7) — tylko do wglądu. */
  successFees: {
    id: string;
    matchId: string;
    loanAmountPln: number;
    feeGrosz: number;
    status: string;
    createdAt: string;
  }[];
}

/** Stan dostępu zalogowanego inwestora — jedno źródło dla panelu. */
export const getMyInvestorPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InvestorPlanState> => {
    const userId = context.userId as string;
    const db = await adminDb();
    const { data: fees } = await db
      .from("investor_success_fees")
      .select("id, match_id, loan_amount_pln, fee_grosz, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    return {
      tier: "podstawowy",
      successFeeBps: SUCCESS_FEE_BPS,
      successFees: ((fees ?? []) as any[]).map((f) => ({
        id: f.id,
        matchId: f.match_id,
        loanAmountPln: Number(f.loan_amount_pln),
        feeGrosz: Number(f.fee_grosz),
        status: f.status,
        createdAt: f.created_at,
      })),
    };
  });

/** Czy inwestor widzi pełne dane konkretnego Projektu — zawsze dla właściciela Dopasowania. */
export const canOpenMatch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ matchId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await adminDb();
    const { data: ok } = await db.rpc("investor_can_open_match", {
      _user_id: context.userId,
      _match_id: data.matchId,
    });
    return { canOpen: Boolean(ok) };
  });

// ── Panel administratora: historyczne opłaty sukcesu ───────────────────────

async function assertAdmin(supabase: any, userId: string) {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const ok = ((roles ?? []) as { role: string }[]).some((r) => r.role === "administrator");
  if (!ok) throw new Error("Brak uprawnień (wymagana rola administrator).");
}

export interface SuccessFeeAdminRow {
  id: string;
  userId: string;
  matchId: string;
  projectRef: string | null;
  loanAmountPln: number;
  feeBps: number;
  feeGrosz: number;
  status: string;
  legalBasis: string | null;
  createdAt: string;
}

/** Rejestr historycznych opłat sukcesu (sekcja nieaktywna). */
export const getSuccessFeesAdminState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as any, context.userId);
    const db = await adminDb();
    const [{ data: fees }, { data: ramowa }] = await Promise.all([
      db
        .from("investor_success_fees")
        .select(
          "id, user_id, match_id, loan_amount_pln, fee_bps, fee_grosz, status, legal_basis, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("legal_documents")
        .select("version, active, allows_investor_fees")
        .eq("code", "umowa_ramowa")
        .maybeSingle(),
    ]);

    const matchIds = ((fees ?? []) as any[]).map((f) => f.match_id);
    let refs = new Map<string, string>();
    if (matchIds.length > 0) {
      const { data: matches } = await db
        .from("investor_order_matches")
        .select("id, project_ref")
        .in("id", matchIds);
      refs = new Map(((matches ?? []) as any[]).map((m) => [m.id, m.project_ref]));
    }

    return {
      // Opłata Sukcesu zniesiona w v7 (allows_investor_fees dotyczy dziś wyłącznie
      // Opłaty Abonamentowej) — ta sekcja pozostaje historyczna.
      feesAllowed: false,
      contractVersion: (ramowa?.version as string | null) ?? null,
      contractActive: Boolean(ramowa?.active),
      fees: ((fees ?? []) as any[]).map(
        (f): SuccessFeeAdminRow => ({
          id: f.id,
          userId: f.user_id,
          matchId: f.match_id,
          projectRef: refs.get(f.match_id) ?? null,
          loanAmountPln: Number(f.loan_amount_pln),
          feeBps: Number(f.fee_bps),
          feeGrosz: Number(f.fee_grosz),
          status: f.status,
          legalBasis: f.legal_basis ?? null,
          createdAt: f.created_at,
        }),
      ),
    };
  });

/**
 * Zmiana statusu historycznej opłaty sukcesu przez administratora. Od v7
 * dozwolone jest wyłącznie anulowanie — naliczanie i fakturowanie opłat od
 * Inwestora nie ma podstawy umownej.
 */
export const setSuccessFeeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        feeId: z.string().uuid(),
        status: z.enum(["anulowana"]),
        note: z.string().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as any, context.userId);
    const db = await adminDb();
    const { error } = await db
      .from("investor_success_fees")
      .update({
        status: data.status,
        note: data.note ?? "Anulowana — Umowa ramowa v7: bez Opłaty Sukcesu.",
      })
      .eq("id", data.feeId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
