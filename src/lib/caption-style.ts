// Napisy własne — czysta logika: SRT → ASS ze stylem (bez I/O, testowalna).
//
// DLACZEGO: napisów HeyGena nie da się ostylować (v3 przyjmuje w
// `caption.style` wyłącznie "default"), a ich tekst z rozpoznawania mowy
// przekręcał nazwę firmy — Studio nie zamawia ich wcale. Plik SRT budujemy
// sami z tekstu scenariusza i czasów znaków ElevenLabs (studio-subtitles.ts).
// Backend chodzi na Cloudflare Workers, gdzie nie ma FFmpega, więc obraz
// wypala osobna usługa (services/caption-burner). Cały wygląd napisów
// rozstrzyga się TUTAJ: z SRT budujemy ASS (Advanced SubStation Alpha —
// format, w którym styl jest częścią pliku), a usługa tylko nakłada go
// filtrem libass. Usługa nic nie interpretuje, więc zmiana wyglądu to
// zmiana w tym pliku, nie w infrastrukturze.
//
// Rozmiary w presetach są w pikselach kadru 720×1280 (PlayResY = 1280);
// libass skaluje je proporcjonalnie, gdy plik ma inną rozdzielczość.

import { fixBrandInCues } from "./caption-brand";

export type SrtCue = {
  /** Sekundy od początku filmu. */
  start: number;
  end: number;
  /** Tekst bez tagów; wiersze rozdziela "\n". */
  text: string;
};

// Wszystkie style wypalamy u nas (usługa caption-burner) — napisów HeyGena
// Studio nie zamawia. Wartość 'heygen' zostaje tylko w starych wierszach
// `studio_video_jobs.caption_style` (rozpoznajemy ją po etykiecie, nie oferujemy).
export const CAPTION_STYLE_IDS = ["reels", "tiktok", "box", "minimal"] as const;
export type CaptionStyleId = (typeof CAPTION_STYLE_IDS)[number];
/** Alias historyczny — dziś każdy styl jest własny. */
export type CustomCaptionStyleId = CaptionStyleId;
/** Wartość w starych wierszach: napisy wypalone przez HeyGen (już nie zamawiane). */
export const LEGACY_HEYGEN_CAPTION_STYLE = "heygen";

export type CaptionStyle = {
  id: CustomCaptionStyleId;
  label: string;
  description: string;
  /** Rodzina czcionki (fontconfig w usłudze; Inter jest w obrazie Dockera). */
  font: string;
  /** Wysokość czcionki w px przy kadrze 1280 px. */
  fontSize: number;
  bold: boolean;
  uppercase: boolean;
  /** Kolory w zapisie "#RRGGBB". */
  color: string;
  outlineColor: string;
  /** Grubość obrysu (px); przy ramce — wewnętrzny margines ramki. */
  outline: number;
  shadow: number;
  /** Ramka pod tekstem (ASS BorderStyle 3) zamiast obrysu. */
  box: { color: string; opacity: number } | null;
  placement: "bottom" | "center";
  /** Odstęp od dolnej krawędzi (px) — omija paski UI Reels / Shorts / TikToka. */
  marginBottom: number;
  marginSide: number;
  /** Maks. znaków w wierszu i wierszy naraz — dłuższe kwestie tniemy na krótsze. */
  maxChars: number;
  maxLines: 1 | 2;
  /** Kolor podświetlenia aktualnie mówionego słowa; null = bez podświetlania. */
  highlight: string | null;
};

const FONT = "Inter";

export const CUSTOM_CAPTION_STYLES: Record<CustomCaptionStyleId, CaptionStyle> = {
  reels: {
    id: "reels",
    label: "Rolka — duże z obrysem",
    description: "Duże białe litery z czarnym obrysem, nad paskiem UI Reels i Shorts.",
    font: FONT,
    fontSize: 60,
    bold: true,
    uppercase: false,
    color: "#FFFFFF",
    outlineColor: "#000000",
    outline: 4,
    shadow: 1,
    box: null,
    placement: "bottom",
    marginBottom: 380,
    marginSide: 40,
    maxChars: 18,
    maxLines: 2,
    highlight: null,
  },
  tiktok: {
    id: "tiktok",
    label: "TikTok — wielkie litery, podświetlanie słów",
    description: "Po kilka słów naraz, wielkie litery, żółte podświetlenie mówionego słowa.",
    font: FONT,
    fontSize: 64,
    bold: true,
    uppercase: true,
    color: "#FFFFFF",
    outlineColor: "#000000",
    outline: 5,
    shadow: 0,
    box: null,
    placement: "bottom",
    marginBottom: 430,
    marginSide: 40,
    maxChars: 13,
    maxLines: 1,
    highlight: "#FFD400",
  },
  box: {
    id: "box",
    label: "Ramka — biały na ciemnym pasku",
    description: "Tekst na półprzezroczystej granatowej ramce — czytelny na jasnych przebitkach.",
    font: FONT,
    fontSize: 52,
    bold: true,
    uppercase: false,
    color: "#FFFFFF",
    outlineColor: "#0B1220",
    outline: 12,
    shadow: 0,
    box: { color: "#0B1220", opacity: 0.78 },
    placement: "bottom",
    marginBottom: 340,
    marginSide: 40,
    maxChars: 20,
    maxLines: 2,
    highlight: null,
  },
  minimal: {
    id: "minimal",
    label: "Delikatne — mniejsze u dołu",
    description: "Jak napisy HeyGena, tylko czytelniejsze: cienki obrys, nisko w kadrze.",
    font: FONT,
    fontSize: 44,
    bold: true,
    uppercase: false,
    color: "#FFFFFF",
    outlineColor: "#000000",
    outline: 2,
    shadow: 1,
    box: null,
    placement: "bottom",
    marginBottom: 200,
    marginSide: 40,
    maxChars: 24,
    maxLines: 2,
    highlight: null,
  },
};

/** Opcje do selecta w panelu — wszystkie wypalane u nas, w kolejności presetów. */
export const CAPTION_STYLE_OPTIONS: ReadonlyArray<{
  id: CaptionStyleId;
  label: string;
  description: string;
}> = Object.values(CUSTOM_CAPTION_STYLES).map(({ id, label, description }) => ({
  id,
  label,
  description,
}));

/** Styl wybierany domyślnie — ten sam w panelu Studia, serii, cronie i MCP. */
export const DEFAULT_CUSTOM_CAPTION_STYLE: CustomCaptionStyleId = "reels";

/** Domyślny styl napisów rolki — zawsze własny, wypalany naszą usługą. */
export function defaultCaptionStyle(): CaptionStyleId {
  return DEFAULT_CUSTOM_CAPTION_STYLE;
}

export function isCaptionStyleId(v: unknown): v is CaptionStyleId {
  return typeof v === "string" && (CAPTION_STYLE_IDS as readonly string[]).includes(v);
}

export function isCustomCaptionStyle(v: unknown): v is CustomCaptionStyleId {
  return isCaptionStyleId(v);
}

/** Nieznana / pusta wartość (także stare 'heygen') = styl domyślny. */
export function parseCaptionStyleId(v: unknown): CaptionStyleId {
  return isCaptionStyleId(v) ? v : DEFAULT_CUSTOM_CAPTION_STYLE;
}

export function captionStyleLabel(id: unknown): string {
  const found = CAPTION_STYLE_OPTIONS.find((o) => o.id === id);
  if (found) return found.label;
  return id === LEGACY_HEYGEN_CAPTION_STYLE ? "HeyGen (dawne)" : "nieznany styl";
}

// ── SRT ─────────────────────────────────────────────────────────────────────

// Godziny opcjonalne — WebVTT pozwala na `mm:ss.ttt`.
const TIME_RE =
  /((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{1,3})/;
/** Kwestia bez sensownego końca dostaje tyle — lepsze niż zniknięcie. */
const MIN_CUE_SECONDS = 0.5;

function parseTimestamp(s: string): number {
  const parts = s.split(":");
  const [h, m, rest] = parts.length === 2 ? ["0", ...parts] : parts;
  const [sec, ms = ""] = rest.split(/[,.]/);
  return Number(h) * 3600 + Number(m) * 60 + Number(sec) + Number(ms.padEnd(3, "0")) / 1000;
}

/** Tagi HTML/ASS z SRT wylatują — my nakładamy własny styl. */
function cleanCueText(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/\{[^}]*\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parser SRT odporny na to, co realnie wraca z HeyGena: BOM, CRLF, brak
 * numerów kwestii, kropka zamiast przecinka w milisekundach, tagi `<i>`.
 * Kwestie puste albo bez czasu są pomijane; wynik posortowany po starcie.
 */
export function parseSrt(srt: string): SrtCue[] {
  const text = srt.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const cues: SrtCue[] = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) continue;
    let i = 0;
    if (/^\d+$/.test(lines[0]) && lines.length > 1 && TIME_RE.test(lines[1])) i = 1;
    const m = TIME_RE.exec(lines[i] ?? "");
    if (!m) continue;
    const start = parseTimestamp(m[1]);
    const end = parseTimestamp(m[2]);
    const body = cleanCueText(lines.slice(i + 1).join(" "));
    if (!body || !Number.isFinite(start) || !Number.isFinite(end)) continue;
    cues.push({ start, end: end > start ? end : start + MIN_CUE_SECONDS, text: body });
  }
  return cues.sort((a, b) => a.start - b.start);
}

/**
 * Kwestie z pliku ASS (zdarzenia `Dialogue:` w sekcji `[Events]`) — tak
 * oddają napisy niektóre filmy HeyGena spoza Studia (API v2). Kolumny bierzemy
 * z linii `Format:`; tagi `{…}` i łamania `\N` wylatują.
 */
export function parseAssCues(ass: string): SrtCue[] {
  const text = ass.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const events = text.split(/^\[Events\]\s*$/im)[1] ?? "";
  let cols = [
    "layer",
    "start",
    "end",
    "style",
    "name",
    "marginl",
    "marginr",
    "marginv",
    "effect",
    "text",
  ];
  const cues: SrtCue[] = [];
  for (const line of events.split("\n")) {
    const format = /^Format:\s*(.*)$/i.exec(line);
    if (format) {
      cols = format[1].split(",").map((c) => c.trim().toLowerCase());
      continue;
    }
    const dialogue = /^Dialogue:\s*(.*)$/i.exec(line);
    if (!dialogue) continue;
    const textIdx = cols.indexOf("text");
    const fields = dialogue[1].split(",");
    if (textIdx < 0 || fields.length <= textIdx) continue;
    const head = fields.slice(0, textIdx);
    const raw = fields.slice(textIdx).join(",");
    const start = parseTimestamp(head[cols.indexOf("start")]?.trim() ?? "");
    const end = parseTimestamp(head[cols.indexOf("end")]?.trim() ?? "");
    const body = cleanCueText(raw.replace(/\\[Nn]/g, " ").replace(/\\h/g, " "));
    if (!body || !Number.isFinite(start) || !Number.isFinite(end)) continue;
    cues.push({ start, end: end > start ? end : start + MIN_CUE_SECONDS, text: body });
  }
  return cues.sort((a, b) => a.start - b.start);
}

/** Napisy w dowolnym z formatów: SRT (nasz plik), WebVTT albo ASS (import z HeyGena). */
export function parseSubtitles(raw: string): SrtCue[] {
  const text = raw.replace(/^\uFEFF/, "");
  return /^\s*\[Script Info\]|^\[Events\]/im.test(text) ? parseAssCues(text) : parseSrt(text);
}

// ── Łamanie i cięcie kwestii ────────────────────────────────────────────────

/** Łamanie zachłanne po słowach; słowo dłuższe niż limit zostaje w swoim wierszu. */
export function layoutLines(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (current.length + 1 + word.length <= maxChars) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Dwa wiersze wyrównujemy długością: „Pożyczka pod zastaw nieruchomości / to”
 * czyta się gorzej niż „Pożyczka pod zastaw / nieruchomości to”.
 */
function balanceTwoLines(lines: string[], maxChars: number): string[] {
  if (lines.length !== 2) return lines;
  let [a, b] = lines;
  for (;;) {
    const words = a.split(" ");
    if (words.length < 2) break;
    const moved = `${words[words.length - 1]} ${b}`;
    const rest = words.slice(0, -1).join(" ");
    if (moved.length > maxChars) break;
    if (Math.abs(rest.length - moved.length) >= Math.abs(a.length - b.length)) break;
    a = rest;
    b = moved;
  }
  return [a, b];
}

/**
 * Tnie kwestie SRT na porcje mieszczące się w `maxLines` wierszach po
 * `maxChars` znaków. Czas kwestii dzielimy proporcjonalnie do liczby znaków —
 * SRT nie niesie czasów słów, a kwestie z ElevenLabs są krótkie (zdanie /
 * fraza), więc proporcja trzyma się tempa lektora.
 */
export function chunkCues(cues: SrtCue[], opts: { maxChars: number; maxLines: number }): SrtCue[] {
  const out: SrtCue[] = [];
  const perChunk = Math.max(1, opts.maxLines);
  for (const cue of cues) {
    const lines = layoutLines(cue.text, opts.maxChars);
    if (!lines.length) continue;
    const groups: string[][] = [];
    for (let i = 0; i < lines.length; i += perChunk) {
      groups.push(balanceTwoLines(lines.slice(i, i + perChunk), opts.maxChars));
    }
    const weights = groups.map((g) => g.join(" ").length);
    const total = weights.reduce((a, b) => a + b, 0);
    const duration = cue.end - cue.start;
    let t = cue.start;
    groups.forEach((group, i) => {
      const end = i === groups.length - 1 ? cue.end : t + (duration * weights[i]) / total;
      out.push({ start: t, end, text: group.join("\n") });
      t = end;
    });
  }
  return out;
}

// ── ASS ─────────────────────────────────────────────────────────────────────

export type AssDimensions = { width: number; height: number };
/** Kadr, w którym Studio renderuje rolki (HeyGen 720p pion). */
export const DEFAULT_ASS_DIMENSIONS: AssDimensions = { width: 720, height: 1280 };

const hex2 = (n: number) =>
  Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, "0");

/** "#RRGGBB" → "BBGGRR" (ASS trzyma kolory od tyłu). */
function assBgr(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const rgb = (m ? m[1] : "ffffff").toLowerCase();
  return `${rgb.slice(4, 6)}${rgb.slice(2, 4)}${rgb.slice(0, 2)}`.toUpperCase();
}

/** Pełny kolor stylu: &HAABBGGRR, alfa 00 = kryjący. */
function assColor(hex: string, alpha = 0): string {
  return `&H${hex2(alpha).toUpperCase()}${assBgr(hex)}`;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const toCentis = (sec: number) => Math.max(0, Math.round(sec * 100));
function assTime(cs: number): string {
  const h = Math.floor(cs / 360_000);
  const m = Math.floor((cs % 360_000) / 6_000);
  const s = Math.floor((cs % 6_000) / 100);
  return `${h}:${pad2(m)}:${pad2(s)}.${pad2(cs % 100)}`;
}

/** Nawiasy klamrowe otwierają w ASS blok sterujący, backslash — tag; neutralizujemy. */
function escapeAss(s: string): string {
  return s.replace(/\\/g, "/").replace(/\{/g, "(").replace(/\}/g, ")");
}

function styleLine(style: CaptionStyle): string {
  const primary = assColor(style.color);
  const outline = assColor(style.outlineColor);
  // Przy obrysie BackColour to kolor cienia; przy ramce — jej wypełnienie.
  const back = style.box
    ? assColor(style.box.color, (1 - style.box.opacity) * 255)
    : assColor("#000000", 128);
  const alignment = style.placement === "center" ? 5 : 2;
  const marginV = style.placement === "center" ? 0 : style.marginBottom;
  return [
    "Cap",
    style.font,
    style.fontSize,
    primary,
    primary,
    outline,
    back,
    style.bold ? -1 : 0,
    0,
    0,
    0,
    100,
    100,
    0,
    0,
    style.box ? 3 : 1,
    style.outline,
    style.shadow,
    alignment,
    style.marginSide,
    style.marginSide,
    marginV,
    1,
  ].join(",");
}

function dialogue(startCs: number, endCs: number, text: string): string {
  return `Dialogue: 0,${assTime(startCs)},${assTime(endCs)},Cap,,0,0,0,,${text}`;
}

/**
 * Podświetlanie słów: dla każdego słowa osobne zdarzenie z tym słowem w
 * kolorze `highlight`, reszta bez zmian. Czasy słów — proporcjonalnie do
 * liczby liter (SRT nie zna czasów słów). Zdarzenia stykają się co do
 * setnej sekundy, więc libass nie mruga między nimi.
 */
function highlightedEvents(
  cue: SrtCue,
  style: CaptionStyle,
  primaryBgr: string,
  highlightBgr: string,
): string[] {
  const lines = cue.text.split("\n").map((l) => l.split(" ").filter(Boolean));
  const words = lines.flatMap((ws, li) => ws.map((_, wi) => ({ li, wi })));
  const startCs = toCentis(cue.start);
  const endCs = toCentis(cue.end);
  const plain = dialogue(startCs, endCs, lines.map((ws) => escapeAss(ws.join(" "))).join("\\N"));
  if (words.length <= 1 || endCs <= startCs) return [plain];

  const weights = words.map(({ li, wi }) =>
    Math.max(1, lines[li][wi].replace(/[^\p{L}\p{N}]/gu, "").length),
  );
  const total = weights.reduce((a, b) => a + b, 0);
  const bounds = [startCs];
  let acc = 0;
  for (let i = 0; i < words.length - 1; i++) {
    acc += weights[i];
    bounds.push(startCs + Math.round(((endCs - startCs) * acc) / total));
  }
  bounds.push(endCs);

  return words.map((current, k) => {
    const text = lines
      .map((ws, li) =>
        ws
          .map((w, wi) =>
            li === current.li && wi === current.wi
              ? `{\\1c&H${highlightBgr}&}${escapeAss(w)}{\\1c&H${primaryBgr}&}`
              : escapeAss(w),
          )
          .join(" "),
      )
      .join("\\N");
    return dialogue(bounds[k], bounds[k + 1], text);
  });
}

// ── Znaczek „AI" ────────────────────────────────────────────────────────────
//
// Oznaczenie treści wygenerowanej przez AI: mała półprzezroczysta „pigułka"
// z napisem AI w prawym górnym rogu, przez cały film. Rysujemy ją w tym samym
// pliku ASS co napisy (tryb rysowania libass `\p1`), więc usługa wypalania
// nie potrzebuje żadnych zmian. Wymiary w pikselach kadru 720×1280 — libass
// skaluje je do faktycznej rozdzielczości.
//
// Pozycja: prawy górny róg, ale PONIŻEJ paska aplikacji (Reels / TikTok /
// Shorts trzymają tam ikonki aparatu i wyszukiwania, ok. 110 px w tym kadrze).
// Prawy brzeg niżej zajmują przyciski polubień, więc wyżej niż ~40% kadru.

export type AiBadgeSpec = {
  text: string;
  /** Szerokość i wysokość pigułki. */
  width: number;
  height: number;
  radius: number;
  /** Odległość od prawej krawędzi i od góry kadru. */
  marginRight: number;
  marginTop: number;
  fontSize: number;
  /** Wypełnienie pigułki i jego krycie (0–1). */
  fill: string;
  fillOpacity: number;
  /** Cienka ramka — czytelność na jasnym i ciemnym tle. */
  border: string;
  borderWidth: number;
  textColor: string;
};

export const AI_BADGE: AiBadgeSpec = {
  text: "AI",
  width: 64,
  height: 36,
  radius: 10,
  marginRight: 28,
  marginTop: 140,
  fontSize: 22,
  fill: "#000000",
  fillOpacity: 0.45,
  border: "#FFFFFF",
  borderWidth: 1.5,
  textColor: "#FFFFFF",
};

/** Do końca filmu — libass rysuje zdarzenie tylko w czasie trwania wideo. */
const BADGE_END_CS = 9 * 360_000 + 59 * 6_000 + 59 * 100 + 99;
/** Warstwa nad napisami (te leżą na 0). */
const BADGE_LAYER = 5;

const badgeStyleLine = (spec: AiBadgeSpec) =>
  [
    "AiBadge",
    "Inter",
    spec.fontSize,
    assColor(spec.textColor),
    assColor(spec.textColor),
    assColor(spec.border),
    assColor("#000000", 255),
    -1,
    0,
    0,
    0,
    100,
    100,
    1,
    0,
    1,
    0,
    0,
    7,
    0,
    0,
    0,
    1,
  ].join(",");

/** Zaokrąglony prostokąt w poleceniach rysowania ASS (0,0 = lewy górny róg). */
function roundedRectPath(w: number, h: number, r: number): string {
  const n = (v: number) => Math.round(v * 100) / 100;
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  return [
    `m ${n(rr)} 0`,
    `l ${n(w - rr)} 0`,
    `b ${n(w)} 0 ${n(w)} 0 ${n(w)} ${n(rr)}`,
    `l ${n(w)} ${n(h - rr)}`,
    `b ${n(w)} ${n(h)} ${n(w)} ${n(h)} ${n(w - rr)} ${n(h)}`,
    `l ${n(rr)} ${n(h)}`,
    `b 0 ${n(h)} 0 ${n(h)} 0 ${n(h - rr)}`,
    `l 0 ${n(rr)}`,
    `b 0 0 0 0 ${n(rr)} 0`,
  ].join(" ");
}

/** Dwa zdarzenia znaczka: pigułka (rysunek) i napis na jej środku. */
export function aiBadgeEvents(
  dims: AssDimensions = DEFAULT_ASS_DIMENSIONS,
  spec: AiBadgeSpec = AI_BADGE,
): string[] {
  const x = dims.width - spec.marginRight - spec.width;
  const y = spec.marginTop;
  const cx = Math.round(x + spec.width / 2);
  const cy = Math.round(y + spec.height / 2);
  const fillAlpha = hex2((1 - spec.fillOpacity) * 255).toUpperCase();
  const end = assTime(BADGE_END_CS);
  const shape =
    `{\\an7\\pos(${x},${y})\\p1\\1c&H${assBgr(spec.fill)}&\\1a&H${fillAlpha}&` +
    `\\3c&H${assBgr(spec.border)}&\\3a&H40&\\bord${spec.borderWidth}\\shad0}` +
    `${roundedRectPath(spec.width, spec.height, spec.radius)}{\\p0}`;
  const label =
    `{\\an5\\pos(${cx},${cy})\\fnInter\\fs${spec.fontSize}\\b1\\fsp1` +
    `\\1c&H${assBgr(spec.textColor)}&\\bord0\\shad0}${escapeAss(spec.text)}`;
  return [
    `Dialogue: ${BADGE_LAYER},${assTime(0)},${end},AiBadge,,0,0,0,,${shape}`,
    `Dialogue: ${BADGE_LAYER + 1},${assTime(0)},${end},AiBadge,,0,0,0,,${label}`,
  ];
}

// ── Nakładki dynamiczne ─────────────────────────────────────────────────────
//
// Elementy ekranowe rolki z paczki 250 pytań (SHORTS_DYNAMIC_ELEMENTS w
// shorts-script.ts), wypalane w obrazie zamiast być instrukcją montażową:
//   * znacznik kategorii — duży na środku od 0 s, potem zmniejsza się
//     (\move + \t ze skalą) i zostaje mały u góry kadru do końca filmu;
//   * DUŻE pytanie na środku — dokładnie to, co mówi lektor; pojawia się,
//     gdy znacznik rusza do góry, i znika z końcem kwestii SRT, w której
//     pytanie pada (overlaysWithCueTiming).
// Ta sama droga co znaczek „AI": zdarzenia w pliku ASS, usługa wypalania
// bez żadnych zmian. Wymiary w pikselach kadru 720×1280.

export type DynamicOverlays = {
  /** Znacznik kategorii; wiersze rozdziela "\n". */
  tag: string;
  /** Do tej sekundy znacznik jest duży na środku; potem mały u góry. */
  tagHoldSeconds: number;
  /** Pytanie rolki — dokładnie tekst mówiony przez lektora. */
  headline: string;
  headlineStartSeconds: number;
  /** Koniec pytania; gdy jest SRT, liczy go overlaysWithCueTiming. */
  headlineEndSeconds: number;
};

/** Układ nakładek w kadrze 720×1280 (ułamki wysokości — libass przeskaluje). */
export const DYNAMIC_OVERLAY_LAYOUT = {
  tagFontSize: 40,
  /** Środek dużego znacznika (ułamek wysokości kadru). */
  tagBigY: 0.3125,
  /** Środek małego znacznika u góry — poniżej paska aplikacji (~110 px). */
  tagSmallY: 0.117,
  /** Skala małego znacznika w % (po animacji \t). */
  tagSmallScale: 42,
  headlineFontSize: 56,
  /** Środek pytania (ułamek wysokości kadru). */
  headlineY: 0.5,
  /** Maks. znaków w wierszu pytania przy fontSize 56 w kadrze 720 px. */
  headlineMaxChars: 18,
} as const;

/** Warstwy nakładek: nad napisami (0), pod znaczkiem „AI" (5/6). */
const OVERLAY_TAG_LAYER = 3;
const OVERLAY_HEADLINE_LAYER = 4;

const overlayStyleLines = (): string[] => {
  const common = (name: string, fontSize: number, outline: number, shadow: number) =>
    [
      name,
      "Inter",
      fontSize,
      assColor("#FFFFFF"),
      assColor("#FFFFFF"),
      assColor("#000000"),
      assColor("#000000", 128),
      -1,
      0,
      0,
      0,
      100,
      100,
      0,
      0,
      1,
      outline,
      shadow,
      5,
      40,
      40,
      0,
      1,
    ].join(",");
  return [
    common("OvTag", DYNAMIC_OVERLAY_LAYOUT.tagFontSize, 3, 0),
    common("OvHead", DYNAMIC_OVERLAY_LAYOUT.headlineFontSize, 4, 1),
  ];
};

const overlayText = (text: string, maxChars?: number): string => {
  const lines = maxChars ? layoutLines(text, maxChars) : text.split("\n");
  return lines.map((l) => escapeAss(l)).join("\\N");
};

/**
 * Zdarzenia nakładek: znacznik w dwóch fazach (duży na środku → animacja
 * zmniejszenia do góry → mały do końca filmu) i pytanie na środku z \fad.
 */
export function dynamicOverlayEvents(
  ov: DynamicOverlays,
  dims: AssDimensions = DEFAULT_ASS_DIMENSIONS,
): string[] {
  const L = DYNAMIC_OVERLAY_LAYOUT;
  const cx = Math.round(dims.width / 2);
  const bigY = Math.round(dims.height * L.tagBigY);
  const smallY = Math.round(dims.height * L.tagSmallY);
  const headY = Math.round(dims.height * L.headlineY);
  const toMs = (sec: number) => Math.max(0, Math.round(sec * 1000));

  // Zmniejszenie rusza, gdy pojawia się pytanie, i kończy z końcem fazy dużej.
  const shrinkFromMs = toMs(Math.min(ov.headlineStartSeconds, ov.tagHoldSeconds));
  const shrinkToMs = toMs(ov.tagHoldSeconds);
  const holdCs = toCentis(ov.tagHoldSeconds);
  const tag = overlayText(ov.tag);
  const tagBig =
    `{\\an5\\move(${cx},${bigY},${cx},${smallY},${shrinkFromMs},${shrinkToMs})` +
    `\\t(${shrinkFromMs},${shrinkToMs},\\fscx${L.tagSmallScale}\\fscy${L.tagSmallScale})` +
    `\\fad(120,0)}${tag}`;
  const tagSmall = `{\\an5\\pos(${cx},${smallY})\\fscx${L.tagSmallScale}\\fscy${L.tagSmallScale}}${tag}`;

  const headStartCs = toCentis(ov.headlineStartSeconds);
  const headEndCs = Math.max(toCentis(ov.headlineEndSeconds), headStartCs + 100);
  const head = `{\\an5\\pos(${cx},${headY})\\fad(160,200)}${overlayText(
    ov.headline,
    L.headlineMaxChars,
  )}`;

  return [
    `Dialogue: ${OVERLAY_TAG_LAYER},${assTime(0)},${assTime(holdCs)},OvTag,,0,0,0,,${tagBig}`,
    `Dialogue: ${OVERLAY_TAG_LAYER},${assTime(holdCs)},${assTime(BADGE_END_CS)},OvTag,,0,0,0,,${tagSmall}`,
    `Dialogue: ${OVERLAY_HEADLINE_LAYER},${assTime(headStartCs)},${assTime(headEndCs)},OvHead,,0,0,0,,${head}`,
  ];
}

const normalizeWords = (text: string): string[] =>
  text
    .toLocaleLowerCase("pl-PL")
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);

/**
 * Dopasowuje koniec pytania do kwestii SRT, w której lektor je kończy
 * (słowa pytania jako podciąg słów kolejnych kwestii). Bez dopasowania
 * zostaje szacunek z `headlineEndSeconds`.
 */
export function overlaysWithCueTiming(ov: DynamicOverlays, cues: SrtCue[]): DynamicOverlays {
  const target = normalizeWords(ov.headline);
  if (!target.length) return ov;
  let i = 0;
  for (const cue of cues) {
    for (const word of normalizeWords(cue.text)) {
      if (word === target[i]) i++;
      if (i === target.length) return { ...ov, headlineEndSeconds: cue.end + 0.25 };
    }
  }
  return ov;
}

export type AssOptions = {
  /** Dorysuj znaczek „AI" w rogu (przez cały film). */
  aiBadge?: boolean;
  /** Wypal nakładki dynamiczne (znacznik kategorii + duże pytanie). */
  overlays?: DynamicOverlays | null;
};

function assDocument(opts: {
  comment: string;
  dims: AssDimensions;
  styles: string[];
  events: string[];
}): string {
  return [
    "[Script Info]",
    `; ${opts.comment}`,
    "ScriptType: v4.00+",
    `PlayResX: ${opts.dims.width}`,
    `PlayResY: ${opts.dims.height}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "YCbCr Matrix: None",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    ...opts.styles.map((s) => `Style: ${s}`),
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...opts.events,
    "",
  ].join("\n");
}

/**
 * Plik ASS bez napisów — sam znaczek „AI", same nakładki dynamiczne albo
 * oba naraz (rolka zamówiona bez napisów). `null`, gdy nie ma czego wypalać.
 */
export function extrasAss(
  opts: { aiBadge?: boolean; overlays?: DynamicOverlays | null },
  dims: AssDimensions = DEFAULT_ASS_DIMENSIONS,
): string | null {
  const styles: string[] = [];
  const events: string[] = [];
  if (opts.overlays) {
    styles.push(...overlayStyleLines());
    events.push(...dynamicOverlayEvents(opts.overlays, dims));
  }
  if (opts.aiBadge) {
    styles.push(badgeStyleLine(AI_BADGE));
    events.push(...aiBadgeEvents(dims));
  }
  if (!events.length) return null;
  return assDocument({
    comment: `Finance You — ${[opts.overlays ? "nakładki dynamiczne" : null, opts.aiBadge ? "znaczek AI" : null].filter(Boolean).join(" + ")}`,
    dims,
    styles,
    events,
  });
}

/**
 * Plik ASS z samym znaczkiem „AI" — do rolki bez napisów; usługa wypalania
 * dokłada wtedy tylko znaczek.
 */
export function aiBadgeAss(dims: AssDimensions = DEFAULT_ASS_DIMENSIONS): string {
  return extrasAss({ aiBadge: true }, dims)!;
}

/**
 * Buduje plik ASS: nagłówek z kadrem, styl `Cap` i zdarzenia (plus znaczek
 * „AI" i nakładki dynamiczne, gdy zamówione). Kwestie powinny być już pocięte
 * (`chunkCues`) — `WrapStyle: 2` wyłącza łamanie po stronie libass, żeby
 * wiersze wyglądały dokładnie tak, jak je policzyliśmy.
 */
export function buildAss(
  cues: SrtCue[],
  style: CaptionStyle,
  dims: AssDimensions = DEFAULT_ASS_DIMENSIONS,
  opts: AssOptions = {},
): string {
  const primaryBgr = assBgr(style.color);
  const highlightBgr = style.highlight ? assBgr(style.highlight) : null;
  const events: string[] = [];
  for (const raw of cues) {
    const cue = style.uppercase ? { ...raw, text: raw.text.toLocaleUpperCase("pl-PL") } : raw;
    if (highlightBgr) {
      events.push(...highlightedEvents(cue, style, primaryBgr, highlightBgr));
      continue;
    }
    const text = cue.text
      .split("\n")
      .map((l) => escapeAss(l))
      .join("\\N");
    events.push(dialogue(toCentis(cue.start), toCentis(cue.end), text));
  }
  const styles = [styleLine(style)];
  if (opts.overlays) {
    styles.push(...overlayStyleLines());
    events.push(...dynamicOverlayEvents(opts.overlays, dims));
  }
  if (opts.aiBadge) {
    styles.push(badgeStyleLine(AI_BADGE));
    events.push(...aiBadgeEvents(dims));
  }
  const extras = [
    opts.overlays ? "nakładki dynamiczne" : null,
    opts.aiBadge ? "znaczek AI" : null,
  ].filter(Boolean);
  return assDocument({
    comment: `Finance You — napisy własne (styl: ${style.id})${extras.length ? ` + ${extras.join(" + ")}` : ""}`,
    dims,
    styles,
    events,
  });
}

/**
 * Cała droga SRT → ASS dla wybranego stylu. `null`, gdy w SRT nie ma ani
 * jednej kwestii — wtedy nie ma czego wypalać.
 */
export function srtToAss(
  srt: string,
  styleId: CustomCaptionStyleId,
  dims: AssDimensions = DEFAULT_ASS_DIMENSIONS,
  opts: AssOptions = {},
): string | null {
  const style = CUSTOM_CAPTION_STYLES[styleId];
  // Zabezpieczenie dla SRT spoza Studia (import filmu z HeyGena): nazwa firmy
  // z rozpoznawania mowy bywa przekręcona („fajnasiu") — poprawiamy ją, zanim
  // cokolwiek trafi na obraz. Dla SRT z tekstu scenariusza to przejście puste.
  const parsed = fixBrandInCues(parseSubtitles(srt));
  const cues = chunkCues(parsed, {
    maxChars: style.maxChars,
    maxLines: style.maxLines,
  });
  if (!cues.length) return null;
  // Koniec dużego pytania dopasowujemy do kwestii, w której lektor je kończy.
  const overlays = opts.overlays ? overlaysWithCueTiming(opts.overlays, parsed) : opts.overlays;
  return buildAss(cues, style, dims, { ...opts, overlays });
}

// ── Podgląd w panelu ────────────────────────────────────────────────────────

function cssRgba(hex: string, opacity: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const rgb = m ? m[1] : "000000";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(rgb.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Przybliżenie stylu w CSS do podglądu w panelu (kadr pomniejszony do
 * ~1/3). To orientacja, nie render — prawdziwy wygląd daje libass.
 */
export function captionPreviewCss(style: CaptionStyle, scale = 0.32): Record<string, string> {
  const px = (v: number) => `${Math.round(v * scale * 10) / 10}px`;
  const css: Record<string, string> = {
    fontFamily: `"${style.font}", system-ui, sans-serif`,
    fontWeight: style.bold ? "800" : "500",
    fontSize: px(style.fontSize),
    lineHeight: "1.15",
    color: style.color,
    textTransform: style.uppercase ? "uppercase" : "none",
    textAlign: "center",
  };
  if (style.box) {
    css.background = cssRgba(style.box.color, style.box.opacity);
    css.padding = `${px(style.outline)} ${px(style.outline * 1.5)}`;
    css.borderRadius = "4px";
  } else {
    const o = px(style.outline);
    const dirs = ["-1 -1", "1 -1", "-1 1", "1 1", "0 -1", "0 1", "-1 0", "1 0"];
    css.textShadow = dirs
      .map((d) => {
        const [x, y] = d.split(" ");
        return `calc(${o} * ${x}) calc(${o} * ${y}) 0 ${style.outlineColor}`;
      })
      .concat(style.shadow ? [`0 ${px(style.outline + style.shadow)} 2px rgba(0,0,0,.6)`] : [])
      .join(", ");
  }
  return css;
}
