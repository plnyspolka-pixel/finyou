// Regionalny współczynnik dożycia z GUS BDL (podregion NUTS3 powiatu
// nieruchomości; zapasowo województwo). Cache w pamięci procesu — dane roczne.
import {
  BDL_EX_VARIABLES,
  BDL_POLAND_UNIT,
  ageBucket,
  regionalLongevityFrom,
  unavailableLongevity,
  type LongevitySex,
  type RegionalLongevity,
} from "./regional-longevity";
import { registryGet } from "@/lib/registry-fetch.server";

export const BDL = "https://bdl.stat.gov.pl/api/v1";
const cache = new Map<string, Promise<any>>();

function headers(): HeadersInit {
  const key = process.env.GUS_BDL_API_KEY;
  const h: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "FinanceYou-Analysis/1.0 (+https://financeyou.pl)",
  };
  if (key) h["X-ClientId"] = key;
  return h;
}

export function getJson(url: string): Promise<any> {
  let p = cache.get(url);
  if (!p) {
    p = registryGet(url, {
      headers: headers() as Record<string, string>,
      timeoutMs: 15_000,
      prefer: "direct",
    })
      .then((r) => (r.ok ? JSON.parse(r.text) : null))
      .catch(() => null);
    cache.set(url, p);
    // Błąd nie zostaje w cache na stałe.
    p.then((v) => v == null && cache.delete(url));
  }
  return p;
}

const norm = (s: string) =>
  s
    .toLocaleLowerCase("pl-PL")
    .replace(/^\s*(powiat|m\.?\s*st\.?|m\.)\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Jednostka BDL: podregion powiatu nieruchomości, a gdy go nie ustalono — województwo. */
export async function resolveUnit(
  county: string | null,
  voivodeship: string | null,
): Promise<{ id: string; name: string; level: "podregion" | "województwo" } | null> {
  if (county) {
    const q = norm(county);
    const d = await getJson(
      `${BDL}/units/search?name=${encodeURIComponent(q)}&level=5&format=json&page-size=20`,
    );
    const hits: any[] = d?.results ?? [];
    const exact =
      hits.find((u) => norm(String(u.name)) === q) ??
      hits.find((u) => norm(String(u.name)).endsWith(q)) ??
      (hits.length === 1 ? hits[0] : null);
    if (exact?.parentId) {
      const parent = await getJson(`${BDL}/units/${exact.parentId}?format=json`);
      return { id: exact.parentId, name: parent?.name ?? "podregion", level: "podregion" };
    }
  }
  if (voivodeship) {
    const d = await getJson(
      `${BDL}/units/search?name=${encodeURIComponent(norm(voivodeship))}&level=2&format=json`,
    );
    const v = (d?.results ?? [])[0];
    if (v?.id) return { id: v.id, name: v.name, level: "województwo" };
  }
  return null;
}

function latest(values: any[] | undefined): { year: string; val: number } | null {
  const v = (values ?? []).filter((x) => typeof x?.val === "number").at(-1);
  return v ? { year: String(v.year), val: Number(v.val) } : null;
}

export async function fetchRegionalLongevity(args: {
  age: number | null;
  sex: LongevitySex | null;
  county: string | null;
  voivodeship: string | null;
}): Promise<RegionalLongevity> {
  if (args.age == null || !args.sex) {
    return unavailableLongevity(
      "Brak wieku/płci właściciela — nie wyznaczono współczynnika regionalnego.",
    );
  }
  const bucket = ageBucket(args.age);
  const varId = BDL_EX_VARIABLES[args.sex][bucket];
  const unit = await resolveUnit(args.county, args.voivodeship).catch(() => null);
  if (!unit) {
    return unavailableLongevity("Nie ustalono podregionu ani województwa nieruchomości w GUS BDL.");
  }
  const [reg, pl] = await Promise.all([
    getJson(`${BDL}/data/by-unit/${unit.id}?var-id=${varId}&format=json`),
    getJson(`${BDL}/data/by-unit/${BDL_POLAND_UNIT}?var-id=${varId}&format=json`),
  ]);
  const regional = latest(reg?.results?.[0]?.values);
  const national = latest(pl?.results?.[0]?.values);
  // Ten sam rok w obu szeregach — inaczej współczynnik porównywałby różne lata.
  const plSameYear =
    regional && pl?.results?.[0]?.values
      ? ((pl.results[0].values as any[])
          .filter((x) => String(x.year) === regional.year && typeof x.val === "number")
          .map((x) => ({ year: String(x.year), val: Number(x.val) }))[0] ?? national)
      : national;
  return regionalLongevityFrom({
    unitName: unit.name,
    unitLevel: unit.level,
    ageBucket: bucket,
    sex: args.sex,
    regional,
    national: plSameYear,
  });
}
