// Karta oferty — publiczna, tokenowana strona z pełnym dossier tematu
// pożyczkowego, którą pokazujemy inwestorom instytucjonalnym (link zewnętrzny).
// Zawiera: dane klienta i wniosku, pełną treść księgi wieczystej, lokalizację
// z mapą, dane o zaludnieniu, nieruchomości w okolicy oraz źródła danych —
// wszystko zasilane z analizy ryzyka (investment_risk_assessments).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { InvestmentRiskAssessment } from "@/lib/risk-assessment/types";

type SupabaseLike = { from: (t: string) => any };

async function assertAdminOrOperator(supabase: SupabaseLike, userId: string) {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const allowed = (roles ?? []).some(
    (r: { role: string }) => r.role === "administrator" || r.role === "operator",
  );
  if (!allowed) throw new Error("Brak uprawnień (wymagana rola administrator/operator).");
}

function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Zwraca (tworząc w razie potrzeby) publiczny link Karty oferty dla wniosku. */
export const ensureOfferCardLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SupabaseLike;
    await assertAdminOrOperator(supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: app, error } = await supabaseAdmin
      .from("loan_applications")
      .select("id, offer_card_token")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (error || !app) throw new Error("Nie znaleziono wniosku");

    let token = (app as any).offer_card_token as string | null;
    if (!token) {
      token = generateToken();
      const { error: updError } = await supabaseAdmin
        .from("loan_applications")
        .update({ offer_card_token: token })
        .eq("id", data.applicationId);
      if (updError) throw new Error(`Nie udało się zapisać tokenu: ${updError.message}`);
    }
    const { offerCardUrl } = await import("@/lib/offer-replies.server");
    return { token, url: offerCardUrl(token) };
  });

// ---- Publiczny payload Karty oferty ----

export interface PublicOfferCard {
  applicationId: string;
  clientName: string | null;
  loanAmountPln: number | null;
  periodMonths: number | null;
  property: {
    type: string | null;
    address: string | null;
    city: string | null;
    voivodeship: string | null;
    areaSqm: number | null;
    estimatedValuePln: number | null;
    kwNumber: string | null;
    description: string | null;
    hasMortgage: boolean | null;
  } | null;
  /** Pełna treść KW (HTML z EKW/CMD) — sanitizowana po stronie klienta. */
  kw: {
    fetchedAt: string | null;
    sections: Array<{ key: string; label: string; html: string }>;
  } | null;
  /** Adres do osadzenia mapy (Google Maps embed po adresie). */
  mapQuery: string | null;
  risk: {
    generatedAt: string | null;
    investmentScore: number | null;
    riskGrade: string | null;
    recommendation: string | null;
    executiveSummary: string | null;
    valuation: {
      lowPln: number | null;
      midPln: number | null;
      highPln: number | null;
      basisSource: string | null;
      marketTrend: string | null;
      suggestedLtvCapPercent: number | null;
      suggestedMaxLoanAmountPln: number | null;
    } | null;
    forcedSale: {
      firstAuctionOpeningPln: number | null;
      secondAuctionOpeningPln: number | null;
      expectedLowPln: number | null;
      expectedHighPln: number | null;
    } | null;
    population: {
      localityPopulation: number | null;
      populationTrend: string | null;
      nearestLargeCity: {
        name: string | null;
        population: number | null;
        distanceKm: number | null;
      } | null;
    } | null;
    nearbyOffers: {
      radiusKm: number | null;
      totalActiveListings: number;
      agencyListings: number;
      privateListings: number;
      medianPricePerM2: number | null;
      sample: Array<{
        title: string | null;
        url: string | null;
        pricePln: number | null;
        pricePerM2: number | null;
        source: string | null;
        postedBy: string | null;
      }>;
    } | null;
    kwLegalSummary: string | null;
    dataSources: Array<{
      source: string;
      purpose: string;
      dataLevel: string | null;
      period: string | null;
      status: string;
      note: string | null;
    }>;
  } | null;
}

const KW_SECTIONS: Array<{ key: string; label: string }> = [
  { key: "okladka", label: "Okładka" },
  { key: "dzial_1o", label: "Dział I-O — Oznaczenie nieruchomości" },
  { key: "dzial_1s", label: "Dział I-Sp — Spis praw związanych" },
  { key: "dzial_2", label: "Dział II — Własność" },
  { key: "dzial_3", label: "Dział III — Prawa, roszczenia i ograniczenia" },
  { key: "dzial_4", label: "Dział IV — Hipoteki" },
];

/** Publiczny odczyt Karty oferty po tokenie — BEZ logowania (link dla inwestorów). */
export const getPublicOfferCard = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token: z.string().min(24).max(64) }).parse(d))
  .handler(async ({ data }): Promise<PublicOfferCard | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: app } = await supabaseAdmin
      .from("loan_applications")
      .select(
        "id, loan_amount, preferred_period_months, deleted_at, client:clients(first_name,last_name), properties(property_type,address,street,city,voivodeship,area_sqm,estimated_value,land_register_number,description,has_mortgage)",
      )
      .eq("offer_card_token", data.token)
      .maybeSingle();
    if (!app || (app as any).deleted_at) return null;

    const client = (app as any).client ?? null;
    const props = (app as any).properties;
    const p: any = Array.isArray(props) ? props[0] : props;

    // Treść KW (kw_documents po znormalizowanym numerze)
    let kw: PublicOfferCard["kw"] = null;
    let kwNumber: string | null = null;
    if (p?.land_register_number) {
      const { normalizeKwNumber } = await import("@/lib/kw-fetch.server");
      const normalized =
        normalizeKwNumber(String(p.land_register_number)) ?? String(p.land_register_number);
      kwNumber = normalized;
      const { data: kwDoc } = await supabaseAdmin
        .from("kw_documents")
        .select("status, fetched_at, okladka, dzial_1o, dzial_1s, dzial_2, dzial_3, dzial_4")
        .eq("kw_number", normalized)
        .maybeSingle();
      if (kwDoc?.status === "ready") {
        const sections = KW_SECTIONS.flatMap(({ key, label }) => {
          const html = (kwDoc as any)[key] as string | null;
          return html ? [{ key, label, html }] : [];
        });
        kw = { fetchedAt: (kwDoc as any).fetched_at ?? null, sections };
      }
    }

    // Analiza ryzyka — zaludnienie, rynek w okolicy, wycena, źródła danych
    const { data: raRow } = await supabaseAdmin
      .from("investment_risk_assessments")
      .select("result_json")
      .eq("application_id", (app as any).id)
      .maybeSingle();
    const r = (raRow?.result_json ?? null) as InvestmentRiskAssessment | null;

    const risk: PublicOfferCard["risk"] = r
      ? {
          generatedAt: r.generatedAt ?? null,
          investmentScore: r.investmentScore ?? null,
          riskGrade: r.riskGrade ?? null,
          recommendation: r.recommendation ?? null,
          executiveSummary: r.executiveSummary ?? null,
          valuation: r.masterValuation
            ? {
                lowPln: r.masterValuation.estimatedValueLowPln,
                midPln: r.masterValuation.estimatedValueMidPln,
                highPln: r.masterValuation.estimatedValueHighPln,
                basisSource: r.masterValuation.basisSource ?? null,
                marketTrend: r.masterValuation.marketTrend ?? null,
                suggestedLtvCapPercent: r.masterValuation.suggestedLtvCapPercent,
                suggestedMaxLoanAmountPln: r.masterValuation.suggestedMaxLoanAmountPln,
              }
            : null,
          forcedSale: r.forcedSale
            ? {
                firstAuctionOpeningPln: r.forcedSale.firstAuctionOpeningPln,
                secondAuctionOpeningPln: r.forcedSale.secondAuctionOpeningPln,
                expectedLowPln: r.forcedSale.expectedForcedSaleLowPln,
                expectedHighPln: r.forcedSale.expectedForcedSaleHighPln,
              }
            : null,
          population: r.saleability
            ? {
                localityPopulation: r.saleability.localityPopulation,
                populationTrend: r.saleability.populationTrend ?? null,
                nearestLargeCity: r.saleability.nearestLargeCity ?? null,
              }
            : null,
          nearbyOffers: r.saleability?.localMarketOffers
            ? {
                radiusKm: r.saleability.localMarketOffers.radiusKm ?? null,
                totalActiveListings: r.saleability.localMarketOffers.totalActiveListings ?? 0,
                agencyListings: r.saleability.localMarketOffers.agencyListings ?? 0,
                privateListings: r.saleability.localMarketOffers.privateListings ?? 0,
                medianPricePerM2: r.saleability.localMarketOffers.medianPricePerM2,
                sample: (r.saleability.localMarketOffers.sample ?? []).map((l) => ({
                  title: l.title ?? null,
                  url: l.url ?? null,
                  pricePln: l.pricePln,
                  pricePerM2: l.pricePerM2,
                  source: l.source ?? null,
                  postedBy: l.postedBy ?? null,
                })),
              }
            : null,
          kwLegalSummary: r.kwLegal?.available ? (r.kwLegal.summary ?? null) : null,
          dataSources: (r.dataSources ?? []).map((s) => ({
            source: s.source,
            purpose: s.purpose,
            dataLevel: s.dataLevel ?? null,
            period: s.period ?? null,
            status: s.status,
            note: s.note ?? null,
          })),
        }
      : null;

    const addressParts = [p?.street ?? p?.address, p?.city, p?.voivodeship].filter(Boolean);
    const kwAddress = r?.kwLegal?.address?.fullAddress ?? null;
    const mapQuery = addressParts.length > 0 ? addressParts.join(", ") : kwAddress;

    return {
      applicationId: (app as any).id,
      clientName: client
        ? [client.first_name, client.last_name].filter(Boolean).join(" ") || null
        : null,
      loanAmountPln: (app as any).loan_amount ?? null,
      periodMonths: (app as any).preferred_period_months ?? null,
      property: p
        ? {
            type: p.property_type ?? null,
            address: p.address ?? p.street ?? null,
            city: p.city ?? null,
            voivodeship: p.voivodeship ?? null,
            areaSqm: p.area_sqm ?? null,
            estimatedValuePln: p.estimated_value ?? null,
            kwNumber,
            description: p.description ?? null,
            hasMortgage: p.has_mortgage ?? null,
          }
        : null,
      kw,
      mapQuery,
      risk,
    };
  });
