// Scoring dopasowania podmiotu do rekordu referencyjnego (0–100).
// Czysta logika — parametry (progi, premie, kary) przychodzą z ustawień
// (screening_settings), nie są zaszyte w kodzie.
//
//  1. Podobieństwo nazw: najlepsze dopasowanie tokenów 1:1 (Jaro-Winkler,
//     dodatkowo na „szkielecie” fonetycznym ze zniżką), niezależne od
//     kolejności imienia i nazwiska; inicjał pasuje do imienia.
//  2. Data urodzenia: zgodna pełna data → premia; zgodny rok (gdy źródło ma
//     tylko rok) → mniejsza premia; niezgodna → kara (bez automatycznego
//     odrzucenia — wynik może wciąż przekroczyć próg).
//  3. Obywatelstwo / kraj: część wspólna → premia.
//  4. Brak daty urodzenia (w źródle albo u podmiotu) → wynik ograniczony do
//     pasma „do weryfikacji” (próg silny − 1). Nigdy „silne trafienie”.

import { nameVariants, skeleton, type PartialDate } from "./normalize";

export interface ScoringSettings {
  possibleThreshold: number;
  strongThreshold: number;
  dobExactBonus: number;
  dobYearBonus: number;
  dobMismatchPenalty: number;
  nationalityBonus: number;
}

export const DEFAULT_SCORING: ScoringSettings = {
  possibleThreshold: 70,
  strongThreshold: 90,
  dobExactBonus: 10,
  dobYearBonus: 5,
  dobMismatchPenalty: 25,
  nationalityBonus: 3,
};

export interface ScoreSubject {
  kind: "person" | "entity";
  names: string[]; // pierwsza = główna, pozostałe = warianty
  birth: PartialDate;
  nationality: string[];
}

export interface ScoreReference {
  kind: "person" | "entity" | "unknown";
  names: string[];
  births: PartialDate[];
  nationality: string[];
}

export type Band = "none" | "possible" | "strong";

export interface ScoreBreakdown {
  nameScore: number;
  matchedSubjectName: string;
  matchedReferenceName: string;
  tokenPairs: Array<{ subject: string; reference: string; similarity: number }>;
  unmatchedTokens: number;
  dob: "exact" | "year_match" | "mismatch" | "missing_reference" | "missing_subject" | "not_applicable";
  dobAdjustment: number;
  nationality: "match" | "no_overlap" | "unknown";
  nationalityAdjustment: number;
  capApplied: string | null;
  total: number;
  band: Band;
}

// --- Jaro-Winkler -------------------------------------------------------------

export function jaro(a: string, b: string): number {
  if (a === b) return 1;
  const la = a.length;
  const lb = b.length;
  if (la === 0 || lb === 0) return 0;
  const window = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1);
  const aMatch = new Array<boolean>(la).fill(false);
  const bMatch = new Array<boolean>(lb).fill(false);
  let matches = 0;
  for (let i = 0; i < la; i++) {
    const lo = Math.max(0, i - window);
    const hi = Math.min(i + window + 1, lb);
    for (let j = lo; j < hi; j++) {
      if (bMatch[j] || a[i] !== b[j]) continue;
      aMatch[i] = true;
      bMatch[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < la; i++) {
    if (!aMatch[i]) continue;
    while (!bMatch[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  return (matches / la + matches / lb + (matches - t / 2) / matches) / 3;
}

export function jaroWinkler(a: string, b: string, p = 0.1): number {
  const j = jaro(a, b);
  let l = 0;
  while (l < 4 && l < a.length && l < b.length && a[l] === b[l]) l++;
  return j + l * p * (1 - j);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Podobieństwo pary tokenów: Jaro-Winkler ograniczony od góry przez
 * znormalizowaną odległość edycyjną (+0,1). JW sam w sobie jest zbyt
 * łagodny dla krótkich nazwisk o wspólnym początku (Nowak / Nowicki),
 * a odległość edycyjna dobrze toleruje pojedyncze literówki.
 */
function pairSimilarity(a: string, b: string): number {
  const lev = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  return Math.min(jaroWinkler(a, b), lev + 0.1);
}

/** Podobieństwo dwóch tokenów (0–1). */
export function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  // Inicjał: „j” vs „jan”.
  if ((a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b))) return 0.9;
  if (a.length === 1 || b.length === 1) return 0;
  const direct = pairSimilarity(a, b);
  const sa = skeleton(a);
  const sb = skeleton(b);
  // Ten sam „szkielet” fonetyczny (Szewczenko / Shevchenko) — mocny sygnał.
  const phon = sa && sb ? (sa === sb ? 0.96 : pairSimilarity(sa, sb) * 0.9) : 0;
  return Math.max(direct, phon);
}

/** Słabe pary (np. inne imię) mocno obniżają wynik zamiast się uśredniać. */
function effective(sim: number): number {
  return sim >= 0.85 ? sim : sim ** 3;
}

/**
 * Podobieństwo zbiorów tokenów (0–1) — najlepsze przypisanie 1:1 metodą
 * zachłanną po malejącym podobieństwie (zbiory są małe: 2–6 tokenów).
 */
export function tokenSetSimilarity(
  s: string[],
  r: string[],
): { score: number; pairs: Array<{ subject: string; reference: string; similarity: number }>; unmatched: number } {
  const S = [...new Set(s)];
  const R = [...new Set(r)];
  if (S.length === 0 || R.length === 0) return { score: 0, pairs: [], unmatched: Math.max(S.length, R.length) };
  const cand: Array<{ i: number; j: number; sim: number }> = [];
  for (let i = 0; i < S.length; i++) {
    for (let j = 0; j < R.length; j++) cand.push({ i, j, sim: tokenSimilarity(S[i], R[j]) });
  }
  cand.sort((x, y) => y.sim - x.sim);
  const usedS = new Set<number>();
  const usedR = new Set<number>();
  const pairs: Array<{ subject: string; reference: string; similarity: number }> = [];
  const k = Math.min(S.length, R.length);
  for (const c of cand) {
    if (pairs.length >= k) break;
    if (usedS.has(c.i) || usedR.has(c.j)) continue;
    usedS.add(c.i);
    usedR.add(c.j);
    pairs.push({ subject: S[c.i], reference: R[c.j], similarity: Math.round(c.sim * 1000) / 1000 });
  }
  let score = pairs.reduce((acc, p) => acc + effective(p.similarity), 0) / k;
  // Pojedynczy token (np. sam pseudonim) to słaby dowód tożsamości.
  if (k === 1 && Math.max(S.length, R.length) > 1) score *= 0.75;
  const unmatched = Math.max(S.length, R.length) - k;
  // Brakujące drugie imię / człon nazwiska — niewielka kara (do 8 pkt).
  score -= Math.min(0.08, 0.03 * unmatched);
  return { score: Math.max(0, score), pairs, unmatched };
}

// --- Daty / kraje ----------------------------------------------------------------

function dobComponent(
  subject: PartialDate,
  refs: PartialDate[],
  s: ScoringSettings,
): { kind: ScoreBreakdown["dob"]; adj: number } {
  const known = refs.filter((r) => r.date || r.year);
  if (!subject.date && !subject.year) return { kind: "missing_subject", adj: 0 };
  if (known.length === 0) return { kind: "missing_reference", adj: 0 };
  // Najkorzystniejsza z dat w rekordzie (rekordy sankcyjne mają często kilka).
  let best: { kind: ScoreBreakdown["dob"]; adj: number } = { kind: "mismatch", adj: -s.dobMismatchPenalty };
  for (const r of known) {
    if (subject.date && r.date && subject.date === r.date) return { kind: "exact", adj: s.dobExactBonus };
    const sy = subject.year ?? (subject.date ? Number(subject.date.slice(0, 4)) : null);
    const ry = r.year ?? (r.date ? Number(r.date.slice(0, 4)) : null);
    // Zgodny rok liczy się tylko wtedy, gdy jedna ze stron zna wyłącznie rok.
    if (sy && ry && sy === ry && (!subject.date || !r.date)) best = { kind: "year_match", adj: s.dobYearBonus };
  }
  return best;
}

function nationalityComponent(
  subject: string[],
  ref: string[],
  s: ScoringSettings,
): { kind: ScoreBreakdown["nationality"]; adj: number } {
  if (subject.length === 0 || ref.length === 0) return { kind: "unknown", adj: 0 };
  const set = new Set(subject.map((c) => c.toUpperCase()));
  return ref.some((c) => set.has(c.toUpperCase()))
    ? { kind: "match", adj: s.nationalityBonus }
    : { kind: "no_overlap", adj: 0 };
}

export function bandFor(score: number, s: ScoringSettings): Band {
  if (score >= s.strongThreshold) return "strong";
  if (score >= s.possibleThreshold) return "possible";
  return "none";
}

/** Pełny scoring pary podmiot–rekord. */
export function scoreMatch(subject: ScoreSubject, ref: ScoreReference, s: ScoringSettings = DEFAULT_SCORING): ScoreBreakdown {
  const entity = subject.kind === "entity";
  let best = { score: -1, sName: "", rName: "", pairs: [] as ScoreBreakdown["tokenPairs"], unmatched: 0 };
  const subjVariants = subject.names.flatMap((n) => nameVariants(n, { entity }));
  const refVariants = ref.names.flatMap((n) => nameVariants(n, { entity: ref.kind === "entity" || entity }));
  for (const sv of subjVariants) {
    for (const rv of refVariants) {
      const r = tokenSetSimilarity(sv.tokens, rv.tokens);
      if (r.score > best.score) best = { score: r.score, sName: sv.key, rName: rv.key, pairs: r.pairs, unmatched: r.unmatched };
    }
  }
  const nameScore = Math.round(Math.max(0, best.score) * 100);

  const dob = entity || ref.kind === "entity"
    ? { kind: "not_applicable" as const, adj: 0 }
    : dobComponent(subject.birth, ref.births, s);
  const nat = nationalityComponent(subject.nationality, ref.nationality, s);

  let total = nameScore + dob.adj + nat.adj;
  // Premie nie mogą „podnieść” słabego dopasowania nazwy ponad próg.
  if (nameScore < s.possibleThreshold) total = Math.min(total, nameScore);
  total = Math.max(0, Math.min(100, total));

  let capApplied: string | null = null;
  if (dob.kind === "missing_reference" || dob.kind === "missing_subject") {
    const cap = s.strongThreshold - 1;
    if (total > cap) {
      total = cap;
      capApplied = dob.kind === "missing_reference" ? "brak daty urodzenia w źródle" : "brak daty urodzenia podmiotu";
    }
  }

  return {
    nameScore,
    matchedSubjectName: best.sName,
    matchedReferenceName: best.rName,
    tokenPairs: best.pairs,
    unmatchedTokens: best.unmatched,
    dob: dob.kind,
    dobAdjustment: dob.adj,
    nationality: nat.kind,
    nationalityAdjustment: nat.adj,
    capApplied,
    total,
    band: bandFor(total, s),
  };
}
