// Aktywne oferty sprzedaży nieruchomości w okolicy — bezpośrednio z portali
// (otodom, morizon, gratka, adresowo, olx; real-estate-market.server.ts).
// Zastępuje dawne zapytania do Perplexity: liczby ofert, podział biura/prywatni
// i mediana zł/m² pochodzą z rzeczywistych stron wyników, nie z modelu językowego.
// Server-only.

import type { PropertyType } from "./types";
import {
  fetchPortalMarket,
  type ListingPostedBy,
  type PortalSource,
} from "./real-estate-market.server";

export type OfferPostedBy = ListingPostedBy;

export interface LocalOffer {
  title: string;
  url: string;
  source: string; // domena portalu, np. "otodom.pl"
  postedBy: OfferPostedBy;
  pricePln: number | null;
  pricePerM2: number | null;
}

export interface LocalOffersResult {
  status: "success" | "no_data" | "error";
  totalActiveListings: number;
  agencyListings: number;
  privateListings: number;
  medianPricePerM2: number | null;
  offers: LocalOffer[];
  citations: string[];
  errorMessage?: string;
}

export interface LocalOffersParams {
  propertyType: PropertyType | string;
  city?: string | null;
  district?: string | null;
  voivodeship?: string | null;
  county?: string | null;
  areaM2?: number | null;
  radiusKm?: number;
  /** Ogranicz do wybranych portali (np. tylko otodom dla większych promieni). */
  sources?: PortalSource[];
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function emptyResult(status: "no_data" | "error", message?: string): LocalOffersResult {
  return {
    status,
    totalActiveListings: 0,
    agencyListings: 0,
    privateListings: 0,
    medianPricePerM2: null,
    offers: [],
    citations: [],
    errorMessage: message,
  };
}

export async function fetchLocalOffers(p: LocalOffersParams): Promise<LocalOffersResult> {
  const city = p.city || p.district;
  if (!city) return emptyResult("no_data", "Brak lokalizacji — nie wyszukano ofert.");
  try {
    const market = await fetchPortalMarket({
      propertyType: String(p.propertyType),
      city,
      voivodeship: p.voivodeship ?? null,
      county: p.county ?? null,
      radiusKm: p.radiusKm ?? null,
      sources: p.sources ?? ["otodom.pl", "morizon.pl", "gratka.pl", "adresowo.pl", "olx.pl"],
    });
    const offerListings = market.listings.filter((l) => l.kind === "offer");
    // Oferty o metrażu zbliżonym do wycenianej nieruchomości idą na początek próbki.
    const target = p.areaM2 ?? null;
    const sorted = target
      ? [...offerListings].sort(
          (a, b) =>
            Math.abs((a.areaM2 ?? Infinity) - target) - Math.abs((b.areaM2 ?? Infinity) - target),
        )
      : offerListings;
    const offers: LocalOffer[] = sorted.slice(0, 12).map((l) => ({
      title: l.title ?? "",
      url: l.url ?? "",
      source: l.source,
      postedBy: l.postedBy,
      pricePln: l.pricePln,
      pricePerM2: l.pricePerM2,
    }));
    const medianPricePerM2 = median(
      offerListings.map((l) => l.pricePerM2).filter((v): v is number => v != null && v > 500),
    );
    const failed = market.sources.filter((s) => s.status === "error");
    if (offerListings.length === 0 && market.totalActiveListings === 0) {
      return failed.length === market.sources.length && failed.length > 0
        ? emptyResult("error", failed.map((s) => `${s.source}: ${s.message}`).join("; "))
        : {
            ...emptyResult("no_data", "Brak ofert na portalach dla tej lokalizacji."),
            citations: market.sourceUrls,
          };
    }
    return {
      status: "success",
      totalActiveListings: market.totalActiveListings,
      agencyListings: market.agencyListings,
      privateListings: market.privateListings,
      medianPricePerM2,
      offers,
      citations: market.sourceUrls,
    };
  } catch (e: any) {
    return emptyResult("error", e?.message ?? "Nieznany błąd pobierania ofert.");
  }
}
