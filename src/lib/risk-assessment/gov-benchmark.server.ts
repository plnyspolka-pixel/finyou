// Benchmark z danych rządowych — priorytetowe źródło wyceny.
// Łączy DWA źródła urzędowe (government-first):
//   1) RCN / Geoportal GUGiK — RZECZYWISTE ceny transakcyjne (WMS GetFeatureInfo),
//   2) GUS BDL — przeciętne ceny (grunt rolny zł/ha wg klasy, lokale zł/m²).
// Priorytet: RCN (transakcje) > GUS (średnie). Reużywa istniejących klientów.

import { gusBenchmark, classifySoil } from "@/lib/property-analysis/gus-bdl.server";
import { rcnBenchmarkCached, rcnStatusMessage } from "@/lib/property-analysis/rcn-geoportal.server";
import { geocode } from "@/lib/property-analysis/location-score.server";
import type { GovBenchmark } from "./types";

function levelLabel(level: "powiat" | "wojewodztwo" | "krajowy" | undefined | null): string | null {
  if (level === "powiat") return "powiat";
  if (level === "wojewodztwo") return "województwo";
  if (level === "krajowy") return "Polska";
  return null;
}

/**
 * POMOCNICZY benchmark GUS BDL — bez RCN i bez geokodowania.
 * Rola w nowym pipeline wyceny: dane GUS są wyłącznie wsparciem — przede
 * wszystkim dla GRUNTÓW ROLNYCH (ceny zł/ha wg klasy bonitacyjnej), gdzie
 * stanowią podstawę wyceny; dla pozostałych typów służą jako sanity-check /
 * fallback, gdy scraping rynku (deweloperuch/otodom) nie zwróci danych.
 */
export async function fetchGusAuxiliaryBenchmark(args: {
  propertyType: string;
  city?: string | null;
  voivodeship?: string | null;
  county?: string | null;
  soilClass?: string | null;
  areaSqm?: number | null;
  landAreaHa?: number | null;
}): Promise<GovBenchmark> {
  const areaHa =
    args.landAreaHa ?? (args.areaSqm ? Math.round((args.areaSqm / 10_000) * 1000) / 1000 : null);
  const soilCategory = classifySoil(args.soilClass);
  const isLand = args.propertyType === "grunt_rolny";

  const base: GovBenchmark = {
    source: "GUS BDL",
    available: false,
    propertyType: args.propertyType,
    primarySource: "brak",
    pricePerHa: null,
    pricePerM2Median: null,
    pricePerM2Average: null,
    soilClass: args.soilClass ?? null,
    soilCategory,
    areaHa,
    landValuePln: null,
    dwellingValuePln: null,
    gusPricePerHa: null,
    gusPricePerM2Median: null,
    rcnAvailable: false,
    rcnPricePerHa: null,
    rcnPricePerM2: null,
    rcnTransactions: 0,
    rcnRadiusKm: null,
    rcnStatus: "disabled",
    rcnStatusMessage: "Moduł RCN wyłączony — GUS wykorzystywany pomocniczo.",
    unitName: null,
    unitLevel: null,
    period: null,
    fallbackUsed: false,
    summaryLine: "GUS BDL (pomocniczo): brak danych.",
    warnings: [],
  };

  const gus = await gusBenchmark({
    propertyType: args.propertyType,
    city: args.city,
    voivodeship: args.voivodeship,
    county: args.county,
    soilClass: args.soilClass,
  }).catch(() => null);

  if (gus?.stats) {
    base.unitName = gus.diagnostics.resolvedLocation?.bdlUnitName ?? null;
    base.unitLevel = levelLabel(gus.stats.level);
    base.period = gus.diagnostics.period?.label || gus.stats.period || null;
    base.fallbackUsed = !!gus.diagnostics.fallbackUsed;
    base.warnings.push(...(gus.diagnostics.warnings ?? []));
    if (isLand && gus.stats.pricePerHaByClass) {
      base.gusPricePerHa =
        gus.stats.pricePerHaByClass[soilCategory] ?? gus.stats.pricePerHaByClass.ogolem ?? null;
    }
    base.gusPricePerM2Median = gus.stats.pricePerM2Median ?? null;
    base.pricePerM2Average = gus.stats.pricePerM2Average ?? null;
  } else if (gus) {
    base.unitName = gus.diagnostics.resolvedLocation?.bdlUnitName ?? null;
    if (gus.diagnostics.warnings?.length) base.warnings.push(...gus.diagnostics.warnings);
  }

  base.pricePerHa = base.gusPricePerHa;
  base.pricePerM2Median = base.gusPricePerM2Median;
  base.available = base.pricePerHa != null || base.pricePerM2Median != null;
  base.primarySource = base.available ? "GUS BDL" : "brak";

  if (isLand) {
    base.landValuePln =
      base.pricePerHa != null && areaHa != null ? Math.round(base.pricePerHa * areaHa) : null;
  } else if (args.propertyType === "mieszkanie" || args.propertyType === "dom") {
    base.dwellingValuePln =
      base.pricePerM2Median != null && args.areaSqm != null
        ? Math.round(base.pricePerM2Median * args.areaSqm)
        : null;
  }

  const parts: string[] = [];
  if (base.pricePerHa != null)
    parts.push(`${base.pricePerHa.toLocaleString("pl-PL")} zł/ha (klasa: ${soilCategory})`);
  if (base.pricePerM2Median != null)
    parts.push(`${base.pricePerM2Median.toLocaleString("pl-PL")} zł/m²`);
  if (base.unitName) parts.push(base.unitName);
  base.summaryLine = base.available
    ? `GUS BDL (pomocniczo${isLand ? " — podstawa dla gruntu rolnego" : ""}): ${parts.join(", ")}${base.period ? `, ${base.period}` : ""}.`
    : "GUS BDL (pomocniczo): brak danych.";

  return base;
}

export async function fetchGovBenchmark(args: {
  propertyType: string;
  /** Pełny adres nieruchomości (np. z działu I-O KW) — geokodowany, gdy brak współrzędnych, aby odpytać RCN. */
  address?: string | null;
  city?: string | null;
  voivodeship?: string | null;
  county?: string | null;
  soilClass?: string | null;
  areaSqm?: number | null;
  landAreaHa?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<GovBenchmark> {
  const areaHa =
    args.landAreaHa ?? (args.areaSqm ? Math.round((args.areaSqm / 10_000) * 1000) / 1000 : null);
  const soilCategory = classifySoil(args.soilClass);

  const base: GovBenchmark = {
    source: "GUS BDL",
    available: false,
    propertyType: args.propertyType,
    primarySource: "brak",
    pricePerHa: null,
    pricePerM2Median: null,
    pricePerM2Average: null,
    soilClass: args.soilClass ?? null,
    soilCategory,
    areaHa,
    landValuePln: null,
    dwellingValuePln: null,
    gusPricePerHa: null,
    gusPricePerM2Median: null,
    rcnAvailable: false,
    rcnPricePerHa: null,
    rcnPricePerM2: null,
    rcnTransactions: 0,
    rcnRadiusKm: null,
    rcnStatus: "not_started",
    rcnStatusMessage: "RCN nie odpytany.",
    unitName: null,
    unitLevel: null,
    period: null,
    fallbackUsed: false,
    summaryLine: "Dane rządowe: brak.",
    warnings: [],
  };

  // Współrzędne do RCN: użyj przekazanych, a w razie braku — zgeokoduj pełny adres
  // (np. z działu I-O KW). Dzięki temu RCN da się odpytać nawet gdy wcześniejsza
  // analiza zabezpieczenia nie ustaliła współrzędnych.
  let lat = Number.isFinite(args.latitude as number) ? (args.latitude as number) : null;
  let lng = Number.isFinite(args.longitude as number) ? (args.longitude as number) : null;
  let geocodedFromAddress = false;
  if ((lat == null || lng == null) && args.address) {
    const query = [args.address, args.city, args.voivodeship, "Polska"].filter(Boolean).join(", ");
    const geo = await geocode(query, {
      expectedCity: args.city,
      expectedVoivodeship: args.voivodeship,
    }).catch(() => null);
    if (geo) {
      lat = geo.lat;
      lng = geo.lng;
      geocodedFromAddress = true;
    }
  }

  // Odpytujemy oba źródła równolegle — RCN wymaga współrzędnych.
  const rcnP =
    lat != null && lng != null
      ? rcnBenchmarkCached({ lat, lng, propertyType: args.propertyType }).catch(() => null)
      : Promise.resolve(null);
  const gusP = gusBenchmark({
    propertyType: args.propertyType,
    city: args.city,
    voivodeship: args.voivodeship,
    county: args.county,
    soilClass: args.soilClass,
  }).catch(() => null);

  const [rcn, gus] = await Promise.all([rcnP, gusP]);

  const warnings: string[] = [];

  // --- RCN (rzeczywiste transakcje) ---
  let rcnPricePerHa: number | null = null;
  let rcnPricePerM2: number | null = null;
  if (rcn) {
    base.rcnStatus = rcn.diagnostics.status;
    base.rcnStatusMessage =
      rcnStatusMessage(rcn.diagnostics.status) +
      (geocodedFromAddress ? " (współrzędne z geokodowania adresu KW)" : "");
    base.rcnRadiusKm = rcn.radiusKm;
    base.rcnTransactions = rcn.transactionsCount ?? 0;
    if (rcn.stats) {
      if (rcn.stats.unit === "pln_per_ha")
        rcnPricePerHa = rcn.stats.median ?? rcn.stats.average ?? null;
      if (rcn.stats.unit === "pln_per_m2")
        rcnPricePerM2 = rcn.stats.median ?? rcn.stats.average ?? null;
    }
    base.rcnAvailable = rcnPricePerHa != null || rcnPricePerM2 != null;
    base.rcnPricePerHa = rcnPricePerHa;
    base.rcnPricePerM2 = rcnPricePerM2;
  } else if (lat == null || lng == null) {
    if (args.address) {
      base.rcnStatus = "geocoding_failed";
      base.rcnStatusMessage =
        "RCN nieodpytany — nie udało się zgeokodować adresu z KW do współrzędnych.";
    } else {
      base.rcnStatus = "missing_coordinates";
      base.rcnStatusMessage = "RCN nieodpytany — brak adresu/współrzędnych nieruchomości.";
    }
  } else {
    base.rcnStatusMessage = "RCN niedostępny (błąd usługi Geoportal).";
  }

  // --- GUS BDL (przeciętne) ---
  let gusPricePerHa: number | null = null;
  let gusPricePerM2Median: number | null = null;
  let gusPricePerM2Average: number | null = null;
  if (gus?.stats) {
    base.unitName = gus.diagnostics.resolvedLocation?.bdlUnitName ?? null;
    base.unitLevel = levelLabel(gus.stats.level);
    base.period = gus.diagnostics.period?.label || gus.stats.period || null;
    base.fallbackUsed = !!gus.diagnostics.fallbackUsed;
    warnings.push(...(gus.diagnostics.warnings ?? []));
    if (args.propertyType === "grunt_rolny" && gus.stats.pricePerHaByClass) {
      gusPricePerHa =
        gus.stats.pricePerHaByClass[soilCategory] ?? gus.stats.pricePerHaByClass.ogolem ?? null;
    }
    gusPricePerM2Median = gus.stats.pricePerM2Median ?? null;
    gusPricePerM2Average = gus.stats.pricePerM2Average ?? null;
  } else if (gus) {
    base.unitName = gus.diagnostics.resolvedLocation?.bdlUnitName ?? null;
    if (gus.diagnostics.warnings?.length) warnings.push(...gus.diagnostics.warnings);
  }
  base.gusPricePerHa = gusPricePerHa;
  base.gusPricePerM2Median = gusPricePerM2Median;
  base.pricePerM2Average = gusPricePerM2Average;

  // --- Wybór priorytetowy: RCN (transakcje) > GUS (średnie) ---
  const isLand = args.propertyType === "grunt_rolny";
  const chosenPerHa = rcnPricePerHa ?? gusPricePerHa;
  const chosenPerM2 = rcnPricePerM2 ?? gusPricePerM2Median;
  const rcnDroveHa = isLand && rcnPricePerHa != null;
  const rcnDroveM2 = !isLand && rcnPricePerM2 != null;
  const primarySource: GovBenchmark["primarySource"] =
    rcnDroveHa || rcnDroveM2
      ? "RCN"
      : chosenPerHa != null || chosenPerM2 != null
        ? "GUS BDL"
        : "brak";

  base.pricePerHa = chosenPerHa;
  base.pricePerM2Median = chosenPerM2;
  base.primarySource = primarySource;
  base.available = primarySource !== "brak";
  base.source = base.rcnAvailable ? "RCN + GUS BDL" : "GUS BDL";

  if (isLand) {
    base.landValuePln =
      chosenPerHa != null && areaHa != null ? Math.round(chosenPerHa * areaHa) : null;
  } else if (args.propertyType === "mieszkanie" || args.propertyType === "dom") {
    base.dwellingValuePln =
      chosenPerM2 != null && args.areaSqm != null ? Math.round(chosenPerM2 * args.areaSqm) : null;
  }

  base.warnings = warnings;
  const parts: string[] = [];
  if (primarySource === "RCN")
    parts.push(
      `RCN (${base.rcnTransactions} transakcji${base.rcnRadiusKm ? `, r=${base.rcnRadiusKm} km` : ""})`,
    );
  if (chosenPerHa != null) parts.push(`${chosenPerHa.toLocaleString("pl-PL")} zł/ha`);
  if (chosenPerM2 != null) parts.push(`${chosenPerM2.toLocaleString("pl-PL")} zł/m²`);
  if (base.unitName) parts.push(base.unitName);
  base.summaryLine = base.available
    ? `Dane rządowe [${primarySource}]: ${parts.filter(Boolean).join(", ")}${base.period ? `, ${base.period}` : ""}.`
    : `Dane rządowe: brak (RCN: ${base.rcnStatusMessage}).`;

  return base;
}
