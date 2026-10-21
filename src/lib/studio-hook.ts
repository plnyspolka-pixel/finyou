// Hook wizualny rolki Studia (0–2,5 s) — czyste dane i reguły, bez I/O.
//
// Hook to pełnoekranowy obraz w ruchu nałożony na pierwsze zdanie lektora:
// gotowy klip z banku klipów hooka (gra w całości, ~5 s, i kończy się na
// ścianie z logo za awatarami — twarde cięcie do awatara) albo obraz z
// naszego generatora / banku przebitek animowany w Remotion (push-in,
// wstrząs na uderzeniu, błysk), efekt dźwiękowy ElevenLabs zgrany
// z uderzeniem i duży kinetyczny tekst na całą szerokość kadru (3–4 słowa,
// jedno słowo złote). Napisy lektora i elementy dynamiczne czekają, aż hook
// się skończy. Tekst rysuje WYŁĄCZNIE Remotion — model obrazu/wideo dostaje
// zakaz liter w kadrze.
//
// Pole zadania `studio_video_jobs.hook` (jsonb):
//   { visual_prompt, text, highlight, sfx_prompt, source, music_prompt?,
//     variants?: [spec A, spec B, …], variant?: "A" | "B", assets?: HookAssets }
// `hook_variant` zadania mówi, który wariant poszedł do renderu (test A/B).

import type { Track } from "./autopilot/types";
import { HOOK_CLIP_DEFAULT_SECONDS } from "./studio-hook-clips";

export const HOOK_SOURCES = [
  "auto",
  "clip_bank",
  "studio_image",
  "broll",
  "flows_video",
  "flows_image",
] as const;
export type HookSource = (typeof HOOK_SOURCES)[number];

/** Długość hooka (s) i chwila uderzenia (ruch + dźwięk w pierwszych 0,3 s). */
export const HOOK_SECONDS = 2.5;
export const HOOK_IMPACT_AT = 0.2;

export const HOOK_LIMITS = {
  maxWords: 4,
  maxChars: 30,
  visualPrompt: 700,
  sfxPrompt: 220,
  musicPrompt: 220,
  maxVariants: 3,
} as const;

/** Specyfikacja jednego wariantu hooka (to, co wypełnia planer / robot). */
export type HookSpec = {
  /** Opis obrazu-metafory po angielsku, bez tekstu w kadrze. */
  visual_prompt: string;
  /** 1–4 słowa na ekranie (rysuje Remotion). */
  text: string;
  /** Słowo akcentowane złotem — jedno ze słów `text`; null = ostatnie. */
  highlight: string | null;
  /** Opis efektu dźwiękowego uderzenia (ElevenLabs Sound Effects). */
  sfx_prompt: string;
  /**
   * Skąd klip: auto = bank klipów hooka (`studio_hook_clips`, klip ~5 s
   * kończący się na ścianie z logo za pionowymi awatarami e0db…/65ef… —
   * rolka z klipem powinna zaczynać się od jednego z nich) → grafika Studia →
   * bank przebitek. `flows_*` (ElevenLabs) tylko przy fladze STUDIO_HOOK_FLOWS=1.
   */
  source: HookSource;
  /** Opcjonalny podkład muzyczny (`compose_music`), ściszony pod lektorem. */
  music_prompt?: string | null;
};

export type HookAssetStatus = "pending" | "ready" | "failed";

/** Wygenerowane zasoby hooka — kopie w naszym Storage (linki Flows wygasają po ~1 h). */
export type HookAssets = {
  status: HookAssetStatus;
  /** Rodzaj klipu w kadrze. */
  kind: "video" | "image" | null;
  url: string | null;
  /** Skąd faktycznie przyszedł klip. */
  source_used: Exclude<HookSource, "auto"> | null;
  sfx_url: string | null;
  music_url: string | null;
  /** Zlecenia Flows w toku (status sprawdza wykończenie). */
  video_generation_id?: string | null;
  image_generation_id?: string | null;
  started_at?: string | null;
  /** Klip z banku klipów hooka (`studio_hook_clips.id`) i jego długość w s. */
  clip_id?: string | null;
  clip_duration?: number | null;
  /** Flows (gdy włączone flagą) zwróciło 402 — konto bez planu Pro. */
  pro_plan_required?: boolean;
  notes: string[];
};

export type StudioHook = HookSpec & {
  /** Wszystkie warianty do testu A/B w stałej kolejności (A, B, …); główne pola = wybrany. */
  variants?: HookSpec[];
  /** Który wariant jest w głównych polach (zgodny z `hook_variant`). */
  variant?: string | null;
  assets?: HookAssets | null;
};

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

const words = (t: string) => t.split(/\s+/).filter(Boolean);
const bare = (w: string) => w.replace(/[^\p{L}\p{N}]/gu, "").toLocaleLowerCase("pl-PL");

/**
 * Walidacja jednego wariantu. Tekst: maks. 4 słowa i 30 znaków (dłuższy jest
 * przycinany do pierwszych 4 słów); akcent musi być jednym ze słów tekstu.
 * Brak tekstu = brak hooka (null).
 */
export function sanitizeHookSpec(raw: unknown): HookSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  let text = str(o.text, 120);
  if (!text) return null;
  const w = words(text).slice(0, HOOK_LIMITS.maxWords);
  text = w.join(" ");
  while (text.length > HOOK_LIMITS.maxChars && w.length > 1) {
    w.pop();
    text = w.join(" ");
  }
  if (text.length > HOOK_LIMITS.maxChars) text = text.slice(0, HOOK_LIMITS.maxChars);
  const hl = str(o.highlight, 40);
  const match = hl ? w.find((x) => bare(x) === bare(hl)) : undefined;
  const source = HOOK_SOURCES.find((s) => s === o.source) ?? "auto";
  return {
    visual_prompt: str(o.visual_prompt, HOOK_LIMITS.visualPrompt),
    text,
    highlight: match ?? null,
    sfx_prompt: str(o.sfx_prompt, HOOK_LIMITS.sfxPrompt),
    source,
    music_prompt: str(o.music_prompt, HOOK_LIMITS.musicPrompt) || null,
  };
}

function sanitizeAssets(raw: unknown): HookAssets | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const status = (["pending", "ready", "failed"] as const).find((s) => s === o.status) ?? "failed";
  const url = typeof o.url === "string" && /^https:\/\//.test(o.url) ? o.url : null;
  const httpsOrNull = (v: unknown) => (typeof v === "string" && /^https:\/\//.test(v) ? v : null);
  const used = HOOK_SOURCES.find((s) => s === o.source_used && s !== "auto") as
    | Exclude<HookSource, "auto">
    | undefined;
  return {
    status,
    kind: o.kind === "video" || o.kind === "image" ? o.kind : null,
    url,
    source_used: used ?? null,
    sfx_url: httpsOrNull(o.sfx_url),
    music_url: httpsOrNull(o.music_url),
    video_generation_id: typeof o.video_generation_id === "string" ? o.video_generation_id : null,
    image_generation_id: typeof o.image_generation_id === "string" ? o.image_generation_id : null,
    started_at: typeof o.started_at === "string" ? o.started_at : null,
    clip_id: typeof o.clip_id === "string" ? o.clip_id : null,
    clip_duration:
      typeof o.clip_duration === "number" && Number.isFinite(o.clip_duration) && o.clip_duration > 0
        ? o.clip_duration
        : null,
    pro_plan_required: o.pro_plan_required === true,
    notes: Array.isArray(o.notes)
      ? o.notes.filter((n): n is string => typeof n === "string").slice(0, 12)
      : [],
  };
}

/** Pole `hook` zadania → hook (z wariantami i zasobami) albo null. */
export function sanitizeHook(raw: unknown): StudioHook | null {
  const spec = sanitizeHookSpec(raw);
  if (!spec) return null;
  const o = raw as Record<string, unknown>;
  const variants = Array.isArray(o.variants)
    ? o.variants
        .map(sanitizeHookSpec)
        .filter((v): v is HookSpec => v !== null)
        .slice(0, HOOK_LIMITS.maxVariants)
    : [];
  return {
    ...spec,
    ...(variants.length ? { variants } : {}),
    variant: typeof o.variant === "string" ? o.variant.slice(0, 8) : null,
    assets: sanitizeAssets(o.assets),
  };
}

/**
 * Patch z narzędzi (MCP / panel): pola podane wprost zastępują zapisane,
 * zmiana obrazu/źródła/dźwięku kasuje wygenerowane zasoby (powstaną od nowa).
 */
export function mergeHookPatch(
  current: StudioHook | null,
  patch: Partial<HookSpec>,
): StudioHook | null {
  const base: Record<string, unknown> = { ...(current ?? {}) };
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) base[k] = v;
  const next = sanitizeHook(base);
  if (!next) return null;
  const assetsStale =
    !current ||
    (["visual_prompt", "source", "sfx_prompt", "music_prompt"] as const).some(
      (k) => patch[k] !== undefined && patch[k] !== current[k],
    );
  if (assetsStale) next.assets = null;
  // Edytowany główny spec zastępuje swój wpis na liście wariantów.
  if (next.variants?.length && current) {
    const i = Math.max(0, variantIndex(current.variant ?? "A"));
    const { variants: _v, assets: _a, variant: _k, ...main } = next;
    next.variants = next.variants.map((v, j) => (j === i ? (main as HookSpec) : v));
  }
  return next;
}

// ── A/B ──────────────────────────────────────────────────────────────────────

export const HOOK_VARIANT_KEYS = ["A", "B", "C"] as const;

const variantIndex = (key: string) =>
  HOOK_VARIANT_KEYS.indexOf(key.trim().toUpperCase() as (typeof HOOK_VARIANT_KEYS)[number]);

/**
 * Wariant do renderu: zapisany `hook_variant`, a gdy go nie ma i są co
 * najmniej dwa warianty — przydział naprzemienny po id zadania (połowa
 * rolek A, połowa B; zwycięzcę po 72 h wybiera metrics.ts).
 */
export function chooseHookVariant(hook: StudioHook, jobId: string, stored: string | null): string {
  const n = Math.max(1, Math.min(hook.variants?.length ?? 0, HOOK_VARIANT_KEYS.length));
  const want = variantIndex(stored ?? "");
  if (want >= 0 && want < n) return HOOK_VARIANT_KEYS[want];
  if (n < 2) return "A";
  // FNV-1a — równy rozkład parzystości także dla krótkich id.
  let h = 0x811c9dc5;
  for (const ch of jobId) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return HOOK_VARIANT_KEYS[(h >>> 16) % 2];
}

const sameSpec = (a: HookSpec, b: HookSpec) =>
  a.text === b.text && a.visual_prompt === b.visual_prompt && a.sfx_prompt === b.sfx_prompt;

/**
 * Hook z wybranym wariantem w głównych polach. `variants` to pełna lista
 * w stałej kolejności (A, B, …), więc przełączanie działa w obie strony.
 * Zmiana na inny spec kasuje zasoby (obraz/dźwięk innego wariantu).
 */
export function applyHookVariant(hook: StudioHook, key: string): StudioHook {
  const idx = variantIndex(key);
  const chosen = idx >= 0 ? hook.variants?.[idx] : undefined;
  if (!chosen) return { ...hook, variant: hook.variant ?? "A" };
  const label = HOOK_VARIANT_KEYS[idx];
  if (sameSpec(chosen, hook)) return { ...hook, ...chosen, variant: label };
  return { ...hook, ...chosen, variant: label, assets: null };
}

// ── Zasady generatora (prompt + fallback deterministyczny) ──────────────────

/** Doklejane do każdego opisu obrazu/wideo — model nie rysuje tekstu. */
export const HOOK_VISUAL_SUFFIX =
  "Vertical 9:16 full-frame shot, cinematic, photorealistic, one clear subject filling the frame, dramatic contrast lighting, strong motion and impact in the first 0.3 seconds (no slow intro). Absolutely no text, letters, words, numbers, signs, logos, watermarks or captions anywhere in the image. No recognizable faces.";

export function hookVisualPrompt(spec: Pick<HookSpec, "visual_prompt">): string {
  const base = spec.visual_prompt.trim().replace(/\.?$/, ".");
  return `${base} ${HOOK_VISUAL_SUFFIX}`.slice(0, 1800);
}

export function hookSfxPrompt(spec: Pick<HookSpec, "sfx_prompt">): string {
  const base = spec.sfx_prompt.trim() || "deep cinematic impact hit with short metallic boom";
  return `${base}, impact right at the start, short tail, no music, no voice`.slice(0, 450);
}

/** Zasady hooka dla scenarzysty / planera (LLM). */
export const HOOK_RULES = `HOOK WIZUALNY (pierwsze 2,5 s rolki, pełny kadr przed twarzą awatara):
- "visual_prompt" (po ANGIELSKU): JEDEN konkretny obraz-metafora problemu widza, w ruchu, z uderzeniem w pierwszych 0,3 s. Przykłady: drzwi skarbca bankowego zatrzaskujące się przed kamerą; czerwona pieczątka uderzająca w wniosek kredytowy (pusta pieczątka, bez liter); klucz do domu w snopie światła w ciemnym pokoju; teczka z dokumentami spadająca na biurko; kalkulator zamykany z hukiem. ZERO tekstu, liter, cyfr i logotypów w kadrze (tekst rysuje montaż). Bez twarzy.
- "text": 2–4 słowa po polsku, WIELKIE litery, teza albo pytanie (np. "BANK MÓWI NIE?", "ILE DOSTANIESZ?", "ODMOWA TO NIE KONIEC"). Bez cen, procentów, obietnic i słów zakazanych przez compliance.
- "highlight": jedno słowo z "text" do wyróżnienia złotem (najmocniejsze).
- "sfx_prompt" (po ANGIELSKU): dźwięk uderzenia zgrany z obrazem (np. "heavy steel vault door slam, deep metallic boom").`;

type Theme = { test: RegExp; spec: Omit<HookSpec, "source"> };

/** Motywy zapasowe (bez AI) — dobierane po treści pierwszego zdania. */
const THEMES: Theme[] = [
  {
    test: /odm[oó]w|powiedzia\p{L}* nie|\bnie\b.{0,20}bank|bank.{0,30}\bnie\b/iu,
    spec: {
      visual_prompt:
        "Extreme close-up: a heavy red rubber stamp slams down onto a sheet of paper on a dark wooden desk, papers jump, red ink splashes on impact; blank stamp face, the paper shows only soft blurred grey lines, nothing readable",
      text: "BANK MÓWI NIE?",
      highlight: "NIE?",
      sfx_prompt: "heavy rubber stamp slam on a wooden desk, sharp thud with paper rustle",
    },
  },
  {
    test: /ile (?:dostaniesz|możesz|mogę)|ltv|warto\p{L}* nieruchomo|pod (?:dom|mieszkanie|nieruchomo)/iu,
    spec: {
      visual_prompt:
        "A single brass house key drops into a beam of warm golden light in a dark room and lands on a polished table with a bounce, light flare on impact, camera pushing in fast",
      text: "ILE DOSTANIESZ?",
      highlight: "ILE",
      sfx_prompt: "metal key hitting a wooden table, bright metallic clink with low whoosh",
    },
  },
  {
    test: /dokument|wniosek|wniosku|papier|formalno/iu,
    spec: {
      visual_prompt:
        "A thick folder of documents is slammed onto an office desk in slow motion, sheets fly up toward the camera, harsh side light, shallow depth of field",
      text: "TEN BŁĄD KOSZTUJE",
      highlight: "BŁĄD",
      sfx_prompt: "heavy folder slammed on a desk, paper whoosh and thud",
    },
  },
];

const DEFAULT_THEME: Omit<HookSpec, "source"> = {
  visual_prompt:
    "A massive steel bank vault door swings shut and slams right in front of the camera, sparks of dust, cold blue light leaking through the closing gap",
  text: "BANK ZAMKNĄŁ DRZWI?",
  highlight: "DRZWI?",
  sfx_prompt: "heavy steel vault door slam, deep metallic boom with short reverb",
};

/** Hook bez AI — z pierwszego zdania scenariusza i motywów zapasowych. */
export function fallbackHookSpec(script: string, _track: Track | null = null): HookSpec {
  const first = script.split(/(?<=[.!?])\s+/)[0] ?? script;
  const theme = THEMES.find((t) => t.test.test(first)) ?? THEMES.find((t) => t.test.test(script));
  return { ...(theme?.spec ?? DEFAULT_THEME), source: "auto" };
}

// ── Plan dla Remotion ────────────────────────────────────────────────────────

/** Kadr bazowy planu (jak studio-reel-plan.ts). */
const BASE = { width: 720, height: 1280 } as const;

export type ReelHookWord = { text: string; accent: boolean };

export type ReelHook = {
  start: number;
  end: number;
  impactAt: number;
  media: { type: "video" | "image"; url: string } | null;
  /** Wiersze tekstu (słowa z akcentem), rozmiar czcionki w pikselach kadru 720×1280. */
  lines: ReelHookWord[][];
  fontSize: number;
  /** Środek bloku tekstu w pionie (ułamek wysokości kadru). */
  centerY: number;
  sfx: { url: string; at: number; volume: number } | null;
  music: { url: string; volume: number } | null;
  /**
   * `still` (domyślnie) — obraz/klip z najazdem, wstrząsem, błyskiem
   * i wygaszeniem; `clip` — klip z banku gra w całości bez efektów, tekst
   * znika przed końcem, na końcu twarde cięcie do awatara.
   */
  style?: "still" | "clip";
};

/** Średnia szerokość wielkiej litery Inter 800 w em (z zapasem na polskie znaki). */
const GLYPH_EM = 0.68;
/** Odstęp słowa (marginesy po 0,12 em z obu stron — Hook.tsx). */
const WORD_GAP_EM = 0.24;
const SIDE_MARGIN = 24;

/** Szerokość wiersza w em: litery + odstępy słów (tak rysuje Hook.tsx). */
export const hookLineEm = (line: string[]) =>
  line.reduce((acc, w) => acc + [...w].length * GLYPH_EM + WORD_GAP_EM, 0);
/** Tekst hooka: minimum ~12% wysokości kadru (wymóg właściciela). */
export const HOOK_MIN_TEXT_HEIGHT = 0.12;
const MAX_FONT = 300;
const LINE_HEIGHT = 1.0;

/**
 * Układ tekstu hooka na całą szerokość: próbuje 1, 2, 3… wierszy i bierze
 * ten, który daje blok najbliższy ~30% wysokości kadru (nie mniej niż 12%,
 * nie więcej niż 45%). Rozmiar = najdłuższy wiersz dokładnie na szerokość.
 */
export function layoutHookText(
  text: string,
  highlight: string | null,
): { lines: ReelHookWord[][]; fontSize: number } {
  const ws = words(text.toLocaleUpperCase("pl-PL"));
  const accentIdx = (() => {
    if (highlight) {
      const i = ws.findIndex((w) => bare(w) === bare(highlight));
      if (i >= 0) return i;
    }
    return ws.length - 1;
  })();
  const usable = BASE.width - 2 * SIDE_MARGIN;
  let best: { lines: ReelHookWord[][]; fontSize: number; score: number } | null = null;
  for (let n = 1; n <= Math.min(ws.length, 4); n++) {
    const lines = splitBalanced(ws, n);
    const widest = Math.max(...lines.map(hookLineEm));
    const fontSize = Math.min(MAX_FONT, Math.floor(usable / widest));
    const block = (fontSize * LINE_HEIGHT * n) / BASE.height;
    if (block > 0.45) continue;
    // Preferujemy ~30% wysokości; poniżej 12% — kara (ostatnia deska ratunku).
    const score = (block < HOOK_MIN_TEXT_HEIGHT ? 10 : 0) + Math.abs(block - 0.3);
    if (!best || score < best.score) {
      let k = 0;
      best = {
        score,
        fontSize,
        lines: lines.map((l) => l.map((w) => ({ text: w, accent: k++ === accentIdx }))),
      };
    }
  }
  return (
    best ?? { lines: [ws.map((w, i) => ({ text: w, accent: i === accentIdx }))], fontSize: 60 }
  );
}

function splitBalanced(ws: string[], n: number): string[][] {
  if (n <= 1) return [ws];
  // Wszystkie podziały na n wierszy (słów ≤ 4) — wybór o najkrótszym najdłuższym wierszu.
  let best: string[][] = [ws];
  let bestLen = Infinity;
  const rec = (start: number, left: number, acc: string[][]) => {
    if (left === 1) {
      const all = [...acc, ws.slice(start)];
      const len = Math.max(...all.map((l) => l.join(" ").length));
      if (len < bestLen) {
        bestLen = len;
        best = all;
      }
      return;
    }
    for (let i = start + 1; i <= ws.length - left + 1; i++)
      rec(i, left - 1, [...acc, ws.slice(start, i)]);
  };
  rec(0, n, []);
  return best;
}

/**
 * Hook gotowy do planu Remotion — tylko gdy jest klip i tekst. Bez klipu
 * (wszystkie źródła padły) hook nie wchodzi: lepszy brak niż czarny kadr.
 */
export function buildReelHook(hook: StudioHook | null, videoDuration?: number): ReelHook | null {
  if (!hook?.assets || hook.assets.status !== "ready" || !hook.assets.url || !hook.assets.kind) {
    return null;
  }
  const clip = hook.assets.source_used === "clip_bank" && hook.assets.kind === "video";
  // Klip z banku gra w całości (kończy się na ścianie z logo za awatarem).
  const want = clip ? (hook.assets.clip_duration ?? HOOK_CLIP_DEFAULT_SECONDS) : HOOK_SECONDS;
  const end = Math.max(1.2, Math.min(want, (videoDuration ?? want + 1) - 0.5));
  const { lines, fontSize } = layoutHookText(hook.text, hook.highlight);
  return {
    start: 0,
    end,
    impactAt: HOOK_IMPACT_AT,
    media: { type: hook.assets.kind, url: hook.assets.url },
    lines,
    fontSize,
    centerY: 0.5,
    sfx: hook.assets.sfx_url ? { url: hook.assets.sfx_url, at: 0, volume: 0.9 } : null,
    music: hook.assets.music_url ? { url: hook.assets.music_url, volume: 0.12 } : null,
    style: clip ? "clip" : "still",
  };
}
