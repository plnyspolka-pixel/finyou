// GUS BDL — benchmark statystyczny (mieszkania zł/m², grunty rolne zł/ha).
// Z poprawnym mapowaniem jednostki terytorialnej (TERYT/BDL), hierarchią
// fallbacków, sanity-checkiem dla dużych miast i diagnostyką.
import type { GusStats, GusBenchmarkDiagnostics, BdlLevelLabel, GusSanityStatus } from "./types";

import { fetchWithTimeout, withCache } from "./cache.server";

const BDL_BASE = "https://bdl.stat.gov.pl/api/v1";

function headers(): HeadersInit {
  const key = process.env.GUS_BDL_API_KEY;
  return key ? { "X-ClientId": key, Accept: "application/json" } : { Accept: "application/json" };
}

// --- Identyfikatory wskaźników BDL (dane GUS, podgrupa: ceny lokali mieszkalnych) ---
// Preferowane: mediana ceny za 1 m² lokali mieszkalnych sprzedanych
// w ramach transakcji rynkowych (rynek ogółem).
const VAR_DWELLING_MEDIAN = "633687";
const VAR_DWELLING_AVG = "633690";
const VAR_LAND_AGRI_AVG = "217230";

// --- Mapowanie znanych miast na BDL unit-id (poziom 6: powiat / miasto na prawach powiatu) ---
// Klucz: znormalizowana nazwa miasta. Wartość: BDL unitId (12-znakowy kod TERYT-BDL).
// Te ID są stabilne i służą jako twarde rozpoznanie dużych miast bez polegania
// na pierwszym wyniku z /units/search.
const KNOWN_CITY_UNITS: Record<
  string,
  { unitId: string; unitName: string; level: 6; voivodeship: string }
> = {
  warszawa: {
    unitId: "011412011000",
    unitName: "Powiat m.st. Warszawa",
    level: 6,
    voivodeship: "mazowieckie",
  },
  krakow: {
    unitId: "021261011000",
    unitName: "Powiat m. Kraków",
    level: 6,
    voivodeship: "małopolskie",
  },
  lodz: { unitId: "031061011000", unitName: "Powiat m. Łódź", level: 6, voivodeship: "łódzkie" },
  wroclaw: {
    unitId: "020264011000",
    unitName: "Powiat m. Wrocław",
    level: 6,
    voivodeship: "dolnośląskie",
  },
  poznan: {
    unitId: "153064011000",
    unitName: "Powiat m. Poznań",
    level: 6,
    voivodeship: "wielkopolskie",
  },
  gdansk: {
    unitId: "062261011000",
    unitName: "Powiat m. Gdańsk",
    level: 6,
    voivodeship: "pomorskie",
  },
  gdynia: {
    unitId: "062263011000",
    unitName: "Powiat m. Gdynia",
    level: 6,
    voivodeship: "pomorskie",
  },
  szczecin: {
    unitId: "132262011000",
    unitName: "Powiat m. Szczecin",
    level: 6,
    voivodeship: "zachodniopomorskie",
  },
  bydgoszcz: {
    unitId: "040461011000",
    unitName: "Powiat m. Bydgoszcz",
    level: 6,
    voivodeship: "kujawsko-pomorskie",
  },
  lublin: {
    unitId: "060663011000",
    unitName: "Powiat m. Lublin",
    level: 6,
    voivodeship: "lubelskie",
  },
  katowice: {
    unitId: "142469011000",
    unitName: "Powiat m. Katowice",
    level: 6,
    voivodeship: "śląskie",
  },
  bialystok: {
    unitId: "100261011000",
    unitName: "Powiat m. Białystok",
    level: 6,
    voivodeship: "podlaskie",
  },
  rzeszow: {
    unitId: "091063011000",
    unitName: "Powiat m. Rzeszów",
    level: 6,
    voivodeship: "podkarpackie",
  },
  olsztyn: {
    unitId: "112861011000",
    unitName: "Powiat m. Olsztyn",
    level: 6,
    voivodeship: "warmińsko-mazurskie",
  },
  kielce: {
    unitId: "122661011000",
    unitName: "Powiat m. Kielce",
    level: 6,
    voivodeship: "świętokrzyskie",
  },
  torun: {
    unitId: "040463011000",
    unitName: "Powiat m. Toruń",
    level: 6,
    voivodeship: "kujawsko-pomorskie",
  },
};

// Identyfikatory jednostek województw (poziom 2 w BDL = województwo).
// Trzymane jako fallback. Niepełne — uzupełniane w razie potrzeby.
const KNOWN_VOIVODESHIP_UNITS: Record<string, { unitId: string; unitName: string }> = {
  mazowieckie: { unitId: "010000000000", unitName: "MAZOWIECKIE" },
  dolnoslaskie: { unitId: "020000000000", unitName: "DOLNOŚLĄSKIE" },
  lodzkie: { unitId: "030000000000", unitName: "ŁÓDZKIE" },
  "kujawsko-pomorskie": { unitId: "040000000000", unitName: "KUJAWSKO-POMORSKIE" },
  lubuskie: { unitId: "050000000000", unitName: "LUBUSKIE" },
  lubelskie: { unitId: "060000000000", unitName: "LUBELSKIE" },
  malopolskie: { unitId: "020000000000", unitName: "MAŁOPOLSKIE" },
  opolskie: { unitId: "080000000000", unitName: "OPOLSKIE" },
  podkarpackie: { unitId: "090000000000", unitName: "PODKARPACKIE" },
  podlaskie: { unitId: "100000000000", unitName: "PODLASKIE" },
  pomorskie: { unitId: "110000000000", unitName: "POMORSKIE" },
  slaskie: { unitId: "120000000000", unitName: "ŚLĄSKIE" },
  swietokrzyskie: { unitId: "130000000000", unitName: "ŚWIĘTOKRZYSKIE" },
  "warminsko-mazurskie": { unitId: "140000000000", unitName: "WARMIŃSKO-MAZURSKIE" },
  wielkopolskie: { unitId: "150000000000", unitName: "WIELKOPOLSKIE" },
  zachodniopomorskie: { unitId: "160000000000", unitName: "ZACHODNIOPOMORSKIE" },
};

const COUNTRY_UNIT = { unitId: "000000000000", unitName: "POLSKA", level: 1 as const };

// Progi sanity-check (zł/m²) — wartość mniejsza oznacza wynik podejrzany.
const CITY_SANITY_MIN_PLN_M2: Record<string, number> = {
  warszawa: 12000,
  krakow: 10000,
  wroclaw: 9000,
  gdansk: 9000,
  poznan: 8000,
  lodz: 6000,
  katowice: 6000,
};

// BdlLevelLabel imported from ./types

function levelLabel(level: number): BdlLevelLabel {
  if (level === 6) return "powiat / miasto na prawach powiatu";
  if (level === 4 || level === 2) return "województwo";
  if (level === 3) return "region NUTS";
  if (level === 1) return "Polska";
  return "nieznany";
}

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[łŁ]/g, "l")
    .toLowerCase()
    .trim();
}

export interface ResolvedBdlUnit {
  unitId: string;
  unitName: string;
  level: number;
  levelLabel: BdlLevelLabel;
  source: "known_city" | "known_voivodeship" | "search" | "country_fallback";
  fallbackUsed: boolean;
  fallbackLevel: BdlLevelLabel | null;
}

async function searchUnit(
  name: string,
  level?: number,
): Promise<{ id: string; name: string; level: number } | null> {
  const url = `${BDL_BASE}/units/search?name=${encodeURIComponent(name)}${level ? `&level=${level}` : ""}&format=json&page-size=10`;
  try {
    const res = await fetchWithTimeout(url, { headers: headers() }, 12_000);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results?: Array<{ id: string; name: string; level: number }>;
    };
    const list = json.results ?? [];
    if (!list.length) return null;
    // Najpierw exact match (bez ogonków), potem cokolwiek z requested level.
    const target = norm(name);
    const exact = list.find((u) => norm(u.name) === target || norm(u.name).includes(target));
    return exact ?? list[0];
  } catch {
    return null;
  }
}

export async function resolveBdlUnit(args: {
  city?: string | null;
  county?: string | null;
  voivodeship?: string | null;
}): Promise<ResolvedBdlUnit> {
  const cityKey = norm(args.city);
  const voKey = norm(args.voivodeship);

  // 1) Znane duże miasto — twarda mapa.
  if (cityKey && KNOWN_CITY_UNITS[cityKey]) {
    const u = KNOWN_CITY_UNITS[cityKey];
    return {
      unitId: u.unitId,
      unitName: u.unitName,
      level: u.level,
      levelLabel: levelLabel(u.level),
      source: "known_city",
      fallbackUsed: false,
      fallbackLevel: null,
    };
  }

  // 2) Spróbuj wyszukać powiat / miasto na prawach powiatu po nazwie.
  const cityOrCounty = args.city || args.county;
  if (cityOrCounty) {
    const u = await searchUnit(cityOrCounty, 6);
    if (u) {
      return {
        unitId: u.id,
        unitName: u.name,
        level: u.level,
        levelLabel: levelLabel(u.level),
        source: "search",
        fallbackUsed: false,
        fallbackLevel: null,
      };
    }
  }

  // 3) Województwo — znane lub wyszukane.
  if (voKey && KNOWN_VOIVODESHIP_UNITS[voKey]) {
    const u = KNOWN_VOIVODESHIP_UNITS[voKey];
    return {
      unitId: u.unitId,
      unitName: u.unitName,
      level: 2,
      levelLabel: "województwo",
      source: "known_voivodeship",
      fallbackUsed: true,
      fallbackLevel: "województwo",
    };
  }
  if (args.voivodeship) {
    const u = await searchUnit(args.voivodeship, 2);
    if (u) {
      return {
        unitId: u.id,
        unitName: u.name,
        level: u.level,
        levelLabel: levelLabel(u.level),
        source: "search",
        fallbackUsed: true,
        fallbackLevel: "województwo",
      };
    }
  }

  // 4) Polska — ostatni fallback.
  return {
    unitId: COUNTRY_UNIT.unitId,
    unitName: COUNTRY_UNIT.unitName,
    level: COUNTRY_UNIT.level,
    levelLabel: "Polska",
    source: "country_fallback",
    fallbackUsed: true,
    fallbackLevel: "Polska",
  };
}

interface BdlValuePoint {
  value: number | null;
  year: string | null;
  quarter: string | null;
  period: string; // np. "2024 Q4" lub "2024"
}

async function fetchVarMeta(varId: string): Promise<{ name: string; unit: string | null } | null> {
  try {
    const res = await fetchWithTimeout(
      `${BDL_BASE}/variables/${varId}?format=json`,
      { headers: headers() },
      10_000,
    );
    if (!res.ok) return null;
    const j = (await res.json()) as {
      n1?: string;
      n2?: string;
      n3?: string;
      measureUnitName?: string;
    };
    const name = [j.n1, j.n2, j.n3].filter(Boolean).join(" — ");
    return { name: name || `Wskaźnik BDL ${varId}`, unit: j.measureUnitName ?? null };
  } catch {
    return null;
  }
}

async function fetchValueForUnit(varId: string, unitId: string): Promise<BdlValuePoint | null> {
  const url = `${BDL_BASE}/data/by-variable/${varId}?unit-parent-id=${unitId}&unit-level=${unitId === COUNTRY_UNIT.unitId ? 1 : 6}&format=json&page-size=200`;
  // Dla bezpiecznego dopasowania pobieramy po unitId bezpośrednio:
  const direct = `${BDL_BASE}/data/by-unit/${unitId}?var-id=${varId}&format=json&page-size=50`;
  try {
    const res = await fetchWithTimeout(direct, { headers: headers() }, 15_000);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results?: Array<{ values?: Array<{ val?: number; year?: string; attrId?: string }> }>;
    };
    const values = json.results?.[0]?.values ?? [];
    if (!values.length) return null;
    // Posortuj po roku malejąco; pierwszy z liczbą = najnowszy.
    const sorted = values
      .filter((v) => typeof v.val === "number")
      .sort((a, b) => Number(b.year ?? 0) - Number(a.year ?? 0));
    const top = sorted[0];
    if (!top) return null;
    return {
      value: top.val ?? null,
      year: top.year ?? null,
      quarter: null,
      period: top.year ?? "",
    };
  } catch {
    void url;
    return null;
  }
}

export type SanityStatus = "ok" | "suspicious" | "rejected";

export function validateResidentialPricePerM2SanityCheck(
  city: string | null | undefined,
  pricePerM2: number | null,
): { status: SanityStatus; threshold: number | null; reason: string | null } {
  const key = norm(city);
  const threshold = CITY_SANITY_MIN_PLN_M2[key] ?? null;
  if (pricePerM2 == null) return { status: "ok", threshold, reason: null };
  if (threshold == null) return { status: "ok", threshold: null, reason: null };
  if (pricePerM2 < threshold * 0.7) {
    return {
      status: "rejected",
      threshold,
      reason: `Cena ${Math.round(pricePerM2)} zł/m² rażąco odbiega od minimum dla miasta (${threshold} zł/m²).`,
    };
  }
  if (pricePerM2 < threshold) {
    return {
      status: "suspicious",
      threshold,
      reason: `Cena ${Math.round(pricePerM2)} zł/m² jest nietypowo niska dla tej lokalizacji (próg ostrzegawczy ${threshold} zł/m²).`,
    };
  }
  return { status: "ok", threshold, reason: null };
}

// GusBenchmarkDiagnostics imported from ./types

export interface GusBenchmarkArgs {
  propertyType: string;
  city?: string | null;
  voivodeship?: string | null;
  county?: string | null;
  soilClass?: string | null;
}

export function classifySoil(
  soilClass: string | null | undefined,
): "dobre" | "srednie" | "slabe" | "ogolem" {
  if (!soilClass) return "ogolem";
  const s = soilClass.trim().toUpperCase();
  if (["I", "II", "IIIA", "III A"].includes(s)) return "dobre";
  if (["IIIB", "III B", "IV", "IVA", "IVB"].includes(s)) return "srednie";
  if (["V", "VI"].includes(s)) return "slabe";
  return "ogolem";
}

export interface GusBenchmarkResult {
  stats: GusStats | null;
  diagnostics: GusBenchmarkDiagnostics;
}

async function fetchWithUnitFallback(
  varId: string,
  primaryUnit: ResolvedBdlUnit,
  voivodeship: string | null | undefined,
): Promise<{ value: BdlValuePoint | null; unit: ResolvedBdlUnit; fallbackUsed: boolean }> {
  // Próbuj na poziomie powiatu/miasta:
  let v = await fetchValueForUnit(varId, primaryUnit.unitId);
  if (v && v.value != null)
    return { value: v, unit: primaryUnit, fallbackUsed: primaryUnit.fallbackUsed };

  // Fallback do województwa:
  const voKey = norm(voivodeship);
  if (voKey && KNOWN_VOIVODESHIP_UNITS[voKey] && primaryUnit.level !== 2) {
    const voUnit = KNOWN_VOIVODESHIP_UNITS[voKey];
    v = await fetchValueForUnit(varId, voUnit.unitId);
    if (v && v.value != null) {
      return {
        value: v,
        unit: {
          unitId: voUnit.unitId,
          unitName: voUnit.unitName,
          level: 2,
          levelLabel: "województwo",
          source: "known_voivodeship",
          fallbackUsed: true,
          fallbackLevel: "województwo",
        },
        fallbackUsed: true,
      };
    }
  }

  // Fallback do Polski:
  v = await fetchValueForUnit(varId, COUNTRY_UNIT.unitId);
  if (v && v.value != null) {
    return {
      value: v,
      unit: {
        unitId: COUNTRY_UNIT.unitId,
        unitName: COUNTRY_UNIT.unitName,
        level: 1,
        levelLabel: "Polska",
        source: "country_fallback",
        fallbackUsed: true,
        fallbackLevel: "Polska",
      },
      fallbackUsed: true,
    };
  }
  return { value: null, unit: primaryUnit, fallbackUsed: false };
}

export async function gusBenchmark(args: GusBenchmarkArgs): Promise<GusBenchmarkResult> {
  const warnings: string[] = [];
  const unit = await resolveBdlUnit({
    city: args.city,
    county: args.county,
    voivodeship: args.voivodeship,
  });

  // Walidacja: jeżeli miasto = Warszawa, jednostka MUSI zawierać "Warszawa".
  if (norm(args.city) === "warszawa" && !/warszaw/i.test(unit.unitName)) {
    warnings.push(
      "Benchmark GUS BDL odrzucony: jednostka terytorialna nie odpowiada lokalizacji nieruchomości.",
    );
    return {
      stats: null,
      diagnostics: {
        inputLocation: {
          city: args.city ?? null,
          county: args.county ?? null,
          voivodeship: args.voivodeship ?? null,
        },
        resolvedLocation: {
          bdlUnitId: unit.unitId,
          bdlUnitName: unit.unitName,
          bdlUnitLevel: unit.levelLabel,
          source: unit.source,
        },
        bdlVariable: null,
        period: { year: null, quarter: null, label: "" },
        value: null,
        fallbackUsed: true,
        fallbackLevel: unit.levelLabel,
        sanityCheckStatus: "rejected",
        sanityCheckReason: "Niezgodność jednostki BDL z lokalizacją",
        warnings,
        summaryLine: "GUS BDL: jednostka terytorialna nie pasuje do lokalizacji — wynik odrzucony.",
      },
    };
  }

  if (args.propertyType === "mieszkanie" || args.propertyType === "dom") {
    // Preferowana zmienna: mediana zł/m². Średnia jako wsparcie.
    const cacheKey = `gus2:${args.propertyType}:${unit.unitId}:${VAR_DWELLING_MEDIAN}:${VAR_DWELLING_AVG}`;
    return withCache("gus_bdl_cache", cacheKey, 30, async () => {
      const [medRes, avgRes, medMeta, avgMeta] = await Promise.all([
        fetchWithUnitFallback(VAR_DWELLING_MEDIAN, unit, args.voivodeship),
        fetchWithUnitFallback(VAR_DWELLING_AVG, unit, args.voivodeship),
        fetchVarMeta(VAR_DWELLING_MEDIAN),
        fetchVarMeta(VAR_DWELLING_AVG),
      ]);

      const finalUnit = medRes.value ? medRes.unit : avgRes.value ? avgRes.unit : unit;
      const pickedMeta = medRes.value ? medMeta : avgMeta;
      const pickedPoint = medRes.value ?? avgRes.value;
      const pickedVarId = medRes.value ? VAR_DWELLING_MEDIAN : VAR_DWELLING_AVG;
      const pickedVarName =
        pickedMeta?.name ??
        (pickedVarId === VAR_DWELLING_MEDIAN
          ? "Mediana ceny za 1 m² lokali mieszkalnych sprzedanych w ramach transakcji rynkowych"
          : "Średnia cena za 1 m² lokali mieszkalnych sprzedanych w ramach transakcji rynkowych");

      const pricePerM2 = pickedPoint?.value ?? null;
      const sanity = validateResidentialPricePerM2SanityCheck(args.city, pricePerM2);
      if (sanity.status === "suspicious") {
        warnings.push(
          `Cena GUS BDL wygląda nietypowo nisko dla tej lokalizacji. Sprawdź jednostkę BDL, okres i zmienną. ${sanity.reason ?? ""}`.trim(),
        );
      }
      if (sanity.status === "rejected") {
        warnings.push(
          `Benchmark GUS BDL odrzucony jako rażąco zaniżony. ${sanity.reason ?? ""}`.trim(),
        );
      }
      if (finalUnit.fallbackUsed) {
        warnings.push(
          `Użyto danych zastępczych na poziomie ${finalUnit.levelLabel}, ponieważ brak danych dla powiatu.`,
        );
      }

      const periodLabel = pickedPoint?.year ?? "";
      const summaryLine = `GUS BDL: ${finalUnit.unitName}, ${finalUnit.levelLabel}${periodLabel ? `, ${periodLabel}` : ""}, ${pickedVarName}`;

      const stats: GusStats | null =
        pricePerM2 != null && sanity.status !== "rejected"
          ? {
              pricePerM2Median: medRes.value?.value ?? null,
              pricePerM2Average: avgRes.value?.value ?? null,
              transactionsCount: null,
              period: periodLabel,
              level:
                finalUnit.level === 6
                  ? "powiat"
                  : finalUnit.level === 2
                    ? "wojewodztwo"
                    : "krajowy",
            }
          : null;

      const diagnostics: GusBenchmarkDiagnostics = {
        inputLocation: {
          city: args.city ?? null,
          county: args.county ?? null,
          voivodeship: args.voivodeship ?? null,
        },
        resolvedLocation: {
          bdlUnitId: finalUnit.unitId,
          bdlUnitName: finalUnit.unitName,
          bdlUnitLevel: finalUnit.levelLabel,
          source: finalUnit.source,
        },
        bdlVariable: {
          variableId: pickedVarId,
          variableName: pickedVarName,
          unit: pickedMeta?.unit ?? "zł/m²",
        },
        period: {
          year: pickedPoint?.year ?? null,
          quarter: pickedPoint?.quarter ?? null,
          label: periodLabel,
        },
        value: pricePerM2,
        fallbackUsed: finalUnit.fallbackUsed,
        fallbackLevel: finalUnit.fallbackUsed ? finalUnit.levelLabel : null,
        sanityCheckStatus: sanity.status,
        sanityCheckReason: sanity.reason,
        warnings,
        summaryLine,
      };

      return { stats, diagnostics };
    });
  }

  if (args.propertyType === "grunt_rolny") {
    const cacheKey = `gus2:grunt_rolny:${unit.unitId}:${VAR_LAND_AGRI_AVG}`;
    return withCache("gus_bdl_cache", cacheKey, 30, async () => {
      const meta = await fetchVarMeta(VAR_LAND_AGRI_AVG);
      const res = await fetchWithUnitFallback(VAR_LAND_AGRI_AVG, unit, args.voivodeship);
      if (!res.value || res.value.value == null) {
        return {
          stats: null,
          diagnostics: {
            inputLocation: {
              city: args.city ?? null,
              county: args.county ?? null,
              voivodeship: args.voivodeship ?? null,
            },
            resolvedLocation: {
              bdlUnitId: unit.unitId,
              bdlUnitName: unit.unitName,
              bdlUnitLevel: unit.levelLabel,
              source: unit.source,
            },
            bdlVariable: {
              variableId: VAR_LAND_AGRI_AVG,
              variableName: meta?.name ?? "Średnia cena gruntów rolnych za 1 ha",
              unit: meta?.unit ?? "zł/ha",
            },
            period: { year: null, quarter: null, label: "" },
            value: null,
            fallbackUsed: false,
            fallbackLevel: null,
            sanityCheckStatus: "ok",
            sanityCheckReason: null,
            warnings: ["GUS BDL: brak danych dla gruntów rolnych w wybranej jednostce."],
            summaryLine: `GUS BDL: ${unit.unitName} — brak danych`,
          },
        };
      }
      if (res.unit.fallbackUsed) {
        warnings.push(
          `Użyto danych zastępczych na poziomie ${res.unit.levelLabel}, ponieważ brak danych dla powiatu.`,
        );
      }
      const stats: GusStats = {
        pricePerM2Median: null,
        pricePerM2Average: null,
        transactionsCount: null,
        period: res.value.year ?? "",
        level: res.unit.level === 6 ? "powiat" : res.unit.level === 2 ? "wojewodztwo" : "krajowy",
        pricePerHaByClass: {
          dobre: res.value.value * 1.2,
          srednie: res.value.value,
          slabe: res.value.value * 0.7,
          ogolem: res.value.value,
        },
      };
      return {
        stats,
        diagnostics: {
          inputLocation: {
            city: args.city ?? null,
            county: args.county ?? null,
            voivodeship: args.voivodeship ?? null,
          },
          resolvedLocation: {
            bdlUnitId: res.unit.unitId,
            bdlUnitName: res.unit.unitName,
            bdlUnitLevel: res.unit.levelLabel,
            source: res.unit.source,
          },
          bdlVariable: {
            variableId: VAR_LAND_AGRI_AVG,
            variableName: meta?.name ?? "Średnia cena gruntów rolnych za 1 ha",
            unit: meta?.unit ?? "zł/ha",
          },
          period: { year: res.value.year, quarter: null, label: res.value.year ?? "" },
          value: res.value.value,
          fallbackUsed: res.unit.fallbackUsed,
          fallbackLevel: res.unit.fallbackUsed ? res.unit.levelLabel : null,
          sanityCheckStatus: "ok",
          sanityCheckReason: null,
          warnings,
          summaryLine: `GUS BDL: ${res.unit.unitName}, ${res.unit.levelLabel}${res.value.year ? `, ${res.value.year}` : ""}, ${meta?.name ?? "średnia cena 1 ha gruntu rolnego"}`,
        },
      };
    });
  }

  return {
    stats: null,
    diagnostics: {
      inputLocation: {
        city: args.city ?? null,
        county: args.county ?? null,
        voivodeship: args.voivodeship ?? null,
      },
      resolvedLocation: {
        bdlUnitId: unit.unitId,
        bdlUnitName: unit.unitName,
        bdlUnitLevel: unit.levelLabel,
        source: unit.source,
      },
      bdlVariable: null,
      period: { year: null, quarter: null, label: "" },
      value: null,
      fallbackUsed: false,
      fallbackLevel: null,
      sanityCheckStatus: "ok",
      sanityCheckReason: null,
      warnings: [
        `GUS BDL: brak dedykowanego wskaźnika dla typu nieruchomości "${args.propertyType}".`,
      ],
      summaryLine: `GUS BDL: brak wskaźnika dla typu ${args.propertyType}`,
    },
  };
}
