// Pakiet inwestora (Podstawowy / PRO): stan konta, bramki modułów PRO,
// odblokowania pojedynczych okazji i naliczanie opłaty sukcesu 5%.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AccessProduct } from "@/lib/access/core";
import {
  PRODUCT_PRO_180D,
  PRODUCT_OKAZJA_UNLOCK,
  SUCCESS_FEE_BPS,
  UNLOCK_PRICE_GROSZ,
  successFeeGrosz,
  tierHasFeature,
  FEATURE_LABELS,
  type InvestorFeature,
  type InvestorTier,
} from "./plans";

const loose = (c: unknown) => c as any;

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return loose(supabaseAdmin);
}

/** Pakiet inwestora czytany z zaufanego źródła (SQL `investor_tier`). */
export async function investorTier(userId: string): Promise<InvestorTier> {
  const db = await adminDb();
  const { data } = await db.rpc("investor_tier", { _user_id: userId });
  return data === "pro" ? "pro" : "podstawowy";
}

/** Bramka serwerowa modułów PRO (Akademia, compliance, AML, windykacja AI). */
export async function assertInvestorPro(userId: string, feature: InvestorFeature): Promise<void> {
  const tier = await investorTier(userId);
  if (tierHasFeature(tier, feature)) return;
  throw new Error(
    `PAYWALL_INVESTOR_PRO: „${FEATURE_LABELS[feature]}" jest dostępne w pakiecie PRO.`,
  );
}

export interface InvestorPlanState {
  tier: InvestorTier;
  activeUntil: string | null;
  daysLeft: number;
  /** Produkt PRO z katalogu (cena zawsze z bazy, nie z frontendu). */
  proProduct: AccessProduct | null;
  /** Produkt „odblokowanie okazji" dla pakietu Podstawowego. */
  unlockProduct: AccessProduct | null;
  unlockPriceGrosz: number;
  successFeeBps: number;
  unlockedMatchIds: string[];
  successFees: {
    id: string;
    matchId: string;
    loanAmountPln: number;
    feeGrosz: number;
    status: string;
    createdAt: string;
  }[];
}

/** Stan pakietu zalogowanego inwestora — jedno źródło dla panelu. */
export const getMyInvestorPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InvestorPlanState> => {
    const userId = context.userId as string;
    const db = await adminDb();

    const [{ data: tier }, { data: ent }, { data: products }, { data: unlocks }, { data: fees }] =
      await Promise.all([
        db.rpc("investor_tier", { _user_id: userId }),
        db
          .from("access_entitlements")
          .select("active_until")
          .eq("user_id", userId)
          .eq("audience", "investor")
          .maybeSingle(),
        db
          .from("access_products")
          .select(
            "id,code,audience,label,duration_days,amount_grosz,currency,active,sort_order,kind,tier,success_fee_bps",
          )
          .in("code", [PRODUCT_PRO_180D, PRODUCT_OKAZJA_UNLOCK]),
        db.from("investor_opportunity_unlocks").select("match_id").eq("user_id", userId),
        db
          .from("investor_success_fees")
          .select("id, match_id, loan_amount_pln, fee_grosz, status, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

    const list = (products ?? []) as AccessProduct[];
    const proProduct = list.find((p) => p.code === PRODUCT_PRO_180D) ?? null;
    const unlockProduct = list.find((p) => p.code === PRODUCT_OKAZJA_UNLOCK) ?? null;
    const activeUntil = (ent?.active_until as string | null) ?? null;
    const msLeft = activeUntil ? new Date(activeUntil).getTime() - Date.now() : 0;

    return {
      tier: tier === "pro" ? "pro" : "podstawowy",
      activeUntil,
      daysLeft: msLeft > 0 ? Math.ceil(msLeft / 86_400_000) : 0,
      proProduct,
      unlockProduct,
      unlockPriceGrosz: unlockProduct?.amount_grosz ?? UNLOCK_PRICE_GROSZ,
      successFeeBps: proProduct?.success_fee_bps ?? SUCCESS_FEE_BPS,
      unlockedMatchIds: ((unlocks ?? []) as { match_id: string }[]).map((u) => u.match_id),
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

/** Czy inwestor widzi pełne dane konkretnej okazji (PRO albo wykupiona). */
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

/**
 * Naliczenie opłaty sukcesu 5% od kwoty udzielonej pożyczki (tylko PRO).
 * Wywoływane po potwierdzeniu Załącznika nr 6 przy wypłacie.
 *
 * Rekord powstaje ze statusem `wstrzymana`, dopóki obowiązuje Umowa ramowa
 * v5 (§ 7: usługa nieodpłatna dla Inwestora). Aktywacja wersji dopuszczającej
 * odpłatność przestawia status na `naliczona` — bez niej nie wystawiamy
 * wezwania ani faktury.
 */
export async function registerSuccessFee(input: {
  matchId: string;
  loanAmountPln: number;
}): Promise<{ registered: boolean; feeGrosz: number; status: string } | null> {
  const db = await adminDb();

  const { data: match } = await db
    .from("investor_order_matches")
    .select("id, order_id")
    .eq("id", input.matchId)
    .maybeSingle();
  if (!match) return null;

  const { data: order } = await db
    .from("investor_orders")
    .select("user_id")
    .eq("id", match.order_id)
    .maybeSingle();
  if (!order?.user_id) return null;

  const tier = await investorTier(order.user_id);
  if (tier !== "pro") return null;

  const { data: product } = await db
    .from("access_products")
    .select("success_fee_bps")
    .eq("code", PRODUCT_PRO_180D)
    .maybeSingle();
  const bps = Number(product?.success_fee_bps ?? SUCCESS_FEE_BPS);
  const feeGrosz = successFeeGrosz(input.loanAmountPln, bps);
  if (feeGrosz <= 0) return null;

  // Odpłatność wymaga aktywnej wersji Umowy ramowej dopuszczającej opłaty
  // od Inwestora — sprawdzamy rejestr dokumentów, nie zakładamy niczego.
  const { data: ramowa } = await db
    .from("legal_documents")
    .select("version, allows_investor_fees")
    .eq("code", "umowa_ramowa")
    .eq("active", true)
    .maybeSingle();
  const allowed = Boolean(ramowa?.allows_investor_fees);

  const { error } = await db.from("investor_success_fees").upsert(
    {
      user_id: order.user_id,
      match_id: input.matchId,
      loan_amount_pln: input.loanAmountPln,
      fee_bps: bps,
      fee_grosz: feeGrosz,
      status: allowed ? "naliczona" : "wstrzymana",
      legal_basis: allowed
        ? `Umowa ramowa ${ramowa?.version ?? ""} — odpłatność Pakietu PRO`.trim()
        : "Wstrzymane: aktywna Umowa ramowa nie dopuszcza opłat od Inwestora (§ 7).",
    },
    { onConflict: "match_id", ignoreDuplicates: false },
  );
  if (error) {
    console.error("[investor-plan] success fee upsert failed", error.message);
    return null;
  }
  return { registered: true, feeGrosz, status: allowed ? "naliczona" : "wstrzymana" };
}

// ── Panel administratora: opłaty sukcesu PRO ────────────────────────────────

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

/** Rejestr opłat sukcesu + informacja, czy aktywna umowa dopuszcza opłaty. */
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
      // Aktywna wersja umowy dopuszcza wynagrodzenie Finance You od Inwestora
      // (v6 = true). Dopóki false, opłaty sukcesu są tylko rejestrowane.
      feesAllowed: Boolean(ramowa?.active && ramowa?.allows_investor_fees),
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
 * Zmiana statusu opłaty sukcesu przez administratora. Przejście ze statusu
 * `wstrzymana` na `naliczona` jest możliwe TYLKO wtedy, gdy aktywna wersja
 * Umowy ramowej dopuszcza wynagrodzenie od Inwestora — decyzję podejmuje
 * człowiek, migracja niczego nie odmraża sama.
 */
export const setSuccessFeeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        feeId: z.string().uuid(),
        status: z.enum(["wstrzymana", "naliczona", "zafakturowana", "oplacona", "anulowana"]),
        note: z.string().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as any, context.userId);
    const db = await adminDb();

    if (data.status !== "wstrzymana" && data.status !== "anulowana") {
      const { data: ramowa } = await db
        .from("legal_documents")
        .select("version, active, allows_investor_fees")
        .eq("code", "umowa_ramowa")
        .maybeSingle();
      if (!ramowa?.active || !ramowa?.allows_investor_fees) {
        throw new Error(
          "Aktywna wersja Umowy ramowej nie dopuszcza wynagrodzenia od Inwestora — najpierw aktywuj wersję z Cennikiem Pakietów (v6).",
        );
      }
    }

    const { error } = await db
      .from("investor_success_fees")
      .update({ status: data.status, note: data.note ?? null })
      .eq("id", data.feeId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
