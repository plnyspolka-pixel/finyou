// Etap 1 produkcji (brief 5.1/5.3): autopilot sam planuje rolki z lead
// magnetami. Czysta logika — bez I/O: decyzja o buforze per tor, rotacja
// serii, hasło → materiał, brief dla scenarzysty, opis-teza po skrypcie.
// Warstwa serwerowa (production.server.ts) dostarcza liczby i zapisuje joby.
import { resolveKeywordTarget, type KeywordTarget } from "@/lib/lead-magnets/catalog";
import { SERIES, seriesForTrack, type SeriesDef } from "./series";
import { TRACK_HOOK_EXAMPLES } from "./track-voice";
import type { AudienceProfile } from "./profiles";
import type { Track } from "./types";

/**
 * Ile rolek toru ma czekać w zapasie (gotowe, nieopublikowane + w produkcji).
 * Sloty dają 1 rolkę dziennie na tor, więc 2 = jutro i pojutrze zabezpieczone;
 * tick co godzinę dorabia, gdy spadnie poniżej.
 */
export const REEL_BUFFER_PER_TRACK = 2;
/** Maks. nowych rolek toru na dobę — bezpiecznik kredytów HeyGen i budżetu AI. */
export const MAX_PRODUCED_PER_TRACK_PER_DAY = 2;
/** Szacunek kosztu jednej produkcji (scenariusz + bramka) — do strażnika budżetu. */
export const PRODUCTION_COST_PLN = 0.6;
/** Prefiks promptu joba z produkcji — po nim raport i panel rozpoznają źródło. */
export const PRODUCTION_PROMPT_TAG = "[autopilot]";

export interface TrackPipeline {
  track: Track;
  /** Gotowe, nieopublikowane, nieodrzucone rolki z torem. */
  ready: number;
  /** Rolki w produkcji (queued … captioning). */
  inProgress: number;
  /** Rolki toru założone przez produkcję dziś. */
  producedToday: number;
}

export interface ProductionDecision {
  produce: boolean;
  reason: string;
}

/** Czy tor potrzebuje nowej rolki (bufor + limit dzienny). */
export function decideProduction(p: TrackPipeline): ProductionDecision {
  const pipeline = p.ready + p.inProgress;
  if (p.producedToday >= MAX_PRODUCED_PER_TRACK_PER_DAY) {
    return {
      produce: false,
      reason: `limit ${MAX_PRODUCED_PER_TRACK_PER_DAY}/dobę wyczerpany (${p.producedToday})`,
    };
  }
  if (pipeline >= REEL_BUFFER_PER_TRACK) {
    return {
      produce: false,
      reason: `zapas pełny (${p.ready} gotowych + ${p.inProgress} w produkcji ≥ ${REEL_BUFFER_PER_TRACK})`,
    };
  }
  return {
    produce: true,
    reason: `zapas ${pipeline}/${REEL_BUFFER_PER_TRACK}`,
  };
}

/** Serie do produkcji rolek: bez odcinków tygodniowych (silnik nr 1) i bez serii bez hasła. */
export function productionSeries(track: Track): SeriesDef[] {
  return seriesForTrack(track).filter((s) => !s.weekly && Boolean(s.defaultKeyword));
}

/**
 * Rotacja serii: najdawniej użyta (albo nigdy) idzie pierwsza. `recent` to
 * slugi serii ostatnich rolek toru, od najnowszej.
 */
export function pickSeries(track: Track, recent: string[]): SeriesDef | null {
  const pool = productionSeries(track);
  if (!pool.length) return null;
  const lastIndex = (slug: string) => {
    const i = recent.indexOf(slug);
    return i === -1 ? Number.POSITIVE_INFINITY : i;
  };
  // Największy „wiek” (indeks w historii) wygrywa; remis → kolejność w SERIES.
  return [...pool].sort((a, b) => lastIndex(b.slug) - lastIndex(a.slug))[0] ?? null;
}

export interface ReelBriefInput {
  track: Track;
  series: SeriesDef;
  profile: Pick<AudienceProfile, "targetGroup" | "tone" | "allowedTopics" | "forbiddenPhrases">;
  magnet: KeywordTarget | null;
  /** Tytuły ostatnich rolek toru — scenarzysta ma unikać powtórek. */
  recentTitles: string[];
  /** Temat z listy dozwolonych (rotacja po ostatnich rolkach). */
  topic: string | null;
}

/** Temat z `allowedTopics` najdawniej użyty w ostatnich promptach toru. */
export function pickTopic(allowedTopics: string[], recentPrompts: string[]): string | null {
  if (!allowedTopics.length) return null;
  const joined = recentPrompts.map((p) => p.toLocaleLowerCase("pl"));
  const lastUse = (t: string) => {
    const key = t.toLocaleLowerCase("pl");
    const i = joined.findIndex((p) => p.includes(key));
    return i === -1 ? Number.POSITIVE_INFINITY : i;
  };
  return [...allowedTopics].sort((a, b) => lastUse(b) - lastUse(a))[0] ?? null;
}

/**
 * Brief dla scenarzysty (generateVideoScript): seria ze szkieletem, lead
 * magnet z hasłem w CTA, ton toru, tematy, unikanie powtórek. Tekst promptu
 * ląduje w `studio_video_jobs.prompt` z prefiksem PRODUCTION_PROMPT_TAG.
 */
export function buildReelBrief(input: ReelBriefInput): string {
  const { series, profile, magnet, track } = input;
  const kw = series.defaultKeyword ?? null;
  const lines: string[] = [
    `${PRODUCTION_PROMPT_TAG} Rolka serii „${series.title}” (znacznik serii na starcie: ${series.badge}), tor: ${
      track === "inwestor" ? "inwestor prywatny" : "pożyczkobiorca"
    }.`,
    `Grupa docelowa: ${profile.targetGroup}`,
    `Ton: ${profile.tone}`,
  ];
  if (input.topic) lines.push(`Temat rolki: ${input.topic}.`);
  lines.push(
    `Szkielet rolki (kolejne beaty, każdy 1–2 zdania): ${series.beats
      .map((b, i) => `${i + 1}) ${b}`)
      .join("; ")}.`,
  );
  if (magnet && kw) {
    lines.push(
      `Lead magnet: ${magnet.name} (bezpłatny materiał za komentarz). Ostatnie zdanie scenariusza to CTA dokładnie w tym sensie: „Skomentuj ${kw}, a wyślę Ci ${magnet.name}” — hasło ${kw} musi paść wprost, raz, wielkimi literami.`,
    );
  } else {
    lines.push("Zakończ zachętą do obserwowania profilu (bez obietnic).");
  }
  // Decyzja właściciela 26.10.2026: w rolce DOKŁADNIE jedno zdanie o ryzyku —
  // formułki prawne („nie stanowi oferty”, „wynik szacunkowy”…) ma stopka opisu.
  lines.push(
    "Zastrzeżenia: DOKŁADNIE jedno krótkie zdanie o ryzyku w naturalnym miejscu (przed CTA) — i ani jednego więcej. Nie dopisuj formułek „nie stanowi oferty/porady”, „wynik szacunkowy”, „materiał poglądowy” ani zastrzeżeń przy CTA; te są w opisie publikacji, nie w tekście mówionym. Bez liczb o zwrocie w procentach, bez gwarancji i bez obiecywania, że ryzyka nie ma. Nie używaj frazy „dla każdego” w żadnej formie (także zaprzeczonej); nie obiecuj, że weryfikacji nie będzie, i nie sugeruj przeznaczenia prywatnego.",
  );
  const examples = TRACK_HOOK_EXAMPLES[track];
  if (examples.length)
    lines.push(`Przykłady hooków toru (tylko styl, nie kopiuj): ${examples.join(" | ")}`);
  if (profile.forbiddenPhrases.length)
    lines.push(`Nie używaj fraz: ${profile.forbiddenPhrases.join(", ")}.`);
  if (input.recentTitles.length) {
    lines.push(
      `Ostatnie rolki toru (nie powtarzaj tematu ani hooka): ${input.recentTitles
        .slice(0, 8)
        .map((t) => `„${t}”`)
        .join(", ")}.`,
    );
  }
  return lines.join("\n");
}

/** Hasło rolki: z serii, a gdy jej nie ma — z CTA w opisie/scenariuszu („Skomentuj START”). */
export function keywordOfReel(job: {
  series?: string | null;
  publish_description?: string | null;
  script?: string | null;
  prompt?: string | null;
}): string | null {
  const s = job.series ? SERIES.find((x) => x.slug === job.series) : undefined;
  if (s?.defaultKeyword) return s.defaultKeyword;
  const text = [job.publish_description, job.script, job.prompt].filter(Boolean).join("\n");
  const m = text.match(
    /(?:[Ss]komentuj|[Nn]apisz(?:\s+w\s+komentarzu)?|[Ww]pisz|[Kk]omentarz)\s+[„"]?([A-ZĄĆĘŁŃÓŚŹŻ]{3,12})[”"]?/u,
  );
  const kw = m?.[1] ?? null;
  return kw && resolveKeywordTarget(kw) ? kw : null;
}

/** Materiał za hasło rolki (katalog PDF albo kalkulator) — do opisu-lejka. */
export function magnetOfReel(job: Parameters<typeof keywordOfReel>[0]): {
  keyword: string;
  target: KeywordTarget;
} | null {
  const keyword = keywordOfReel(job);
  if (!keyword) return null;
  const target = resolveKeywordTarget(keyword);
  return target ? { keyword, target } : null;
}

/**
 * Opis joba po produkcji: krótka teza (1–3 zdania) bez hashtagów — hashtagi
 * wracają osobno, bo opis-lejek per platforma składa je na końcu.
 */
export function splitThesisAndTags(description: string): { thesis: string; hashtags: string[] } {
  const tags = [...description.matchAll(/#[\p{L}\p{N}_]+/gu)].map((m) => m[0]);
  const thesis = description
    .replace(/#[\p{L}\p{N}_]+/gu, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { thesis, hashtags: [...new Set(tags)] };
}

/** Tytuł publikacji z hasłem na końcu („… Napisz START”) — jak w rolkach właściciela. */
export function publishTitleWithKeyword(title: string, keyword: string | null, max = 100): string {
  const base = title.trim().replace(/\s+/g, " ");
  if (!keyword) return base.slice(0, max);
  if (base.toLocaleUpperCase("pl").includes(keyword.toLocaleUpperCase("pl")))
    return base.slice(0, max);
  const suffix = ` Napisz ${keyword}`;
  const room = max - suffix.length - 1;
  const head = base.length > room ? `${base.slice(0, Math.max(0, room - 1)).trimEnd()}…` : base;
  // Kropka przed „Napisz HASŁO”, gdy tytuł nie kończy się znakiem interpunkcyjnym.
  const sep = /[.!?…:]$/.test(head) ? "" : ".";
  return `${head}${sep}${suffix}`;
}
