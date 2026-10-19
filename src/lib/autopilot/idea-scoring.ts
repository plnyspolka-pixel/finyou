// Scoring pomysłów 0–100 i wybór hooków (brief 5.1). Heurystyki są jawne i
// deterministyczne – ocenę LLM (jeśli jest) traktujemy jako jeden z
// sygnałów, nie jedyny. Czysty moduł – bez I/O.
import { checkHardRules } from "./compliance-rules";
import type { Track } from "./types";

export interface IdeaSignals {
  /** 0–1: czy teza jest jasna i jednozdaniowa. */
  thesisClarity: number;
  /** Liczba lub kontrast (X vs Y, „zamiast”, „nie… ale…”). */
  hasNumberOrContrast: boolean;
  /** Stawka: pieniądze, czas, ryzyko utraty. */
  hasStakes: boolean;
  /** Kontekst osobisty / sytuacja widza na starcie. */
  hasContext: boolean;
  /** Wróg marki (bank, biurokracja, mit). */
  hasEnemy: boolean;
  /** 0–1: potencjał udostępnienia (np. przydatna liczba, ściąga). */
  sharePotential: number;
  /** Pasuje do toru i serii. */
  fitsTrackAndSeries: boolean;
  /** Liczba blokad reguł twardych w wersji roboczej. */
  complianceBlocks: number;
  /** Ile razy podobny temat był w ostatnich 30 dniach (powtarzalność YT). */
  recentDuplicates: number;
}

export const IDEA_THRESHOLD = 60;

export function scoreIdea(s: IdeaSignals): number {
  let score =
    25 * clamp01(s.thesisClarity) +
    (s.hasNumberOrContrast ? 15 : 0) +
    (s.hasStakes ? 12 : 0) +
    (s.hasContext ? 8 : 0) +
    (s.hasEnemy ? 8 : 0) +
    17 * clamp01(s.sharePotential) +
    (s.fitsTrackAndSeries ? 15 : -20);
  score -= 15 * s.complianceBlocks;
  score -= 10 * s.recentDuplicates;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ── hooki ────────────────────────────────────────────────────────────────────

const NUMBER_RE = /\d/u;
const CONTRAST_RE =
  /(?:\bvs\.?\b|zamiast|nie\s+\p{L}+[^?]{0,40}\s+(?:ale|tylko)|albo|czy\s+raczej)/iu;
const STAKES_RE = /(?:strac|tracisz|kosztuje|zł|pieniądz|odmow|ryzyk|czas|tygodni|miesięc)/iu;
const YOU_RE = /(?:\b(?:ty|ciebie|twoj\p{L}*|twoj|masz|możesz|dostaniesz|wiesz|robisz)\b)/iu;
const ENEMY_RE = /(?:bank|biurokracj|mit|urzęd|formalnoś)/iu;

export interface HookCandidate {
  text: string;
  /** Opcjonalna ocena LLM 0–100. */
  llmScore?: number;
}

export interface ScoredHook extends HookCandidate {
  score: number;
  reasons: string[];
}

/**
 * Ocena hooka: teza (nie zagadka), pytanie, liczba/kontrast, stawka, „Ty”,
 * długość ≤ 14 słów (test: zatrzymaj po 1. zdaniu), brak blokad compliance.
 */
export function scoreHook(h: HookCandidate, track: Track): ScoredHook {
  const t = h.text.trim();
  const words = t.split(/\s+/).filter(Boolean).length;
  const reasons: string[] = [];
  let s = 30;
  if (t.endsWith("?")) {
    s += 12;
    reasons.push("pytanie");
  }
  if (NUMBER_RE.test(t) || CONTRAST_RE.test(t)) {
    s += 14;
    reasons.push("liczba/kontrast");
  }
  if (STAKES_RE.test(t)) {
    s += 10;
    reasons.push("stawka");
  }
  if (YOU_RE.test(t)) {
    s += 8;
    reasons.push("widz w centrum");
  }
  if (ENEMY_RE.test(t)) {
    s += 6;
    reasons.push("wróg");
  }
  if (words <= 14) s += 10;
  else {
    s -= Math.min(20, (words - 14) * 3);
    reasons.push("za długi");
  }
  if (/\.{3}|…$/.test(t)) {
    s -= 10;
    reasons.push("zagadka zamiast tezy");
  }
  const blocks = checkHardRules(t, { kind: "script", track }).filter((x) => x.severity === "block");
  if (blocks.length) {
    s -= 40;
    reasons.push(`compliance: ${blocks.map((b) => b.code).join(",")}`);
  }
  if (h.llmScore != null) s = Math.round(0.6 * s + 0.4 * Math.max(0, Math.min(100, h.llmScore)));
  return { ...h, score: Math.max(0, Math.min(100, s)), reasons };
}

/** Najlepszy hook do produkcji + drugi do testu A/B (gdy różnica ≤ 15 pkt). */
export function pickHooks(
  candidates: HookCandidate[],
  track: Track,
): { best: ScoredHook | null; abChallenger: ScoredHook | null; ranked: ScoredHook[] } {
  const ranked = candidates
    .filter((c) => c.text.trim())
    .map((c) => scoreHook(c, track))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0] ?? null;
  const second = ranked[1] ?? null;
  const abChallenger =
    best && second && second.score >= IDEA_THRESHOLD - 10 && best.score - second.score <= 15
      ? second
      : null;
  return { best, abChallenger, ranked };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
}
