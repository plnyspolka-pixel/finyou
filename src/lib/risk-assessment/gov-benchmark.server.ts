// Benchmark z danych rządowych GUS BDL — priorytetowe źródło wyceny.
// Grunt rolny: cena za hektar (wg klasy bonitacyjnej / powiatu). Lokale/domy: zł/m².
// Reużywa istniejącego klienta gus-bdl.server (rozpoznanie jednostki TERYT/BDL,
// hierarchia fallbacków powiat → województwo → Polska, cache w gus_bdl_cache).

import { gusBenchmark, classifySoil } from "@/lib/property-analysis/gus-bdl.server";
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
}): Promise<GovBenchmark> {
  const empty: GovBenchmark = {
    source: "GUS BDL",
    available: false,
    propertyType: args.propertyType,
    pricePerHa: null,
    soilClass: args.soilClass ?? null,
    soilCategory: classifySoil(args.soilClass),
    areaHa: args.landAreaHa ?? (args.areaSqm ? Math.round((args.areaSqm / 10_000) * 1000) / 1000 : null),
    landValuePln: null,
    pricePerM2Median: null,
    pricePerM2Average: null,
    dwellingValuePln: null,
    unitName: null,
    unitLevel: null,
    period: null,
    fallbackUsed: false,
    summaryLine: "GUS BDL: brak danych.",
    warnings: [],
  };

  try {
    const { stats, diagnostics } = await gusBenchmark({
      propertyType: args.propertyType,
      city: args.city,
      voivodeship: args.voivodeship,
      county: args.county,
      soilClass: args.soilClass,
    });

    const unitName = diagnostics.resolvedLocation?.bdlUnitName ?? null;
    const unitLevel = levelLabel(stats?.level);
    const period = diagnostics.period?.label || stats?.period || null;
    const fallbackUsed = !!diagnostics.fallbackUsed;
    const warnings = diagnostics.warnings ?? [];

    if (!stats) {
      return { ...empty, unitName, period, fallbackUsed, warnings, summaryLine: diagnostics.summaryLine || empty.summaryLine };
    }

    // Grunt rolny — cena za ha wg klasy bonitacyjnej.
    if (args.propertyType === "grunt_rolny" && stats.pricePerHaByClass) {
      const cat = classifySoil(args.soilClass);
      const pricePerHa = stats.pricePerHaByClass[cat] ?? stats.pricePerHaByClass.ogolem ?? null;
      const areaHa = empty.areaHa;
      const landValuePln = pricePerHa != null && areaHa != null ? Math.round(pricePerHa * areaHa) : null;
      return {
        ...empty,
        available: true,
        pricePerHa,
        soilCategory: cat,
        areaHa,
        landValuePln,
        unitName,
        unitLevel,
        period,
        fallbackUsed,
        summaryLine: diagnostics.summaryLine,
        warnings,
      };
    }

    // Lokale / domy — zł/m².
    if (args.propertyType === "mieszkanie" || args.propertyType === "dom") {
      const median = stats.pricePerM2Median ?? null;
      const average = stats.pricePerM2Average ?? null;
      const ppm2 = median ?? average;
      const dwellingValuePln = ppm2 != null && args.areaSqm != null ? Math.round(ppm2 * args.areaSqm) : null;
      return {
        ...empty,
        available: ppm2 != null,
        pricePerM2Median: median,
        pricePerM2Average: average,
        dwellingValuePln,
        unitName,
        unitLevel,
        period,
        fallbackUsed,
        summaryLine: diagnostics.summaryLine,
        warnings,
      };
    }

    return { ...empty, unitName, period, fallbackUsed, warnings, summaryLine: diagnostics.summaryLine };
  } catch (e: any) {
    return { ...empty, warnings: [`GUS BDL: ${e?.message ?? "błąd pobierania"}`] };
  }
}
