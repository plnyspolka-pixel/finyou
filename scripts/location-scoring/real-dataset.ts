// Wspólne źródło danych rozszerzonego seeda (seed-real-2) — pokrycie prefiksów
// realnie występujących w bazie wniosków + STREFY PODMIEJSKIE dla metropolii.
// DANE PRZYBLIŻONE (miasto-siedziba sądu + gminy podmiejskie per prefiks);
// mapowanie sądów best-effort (conf). Do zastąpienia oficjalnym importem MS + GUS.
// Używane przez emit-sql.ts (SQL referencyjny) i backfill-sql.ts (przeliczenie).
//
// Strefy podmiejskie: dla domów/działek rozkład rozkłada się na gminy okoliczne
// (commuting_zone) o wysokim udziale zabudowy jednorodzinnej — dom/działka pod
// dużym miastem dostaje wysoką ocenę, tak jak Pruszków pod Warszawą.
import {
  computeMetricsFor,
  generatePropertyWeights,
  type ComputedMetrics,
  type SeedGeoUnit,
  type FuaEntry,
  type PropertyWeight,
} from "./compute";

export const DATA_VERSION = "seed-real-2";
export const JUR_LABEL = "2026.1-seed-real";

export type Suburb = { city: string; lat: number; lng: number; pop: number };

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
  suburbs?: Suburb[];
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
    suburbs: [
      { city: "Legionowo", lat: 52.4, lng: 20.927, pop: 54000 },
      { city: "Marki", lat: 52.32, lng: 21.106, pop: 38000 },
      { city: "Ząbki", lat: 52.29, lng: 21.11, pop: 38000 },
    ],
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
    suburbs: [{ city: "Kozienice", lat: 51.583, lng: 21.549, pop: 17000 }],
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
    suburbs: [
      { city: "Wieliczka", lat: 49.987, lng: 20.065, pop: 55000 },
      { city: "Skawina", lat: 49.976, lng: 19.83, pop: 43000 },
      { city: "Zielonki", lat: 50.12, lng: 19.92, pop: 25000 },
    ],
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
    suburbs: [
      { city: "Wasilków", lat: 53.2, lng: 23.207, pop: 15000 },
      { city: "Choroszcz", lat: 53.14, lng: 22.99, pop: 14000 },
      { city: "Łapy", lat: 52.99, lng: 22.88, pop: 22000 },
    ],
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
    suburbs: [{ city: "Sianów", lat: 54.24, lng: 16.29, pop: 13000 }],
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
    suburbs: [
      { city: "Będzin", lat: 50.327, lng: 19.128, pop: 56000 },
      { city: "Sławków", lat: 50.3, lng: 19.37, pop: 7000 },
    ],
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
    suburbs: [
      { city: "Dywity", lat: 53.83, lng: 20.49, pop: 12000 },
      { city: "Stawiguda", lat: 53.66, lng: 20.4, pop: 11000 },
    ],
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
    suburbs: [
      { city: "Siechnice", lat: 51.04, lng: 17.15, pop: 20000 },
      { city: "Kąty Wrocławskie", lat: 51.03, lng: 16.77, pop: 22000 },
      { city: "Oborniki Śląskie", lat: 51.3, lng: 16.9, pop: 20000 },
    ],
  },
  {
    prefix: "BB1Z",
    court: "Sąd Rejonowy w Żywcu",
    city: "Żywiec",
    lat: 49.6853,
    lng: 19.1922,
    pop: 31000,
    conf: 0.8,
    suburbs: [{ city: "Węgierska Górka", lat: 49.6, lng: 19.12, pop: 15000 }],
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
    suburbs: [{ city: "Brześć Kujawski", lat: 52.6, lng: 18.9, pop: 11000 }],
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
    suburbs: [
      { city: "Świdnik", lat: 51.22, lng: 22.7, pop: 40000 },
      { city: "Lubartów", lat: 51.46, lng: 22.6, pop: 22000 },
      { city: "Niemce", lat: 51.35, lng: 22.62, pop: 18000 },
    ],
  },
  {
    prefix: "NS1T",
    court: "Sąd Rejonowy w Nowym Targu",
    city: "Nowy Targ",
    lat: 49.4772,
    lng: 20.0301,
    pop: 33000,
    conf: 0.8,
    suburbs: [{ city: "Rabka-Zdrój", lat: 49.61, lng: 19.96, pop: 17000 }],
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
    suburbs: [{ city: "Otmuchów", lat: 50.46, lng: 17.17, pop: 13000 }],
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
    suburbs: [
      { city: "Luboń", lat: 52.34, lng: 16.88, pop: 31000 },
      { city: "Swarzędz", lat: 52.41, lng: 17.08, pop: 50000 },
      { city: "Suchy Las", lat: 52.5, lng: 16.87, pop: 18000 },
    ],
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
    suburbs: [
      { city: "Głogów Małopolski", lat: 50.16, lng: 21.97, pop: 20000 },
      { city: "Boguchwała", lat: 49.98, lng: 21.95, pop: 20000 },
    ],
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
    suburbs: [
      { city: "Piastów", lat: 52.19, lng: 20.84, pop: 23000 },
      { city: "Brwinów", lat: 52.14, lng: 20.72, pop: 25000 },
    ],
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
    suburbs: [
      { city: "Rumia", lat: 54.57, lng: 18.39, pop: 50000 },
      { city: "Reda", lat: 54.6, lng: 18.35, pop: 27000 },
    ],
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
    suburbs: [{ city: "Żory", lat: 50.04, lng: 18.7, pop: 61000 }],
  },
  {
    prefix: "KN1K",
    court: "Sąd Rejonowy w Koninie",
    city: "Konin",
    lat: 52.2231,
    lng: 18.2514,
    pop: 72000,
    conf: 0.8,
    suburbs: [{ city: "Kleczew", lat: 52.35, lng: 18.18, pop: 10000 }],
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
    suburbs: [{ city: "Nowe Skalmierzyce", lat: 51.72, lng: 18.0, pop: 15000 }],
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
    suburbs: [
      { city: "Pabianice", lat: 51.66, lng: 19.35, pop: 63000 },
      { city: "Zgierz", lat: 51.86, lng: 19.4, pop: 56000 },
      { city: "Aleksandrów Łódzki", lat: 51.82, lng: 19.3, pop: 22000 },
    ],
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
    suburbs: [{ city: "Chełmża", lat: 53.18, lng: 18.6, pop: 14000 }],
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

export const terytForCity = (city: string): string =>
  "S" +
  city
    .normalize("NFD")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 11)
    .toUpperCase();

export const terytFor = (r: Row): string => terytForCity(r.city);

/** TERYT wszystkich obszarów w zasięgu wydziału (rdzeń + strefy podmiejskie). */
export function areaTerytsFor(r: Row): string[] {
  return [terytForCity(r.city), ...(r.suburbs ?? []).map((s) => terytForCity(s.city))];
}

export type BuiltDataset = {
  units: SeedGeoUnit[];
  metrics: ComputedMetrics[];
  metricsByTeryt: Map<string, ComputedMetrics>;
  weights: PropertyWeight[];
  fua: Record<string, FuaEntry>;
};

/** Buduje jednostki (rdzeń + podmiejskie), metryki (haversine) i wagi rodzaju. */
export function buildDataset(): BuiltDataset {
  const unitByTeryt = new Map<string, SeedGeoUnit>();
  const fua: Record<string, FuaEntry> = {};

  const addUnit = (
    city: string,
    lat: number,
    lng: number,
    pop: number,
    role: FuaEntry["role"] | undefined,
    fuaCode: string | undefined,
  ) => {
    const teryt = terytForCity(city);
    if (unitByTeryt.has(teryt)) return;
    unitByTeryt.set(teryt, {
      teryt,
      name: city,
      unit_type: "municipality",
      parent_teryt: null,
      center_lat: lat,
      center_lng: lng,
      area_km2: Math.max(10, Math.round(pop / 1500)),
      population: pop,
      degurba: pop >= 100000 ? 1 : pop >= 30000 ? 2 : 3,
      is_city_above_30k: pop >= 30000,
      is_city_above_100k: pop >= 100000,
      is_city_above_250k: pop >= 250000,
    });
    if (role) fua[teryt] = { code: fuaCode ?? "PL000", role };
  };

  for (const r of ROWS) {
    addUnit(r.city, r.lat, r.lng, r.pop, r.fua, r.fuaCode);
    for (const s of r.suburbs ?? []) {
      // Gminy podmiejskie: strefa dojazdowa metropolii (kod FUA rdzenia).
      addUnit(s.city, s.lat, s.lng, s.pop, "commuting_zone", r.fuaCode ?? "PL000");
    }
  }

  const units = [...unitByTeryt.values()];
  const metrics = units.map((u) => computeMetricsFor(u, units, fua));
  const metricsByTeryt = new Map(metrics.map((m) => [m.teryt, m]));
  const weights = generatePropertyWeights(units, metricsByTeryt);
  return { units, metrics, metricsByTeryt, weights, fua };
}
