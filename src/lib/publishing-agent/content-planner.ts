/**
 * Etap 5 (część) — planer treści na dwa tory: serie jako dane, klasyfikacja
 * banku 250 pytań, scoring pomysłów 0–100 i wybór hooka z wariantem A/B.
 * Czysta logika; decyzje (produkcja, publikacja) przechodzą przez bezpieczniki
 * i bramkę compliance.
 */
import { checkHardRules, type AudienceTrack } from "./compliance-rules";
import { SHORTS_QUESTIONS, type ShortsQuestion } from "@/lib/shorts-question-bank";

// ── Serie (brief 5.1 „Start”) ───────────────────────────────────────────

export interface SeriesDef {
  id: string;
  track: AudienceTrack;
  name: string;
  /** Format z biblioteki formatów (Warsztat rolek). */
  format:
    | "czy_wiesz"
    | "versus"
    | "lista_bledow"
    | "nie_mow_powiedz"
    | "dzien_x"
    | "mit_fakt"
    | "kroki"
    | "case_study"
    | "audyt";
  cadence: "daily" | "weekly";
  /** Znacznik serii w 1. sekundzie (rozpoznawalność toru). */
  marker: string;
  keywords: string[];
}

export const SERIES: SeriesDef[] = [
  {
    id: "inv-czy-wiesz",
    track: "inwestor",
    name: "Czy wiesz, że…",
    format: "czy_wiesz",
    cadence: "daily",
    marker: "CZY WIESZ?",
    keywords: ["czy wiesz"],
  },
  {
    id: "inv-bank-vs-ty",
    track: "inwestor",
    name: "Bank vs Ty",
    format: "versus",
    cadence: "daily",
    marker: "BANK vs TY",
    keywords: ["bank", "lokat", "po stronie"],
  },
  {
    id: "inv-3-bledy",
    track: "inwestor",
    name: "3 błędy inwestora",
    format: "lista_bledow",
    cadence: "daily",
    marker: "3 BŁĘDY",
    keywords: ["błęd", "pułapk"],
  },
  {
    id: "inv-nie-mow",
    track: "inwestor",
    name: "Nie mów / Powiedz",
    format: "nie_mow_powiedz",
    cadence: "daily",
    marker: "NIE MÓW / POWIEDZ",
    keywords: ["nie mów"],
  },
  {
    id: "inv-dzien-x",
    track: "inwestor",
    name: "Dzień X ze 100",
    format: "dzien_x",
    cadence: "daily",
    marker: "DZIEŃ X/100",
    keywords: [],
  },
  {
    id: "inv-audyt",
    track: "inwestor",
    name: "Audyt zabezpieczenia",
    format: "audyt",
    cadence: "weekly",
    marker: "AUDYT ZABEZPIECZENIA",
    keywords: ["księg", "zabezpiecz", "hipotek", "ltv"],
  },
  {
    id: "bor-odmowa",
    track: "pozyczkobiorca",
    name: "Bank odmówił — co dalej?",
    format: "kroki",
    cadence: "daily",
    marker: "BANK ODMÓWIŁ?",
    keywords: ["odmów", "bank"],
  },
  {
    id: "bor-ltv",
    track: "pozyczkobiorca",
    name: "Ile naprawdę możesz dostać pod nieruchomość (LTV)",
    format: "czy_wiesz",
    cadence: "daily",
    marker: "ILE DOSTANIESZ?",
    keywords: ["ltv", "ile", "wartoś", "wycen"],
  },
  {
    id: "bor-3-bledy",
    track: "pozyczkobiorca",
    name: "3 błędy przy finansowaniu pod zastaw",
    format: "lista_bledow",
    cadence: "daily",
    marker: "3 BŁĘDY",
    keywords: ["błęd", "pułapk"],
  },
  {
    id: "bor-mit-fakt",
    track: "pozyczkobiorca",
    name: "Mit vs fakt o pożyczkach pozabankowych",
    format: "mit_fakt",
    cadence: "daily",
    marker: "MIT czy FAKT?",
    keywords: ["mit", "prawda", "czy to prawda"],
  },
  {
    id: "bor-kroki",
    track: "pozyczkobiorca",
    name: "Krok po kroku: od wniosku do wypłaty",
    format: "kroki",
    cadence: "daily",
    marker: "KROK PO KROKU",
    keywords: ["wniosek", "wypłat", "notariusz", "umow", "dokument"],
  },
  {
    id: "bor-case",
    track: "pozyczkobiorca",
    name: "Studium przypadku (zanonimizowane)",
    format: "case_study",
    cadence: "weekly",
    marker: "STUDIUM PRZYPADKU",
    keywords: [],
  },
];

// ── Bank 250 pytań → dwa tory (5.1a) ───────────────────────────────────

export interface ClassifiedQuestion {
  id: number;
  track: AudienceTrack;
  seriesId: string;
  /** Do przepisania przed użyciem (compliance / cel konsumencki). */
  needsRewrite: boolean;
  reasons: string[];
}

const CONSUMER_HINT =
  /konsument|osob\p{L}*\s+fizyczn\p{L}*\s+na\s+cel|cel\p{L}*\s+prywatn|chwilówk/iu;

export function classifyQuestion(q: ShortsQuestion): ClassifiedQuestion {
  const track: AudienceTrack = q.category === "inwestor" ? "inwestor" : "pozyczkobiorca";
  const text = `${q.question} ${q.thesis}`;
  const reasons: string[] = [];
  const violations = checkHardRules(text, { kind: "video_script", track, aiGenerated: true });
  if (violations.length) reasons.push(...violations.map((v) => `compliance:${v.ruleId}`));
  if (track === "pozyczkobiorca" && CONSUMER_HINT.test(text)) reasons.push("cel_konsumencki");
  const lower = text.toLowerCase();
  const candidates = SERIES.filter((s) => s.track === track && s.cadence === "daily");
  const series =
    candidates.find((s) => s.keywords.some((k) => lower.includes(k))) ??
    candidates.find((s) => s.format === "czy_wiesz") ??
    candidates[0];
  return { id: q.id, track, seriesId: series.id, needsRewrite: reasons.length > 0, reasons };
}

export function classifyQuestionBank(bank: ShortsQuestion[] = SHORTS_QUESTIONS) {
  const items = bank.map(classifyQuestion);
  const bySeries: Record<string, number> = {};
  for (const i of items) bySeries[i.seriesId] = (bySeries[i.seriesId] ?? 0) + 1;
  return {
    items,
    byTrack: {
      pozyczkobiorca: items.filter((i) => i.track === "pozyczkobiorca").length,
      inwestor: items.filter((i) => i.track === "inwestor").length,
    },
    bySeries,
    needsRewrite: items.filter((i) => i.needsRewrite),
  };
}

// ── Scoring pomysłu 0–100 (5.1) ─────────────────────────────────────────

export interface IdeaScore {
  score: number;
  parts: Record<string, number>;
  blocked: boolean;
}

export const IDEA_THRESHOLD = 60;

/**
 * Heurystyka zgodna z kryteriami briefu: jasność tezy, liczba/kontrast,
 * stawka, kontekst, wróg, potencjał udostępnienia, zgodność z torem i serią,
 * ryzyko compliance (twarde naruszenie = 0 i blokada).
 */
export function scoreIdea(
  hook: string,
  opts: { track: AudienceTrack; seriesId?: string; body?: string },
): IdeaScore {
  const h = hook.trim();
  const all = `${h} ${opts.body ?? ""}`;
  const lower = all.toLowerCase();
  const violations = checkHardRules(all, {
    kind: "video_script",
    track: opts.track,
    aiGenerated: true,
  });
  if (violations.length) return { score: 0, parts: { compliance: 0 }, blocked: true };

  const words = h.split(/\s+/).filter(Boolean).length;
  const parts: Record<string, number> = {
    // Teza: pytanie lub stwierdzenie 6–18 słów (test „zatrzymaj po 1. zdaniu”).
    clarity: words >= 6 && words <= 18 ? 20 : words <= 24 ? 10 : 0,
    numberOrContrast:
      /\d/.test(h) || /\bvs\b|zamiast|czy\s+.+\s+czy|więcej niż|mniej niż/iu.test(h) ? 15 : 0,
    stakes: /strac|ryzyk|odmów|koszt|egzekuc|komornik|błęd|pułapk|zapłac/iu.test(lower) ? 15 : 0,
    context: /\d+\s*(lat|pożycz|klient)|na rynku|w praktyce|na prawdziwej/iu.test(lower) ? 10 : 0,
    enemy: /bank|lokat|inflacj|bik|biurokracj/iu.test(lower) ? 10 : 0,
    shareability: /czy wiesz|nikt ci nie powie|mało kto|większość|zanim/iu.test(lower) ? 10 : 0,
    question: /\?\s*$/.test(h) ? 10 : 0,
    seriesFit:
      opts.seriesId && SERIES.some((s) => s.id === opts.seriesId && s.track === opts.track)
        ? 10
        : 0,
  };
  const score = Math.min(
    100,
    Object.values(parts).reduce((a, b) => a + b, 0),
  );
  return { score, parts, blocked: false };
}

/** Najlepszy hook do produkcji, drugi najlepszy do testu A/B (5.1). */
export function pickHooks(
  variants: string[],
  opts: { track: AudienceTrack; seriesId?: string; body?: string },
): {
  primary: string | null;
  abVariant: string | null;
  scored: Array<{ hook: string } & IdeaScore>;
} {
  const scored = variants
    .map((hook) => ({ hook, ...scoreIdea(hook, opts) }))
    .filter((s) => !s.blocked)
    .sort((a, b) => b.score - a.score);
  const ok = scored.filter((s) => s.score >= IDEA_THRESHOLD);
  return { primary: ok[0]?.hook ?? null, abVariant: ok[1]?.hook ?? null, scored };
}

// ── Kadencja tygodnia ───────────────────────────────────────────────────

/** Rozkład rolek w tygodniu między tory wg udziału (start 50/50). */
export function weeklySplit(
  totalReels: number,
  borrowerSharePct: number,
): Record<AudienceTrack, number> {
  const b = Math.round((totalReels * borrowerSharePct) / 100);
  return { pozyczkobiorca: b, inwestor: totalReels - b };
}
