// Strażnik treści publikacji — jedno miejsce, przez które przechodzi każda
// treść przed wstawieniem do kolejek publikacji (social_publish_queue,
// youtube_publish_queue). Powstał po audycie profili FB/IG/YT (10.2026),
// który wykazał powtarzające się błędy w opublikowanych materiałach:
//   * rolki i Shortsy z pustym opisem (zero szans w wyszukiwaniu),
//   * opisy ucinane w pół słowa albo w pół zdania przy limitach platform,
//   * język „gwarantowanego zysku" / „minimalnego ryzyka" przy treściach
//     inwestycyjnych bez disclaimera (ryzyko regulacyjne — KNF),
//   * „link w bio" w postach na platformach, które nie mają bio (FB, YouTube),
//   * Shortsy publikowane bez ani jednego tagu.
//
// Twarde naruszenia (pusta treść, zakazane frazy) dają `errors` — wpis nie
// może trafić do kolejki. Resztę moduł poprawia sam (przycięcie na granicy
// zdania, dopisanie disclaimera, podmiana „link w bio", tagi YouTube)
// i raportuje w `notes`. Czysty moduł bez importów serwerowych — testowalny
// jednostkowo i bezpieczny do użycia po obu stronach.

import type { StudioPlatform } from "./studio-platforms";

/** Limit znaków opisu/captionu per platforma. X przycina własny moduł
 *  (x-post.ts, ważone znaki), więc tu dostaje luźny limit kolejki. */
const MESSAGE_LIMITS: Record<StudioPlatform, number> = {
  youtube: 5000,
  facebook_post: 5000,
  facebook_reels: 2200,
  instagram_reels: 2200,
  tiktok: 2200,
  x: 5000,
};

/** Instagram odrzuca caption z ponad 30 hashtagami. */
const IG_MAX_HASHTAGS = 30;

/** Platformy, na których „link w bio" nie ma sensu (nie mają bio z linkiem). */
const NO_BIO_PLATFORMS: ReadonlySet<StudioPlatform> = new Set([
  "facebook_post",
  "facebook_reels",
  "youtube",
  "x",
]);

export const INVESTMENT_DISCLAIMER =
  "Materiał edukacyjny — nie stanowi oferty ani rekomendacji inwestycyjnej. " +
  "Inwestowanie wiąże się z ryzykiem utraty kapitału.";

// Frazy obiecujące zysk bez ryzyka — zakazane w każdej publikacji.
// Przy produkcie inwestycyjnym to język, którego zakazuje praktyka KNF;
// wpis z taką frazą ma zostać poprawiony u źródła, nie „przepuszczony".
const BANNED_CLAIMS: Array<{ re: RegExp; label: string }> = [
  {
    re: /gwarantowan\w*\s+(zysk|zwrot|dochod|dochód)|(zysk|zwrot|dochód)\s+gwarantowan\w*/iu,
    label: "„gwarantowany zysk/zwrot”",
  },
  {
    re: /pewn\w*\s+(zysk|zwrot)|(zysk|zwrot)\s+pewn\w*/iu,
    label: "„pewny zysk/zwrot”",
  },
  { re: /(bez|brak|zero)\s+ryzyka/iu, label: "„bez ryzyka”" },
  { re: /minimaln\w*\s+ryzyk\w*/iu, label: "„minimalne ryzyko”" },
  {
    re: /bezpieczn\w*\s+(lokat|inwestycj|zysk|zwrot)\w*/iu,
    label: "„bezpieczna lokata/inwestycja/zwrot”",
  },
  { re: /100\s*%\s*bezpieczn\w*/iu, label: "„100% bezpieczne”" },
];

/**
 * Zakazane obietnice zysku bez ryzyka znalezione w tekście (etykiety fraz).
 * Pusta tablica = tekst czysty. Ten sam zestaw reguł co przy kolejkowaniu
 * publikacji — używa go też autoodpowiedź na komentarze, zanim cokolwiek
 * pójdzie publicznie.
 */
export function findBannedClaims(text: string): string[] {
  const found: string[] = [];
  for (const { re, label } of BANNED_CLAIMS) {
    if (re.test(text)) found.push(label);
  }
  return found;
}

// Treść inwestycyjna (promocja inwestowania, nie pożyczki dla klientów) —
// wymaga disclaimera o ryzyku.
const INVESTMENT_THEME_RE =
  /inwest|pasywn\w*\s+doch|pomnaż|stop\w*\s+zwrotu|zwrot\s+z\s+kapitału|lokowa\w*\s+kapita/iu;

// Czy treść ma już jakikolwiek disclaimer o ryzyku / charakterze materiału.
const DISCLAIMER_RE =
  /ryzyk\w*\s+utraty\s+kapitału|nie\s+stanowi\s+oferty|materiał\s+(edukacyjny|marketingowy)/iu;

const LINK_W_BIO_RE = /link\s+w\s+bio(\s*\/\s*komentarzu)?/giu;

const HASHTAG_RE = /#([\p{L}\p{N}_]+)/gu;

/** Domyślne tagi kanału — używane, gdy treść nie niesie własnych hashtagów. */
const DEFAULT_YT_TAGS = [
  "finance you",
  "pożyczki pod zastaw nieruchomości",
  "pożyczka hipoteczna",
  "inwestowanie",
  "nieruchomości",
  "finanse",
];
const YT_MAX_TAGS = 15;
// API liczy limit 500 znaków łącznie (tagi wieloczłonowe z cudzysłowami);
// 400 zostawia margines.
const YT_TAGS_CHAR_BUDGET = 400;

export type GuardrailInput = {
  platform: StudioPlatform;
  title?: string | null;
  message?: string | null;
};

export type GuardrailResult = {
  /** Brak twardych naruszeń — treść może trafić do kolejki. */
  ok: boolean;
  /** Twarde naruszenia (pusta treść, zakazane frazy) — blokują wpis. */
  errors: string[];
  /** Automatyczne poprawki (do logów i odpowiedzi narzędzi). */
  notes: string[];
  title: string;
  message: string;
  /** YouTube: tagi z hashtagów treści + domyślne kanału. */
  tags: string[];
};

/**
 * Przycina tekst do limitu bez ucinania w pół słowa: preferuje granicę
 * ostatniego pełnego zdania (jeśli nie kosztuje ponad 40% tekstu),
 * w ostateczności granicę słowa z wielokropkiem.
 */
export function smartTrim(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  // Ostatni koniec zdania w przyciętym fragmencie.
  const sentenceEnd = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("! "),
    cut.lastIndexOf("? "),
    cut.lastIndexOf(".\n"),
    cut.lastIndexOf("!\n"),
    cut.lastIndexOf("?\n"),
  );
  if (sentenceEnd > max * 0.6) return cut.slice(0, sentenceEnd + 1).trim();
  // Granica słowa + wielokropek (mieści się w limicie: ucinamy ostatni wyraz).
  const lastSpace = cut.search(/\s+\S*$/);
  if (lastSpace > 0) return `${cut.slice(0, lastSpace).trimEnd()}…`;
  return cut;
}

/** Hashtagi z treści (bez #, w oryginalnej pisowni, bez duplikatów). */
export function extractHashtags(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(HASHTAG_RE)) {
    const tag = m[1];
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/** Tagi dla filmu YouTube: hashtagi treści + domyślne kanału, z limitami API. */
export function deriveYoutubeTags(title: string, message: string): string[] {
  const fromContent = extractHashtags(`${title} ${message}`);
  const seen = new Set<string>();
  const tags: string[] = [];
  let budget = 0;
  for (const tag of [...fromContent, ...DEFAULT_YT_TAGS]) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    const cost = tag.length + (tag.includes(" ") ? 2 : 0);
    if (tags.length >= YT_MAX_TAGS || budget + cost > YT_TAGS_CHAR_BUDGET) break;
    seen.add(key);
    tags.push(tag);
    budget += cost;
  }
  return tags;
}

/** Ogranicza liczbę hashtagów w captionie (limit Instagrama). */
function capHashtags(message: string, max: number): { message: string; removed: number } {
  const tags = [...message.matchAll(HASHTAG_RE)];
  if (tags.length <= max) return { message, removed: 0 };
  let kept = 0;
  const out = message.replace(HASHTAG_RE, (match) => {
    kept += 1;
    return kept <= max ? match : "";
  });
  return { message: out.replace(/[ \t]{2,}/g, " ").trim(), removed: tags.length - max };
}

/**
 * Sprawdza i normalizuje treść jednej publikacji. Twarde naruszenia lądują
 * w `errors` (wpis nie może trafić do kolejki); poprawialne rzeczy moduł
 * naprawia sam i opisuje w `notes`.
 */
export function checkPublicationContent(input: GuardrailInput): GuardrailResult {
  const errors: string[] = [];
  const notes: string[] = [];
  const title = (input.title ?? "").trim();
  let message = (input.message ?? "").trim();
  const platform = input.platform;

  // „Link w bio" na platformie bez bio — podmień na adres strony.
  if (NO_BIO_PLATFORMS.has(platform) && LINK_W_BIO_RE.test(message)) {
    LINK_W_BIO_RE.lastIndex = 0;
    message = message.replace(LINK_W_BIO_RE, "financeyou.pl");
    notes.push(`„link w bio” zamienione na financeyou.pl (${platform} nie ma bio).`);
  }

  // Zakazane obietnice — blokada; treść ma wrócić do poprawki u źródła.
  for (const label of findBannedClaims(`${title}\n${message}`)) {
    errors.push(
      `Niedozwolona fraza ${label} — przy treściach inwestycyjnych nie obiecujemy ` +
        `zysku bez ryzyka. Przeredaguj treść (np. opisz mechanizm zabezpieczenia ` +
        `zamiast obiecywać wynik).`,
    );
  }

  // Treść inwestycyjna bez disclaimera — dopisz standardowy.
  const investment = INVESTMENT_THEME_RE.test(`${title}\n${message}`);
  const needsDisclaimer =
    investment && !!message && !DISCLAIMER_RE.test(message) && platform !== "x";
  const limit = MESSAGE_LIMITS[platform];
  const budget = needsDisclaimer ? limit - INVESTMENT_DISCLAIMER.length - 2 : limit;

  // Limit długości — przycinamy na granicy zdania/słowa, nigdy w pół wyrazu.
  if (message.length > budget) {
    message = smartTrim(message, budget);
    notes.push(`Opis przycięty do limitu ${platform} na granicy zdania (${limit} zn.).`);
  }
  if (needsDisclaimer) {
    message = `${message}\n\n${INVESTMENT_DISCLAIMER}`;
    notes.push("Dopisany disclaimer inwestycyjny (treść promuje inwestowanie).");
  }

  // Instagram: maksymalnie 30 hashtagów.
  if (platform === "instagram_reels") {
    const capped = capHashtags(message, IG_MAX_HASHTAGS);
    if (capped.removed > 0) {
      message = capped.message;
      notes.push(`Usunięte ${capped.removed} hashtagów ponad limit Instagrama (30).`);
    }
  }

  // Pusta treść: rolka/Short/post bez opisu nie wychodzi. X i TikTok mogą
  // zastąpić treść tytułem (tak publikują ich tory), więc wymagamy „czegokolwiek".
  const allowsTitleFallback = platform === "x" || platform === "tiktok";
  if (!message && !(allowsTitleFallback && title)) {
    errors.push(
      platform === "youtube"
        ? "Opis filmu nie może być pusty — dodaj opis z CTA i hasztagami."
        : "Treść publikacji nie może być pusta — rolka/post bez opisu nie wychodzi.",
    );
  }
  if (platform === "youtube" && !title) {
    errors.push("YouTube wymaga tytułu.");
  }

  const tags = platform === "youtube" ? deriveYoutubeTags(title, message) : [];
  if (platform === "youtube" && tags.length) {
    notes.push(`Tagi YouTube: ${tags.slice(0, 5).join(", ")}${tags.length > 5 ? "…" : ""}.`);
  }

  return { ok: errors.length === 0, errors, notes, title, message, tags };
}

/**
 * Wariant zbiorczy dla kolejkowania na kilka platform naraz: zwraca wynik
 * per platforma i złączone twarde błędy (jeden rzut dla całego wpisu).
 */
export function checkPublicationForPlatforms(
  platforms: StudioPlatform[],
  title: string | null | undefined,
  message: string | null | undefined,
): {
  ok: boolean;
  errors: string[];
  notes: string[];
  byPlatform: Map<StudioPlatform, GuardrailResult>;
} {
  const byPlatform = new Map<StudioPlatform, GuardrailResult>();
  const errors: string[] = [];
  const notes: string[] = [];
  for (const platform of platforms) {
    const r = checkPublicationContent({ platform, title, message });
    byPlatform.set(platform, r);
    for (const e of r.errors) {
      const tagged = `[${platform}] ${e}`;
      if (!errors.includes(tagged)) errors.push(tagged);
    }
    for (const n of r.notes) {
      const tagged = `[${platform}] ${n}`;
      if (!notes.includes(tagged)) notes.push(tagged);
    }
  }
  return { ok: errors.length === 0, errors, notes, byPlatform };
}
