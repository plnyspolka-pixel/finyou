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
  // Dyskretnie: mocno przezroczysta pigułka — ma być czytelna, nie krzyczeć.
  fillOpacity: 0.3,
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
    `\\3c&H${assBgr(spec.border)}&\\3a&H78&\\bord${spec.borderWidth}\\shad0}` +
    `${roundedRectPath(spec.width, spec.height, spec.radius)}{\\p0}`;
  const label =
    `{\\an5\\pos(${cx},${cy})\\fnInter\\fs${spec.fontSize}\\b1\\fsp1` +
    `\\1c&H${assBgr(spec.textColor)}&\\1a&H38&\\bord0\\shad0}${escapeAss(spec.text)}`;
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
//
// WYGLĄD: szata graficzna strony (system „dark-glow navy+gold" ze
// src/styles.css, sekcja .fy-marketing): znacznik to złoty tekst na
// granatowej plakietce (BorderStyle 3 — libass dopasowuje plakietkę do
// tekstu, więc skaluje się z animacją), pytanie — biel z granatowym obrysem
// i złotym błyskiem po pojawieniu się (\t po \1c). Pod oboma leży miękka
// niebieska poświata (rozmyty obrys \bord+\blur w kolorze akcentu) — jak
// „blue glow" cieni na stronie. Czcionka zostaje Inter: obraz Dockera usługi
// nie ma Montserrata, a Inter to najbliższy dostępny geometryczny sans.

export type OverlayCardRow = {
  /** Znak przed tekstem: "check" = złoty ptaszek, "dot" = złota kropka. */
  icon?: "check" | "dot" | null;
  text: string;
  /** Wartość za tekstem, złota (np. kwota, procent). */
  value?: string | null;
};

/**
 * Karta informacyjna (checklista, tabelka, karta z liczbą): granatowy panel
 * z nagłówkiem i wierszami odsłanianymi po kolei. Rozmiar panelu liczymy z
 * długości wierszy (szacunek szerokości znaków Inter) — treść kart jest
 * nasza i krótka, więc szacunek wystarcza.
 */
export type OverlayCard = {
  /** Złoty nagłówek karty (podany tekst, zwykle wielkie litery). */
  title?: string | null;
  rows: OverlayCardRow[];
  /** Start karty; gdy jest syncText i SRT, liczy go overlaysWithCueTiming. */
  startSeconds: number;
  /** Koniec karty; null = do końca filmu. */
  endSeconds?: number | null;
  /**
   * Mówiony tekst, przy którym karta ma wejść. Gdy nie da się go znaleźć
   * w SRT (np. zmieniony scenariusz), overlaysWithCueTiming USUWA kartę —
   * lepiej bez karty niż karta nie na temat.
   */
  syncText?: string | null;
  /** Środek karty jako ułamek wysokości kadru (domyślnie z layoutu). */
  y?: number;
};

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
  /** Karty informacyjne (checklisty, tabelki) — opcjonalne. */
  cards?: OverlayCard[];
};

/**
 * Kolory nakładek — tokeny systemu „dark-glow navy+gold" (src/styles.css,
 * .fy-marketing); wartości oklch przeliczone na hex.
 */
export const OVERLAY_BRAND = {
  /** Wypełnienie plakietki znacznika (--popover). */
  navy: "#0D1638",
  navyOpacity: 0.82,
  /** Obrys i cień pytania — granat tła strony (--background). */
  navyDeep: "#070B22",
  /** Złoto brandu: tekst znacznika i błysk pytania (--gold-500 / --gold-600). */
  gold: "#EABE4A",
  goldLight: "#EFCE6F",
  /** Niebieska poświata jak cienie .fy-marketing (--accent). */
  glow: "#4F8BF0",
  /** Krawędź kart jak --border strony (rgba(84,124,214,…)). */
  border: "#547CD6",
} as const;

/** Układ nakładek w kadrze 720×1280 (ułamki wysokości — libass przeskaluje). */
export const DYNAMIC_OVERLAY_LAYOUT = {
  tagFontSize: 40,
  /** Wewnętrzny margines plakietki znacznika (Outline przy BorderStyle 3). */
  tagPadding: 10,
  /** Rozstrzelenie liter znacznika (jak --tracking-wide strony). */
  tagSpacing: 2,
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
  /** Rozmycie i zasięg poświaty (px); przy znaczniku wychodzi poza plakietkę. */
  glowSize: 8,
} as const;

/** Układ kart informacyjnych w kadrze 720×1280. */
export const OVERLAY_CARD_LAYOUT = {
  fontSize: 34,
  titleFontSize: 25,
  /** Rozstrzelenie liter nagłówka karty. */
  titleSpacing: 3,
  padding: 26,
  rowHeight: 52,
  titleHeight: 46,
  cornerRadius: 18,
  /** Szacunek szerokości znaku Inter bold jako ułamek fontSize. */
  charWidth: 0.56,
  /** Miejsce na ikonę (ptaszek/kropka) z odstępem. */
  iconWidth: 44,
  /** Środek karty (ułamek wysokości kadru) — między pytaniem a napisami. */
  defaultY: 0.42,
  /** Odstęp między odsłanianiem kolejnych wierszy (s). */
  revealStagger: 0.45,
} as const;

/** Warstwy nakładek: nad napisami (0), pod znaczkiem „AI" (5/6). */
const OVERLAY_GLOW_LAYER = 2;
const OVERLAY_TAG_LAYER = 3;
const OVERLAY_HEADLINE_LAYER = 4;

const overlayStyleLines = (): string[] => {
  const L = DYNAMIC_OVERLAY_LAYOUT;
  const B = OVERLAY_BRAND;
  const line = (
    name: string,
    fontSize: number,
    primary: string,
    outline: string,
    back: string,
    spacing: number,
    borderStyle: 1 | 3,
    outlineWidth: number,
    shadow: number,
  ) =>
    [
      name,
      "Inter",
      fontSize,
      primary,
      primary,
      outline,
      back,
      -1,
      0,
      0,
      0,
      100,
      100,
      spacing,
      0,
      borderStyle,
      outlineWidth,
      shadow,
      5,
      40,
      40,
      0,
      1,
    ].join(",");
  const navyFill = assColor(B.navy, (1 - B.navyOpacity) * 255);
  return [
    // Złoty tekst na granatowej plakietce; Outline = wewnętrzny margines.
    line(
      "OvTag",
      L.tagFontSize,
      assColor(B.gold),
      navyFill,
      navyFill,
      L.tagSpacing,
      3,
      L.tagPadding,
      0,
    ),
    // Białe pytanie z granatowym obrysem i miękkim cieniem.
    line(
      "OvHead",
      L.headlineFontSize,
      assColor("#FFFFFF"),
      assColor(B.navyDeep),
      assColor(B.navyDeep, 128),
      0,
      1,
      4,
      2,
    ),
    // Poświata: sam rozmyty obrys akcentu (\bord/\blur w zdarzeniu),
    // wypełnienie wygaszane tagiem \1a&HFF&.
    line(
      "OvGlow",
      L.tagFontSize,
      assColor("#FFFFFF"),
      assColor(B.glow),
      assColor(B.glow, 255),
      0,
      1,
      0,
      0,
    ),
    // Karty: tekst wierszy i rysunek panelu (kolory nadają tagi w zdarzeniu).
    line(
      "OvCard",
      OVERLAY_CARD_LAYOUT.fontSize,
      assColor("#FFFFFF"),
      assColor(B.navyDeep),
      assColor(B.navyDeep, 255),
      0,
      1,
      0,
      0,
    ),
  ];
};

const overlayText = (text: string, maxChars?: number): string => {
  const lines = maxChars ? layoutLines(text, maxChars) : text.split("\n");
  return lines.map((l) => escapeAss(l)).join("\\N");
};

const CARD_ICONS = { check: "✓", dot: "•" } as const;

/**
 * Zdarzenia jednej karty: poświata panelu, granatowy panel (rysunek ASS),
 * złoty nagłówek i wiersze odsłaniane po kolei (każdy z \fad i lekkim
 * uniesieniem \move — wejście jak karty na stronie).
 */
export function overlayCardEvents(
  card: OverlayCard,
  dims: AssDimensions = DEFAULT_ASS_DIMENSIONS,
): string[] {
  if (!card.rows.length) return [];
  const C = OVERLAY_CARD_LAYOUT;
  const B = OVERLAY_BRAND;
  const hasIcons = card.rows.some((r) => r.icon);
  const rowChars = (r: OverlayCardRow) => r.text.length + (r.value ? r.value.length + 2 : 0);
  const maxChars = Math.max(
    ...card.rows.map(rowChars),
    card.title ? Math.round((card.title.length * C.titleFontSize) / C.fontSize) : 0,
  );
  const innerW = (hasIcons ? C.iconWidth : 0) + Math.ceil(maxChars * C.fontSize * C.charWidth);
  const panelW = Math.min(Math.max(C.padding * 2 + innerW, 300), dims.width - 72);
  const panelH = C.padding * 2 + (card.title ? C.titleHeight : 0) + card.rows.length * C.rowHeight;
  const cy = Math.round(dims.height * (card.y ?? C.defaultY));
  const panelX = Math.round((dims.width - panelW) / 2);
  const panelY = Math.round(cy - panelH / 2);

  const startCs = toCentis(card.startSeconds);
  const endCs =
    card.endSeconds == null ? BADGE_END_CS : Math.max(toCentis(card.endSeconds), startCs + 100);
  const tStart = assTime(startCs);
  const tEnd = assTime(endCs);
  const gold = assBgr(B.gold);
  const navyAlpha = hex2((1 - B.navyOpacity) * 255).toUpperCase();
  const path = roundedRectPath(panelW, panelH, C.cornerRadius);
  // Wejście: lekkie uniesienie + \fad, jak karty .fy-marketing.
  const rise = (x: number, y: number, ms: number) => `\\move(${x},${y + 16},${x},${y},0,${ms})`;

  const events: string[] = [
    `Dialogue: ${OVERLAY_GLOW_LAYER},${tStart},${tEnd},OvGlow,,0,0,0,,` +
      `{\\an7${rise(panelX, panelY, 260)}\\fad(200,0)\\p1\\1a&HFF&\\bord10\\blur14` +
      `\\3c&H${assBgr(B.glow)}&\\3a&H68&}${path}{\\p0}`,
    `Dialogue: ${OVERLAY_TAG_LAYER},${tStart},${tEnd},OvCard,,0,0,0,,` +
      `{\\an7${rise(panelX, panelY, 260)}\\fad(200,0)\\p1\\1c&H${assBgr(B.navy)}&\\1a&H${navyAlpha}&` +
      `\\3c&H${assBgr(B.border)}&\\3a&H90&\\bord1.5\\shad0}${path}{\\p0}`,
  ];

  let contentTop = panelY + C.padding;
  if (card.title) {
    const ty = Math.round(contentTop + C.titleHeight / 2);
    events.push(
      `Dialogue: ${OVERLAY_HEADLINE_LAYER},${tStart},${tEnd},OvCard,,0,0,0,,` +
        `{\\an5${rise(Math.round(dims.width / 2), ty, 260)}\\fad(200,0)` +
        `\\fs${C.titleFontSize}\\fsp${C.titleSpacing}\\1c&H${gold}&\\bord0\\shad0}${escapeAss(card.title)}`,
    );
    contentTop += C.titleHeight;
  }

  const textX = panelX + C.padding;
  card.rows.forEach((row, i) => {
    const ry = Math.round(contentTop + i * C.rowHeight + C.rowHeight / 2);
    const rowStartCs = startCs + 25 + Math.round(i * C.revealStagger * 100);
    const icon = row.icon ? `{\\1c&H${gold}&}${CARD_ICONS[row.icon]}\\h\\h{\\1c&HFFFFFF&}` : "";
    const value = row.value ? `\\h\\h{\\1c&H${gold}&}${escapeAss(row.value)}` : "";
    events.push(
      `Dialogue: ${OVERLAY_HEADLINE_LAYER},${assTime(Math.min(rowStartCs, endCs))},${tEnd},OvCard,,0,0,0,,` +
        `{\\an4${rise(textX, ry, 220)}\\fad(150,0)\\bord0\\shad0}${icon}${escapeAss(row.text)}${value}`,
    );
  });

  return events;
}

/**
 * Zdarzenia nakładek: znacznik w dwóch fazach (duży na środku → animacja
 * zmniejszenia do góry → mały do końca filmu) i pytanie na środku z \fad.
 * Każdy element ma pod sobą warstwę poświaty (OvGlow), a złoto „połyskuje":
 * po pojawieniu się przechodzi \t-em w jaśniejszy odcień i wraca.
 */
export function dynamicOverlayEvents(
  ov: DynamicOverlays,
  dims: AssDimensions = DEFAULT_ASS_DIMENSIONS,
): string[] {
  const L = DYNAMIC_OVERLAY_LAYOUT;
  const B = OVERLAY_BRAND;
  const cx = Math.round(dims.width / 2);
  const bigY = Math.round(dims.height * L.tagBigY);
  const smallY = Math.round(dims.height * L.tagSmallY);
  const headY = Math.round(dims.height * L.headlineY);
  const toMs = (sec: number) => Math.max(0, Math.round(sec * 1000));
  const gold = assBgr(B.gold);
  const goldLight = assBgr(B.goldLight);

  // Zmniejszenie rusza, gdy pojawia się pytanie, i kończy z końcem fazy dużej.
  const shrinkFromMs = toMs(Math.min(ov.headlineStartSeconds, ov.tagHoldSeconds));
  const shrinkToMs = toMs(ov.tagHoldSeconds);
  const holdCs = toCentis(ov.tagHoldSeconds);
  const tag = overlayText(ov.tag);
  const tagAnim =
    `\\move(${cx},${bigY},${cx},${smallY},${shrinkFromMs},${shrinkToMs})` +
    `\\t(${shrinkFromMs},${shrinkToMs},\\fscx${L.tagSmallScale}\\fscy${L.tagSmallScale})` +
    `\\fad(120,0)`;
  const tagRest = `\\pos(${cx},${smallY})\\fscx${L.tagSmallScale}\\fscy${L.tagSmallScale}`;
  // Połysk złota: rozjaśnienie i powrót tuż po pojawieniu się znacznika.
  const tagShimmer = `\\t(0,700,\\1c&H${goldLight}&)\\t(700,1400,\\1c&H${gold}&)`;
  // Poświata: niewidoczne wypełnienie + rozmyty obrys akcentu; przy
  // plakietce obrys musi wyjść poza jej margines, żeby halo było widać.
  const glowOf = (bord: number) =>
    `\\1a&HFF&\\bord${bord}\\blur${L.glowSize + 4}\\3c&H${assBgr(B.glow)}&\\3a&H60&`;
  const tagGlow = glowOf(L.tagPadding + L.glowSize) + `\\fsp${L.tagSpacing}`;

  const headStartCs = toCentis(ov.headlineStartSeconds);
  const headEndCs = Math.max(toCentis(ov.headlineEndSeconds), headStartCs + 100);
  const headText = overlayText(ov.headline, L.headlineMaxChars);
  const headPos = `\\pos(${cx},${headY})\\fad(160,200)`;
  // Złoty błysk po pojawieniu się pytania, potem czysta biel.
  const headShimmer = `\\t(250,850,\\1c&H${goldLight}&)\\t(850,1500,\\1c&HFFFFFF&)`;

  const t0 = assTime(0);
  const tHold = assTime(holdCs);
  const tEnd = assTime(BADGE_END_CS);
  const tHeadStart = assTime(headStartCs);
  const tHeadEnd = assTime(headEndCs);
  return [
    `Dialogue: ${OVERLAY_GLOW_LAYER},${t0},${tHold},OvGlow,,0,0,0,,{\\an5${tagAnim}${tagGlow}}${tag}`,
    `Dialogue: ${OVERLAY_TAG_LAYER},${t0},${tHold},OvTag,,0,0,0,,{\\an5${tagAnim}${tagShimmer}}${tag}`,
    `Dialogue: ${OVERLAY_GLOW_LAYER},${tHold},${tEnd},OvGlow,,0,0,0,,{\\an5${tagRest}${tagGlow}}${tag}`,
    `Dialogue: ${OVERLAY_TAG_LAYER},${tHold},${tEnd},OvTag,,0,0,0,,{\\an5${tagRest}}${tag}`,
    `Dialogue: ${OVERLAY_GLOW_LAYER},${tHeadStart},${tHeadEnd},OvGlow,,0,0,0,,{\\an5${headPos}\\fs${L.headlineFontSize}${glowOf(L.glowSize)}}${headText}`,
    `Dialogue: ${OVERLAY_HEADLINE_LAYER},${tHeadStart},${tHeadEnd},OvHead,,0,0,0,,{\\an5${headPos}${headShimmer}}${headText}`,
    ...(ov.cards ?? []).flatMap((card) => overlayCardEvents(card, dims)),
  ];
}

const normalizeWords = (text: string): string[] =>
  text
    .toLocaleLowerCase("pl-PL")
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);

/**
 * Kiedy lektor wypowiada dany tekst: słowa tekstu jako podciąg słów
 * kolejnych kwestii; start = początek kwestii z pierwszym słowem,
 * koniec = koniec kwestii z ostatnim. `null` bez pełnego dopasowania.
 */
function spokenRange(cues: SrtCue[], text: string): { start: number; end: number } | null {
  const target = normalizeWords(text);
  if (!target.length) return null;
  let i = 0;
  let start: number | null = null;
  for (const cue of cues) {
    for (const word of normalizeWords(cue.text)) {
      if (word !== target[i]) continue;
      if (i === 0) start = cue.start;
      i++;
      if (i === target.length) return { start: start!, end: cue.end };
    }
  }
  return null;
}

/**
 * Dopasowuje czasy nakładek do kwestii SRT: koniec pytania do kwestii,
 * w której lektor je kończy (bez dopasowania zostaje szacunek), a start
 * każdej karty z `syncText` do kwestii, w której ten tekst się zaczyna —
 * karta bez dopasowania WYPADA (scenariusz mógł zostać zmieniony w panelu).
 */
export function overlaysWithCueTiming(ov: DynamicOverlays, cues: SrtCue[]): DynamicOverlays {
  const out: DynamicOverlays = { ...ov };
  const head = spokenRange(cues, ov.headline);
  if (head) out.headlineEndSeconds = head.end + 0.25;
  if (ov.cards?.length) {
    out.cards = ov.cards.flatMap((card) => {
      if (!card.syncText) return [card];
      const range = spokenRange(cues, card.syncText);
      return range ? [{ ...card, startSeconds: range.start }] : [];
    });
  }
  return out;
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
