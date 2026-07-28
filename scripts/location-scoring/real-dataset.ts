// Wspólne źródło danych rozszerzonego seeda (seed-real-1) — pokrycie prefiksów
// realnie występujących w bazie wniosków. DANE PRZYBLIŻONE (miasto-siedziba sądu
// per prefiks); mapowanie sądów best-effort (conf). Do zastąpienia oficjalnym
// importem MS + GUS. Używane przez emit-sql.ts (SQL referencyjny) i
// backfill-sql.ts (przeliczenie wyników dla istniejących wniosków).
import {
  computeMetricsFor,
  generatePropertyWeights,
  type ComputedMetrics,
  type SeedGeoUnit,
  type FuaEntry,
  type PropertyWeight,
} from "./compute";

export const DATA_VERSION = "seed-real-1";
export const JUR_LABEL = "2026.1-seed-real";

export type Row = {
  prefix: string;
  court: string;
  city: string;
  lat: number;
  lng: number;
  pop: number;
  conf: number;
  fua?: "core" | "commuting_zone";
  fuaCode?: string;
};

export const ROWS: Row[] = [
  {
    prefix: "WA1M",
    court: "Sąd Rejonowy dla Warszawy-Mokotowa w Warszawie",
    city: "Warszawa",
    lat: 52.2297,
    lng: 21.0122,
    pop: 1800000,
    conf: 0.9,
    fua: "core",
    fuaCode: "PL001",
  },
  {
    prefix: "RA1R",
    court: "Sąd Rejonowy w Radomiu",
    city: "Radom",
    lat: 51.4027,
    lng: 21.1471,
    pop: 200000,
    conf: 0.9,
    fua: "core",
    fuaCode: "PL021",
  },
  {
    prefix: "KR1P",
    court: "Sąd Rejonowy dla Krakowa-Podgórza w Krakowie",
    city: "Kraków",
    lat: 50.0647,
    lng: 19.945,
    pop: 780000,
    conf: 0.9,
    fua: "core",
    fuaCode: "PL002",
  },
  {
    prefix: "BI1B",
    court: "Sąd Rejonowy w Białymstoku",
    city: "Białystok",
    lat: 53.1325,
    lng: 23.1688,
    pop: 294000,
    conf: 0.85,
    fua: "core",
    fuaCode: "PL018",
  },
  {
    prefix: "K01B",
    court: "Sąd Rejonowy w Koszalinie (prefiks niejednoznaczny)",
    city: "Koszalin",
    lat: 54.1943,
    lng: 16.1714,
    pop: 106000,
    conf: 0.35,
    fua: "core",
    fuaCode: "PL032",
  },
  {
    prefix: "KA1D",
    court: "Sąd Rejonowy w Dąbrowie Górniczej",
    city: "Dąbrowa Górnicza",
    lat: 50.3249,
    lng: 19.1874,
    pop: 118000,
    conf: 0.8,
    fua: "commuting_zone",
    fuaCode: "PL022",
  },
  {
    prefix: "OL1M",
    court: "Sąd Rejonowy w Olsztynie",
    city: "Olsztyn",
    lat: 53.7784,
    lng: 20.4801,
    pop: 170000,
    conf: 0.85,
    fua: "core",
    fuaCode: "PL028",
  },
  {
    prefix: "WR1E",
    court: "Sąd Rejonowy dla Wrocławia (wydział do potwierdzenia)",
    city: "Wrocław",
    lat: 51.1079,
    lng: 17.0385,
    pop: 641000,
    conf: 0.6,
    fua: "core",
    fuaCode: "PL002W",
  },
  {
    prefix: "BB1Z",
    court: "Sąd Rejonowy w Żywcu",
    city: "Żywiec",
    lat: 49.6853,
    lng: 19.1922,
    pop: 31000,
    conf: 0.8,
  },
  {
    prefix: "WL1A",
    court: "Sąd Rejonowy we Włocławku",
    city: "Włocławek",
    lat: 52.6483,
    lng: 19.0677,
    pop: 106000,
    conf: 0.75,
    fua: "core",
    fuaCode: "PL041",
  },
  {
    prefix: "LU1I",
    court: "Sąd Rejonowy Lublin-Wschód / Lublin-Zachód",
    city: "Lublin",
    lat: 51.2465,
    lng: 22.5684,
    pop: 331000,
    conf: 0.75,
    fua: "core",
    fuaCode: "PL034",
  },
  {
    prefix: "NS1T",
    court: "Sąd Rejonowy w Nowym Targu",
    city: "Nowy Targ",
    lat: 49.4772,
    lng: 20.0301,
    pop: 33000,
    conf: 0.8,
  },
  {
    prefix: "OL1B",
    court: "Sąd Rejonowy w Bartoszycach",
    city: "Bartoszyce",
    lat: 54.2521,
    lng: 20.8093,
    pop: 23000,
    conf: 0.8,
  },
  {
    prefix: "OL1N",
    court: "Sąd Rejonowy w Nidzicy",
    city: "Nidzica",
    lat: 53.3589,
    lng: 20.4276,
    pop: 13000,
    conf: 0.75,
  },
  {
    prefix: "OP1N",
    court: "Sąd Rejonowy w Nysie",
    city: "Nysa",
    lat: 50.474,
    lng: 17.3343,
    pop: 43000,
    conf: 0.8,
  },
  {
    prefix: "PL1Z",
    court: "Sąd Rejonowy w Sierpcu (prefiks niejednoznaczny)",
    city: "Sierpc",
    lat: 52.8555,
    lng: 19.6703,
    pop: 18000,
    conf: 0.4,
  },
  {
    prefix: "PO1P",
    court: "Sąd Rejonowy Poznań (wydział do potwierdzenia)",
    city: "Poznań",
    lat: 52.4064,
    lng: 16.9252,
    pop: 530000,
    conf: 0.65,
    fua: "core",
    fuaCode: "PL030",
  },
  {
    prefix: "RZ1R",
    court: "Sąd Rejonowy w Rzeszowie",
    city: "Rzeszów",
    lat: 50.0413,
    lng: 21.999,
    pop: 196000,
    conf: 0.85,
    fua: "core",
    fuaCode: "PL035",
  },
  {
    prefix: "TB1M",
    court: "Sąd Rejonowy w Mielcu",
    city: "Mielec",
    lat: 50.2874,
    lng: 21.4239,
    pop: 60000,
    conf: 0.8,
  },
  {
    prefix: "WA1P",
    court: "Sąd Rejonowy w Pruszkowie",
    city: "Pruszków",
    lat: 52.1705,
    lng: 20.8121,
    pop: 63000,
    conf: 0.75,
    fua: "commuting_zone",
    fuaCode: "PL001",
  },
  {
    prefix: "ZA1J",
    court: "Sąd Rejonowy w Janowie Lubelskim",
    city: "Janów Lubelski",
    lat: 50.7084,
    lng: 22.4102,
    pop: 12000,
    conf: 0.6,
  },
  {
    prefix: "GD1W",
    court: "Sąd Rejonowy w Wejherowie",
    city: "Wejherowo",
    lat: 54.6052,
    lng: 18.2364,
    pop: 51000,
    conf: 0.8,
    fua: "commuting_zone",
    fuaCode: "PL006",
  },
  {
    prefix: "GL1J",
    court: "Sąd Rejonowy w Jastrzębiu-Zdroju",
    city: "Jastrzębie-Zdrój",
    lat: 49.9515,
    lng: 18.573,
    pop: 88000,
    conf: 0.8,
    fua: "commuting_zone",
    fuaCode: "PL022",
  },
  {
    prefix: "KN1K",
    court: "Sąd Rejonowy w Koninie",
    city: "Konin",
    lat: 52.2231,
    lng: 18.2514,
    pop: 72000,
    conf: 0.8,
  },
  {
    prefix: "KS1J",
    court: "Sąd Rejonowy w Kaliszu (prefiks niejednoznaczny)",
    city: "Kalisz",
    lat: 51.7674,
    lng: 18.0912,
    pop: 100000,
    conf: 0.45,
    fua: "core",
    fuaCode: "PL041K",
  },
  {
    prefix: "KS1S",
    court: "Sąd Rejonowy w Ostrowie Wielkopolskim (prefiks niejednoznaczny)",
    city: "Ostrów Wielkopolski",
    lat: 51.6492,
    lng: 17.8102,
    pop: 72000,
    conf: 0.4,
  },
  {
    prefix: "LD1Y",
    court: "Sąd Rejonowy dla Łodzi (wydział do potwierdzenia)",
    city: "Łódź",
    lat: 51.7592,
    lng: 19.4559,
    pop: 670000,
    conf: 0.6,
    fua: "core",
    fuaCode: "PL003",
  },
  {
    prefix: "TO1T",
    court: "Sąd Rejonowy w Toruniu",
    city: "Toruń",
    lat: 53.0138,
    lng: 18.5984,
    pop: 198000,
    conf: 0.8,
    fua: "core",
    fuaCode: "PL047",
  },
  {
    prefix: "WA1N",
    court: "Sąd Rejonowy dla Warszawy (wydział do potwierdzenia)",
    city: "Warszawa",
    lat: 52.2297,
    lng: 21.0122,
    pop: 1800000,
    conf: 0.55,
    fua: "core",
    fuaCode: "PL001",
  },
  {
    prefix: "SW2K",
    court: "Sąd Rejonowy w Suwałkach",
    city: "Suwałki",
    lat: 54.1113,
    lng: 22.9309,
    pop: 69000,
    conf: 0.7,
  },
];

export const terytFor = (r: Row): string =>
  "S" +
  r.city
    .normalize("NFD")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 10)
    .toUpperCase();

export type BuiltDataset = {
  units: SeedGeoUnit[];
  metrics: ComputedMetrics[];
  metricsByTeryt: Map<string, ComputedMetrics>;
  weights: PropertyWeight[];
  fua: Record<string, FuaEntry>;
};

/** Buduje jednostki, metryki (haversine) i wagi rodzaju — identycznie jak importer. */
export function buildDataset(): BuiltDataset {
  const unitByTeryt = new Map<string, SeedGeoUnit>();
  const fua: Record<string, FuaEntry> = {};
  for (const r of ROWS) {
    const teryt = terytFor(r);
    if (!unitByTeryt.has(teryt)) {
      unitByTeryt.set(teryt, {
        teryt,
        name: r.city,
        unit_type: "municipality",
        parent_teryt: null,
        center_lat: r.lat,
        center_lng: r.lng,
        area_km2: Math.max(10, Math.round(r.pop / 1500)),
        population: r.pop,
        degurba: r.pop >= 100000 ? 1 : r.pop >= 30000 ? 2 : 3,
        is_city_above_30k: r.pop >= 30000,
        is_city_above_100k: r.pop >= 100000,
        is_city_above_250k: r.pop >= 250000,
      });
      if (r.fua) fua[teryt] = { code: r.fuaCode ?? "PL000", role: r.fua };
    }
  }
  const units = [...unitByTeryt.values()];
  const metrics = units.map((u) => computeMetricsFor(u, units, fua));
  const metricsByTeryt = new Map(metrics.map((m) => [m.teryt, m]));
  const weights = generatePropertyWeights(units, metricsByTeryt);
  return { units, metrics, metricsByTeryt, weights, fua };
}
