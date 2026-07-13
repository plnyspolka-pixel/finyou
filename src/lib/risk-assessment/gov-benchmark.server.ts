// Benchmark z danych rządowych — priorytetowe źródło wyceny.
// Łączy DWA źródła urzędowe (government-first):
//   1) RCN / Geoportal GUGiK — RZECZYWISTE ceny transakcyjne (WMS GetFeatureInfo),
//   2) GUS BDL — przeciętne ceny (grunt rolny zł/ha wg klasy, lokale zł/m²).
// Priorytet: RCN (transakcje) > GUS (średnie). Reużywa istniejących klientów.

import { gusBenchmark, classifySoil } from "@/lib/property-analysis/gus-bdl.server";
import { rcnBenchmarkCached, rcnStatusMessage } from "@/lib/property-analysis/rcn-geoportal.server";
import type { GovBenchmark } from "./types";

function levelLabel(level: "powiat" | "wojewodztwo" | "krajowy" | undefined | null): string | null {
  if (level === "powiat") return "powiat";
  if (level === "wojewodztwo") return "województwo";
  if (level === "krajowy") return "Polska";
  return null;
}

export async function fetchGovBenchmark(args: {
  propertyType: string;
  city?: string | null;
  voivodeship?: string | null;
  county?: string | null;
  soilClass?: string | null;
  areaSqm?: number | null;
  landAreaHa?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<GovBenchmark> {
  const areaHa = args.landAreaHa ?? (args.areaSqm ? Math.round((args.areaSqm / 10_000) * 1000) / 1000 : null);
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

  // Odpytujemy oba źródła równolegle — RCN wymaga współrzędnych.
  const rcnP =
    args.latitude != null && args.longitude != null && Number.isFinite(args.latitude) && Number.isFinite(args.longitude)
      ? rcnBenchmarkCached({ lat: args.latitude, lng: args.longitude, propertyType: args.propertyType }).catch(() => null)
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
    base.rcnStatusMessage = rcnStatusMessage(rcn.diagnostics.status);
    base.rcnRadiusKm = rcn.radiusKm;
    base.rcnTransactions = rcn.transactionsCount ?? 0;
    if (rcn.stats) {
      if (rcn.stats.unit === "pln_per_ha") rcnPricePerHa = rcn.stats.median ?? rcn.stats.average ?? null;
      if (rcn.stats.unit === "pln_per_m2") rcnPricePerM2 = rcn.stats.median ?? rcn.stats.average ?? null;
    }
    base.rcnAvailable = rcnPricePerHa != null || rcnPricePerM2 != null;
    base.rcnPricePerHa = rcnPricePerHa;
    base.rcnPricePerM2 = rcnPricePerM2;
  } else {
    base.rcnStatusMessage = "RCN niedostępny (brak współrzędnych lub błąd usługi).";
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
      gusPricePerHa = gus.stats.pricePerHaByClass[soilCategory] ?? gus.stats.pricePerHaByClass.ogolem ?? null;
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
    rcnDroveHa || rcnDroveM2 ? "RCN" : chosenPerHa != null || chosenPerM2 != null ? "GUS BDL" : "brak";

  base.pricePerHa = chosenPerHa;
  base.pricePerM2Median = chosenPerM2;
  base.primarySource = primarySource;
  base.available = primarySource !== "brak";
  base.source = base.rcnAvailable ? "RCN + GUS BDL" : "GUS BDL";

  if (isLand) {
    base.landValuePln = chosenPerHa != null && areaHa != null ? Math.round(chosenPerHa * areaHa) : null;
  } else if (args.propertyType === "mieszkanie" || args.propertyType === "dom") {
    base.dwellingValuePln = chosenPerM2 != null && args.areaSqm != null ? Math.round(chosenPerM2 * args.areaSqm) : null;
  }

  base.warnings = warnings;
  const parts: string[] = [];
  if (primarySource === "RCN") parts.push(`RCN (${base.rcnTransactions} transakcji${base.rcnRadiusKm ? `, r=${base.rcnRadiusKm} km` : ""})`);
  if (chosenPerHa != null) parts.push(`${chosenPerHa.toLocaleString("pl-PL")} zł/ha`);
  if (chosenPerM2 != null) parts.push(`${chosenPerM2.toLocaleString("pl-PL")} zł/m²`);
  if (base.unitName) parts.push(base.unitName);
  base.summaryLine = base.available
    ? `Dane rządowe [${primarySource}]: ${parts.filter(Boolean).join(", ")}${base.period ? `, ${base.period}` : ""}.`
    : `Dane rządowe: brak (RCN: ${base.rcnStatusMessage}).`;

  return base;
}
