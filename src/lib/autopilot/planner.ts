// Planer treści (brief 5.1, Etap 5 — fundament): scoring pomysłu 0–100 i
// wybór hooka spośród wariantów. Czysta logika, testy: planner.test.ts.
//
// Ocena jest heurystyczna i deterministyczna (bez LLM), żeby była tania,
// powtarzalna i audytowalna; LLM może dostarczyć warianty, ale decyzja
// o tym, co idzie do produkcji, zapada tu. Wagi zmienia commit, nie agent.
import { checkHardRules, type Track } from "./compliance-rules";

export type Idea = {
  track: Track;
  series: string | null;
  hook: string;
  thesis: string;
  /** Serie zdefiniowane w profilu toru. */
  trackSeries: string[];
};

export type IdeaScore = {
  total: number;
  parts: Record<string, number>;
  blocked: boolean;
  reasons: string[];
};

/** Próg produkcji — pomysły poniżej wracają do banku. */
export const IDEA_SCORE_THRESHOLD = 60;

const NUMBER_OR_CONTRAST =
  /\d|\bvs\.?\b|zamiast|kontra|a\s+nie|nie\s+\p{L}+,\s+(?:tylko|lecz)|więcej\s+niż|mniej\s+niż|połow\p{L}*|dwa\s+razy|zero/iu;
const STAKES =
  /strac\p{L}*|ryzyk\p{L}*|błęd\p{L}*|błąd|odmow\p{L}*|odmówi\p{L}*|egzekucj\p{L}*|komornik\p{L}*|koszt\p{L}*|uwaga|pułapk\p{L}*|zanim/iu;
const CONTEXT =
  /\b(?:od\s+15\s+lat|po\s+\d+|w\s+naszej\s+praktyce|widzimy|analizujemy|setk\p{L}*|tysiąc\p{L}*|tysięcy)\b/iu;
const ENEMY = /bank\p{L}*|pośrednik\p{L}*|mit\p{L}*|naciągacz\p{L}*|drobny\s+druk|ukryt\p{L}*/iu;
const SHAREABLE =
  /wyślij|pokaż|zapisz|checklist\p{L}*|krok\p{L}*|\d\s+(?:błęd|krok|rzecz|zasad|pytań|sposob)\p{L}*|ściąg\p{L}*/iu;
const VAGUE =
  /nie\s+uwierzysz|zobacz,?\s+co|to\s+zmieni\s+wszystko|sekret\p{L}*|niesamowit\p{L}*/iu;

/** Długość hooka w słowach — teza ma się zmieścić w ~1–2 s (≤ 12 słów). */
function words(s: string): number {
  return (s.trim().match(/\S+/g) ?? []).length;
}

export function scoreIdea(idea: Idea): IdeaScore {
  const hook = idea.hook.trim();
  const all = `${hook}\n${idea.thesis}`;
  const parts: Record<string, number> = {};
  const reasons: string[] = [];

  // Jasność tezy (0–20): pytanie-teza, krótko, bez zagadki.
  let clarity = 0;
  const w = words(hook);
  if (w >= 4 && w <= 12) clarity += 10;
  else if (w <= 16) clarity += 5;
  if (/\?$/.test(hook)) clarity += 5;
  if (!VAGUE.test(hook)) clarity += 5;
  else reasons.push("hook jest zagadką, nie tezą");
  parts.clarity = clarity;

  parts.contrast = NUMBER_OR_CONTRAST.test(hook)
    ? 20
    : NUMBER_OR_CONTRAST.test(idea.thesis)
      ? 8
      : 0;
  if (!parts.contrast) reasons.push("brak liczby/kontrastu");
  parts.stakes = STAKES.test(all) ? 15 : 0;
  parts.context = CONTEXT.test(all) ? 10 : 0;
  parts.enemy = ENEMY.test(all) ? 10 : 0;
  parts.shareable = SHAREABLE.test(all) ? 10 : 0;
  parts.series = idea.series && idea.trackSeries.includes(idea.series) ? 15 : idea.series ? 5 : 0;
  if (!parts.series) reasons.push("poza seriami toru");

  const violations = [
    ...checkHardRules(hook, { track: idea.track, kind: "title" }),
    ...checkHardRules(idea.thesis, { track: idea.track, kind: "video_caption" }),
  ];
  const blocked = violations.length > 0;
  if (blocked) reasons.push(`compliance: ${violations.map((v) => v.ruleId).join(", ")}`);

  const total = blocked
    ? 0
    : Math.min(
        100,
        Object.values(parts).reduce((s, v) => s + v, 0),
      );
  return { total, parts, blocked, reasons };
}

/**
 * Wybór hooka: najlepszy idzie do produkcji, drugi najlepszy (jeśli ≥ progu)
 * — do testu A/B. Zablokowane przez compliance odpadają.
 */
export function pickHooks(
  base: Omit<Idea, "hook">,
  hooks: string[],
): {
  primary: string | null;
  abVariant: string | null;
  scores: { hook: string; score: IdeaScore }[];
} {
  const scores = hooks
    .map((hook) => ({ hook, score: scoreIdea({ ...base, hook }) }))
    .filter((x) => !x.score.blocked)
    .sort((a, b) => b.score.total - a.score.total);
  const primary =
    scores[0] && scores[0].score.total >= IDEA_SCORE_THRESHOLD ? scores[0].hook : null;
  const ab =
    primary && scores[1] && scores[1].score.total >= IDEA_SCORE_THRESHOLD ? scores[1].hook : null;
  return { primary, abVariant: ab, scores };
}

/** Decyzja testu A/B po 72 h (brief 5.5): zwycięzca przy ≥ 20% przewagi. */
export function decideAbTest(
  a: { views: number; shares: number; follows: number; ageHours: number },
  b: { views: number; shares: number; follows: number; ageHours: number },
): "a" | "b" | "undecided" {
  if (a.ageHours < 72 || b.ageHours < 72) return "undecided";
  const score = (x: typeof a) => x.views + 20 * x.shares + 50 * x.follows;
  const sa = score(a);
  const sb = score(b);
  if (sa === 0 && sb === 0) return "undecided";
  if (sa >= sb * 1.2) return "a";
  if (sb >= sa * 1.2) return "b";
  return "undecided";
}
