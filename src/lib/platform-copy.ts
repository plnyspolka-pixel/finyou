// Opisy publikacji PER PLATFORMA — czysty moduł (bez importów serwera),
// wspólny dla formularzy (Studio publikacji, „Publikuj" przy materiale,
// auto-publikacja po renderze) i kolejek (studio-enqueue.server.ts,
// studio-video-queue.server.ts, narzędzia MCP).
//
// Zasada: jedna platforma — jeden opis. Każda platforma ma własne pola
// (tytuł i/lub treść), własne limity i własne zwyczaje, więc wspólny tekst
// z formularza jest tylko PUNKTEM WYJŚCIA (composeCopyForPlatform składa
// z niego szkic pod platformę), a do kolejki trafia to, co stoi w polu danej
// platformy — po walidacji (platformCopyError) albo dopasowaniu do limitów
// (fitCopyToPlatform), gdy tekst pochodzi z automatu (AI, MCP, batch).
//
// Limity wg dokumentacji platform (stan: październik 2026):
//   * YouTube Data API — snippet.title ≤ 100 znaków (tor dokleja „ #Shorts",
//     stąd 92 dla użytkownika), snippet.description ≤ 5000 bajtów UTF-8
//     (polskie znaki liczą się podwójnie), oba bez znaków „<" i „>";
//     przy ponad 60 hashtagach YouTube ignoruje wszystkie,
//   * Instagram Content Publishing — caption ≤ 2200 znaków, ≤ 30 hashtagów,
//     ≤ 20 @wzmianek,
//   * Facebook Reels — `description` bez udokumentowanego limitu w Graph API;
//     przyjmujemy 2200 jak dla Reels na Instagramie (tyle mieści kompozytor),
//   * Facebook post — `message` ≤ 63 206 znaków; `title` wideo ≤ 255,
//   * TikTok Content Posting — post_info.title to JEDYNE pole tekstowe (podpis
//     z hashtagami i @wzmiankami), limit TITLE_MAX z tiktok-upload.ts,
//   * X — 280 znaków ważonych (link = 23, emoji / CJK = 2; x-post.ts), chyba
//     że konto Premium podniosło limit sekretem X_POST_MAX_CHARS.
import { STUDIO_PLATFORMS, type StudioPlatform } from "./studio-platforms";
import { TITLE_MAX as TIKTOK_TITLE_MAX } from "./tiktok-upload";
import { X_TEXT_LIMIT, xPostText, xWeightedLength } from "./x-post";

export type PlatformCopy = { title: string; message: string };

/**
 * Opisy per platforma z formularza / MCP / kolumny `publish_copy`. Pole
 * `undefined` = „nie podano" (bierz z opisu wspólnego); pusty string = pusto.
 */
export type PlatformCopyMap = Partial<Record<StudioPlatform, Partial<PlatformCopy>>>;

/** Limity zależne od konta — dziś tylko X Premium (X_POST_MAX_CHARS). */
export type CopyLimits = { xTextMax?: number | null };

export type CopyUnit = "chars" | "bytes" | "x";

export type CopyFieldRule = {
  label: string;
  max: number;
  /** Jak liczymy długość: znaki (code pointy), bajty UTF-8 (YouTube), wagi X. */
  unit: CopyUnit;
  required?: boolean;
  hashtagMax?: number;
  mentionMax?: number;
  /** Znaki, których platforma nie przyjmuje w tym polu. */
  forbidden?: RegExp;
  /** Pole wieloliniowe (textarea o tyle wierszach); brak = jedna linia. */
  rows?: number;
};

export type PlatformCopyRule = {
  title?: CopyFieldRule;
  message?: CopyFieldRule;
  /** Jedno-dwa zdania o wymaganiach platformy — pod polami w formularzu. */
  hint: string;
};

export const YOUTUBE_TITLE_MAX = 92; // 100 − „ #Shorts" doklejane przez tor
export const YOUTUBE_DESCRIPTION_MAX_BYTES = 5000;
export const YOUTUBE_HASHTAG_MAX = 60;
export const IG_CAPTION_MAX = 2200;
export const IG_HASHTAG_MAX = 30;
export const IG_MENTION_MAX = 20;
export const FB_REELS_DESCRIPTION_MAX = 2200;
export const FB_POST_MESSAGE_MAX = 63_206;
export const FB_VIDEO_TITLE_MAX = 255;
export { TIKTOK_TITLE_MAX, X_TEXT_LIMIT };

const YOUTUBE_FORBIDDEN = /[<>]/;

export const PLATFORM_COPY_RULES: Record<StudioPlatform, PlatformCopyRule> = {
  youtube: {
    title: {
      label: "Tytuł",
      max: YOUTUBE_TITLE_MAX,
      unit: "chars",
      required: true,
      forbidden: YOUTUBE_FORBIDDEN,
    },
    message: {
      label: "Opis",
      max: YOUTUBE_DESCRIPTION_MAX_BYTES,
      unit: "bytes",
      hashtagMax: YOUTUBE_HASHTAG_MAX,
      forbidden: YOUTUBE_FORBIDDEN,
      rows: 5,
    },
    hint: "Tytuł do 92 znaków (dopisujemy „#Shorts”), opis do 5000 bajtów UTF-8 (polskie znaki liczą się podwójnie), bez znaków < i >. Pierwsze 3 hashtagi z opisu YouTube pokazuje nad tytułem; powyżej 60 ignoruje wszystkie.",
  },
  instagram_reels: {
    message: {
      label: "Podpis (caption)",
      max: IG_CAPTION_MAX,
      unit: "chars",
      hashtagMax: IG_HASHTAG_MAX,
      mentionMax: IG_MENTION_MAX,
      rows: 5,
    },
    hint: "Podpis do 2200 znaków, maks. 30 hashtagów i 20 @wzmianek. W feedzie widać ok. 125 znaków przed „więcej” — najważniejsze na początek.",
  },
  facebook_reels: {
    message: {
      label: "Opis rolki",
      max: FB_REELS_DESCRIPTION_MAX,
      unit: "chars",
      hashtagMax: IG_HASHTAG_MAX,
      rows: 4,
    },
    hint: "Opis do 2200 znaków z hashtagami (limit jak dla Reels na Instagramie). Tytułu nie ma.",
  },
  tiktok: {
    title: {
      label: "Podpis (title)",
      max: TIKTOK_TITLE_MAX,
      unit: "chars",
      required: true,
      rows: 3,
    },
    hint: `TikTok ma jedno pole tekstowe: podpis do ${TIKTOK_TITLE_MAX} znaków razem z hashtagami (#) i @wzmiankami — osobnego opisu nie ma.`,
  },
  facebook_post: {
    title: {
      label: "Tytuł wideo (opcjonalnie — tylko gdy post z wideo)",
      max: FB_VIDEO_TITLE_MAX,
      unit: "chars",
    },
    message: { label: "Treść posta", max: FB_POST_MESSAGE_MAX, unit: "chars", rows: 5 },
    hint: "Treść do 63 206 znaków; bez rozwijania widać ok. 480. Tytuł Facebook pokazuje tylko przy poście z wideo (do 255 znaków).",
  },
  x: {
    message: { label: "Treść posta", max: X_TEXT_LIMIT, unit: "x", required: true, rows: 3 },
    hint: "Post do 280 znaków liczonych jak u X-a: każdy link to 23 znaki, emoji i znaki spoza alfabetu łacińskiego — 2. Bez tytułu; konto Premium podnosi limit (X_POST_MAX_CHARS).",
  },
};

/** Reguła platformy z limitami konta (X Premium podnosi limit posta). */
export function platformCopyRule(platform: StudioPlatform, limits?: CopyLimits): PlatformCopyRule {
  const rule = PLATFORM_COPY_RULES[platform];
  if (platform === "x" && rule.message && limits?.xTextMax && limits.xTextMax > 0) {
    return { ...rule, message: { ...rule.message, max: limits.xTextMax } };
  }
  return rule;
}

export function copyUnitLabel(unit: CopyUnit): string {
  return unit === "bytes" ? "bajtów" : "znaków";
}

// ── Liczenie ─────────────────────────────────────────────────────────────────

// Hashtag / wzmianka = „#słowo" / „@nazwa" na początku tekstu albo po białym
// znaku (tak liczą je Instagram i TikTok). Grupa 1 = wiodący biały znak.
const HASHTAG_RE = /(^|\s)#[\p{L}\p{N}_]+/gu;
const MENTION_RE = /(^|\s)@[\p{L}\p{N}_.]+/gu;

export function countHashtags(text: string): number {
  return [...text.matchAll(HASHTAG_RE)].length;
}

export function countMentions(text: string): number {
  return [...text.matchAll(MENTION_RE)].length;
}

/** Hashtagi z tekstu w kolejności wystąpienia (bez duplikatów, z „#"). */
export function hashtagsOf(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(HASHTAG_RE)) {
    const tag = m[0].trimStart();
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

function utf8Bytes(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

/** Długość tekstu w jednostce, w której dana platforma liczy limit. */
export function copyLength(text: string, unit: CopyUnit): number {
  if (unit === "x") return xWeightedLength(text);
  let total = 0;
  for (const ch of text) total += unit === "bytes" ? utf8Bytes(ch.codePointAt(0)!) : 1;
  return total;
}

// ── Walidacja ────────────────────────────────────────────────────────────────

export type CopyIssueOptions = {
  /** Puste pola nie są błędem (auto-publikacja: uzupełni je AI ze scenariusza). */
  allowEmpty?: boolean;
};

/** Wszystkie problemy opisu dla platformy — po polsku, do pokazania pod polem. */
export function platformCopyIssues(
  platform: StudioPlatform,
  copy: Partial<PlatformCopy> | undefined,
  limits?: CopyLimits,
  opts?: CopyIssueOptions,
): string[] {
  const rule = platformCopyRule(platform, limits);
  const issues: string[] = [];
  for (const field of ["title", "message"] as const) {
    const fr = rule[field];
    if (!fr) continue;
    const text = (copy?.[field] ?? "").trim();
    if (!text) {
      if (fr.required && !opts?.allowEmpty) issues.push(`${fr.label}: pole wymagane.`);
      continue;
    }
    const len = copyLength(text, fr.unit);
    if (len > fr.max) {
      issues.push(
        `${fr.label}: ${len} / ${fr.max} ${copyUnitLabel(fr.unit)} — za długie o ${len - fr.max}.`,
      );
    }
    if (fr.hashtagMax != null) {
      const n = countHashtags(text);
      if (n > fr.hashtagMax) issues.push(`${fr.label}: ${n} hashtagów (limit ${fr.hashtagMax}).`);
    }
    if (fr.mentionMax != null) {
      const n = countMentions(text);
      if (n > fr.mentionMax) issues.push(`${fr.label}: ${n} @wzmianek (limit ${fr.mentionMax}).`);
    }
    if (fr.forbidden?.test(text)) {
      issues.push(`${fr.label}: platforma nie przyjmuje znaków < i >.`);
    }
  }
  return issues;
}

/** Pierwszy problem albo null — do blokady przycisku i komunikatu serwera. */
export function platformCopyError(
  platform: StudioPlatform,
  copy: Partial<PlatformCopy> | undefined,
  limits?: CopyLimits,
  opts?: CopyIssueOptions,
): string | null {
  return platformCopyIssues(platform, copy, limits, opts)[0] ?? null;
}

// ── Dopasowanie do limitów ───────────────────────────────────────────────────

/** Przycina na granicy słowa (gdy nie zjada to więcej niż ostatni wyraz) i dokleja „…". */
function clip(text: string, max: number, unit: CopyUnit): string {
  if (copyLength(text, unit) <= max) return text;
  // Miejsce na wielokropek — w jednostce platformy („…" to 3 bajty UTF-8).
  const budget = max - copyLength("…", unit);
  let used = 0;
  let out = "";
  for (const ch of text) {
    const w = copyLength(ch, unit);
    if (used + w > budget) break;
    used += w;
    out += ch;
  }
  const lastSpace = out.search(/\s+\S*$/);
  if (lastSpace > 0 && out.length - lastSpace < 20) out = out.slice(0, lastSpace);
  return `${out.trimEnd()}…`;
}

/** Zostawia pierwsze `max` hashtagów, resztę usuwa (reszta tekstu bez zmian). */
export function limitHashtags(text: string, max: number): string {
  let n = 0;
  return text
    .replace(HASHTAG_RE, (m, lead: string) => (++n <= max ? m : lead))
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/[^\S\n]+\n/g, "\n")
    .trim();
}

function normalize(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}

/**
 * Dopasowuje opis do wymagań platformy: usuwa znaki zabronione, nadmiarowe
 * hashtagi i przycina do limitu. Idempotentne (zgodny tekst wraca bez zmian)
 * — używane tam, gdzie tekst nie przeszedł przez formularz (AI, MCP, batch),
 * żeby żadna publikacja nie padła na limicie platformy.
 */
export function fitCopyToPlatform(
  platform: StudioPlatform,
  copy: Partial<PlatformCopy>,
  limits?: CopyLimits,
): PlatformCopy {
  const rule = platformCopyRule(platform, limits);
  const out: PlatformCopy = {
    title: normalize(copy.title ?? ""),
    message: normalize(copy.message ?? ""),
  };
  for (const field of ["title", "message"] as const) {
    const fr = rule[field];
    // Pola, których platforma nie publikuje (np. tytuł przy X), zostają jak
    // są — kolejka pokazuje je tylko w podglądzie.
    if (!fr) continue;
    let text = out[field];
    if (fr.forbidden) text = text.replace(new RegExp(fr.forbidden.source, "g"), "");
    if (fr.hashtagMax != null) text = limitHashtags(text, fr.hashtagMax);
    text = fr.unit === "x" ? xPostText(text, fr.max) : clip(text, fr.max, fr.unit);
    out[field] = text;
  }
  return out;
}

// ── Składanie szkicu z opisu wspólnego ───────────────────────────────────────

function firstParagraph(text: string): string {
  return (
    text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      // Akapit złożony z samych hashtagów nie jest treścią.
      .find((p) => p && p.replace(HASHTAG_RE, "").trim()) ?? ""
  );
}

/**
 * Podpis TikToka z tytułu (albo pierwszego akapitu treści) + hashtagów
 * z treści, ile zmieści się w limicie. Hashtagi obecne już w tytule nie
 * dublują się.
 */
export function tiktokCaption(title: string, message: string, max = TIKTOK_TITLE_MAX): string {
  const head = normalize(title) || firstParagraph(normalize(message));
  const present = new Set(hashtagsOf(head).map((t) => t.toLowerCase()));
  let out = head;
  for (const tag of hashtagsOf(message)) {
    if (present.has(tag.toLowerCase())) continue;
    const next = `${out} ${tag}`.trim();
    // Za długi hashtag pomijamy, ale krótsze dalej w kolejce jeszcze mogą się zmieścić.
    if (copyLength(next, "chars") > max) continue;
    out = next;
  }
  return out;
}

/**
 * Szkic opisu pod platformę ze wspólnego tytułu i treści — punkt wyjścia
 * do edycji w formularzu i treść zapasowa, gdy platforma nie ma własnego
 * opisu (MCP / auto-publikacja). Zawsze mieści się w limitach.
 */
export function composeCopyForPlatform(
  platform: StudioPlatform,
  base: Partial<PlatformCopy>,
  limits?: CopyLimits,
): PlatformCopy {
  const title = normalize(base.title ?? "");
  const message = normalize(base.message ?? "");
  switch (platform) {
    case "youtube":
    case "facebook_post":
      return fitCopyToPlatform(platform, { title, message }, limits);
    case "instagram_reels":
    case "facebook_reels":
      // Rolki nie mają tytułu — gdy brak treści, podpisem staje się tytuł.
      return fitCopyToPlatform(platform, { title: "", message: message || title }, limits);
    case "tiktok":
      return fitCopyToPlatform(
        platform,
        { title: tiktokCaption(title, message, platformCopyRule(platform, limits).title!.max) },
        limits,
      );
    case "x":
      // Jak w torze X: treść jest postem, tytuł tylko zapasem.
      return fitCopyToPlatform(platform, { title: "", message: message || title }, limits);
  }
}

/**
 * Opis do kolejki dla jednej platformy: pola podane wprost (per platforma)
 * wygrywają; brakujące bierze ze szkicu złożonego z opisu wspólnego.
 * Wynik NIE jest przycinany — pola podane wprost waliduje caller
 * (platformCopyError) albo dopasowuje (fitCopyToPlatform).
 */
export function resolvePlatformCopy(
  platform: StudioPlatform,
  base: Partial<PlatformCopy>,
  override?: Partial<PlatformCopy>,
  limits?: CopyLimits,
): PlatformCopy {
  const composed = composeCopyForPlatform(platform, base, limits);
  if (!override) return composed;
  return {
    title: override.title !== undefined ? normalize(override.title) : composed.title,
    message: override.message !== undefined ? normalize(override.message) : composed.message,
  };
}

// ── Mapa opisów ──────────────────────────────────────────────────────────────

export function hasAnyCopy(copy: Partial<PlatformCopy> | undefined): boolean {
  return !!copy && (!!copy.title?.trim() || !!copy.message?.trim());
}

/** Wpis bez pustych pól (puste = „nie podano"); undefined, gdy nic nie zostało. */
export function nonEmptyCopy(
  copy: Partial<PlatformCopy> | undefined,
): Partial<PlatformCopy> | undefined {
  if (!copy) return undefined;
  const out: Partial<PlatformCopy> = {};
  if (copy.title?.trim()) out.title = copy.title.trim();
  if (copy.message?.trim()) out.message = copy.message.trim();
  return Object.keys(out).length ? out : undefined;
}

/**
 * Mapa tylko dla wskazanych platform i tylko z niepustymi polami — tak
 * zapisujemy `publish_copy` przy zadaniu wideo (puste pola uzupełni AI).
 */
export function compactCopyMap(
  map: PlatformCopyMap | undefined,
  platforms?: readonly StudioPlatform[],
): PlatformCopyMap {
  const out: PlatformCopyMap = {};
  for (const p of platforms ?? STUDIO_PLATFORMS) {
    const c = nonEmptyCopy(map?.[p]);
    if (c) out[p] = c;
  }
  return out;
}

/**
 * Mapa do kolejki z formularza: dla każdej zaznaczonej platformy OBA pola
 * (pusty string = świadomie pusto; walidacja wyłapie brak tam, gdzie pole
 * jest wymagane). Platformy bez wpisu dostają szkic z opisu wspólnego.
 */
export function explicitCopyMap(
  map: PlatformCopyMap | undefined,
  platforms: readonly StudioPlatform[],
  base: Partial<PlatformCopy>,
  limits?: CopyLimits,
): PlatformCopyMap {
  const out: PlatformCopyMap = {};
  for (const p of platforms) {
    const c = map?.[p];
    out[p] = c
      ? { title: c.title ?? "", message: c.message ?? "" }
      : composeCopyForPlatform(p, base, limits);
  }
  return out;
}

/**
 * Karty formularza: platforma bez własnej edycji (`overrides`) odbija na żywo
 * opis wspólny złożony pod nią — użytkownik widzi, co dokładnie pójdzie.
 */
export function effectiveCopyMap(
  platforms: readonly StudioPlatform[],
  overrides: PlatformCopyMap,
  base: Partial<PlatformCopy>,
  limits?: CopyLimits,
): PlatformCopyMap {
  const out: PlatformCopyMap = {};
  for (const p of platforms) {
    const o = overrides[p];
    out[p] = o
      ? { title: o.title ?? "", message: o.message ?? "" }
      : composeCopyForPlatform(p, base, limits);
  }
  return out;
}

/**
 * Zmiana z kart → własne edycje: karta równa szkicowi z opisu wspólnego
 * wraca do odbijania go na żywo (np. po „Z opisu wspólnego"), inna zostaje
 * zapisana 1:1. Wpisy platform spoza listy (odznaczonych) zostają.
 */
export function copyOverridesFrom(
  next: PlatformCopyMap,
  platforms: readonly StudioPlatform[],
  prev: PlatformCopyMap,
  base: Partial<PlatformCopy>,
  limits?: CopyLimits,
): PlatformCopyMap {
  const out: PlatformCopyMap = {};
  for (const p of STUDIO_PLATFORMS) {
    if (!platforms.includes(p)) {
      if (prev[p]) out[p] = prev[p];
      continue;
    }
    const c = next[p];
    if (!c) continue;
    const composed = composeCopyForPlatform(p, base, limits);
    const title = c.title ?? "";
    const message = c.message ?? "";
    if (title === composed.title && message === composed.message) continue;
    out[p] = { title, message };
  }
  return out;
}

/**
 * Bezpieczne odczytanie mapy z JSON-a (kolumna jsonb, wejście MCP / server
 * function): tylko znane platformy, tylko stringi; reszta jest pomijana.
 */
export function parsePlatformCopyMap(raw: unknown): PlatformCopyMap {
  const out: PlatformCopyMap = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const p of STUDIO_PLATFORMS) {
    const entry = (raw as Record<string, unknown>)[p];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const copy: Partial<PlatformCopy> = {};
    if (typeof e.title === "string") copy.title = e.title;
    if (typeof e.message === "string") copy.message = e.message;
    if (copy.title !== undefined || copy.message !== undefined) out[p] = copy;
  }
  return out;
}

/** Platformy w stałej kolejności formularzy, tylko te z listy. */
export function orderPlatforms(platforms: readonly StudioPlatform[]): StudioPlatform[] {
  return STUDIO_PLATFORMS.filter((p) => platforms.includes(p));
}
