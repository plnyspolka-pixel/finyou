// Funkcje serwerowe darmowego konta inwestora.
//
// Darmowy inwestor przegląda oferty (zdjęcia + ZANONIMIZOWANA treść KW) i
// składa oferty w ramach limitów: 5 ofert / 2 zawarte pożyczki na 365 dni dla
// kwot ≤ 255 550 zł (powyżej progu — bez limitu liczby). Oprocentowanie ofert
// darmowego konta jest STAŁE i równe odsetkom maksymalnym liczonym na bieżąco
// ze stopy referencyjnej NBP; inwestor nie pobiera prowizji.
// Wszystkie dane wrażliwe pozostają na serwerze — klient dostaje wyłącznie
// dozwolone pola (żadnych danych klienta, adresu, właścicieli z KW).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { isShowablePropertyPhoto } from "@/lib/property-photos";
import {
  canConcludeFreeLoan,
  canSubmitFreeOffer,
  collectPersonalPhrases,
  maskKwNumber,
  redactJson,
  redactText,
  statutoryMaxAnnualRate,
  validateFreeOfferRate,
  FREE_AMOUNT_THRESHOLD_PLN,
  FREE_LOAN_LIMIT,
  FREE_OFFER_LIMIT,
  type FreeInvestorUsage,
} from "./free-investor";

const PHOTO_BUCKETS = ["pliki-klienta", "documents", "property-photos"] as const;

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function assertInvestorRole(db: any, userId: string): Promise<void> {
  const { data } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["inwestor", "administrator"]);
  if (!((data ?? []) as any[]).length) throw new Error("Brak uprawnień (wymagane konto inwestora)");
}

async function fetchFreeUsage(db: any, userId: string): Promise<FreeInvestorUsage> {
  const { data, error } = await db.rpc("free_investor_usage", { _user_id: userId });
  if (error) throw new Error(error.message);
  const u = (data ?? {}) as Record<string, unknown>;
  return {
    offersLast365: Number(u.offersLast365 ?? 0),
    loansLast365: Number(u.loansLast365 ?? 0),
  };
}

export interface FreeInvestorStateResult extends FreeInvestorUsage {
  offerLimit: number;
  loanLimit: number;
  thresholdPln: number;
  nbpReferenceRate: number;
  nbpEffectiveFrom: string | null;
  statutoryMaxRate: number;
}

export interface FreeOfferKwSection {
  kwNumberMasked: string;
  dzial1s: string | null;
  dzial3: string | null;
  dzial4: string | null;
  legalRiskScore: number | null;
  riskFlags: Json | null;
  investorSummary: string | null;
}

export interface FreeOfferDetailResult {
  id: string;
  createdAt: string;
  loanAmount: number | null;
  periodMonths: number | null;
  annualRate: number | null;
  ltv: number | null;
  maxMonthlyPayment: number | null;
  propertyType: string | null;
  city: string | null;
  voivodeship: string | null;
  estimatedValue: number | null;
  areaSqm: number | null;
  description: string | null;
  photoUrls: string[];
  kw: FreeOfferKwSection | null;
}

export type SubmitFreeOfferResult =
  | { ok: true; offerId: string; usage: FreeInvestorUsage; maxRate: number }
  | { ok: false; code: "FREE_OFFER_LIMIT" | "RATE_TOO_HIGH"; message?: string; maxRate?: number };

// ---------------------------------------------------------------------
// Stan darmowego konta: limity + aktualne odsetki maksymalne (NBP).
// ---------------------------------------------------------------------
export const getFreeInvestorState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FreeInvestorStateResult> => {
    const db = await adminDb();
    await assertInvestorRole(db, context.userId);
    const [usage, { getNbpRatesCached }] = await Promise.all([
      fetchFreeUsage(db, context.userId),
      import("@/lib/nbp-rates.server"),
    ]);
    const rates = await getNbpRatesCached();
    return {
      ...usage,
      offerLimit: FREE_OFFER_LIMIT,
      loanLimit: FREE_LOAN_LIMIT,
      thresholdPln: FREE_AMOUNT_THRESHOLD_PLN,
      nbpReferenceRate: rates.referenceRate,
      nbpEffectiveFrom: rates.effectiveFrom,
      statutoryMaxRate: statutoryMaxAnnualRate(rates.referenceRate),
    };
  });

// ---------------------------------------------------------------------
// Darmowy detal oferty: parametry zajawki + WSZYSTKIE bezpieczne zdjęcia
// (podpisane serwerowo) + zanonimizowana treść księgi wieczystej.
// ---------------------------------------------------------------------
export const getFreeOfferDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ applicationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<FreeOfferDetailResult> => {
    const db = await adminDb();
    await assertInvestorRole(db, context.userId);

    const { data: app } = await db
      .from("loan_applications")
      .select(
        "id, created_at, loan_amount, preferred_period_months, annual_investor_rate, estimated_ltv, max_monthly_payment, available_to_investors, visibility_level, deleted_at",
      )
      .eq("id", data.applicationId)
      .maybeSingle();
    if (
      !app ||
      !app.available_to_investors ||
      app.visibility_level !== "zanonimizowane" ||
      app.deleted_at
    ) {
      throw new Error("Oferta jest niedostępna");
    }

    const { data: property } = await db
      .from("properties")
      .select(
        "property_type, city, voivodeship, estimated_value, area_sqm, description, photos, land_register_number",
      )
      .eq("loan_application_id", app.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    // Zdjęcia: wyłącznie faktyczne zdjęcia nieruchomości (bez skanów dokumentów),
    // podpisywane po stronie serwera.
    const photoPaths: string[] = Array.isArray(property?.photos)
      ? (property.photos as string[]).filter(Boolean).filter(isShowablePropertyPhoto)
      : [];
    const photoUrls: string[] = [];
    for (const path of photoPaths.slice(0, 20)) {
      if (/^https?:\/\//i.test(path)) {
        photoUrls.push(path);
        continue;
      }
      for (const bucket of PHOTO_BUCKETS) {
        const { data: signed } = await db.storage.from(bucket).createSignedUrl(path, 3600);
        if (signed?.signedUrl) {
          photoUrls.push(signed.signedUrl);
          break;
        }
      }
    }

    // Zanonimizowana treść KW: działy I-Sp, III i IV (bez okładki, działu I-O
    // z adresem i działu II z właścicielami), z wykropkowanymi danymi osobowymi.
    const kwNumber = (property?.land_register_number ?? "").split("|")[0]?.trim() ?? "";
    let kw: FreeOfferKwSection | null = null;

    if (kwNumber) {
      const [{ data: kwDoc }, { data: kwAnalysis }] = await Promise.all([
        db
          .from("kw_documents")
          .select("dzial_1s, dzial_3, dzial_4")
          .eq("kw_number", kwNumber)
          .maybeSingle(),
        db
          .from("kw_analysis")
          .select("owners_json, risk_flags, investor_summary, legal_risk_score")
          .eq("application_id", app.id)
          .maybeSingle(),
      ]);

      const personal = collectPersonalPhrases(kwAnalysis?.owners_json ?? null);
      const redact = (html: string | null | undefined) =>
        html ? redactText(html, personal) : null;

      if (kwDoc || kwAnalysis) {
        kw = {
          kwNumberMasked: maskKwNumber(kwNumber),
          dzial1s: redact(kwDoc?.dzial_1s),
          dzial3: redact(kwDoc?.dzial_3),
          dzial4: redact(kwDoc?.dzial_4),
          legalRiskScore: kwAnalysis?.legal_risk_score ?? null,
          riskFlags: kwAnalysis?.risk_flags
            ? (redactJson(kwAnalysis.risk_flags, personal) as Json)
            : null,
          investorSummary: kwAnalysis?.investor_summary
            ? redactText(kwAnalysis.investor_summary, personal)
            : null,
        };
      }
    }

    return {
      id: app.id,
      createdAt: app.created_at,
      loanAmount: app.loan_amount != null ? Number(app.loan_amount) : null,
      periodMonths:
        app.preferred_period_months != null ? Number(app.preferred_period_months) : null,
      annualRate: app.annual_investor_rate != null ? Number(app.annual_investor_rate) : null,
      ltv: app.estimated_ltv != null ? Number(app.estimated_ltv) : null,
      maxMonthlyPayment: app.max_monthly_payment != null ? Number(app.max_monthly_payment) : null,
      propertyType: (property?.property_type as string | null) ?? null,
      city: property?.city ?? null,
      voivodeship: property?.voivodeship ?? null,
      estimatedValue: property?.estimated_value != null ? Number(property.estimated_value) : null,
      areaSqm: property?.area_sqm != null ? Number(property.area_sqm) : null,
      description: property?.description ?? null,
      photoUrls,
      kw,
    };
  });

// ---------------------------------------------------------------------
// Złożenie oferty z darmowego konta (limity + odsetki maksymalne z NBP,
// prowizja inwestora zawsze 0). Zapis przez service_role — RLS nie otwiera
// zapisu darmowym kontom.
// ---------------------------------------------------------------------
const FreeOfferSchema = z.object({
  applicationId: z.string().uuid(),
  proposedAmount: z.number().min(20_000).max(2_000_000),
  periodMonths: z.number().int().min(3).max(72),
  annualRate: z.number().min(0.1).max(100),
  repaymentType: z.enum(["miesieczna", "balonowa", "mieszana"]).optional().default("miesieczna"),
  estimatedMonthlyPayment: z.number().min(0).optional().nullable(),
  estimatedTotalCost: z.number().min(0).optional().nullable(),
  investorNote: z.string().trim().max(2000).optional().nullable(),
});

export const submitFreeInvestorOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => FreeOfferSchema.parse(i))
  .handler(async ({ data, context }): Promise<SubmitFreeOfferResult> => {
    const db = await adminDb();
    await assertInvestorRole(db, context.userId);

    // 1) Oferta musi dotyczyć wniosku dostępnego dla inwestorów.
    const { data: app } = await db
      .from("loan_applications")
      .select("id, available_to_investors, visibility_level, deleted_at")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (
      !app ||
      !app.available_to_investors ||
      app.visibility_level !== "zanonimizowane" ||
      app.deleted_at
    ) {
      throw new Error("Ta oferta nie jest już dostępna");
    }

    // 2) Limity darmowego konta (kwoty ≤ progu; powyżej progu bez limitu).
    const usage = await fetchFreeUsage(db, context.userId);
    const offerDecision = canSubmitFreeOffer(usage, data.proposedAmount);
    if (!offerDecision.allowed) {
      return {
        ok: false as const,
        code: "FREE_OFFER_LIMIT" as const,
        message: offerDecision.message,
      };
    }

    // 3) Oprocentowanie: stałe, maksymalnie odsetki maksymalne z bieżącej
    //    stopy referencyjnej NBP (weryfikacja po stronie serwera).
    const { getNbpRatesCached } = await import("@/lib/nbp-rates.server");
    const rates = await getNbpRatesCached();
    const maxRate = statutoryMaxAnnualRate(rates.referenceRate);
    const rateDecision = validateFreeOfferRate(data.annualRate, maxRate);
    if (!rateDecision.allowed) {
      return {
        ok: false as const,
        code: "RATE_TOO_HIGH" as const,
        message: rateDecision.message,
        maxRate,
      };
    }

    // 4) Rekord inwestora (tworzony przy wyborze roli; awaryjnie dokładamy).
    let { data: investor } = await db
      .from("investors")
      .select("id")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!investor) {
      const { data: userRes } = await context.supabase.auth.getUser();
      const meta = (userRes?.user?.user_metadata ?? {}) as Record<string, string | undefined>;
      const { data: created, error: invErr } = await db
        .from("investors")
        .insert({
          user_id: context.userId,
          investor_type: "indywidualny",
          first_name: meta.first_name ?? meta.full_name ?? null,
          last_name: meta.last_name ?? null,
          email: userRes?.user?.email ?? null,
          subscription_status: "nieaktywny",
        })
        .select("id")
        .single();
      if (invErr || !created)
        throw new Error(invErr?.message ?? "Nie udało się utworzyć profilu inwestora");
      investor = created;
    }

    // 5) Zapis oferty: prowizja inwestora ZAWSZE 0 na koncie darmowym.
    const { data: offer, error } = await db
      .from("investor_offers")
      .insert({
        loan_application_id: data.applicationId,
        investor_id: investor.id,
        offer_status: "zlozona",
        proposed_amount: data.proposedAmount,
        period_months: data.periodMonths,
        expected_yearly_yield: Math.round(data.annualRate * 100) / 100,
        commission: 0,
        collection_protection: false,
        has_balloon: data.repaymentType !== "miesieczna",
        repayment_type: data.repaymentType,
        estimated_monthly_payment: data.estimatedMonthlyPayment ?? null,
        estimated_total_cost: data.estimatedTotalCost ?? null,
        investor_note: data.investorNote ?? null,
        submitted_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !offer) throw new Error(error?.message ?? "Nie udało się złożyć oferty");

    const after = await fetchFreeUsage(db, context.userId);
    return { ok: true as const, offerId: offer.id, usage: after, maxRate };
  });

// ---------------------------------------------------------------------
// Bramka „zawarcia pożyczki" dla darmowego konta (wywoływana z przygotowania
// umowy): maks. 2 zaakceptowane pożyczki/365 dni dla kwot ≤ progu.
// Bieżąca oferta jest wyłączana z licznika (jej akceptacja nie może blokować
// przygotowania jej własnej umowy).
// ---------------------------------------------------------------------
export async function assertFreeInvestorCanConcludeLoan(
  userId: string,
  offerAmountPln: number,
  excludeOfferId?: string,
): Promise<void> {
  const db = await adminDb();
  const since = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
  let q = db
    .from("investor_offers")
    .select("id, proposed_amount, client_decision_at, updated_at, investors!inner(user_id)")
    .eq("investors.user_id", userId)
    .eq("offer_status", "zaakceptowana_przez_klienta")
    .lte("proposed_amount", FREE_AMOUNT_THRESHOLD_PLN);
  if (excludeOfferId) q = q.neq("id", excludeOfferId);
  const { data: accepted, error } = await q;
  if (error) throw new Error(error.message);
  const loansLast365 = ((accepted ?? []) as any[]).filter(
    (o) => String(o.client_decision_at ?? o.updated_at ?? "") >= since,
  ).length;

  const decision = canConcludeFreeLoan({ offersLast365: 0, loansLast365 }, offerAmountPln);
  if (!decision.allowed) {
    throw new Error(`FREE_LOAN_LIMIT: ${decision.message}`);
  }
}
