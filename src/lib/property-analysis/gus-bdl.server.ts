// GUS BDL — benchmark statystyczny (mieszkania zł/m², grunty rolne zł/ha).
// Działa anonimowo; jeśli GUS_BDL_API_KEY jest skonfigurowany, używa nagłówka X-ClientId.
import type { GusStats } from "./types";
import { fetchWithTimeout, withCache } from "./cache.server";

const BDL_BASE = "https://bdl.stat.gov.pl/api/v1";

function headers(): HeadersInit {
  const key = process.env.GUS_BDL_API_KEY;
  return key ? { "X-ClientId": key, Accept: "application/json" } : { Accept: "application/json" };
}

// Identyfikatory wskaźników BDL (publicznie dostępne):
//  - 633687: mediana cen sprzedaży lokali mieszkalnych za 1 m² (transakcje rynkowe)
//  - 633690: średnia cena sprzedaży lokali mieszkalnych za 1 m²
//  - 217230: średnia cena gruntów rolnych za 1 ha w obrocie prywatnym
const VAR_DWELLING_MEDIAN = "633687";
const VAR_DWELLING_AVG = "633690";
const VAR_LAND_AGRI_AVG = "217230";

async function fetchVar(varId: string, unitId?: string | null): Promise<{ value: number | null; year: string | null }> {
  const url = unitId
    ? `${BDL_BASE}/data/by-unit/${unitId}?var-id=${varId}&format=json&page-size=10`
    : `${BDL_BASE}/data/by-variable/${varId}?format=json&page-size=10`;
  try {
    const res = await fetchWithTimeout(url, { headers: headers() }, 15_000);
    if (!res.ok) return { value: null, year: null };
    const json = (await res.json()) as { results?: Array<{ values?: Array<{ val?: number; year?: string }> }> };
    const last = json.results?.[0]?.values?.slice().sort((a, b) => Number(b.year ?? 0) - Number(a.year ?? 0))[0];
    return { value: typeof last?.val === "number" ? last.val : null, year: last?.year ?? null };
  } catch {
    return { value: null, year: null };
  }
}

export interface GusBenchmarkArgs {
  propertyType: string;
  voivodeship?: string | null;
  county?: string | null;
  soilClass?: string | null;
  /** Optional TERYT unit id, jeśli wcześniej zostało wyszukane. */
  unitId?: string | null;
}

export function classifySoil(soilClass: string | null | undefined): "dobre" | "srednie" | "slabe" | "ogolem" {
  if (!soilClass) return "ogolem";
  const s = soilClass.trim().toUpperCase();
  if (["I", "II", "IIIA", "III A"].includes(s)) return "dobre";
  if (["IIIB", "III B", "IV", "IVA", "IVB"].includes(s)) return "srednie";
  if (["V", "VI"].includes(s)) return "slabe";
  return "ogolem";
}

export async function gusBenchmark(args: GusBenchmarkArgs): Promise<GusStats | null> {
  const key = `gus:${args.propertyType}:${args.voivodeship ?? ""}:${args.county ?? ""}:${args.soilClass ?? ""}`;
  return withCache("gus_bdl_cache", key, 30, async () => {
    if (args.propertyType === "mieszkanie" || args.propertyType === "dom") {
      const [m, a] = await Promise.all([
        fetchVar(VAR_DWELLING_MEDIAN, args.unitId ?? undefined),
        fetchVar(VAR_DWELLING_AVG, args.unitId ?? undefined),
      ]);
      if (m.value == null && a.value == null) return null;
      return {
        pricePerM2Median: m.value,
        pricePerM2Average: a.value,
        transactionsCount: null,
        period: m.year ?? a.year ?? "",
        level: args.county ? "powiat" : args.voivodeship ? "wojewodztwo" : "krajowy",
      } satisfies GusStats;
    }
    if (args.propertyType === "grunt_rolny") {
      const avg = await fetchVar(VAR_LAND_AGRI_AVG, args.unitId ?? undefined);
      if (avg.value == null) return null;
      return {
        pricePerM2Median: null,
        pricePerM2Average: null,
        transactionsCount: null,
        period: avg.year ?? "",
        level: args.county ? "powiat" : args.voivodeship ? "wojewodztwo" : "krajowy",
        pricePerHaByClass: {
          dobre: avg.value * 1.2,
          srednie: avg.value,
          slabe: avg.value * 0.7,
          ogolem: avg.value,
        },
      } satisfies GusStats;
    }
    return null;
  });
}
