/**
 * Raporty PDF panelu inwestora (Analityk AI) — mały silnik układu na pdf-lib.
 *
 * Czysty JS (pdf-lib + fontkit + Liberation Sans z polskimi znakami): działa
 * w przeglądarce, w Workerze i w testach. A4 z marginesami; na każdej stronie
 * pasek z okrągłym znakiem Finance You („Finance You · Analityk AI”) oraz
 * stopka „Przygotowano dla … · data” (czas polski) i „Strona n z N”.
 *
 * Bloki: tytuł, nagłówki sekcji (nie zostają same na dole strony), akapity
 * z łamaniem wierszy, pary etykieta–wartość (łamane obie kolumny), listy
 * punktowane, ogólna tabela z nagłówkiem powtarzanym po podziale strony,
 * pasek wyniku 0–100, ramka z uwagą i pasek skali A–E (GRADE_BANDS).
 *
 * Znaki spoza fontu zamieniamy na czytelne odpowiedniki (twarde i wąskie
 * spacje → spacja, ✓ → „tak”, ✗ → „nie”, ⚠ → „!”, ★ → „*”), a resztę na „?”
 * — jak w esign-pdf.ts i pdf-z-tekstu.ts.
 */
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { LIBERATION_SANS } from "@/lib/legal/legal-fonts";
import { FY_ROUND_LOGO_PNG_BASE64 } from "@/lib/esign/esign-logo";
import { GRADE_BANDS, gradeRangeLabel } from "@/lib/risk-assessment/grade-bands";
import type { RiskGrade } from "@/lib/risk-assessment/types";

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = { top: 78, right: 48, bottom: 62, left: 48 };
const CONTENT_W = A4.w - MARGIN.left - MARGIN.right;
const HEADER_H = 42;
const FOOTER_Y = 30;
const BRAND = "Finance You · Analityk AI";

const NAVY = rgb(0.11, 0.16, 0.36);
const NAVY_SOFT = rgb(0.93, 0.95, 0.99);
const INK = rgb(0.12, 0.12, 0.14);
const GRAY = rgb(0.42, 0.44, 0.5);
const LIGHT = rgb(0.86, 0.88, 0.92);
const ZEBRA = rgb(0.975, 0.98, 0.99);
const TRACK = rgb(0.92, 0.93, 0.95);
const WHITE = rgb(1, 1, 1);
const AMBER = rgb(0.96, 0.62, 0.04);
const AMBER_SOFT = rgb(1, 0.97, 0.9);

export type ReportFonts = { regular: string | Uint8Array; bold: string | Uint8Array };

export interface ReportWriterOptions {
  /** Tytuł dokumentu — metadane PDF i prawa strona paska górnego. */
  title: string;
  /** Temat w metadanych PDF (np. numer KW / Projektu). */
  subject?: string;
  /** Dla kogo przygotowano raport — stopka każdej strony. */
  preparedFor: string;
  /** Data wygenerowania (stała data → powtarzalny plik w testach). */
  generatedAt?: Date;
  /** Fonty (data-URI/base64/bajty); domyślnie Liberation Sans. */
  fonts?: ReportFonts;
}

export interface TableColumn {
  label: string;
  /** Waga szerokości kolumny (szerokości są proporcjonalne do sumy wag). */
  width: number;
  align?: "left" | "right";
}

// ── tekst ──────────────────────────────────────────────────────────────────

const znak = (cp: number) => String.fromCodePoint(cp);
const klasa = (...cps: number[]) => new RegExp(`[${cps.map(znak).join("")}]`, "g");
const REPLACEMENTS: Array<[RegExp, string]> = [
  [klasa(0x00a0, 0x2007, 0x2009, 0x200a, 0x202f), " "], // twarde, cienkie i wąskie spacje
  [klasa(0x2011), "-"], // twardy łącznik
  [klasa(0x00ad, 0x200b, 0x200c, 0x200d, 0xfe0f, 0xfeff), ""], // miękki łącznik, znaki zerowej szerokości
  [klasa(0x2713, 0x2714, 0x2705), "tak"],
  [klasa(0x2717, 0x2718, 0x274c), "nie"],
  [klasa(0x26a0), "!"],
  [klasa(0x2605, 0x2606), "*"],
  [/\t/g, "  "],
  [/\r/g, ""],
];

function replaceKnown(text: string): string {
  let t = String(text ?? "");
  for (const [re, by] of REPLACEMENTS) t = t.replace(re, by);
  return t;
}

/** Tekst gotowy do rysowania: znane zamiany, znaki spoza fontu → „?”. */
function cleanText(text: string, charset: Set<number>): string {
  let out = "";
  for (const ch of replaceKnown(text)) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 0x0a) out += ch;
    else if (cp < 0x20) continue;
    else out += cp < 0x80 || charset.has(cp) ? ch : "?";
  }
  return out;
}

/**
 * Znaki tekstu, których font nie ma (po zamianach ✓/✗ itp.) — w PDF-ie
 * wyszłyby jako „?”. Do testów modelu raportu.
 */
export async function charsOutsideFont(
  text: string,
  fonts: ReportFonts = LIBERATION_SANS,
): Promise<string[]> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fonts.regular);
  const charset = new Set(regular.getCharacterSet());
  const missing = new Set<string>();
  for (const ch of replaceKnown(text)) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x80 && !charset.has(cp)) missing.add(ch);
  }
  return [...missing];
}

/** „10 października 2026 14:05” — zawsze czas polski, niezależnie od strefy przeglądarki. */
export function formatWarsawDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** „2026-10-10” w czasie polskim — do nazw plików. */
export function warsawDateStamp(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Słowo szersze niż kolumna (np. długi numer bez spacji) dzielimy na kawałki. */
function hardSplit(word: string, font: PDFFont, size: number, maxW: number): string[] {
  if (font.widthOfTextAtSize(word, size) <= maxW) return [word];
  const out: string[] = [];
  let cur = "";
  for (const ch of word) {
    if (cur && font.widthOfTextAtSize(cur + ch, size) > maxW) {
      out.push(cur);
      cur = "";
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(" ").filter((w) => w.length > 0);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let cur = "";
    for (const w0 of words) {
      for (const w of hardSplit(w0, font, size, maxW)) {
        const cand = cur ? `${cur} ${w}` : w;
        if (!cur || font.widthOfTextAtSize(cand, size) <= maxW) cur = cand;
        else {
          lines.push(cur);
          cur = w;
        }
      }
    }
    if (cur) lines.push(cur);
  }
  return lines;
}

function truncate(text: string, font: PDFFont, size: number, maxW: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxW) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function hexColor(hex: string): RGB {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join("") : h, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// ── silnik ─────────────────────────────────────────────────────────────────

export class ReportWriter {
  private page!: PDFPage;
  private y = 0;
  /** Jedna data dla tytułu, stopek i metadanych. */
  private readonly date: Date;

  private constructor(
    private readonly doc: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
    private readonly charset: Set<number>,
    private readonly logo: PDFImage,
    private readonly opts: ReportWriterOptions,
  ) {
    this.date = opts.generatedAt ?? new Date();
    this.newPage();
  }

  static async create(opts: ReportWriterOptions): Promise<ReportWriter> {
    const fonts = opts.fonts ?? LIBERATION_SANS;
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const regular = await doc.embedFont(fonts.regular, { subset: true });
    const bold = await doc.embedFont(fonts.bold, { subset: true });
    const logo = await doc.embedPng(FY_ROUND_LOGO_PNG_BASE64);
    return new ReportWriter(doc, regular, bold, new Set(regular.getCharacterSet()), logo, opts);
  }

  private newPage(): void {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.y = A4.h - MARGIN.top;
  }

  private atPageTop(): boolean {
    return this.y >= A4.h - MARGIN.top - 0.01;
  }

  /** Zapewnia `height` pt miejsca na bieżącej stronie — inaczej nowa strona. */
  private ensure(height: number): void {
    if (this.y - height < MARGIN.bottom) this.newPage();
  }

  private clean(text: string): string {
    return cleanText(text, this.charset);
  }

  /** Odstęp pionowy (pomijany na początku strony). */
  space(height: number): void {
    if (!this.atPageTop()) this.y -= height;
  }

  /** Tytuł raportu z podtytułem i datą wygenerowania. */
  title(text: string, subtitle?: string | null): void {
    this.paragraph(text, { size: 18, bold: true, color: NAVY, after: 3 });
    if (subtitle) this.paragraph(subtitle, { size: 10.5, color: INK, after: 2 });
    const when = formatWarsawDateTime(this.date);
    this.paragraph(`Wygenerowano ${when} (czas polski)`, { size: 8, color: GRAY, after: 6 });
  }

  /** Nagłówek sekcji — wersaliki z linią; nie zostaje sam na dole strony. */
  heading(text: string): void {
    this.space(12);
    this.ensure(18 + 3 * 11.5);
    this.paragraph(text.toUpperCase(), { size: 10, bold: true, color: NAVY, after: 2 });
    this.page.drawLine({
      start: { x: MARGIN.left, y: this.y },
      end: { x: A4.w - MARGIN.right, y: this.y },
      thickness: 0.8,
      color: NAVY,
    });
    this.y -= 6;
  }

  /** Podtytuł w sekcji — pogrubiony, trzymany z następnymi wierszami. */
  subheading(text: string): void {
    this.space(5);
    this.ensure(13 + 2 * 11.5);
    this.paragraph(text, { size: 9.5, bold: true, color: INK, after: 2 });
  }

  paragraph(
    text: string,
    opts: {
      size?: number;
      bold?: boolean;
      muted?: boolean;
      color?: RGB;
      indent?: number;
      after?: number;
    } = {},
  ): void {
    const size = opts.size ?? 8.8;
    const font = opts.bold ? this.bold : this.regular;
    const x = MARGIN.left + (opts.indent ?? 0);
    const lh = size * 1.32;
    const lines = wrap(this.clean(text), font, size, A4.w - MARGIN.right - x);
    const color = opts.color ?? (opts.muted ? GRAY : INK);
    // Dwa pierwsze wiersze akapitu razem (bez „wdowy” na dole strony).
    this.ensure(Math.min(lines.length, 2) * lh);
    for (const ln of lines) {
      this.ensure(lh);
      this.y -= lh;
      if (ln) this.page.drawText(ln, { x, y: this.y, size, font, color });
    }
    this.y -= opts.after ?? 3;
  }

  /** Pary etykieta–wartość; obie kolumny łamane, wiersz może przejść na kolejną stronę. */
  keyValues(
    rows: Array<[string, string]>,
    opts: { labelWidth?: number; size?: number } = {},
  ): void {
    const size = opts.size ?? 8.6;
    const lh = size * 1.32;
    const labelW = opts.labelWidth ?? 150;
    const valueX = MARGIN.left + labelW;
    const valueW = A4.w - MARGIN.right - valueX;
    for (const [key, value] of rows) {
      const labelLines = wrap(this.clean(key), this.bold, size, labelW - 10);
      const valueLines = wrap(this.clean(value || "—"), this.regular, size, valueW);
      const n = Math.max(labelLines.length, valueLines.length, 1);
      this.ensure(Math.min(n, 3) * lh);
      for (let i = 0; i < n; i++) {
        this.ensure(lh);
        this.y -= lh;
        const l = labelLines[i];
        const v = valueLines[i];
        if (l)
          this.page.drawText(l, { x: MARGIN.left, y: this.y, size, font: this.bold, color: GRAY });
        if (v)
          this.page.drawText(v, { x: valueX, y: this.y, size, font: this.regular, color: INK });
      }
      this.y -= 2.5;
    }
    this.y -= 1.5;
  }

  bullets(items: string[], opts: { size?: number; indent?: number } = {}): void {
    const size = opts.size ?? 8.6;
    const lh = size * 1.32;
    const x = MARGIN.left + (opts.indent ?? 4);
    const textX = x + 10;
    const maxW = A4.w - MARGIN.right - textX;
    for (const item of items) {
      const lines = wrap(this.clean(item), this.regular, size, maxW);
      this.ensure(Math.min(lines.length, 2) * lh);
      lines.forEach((ln, i) => {
        this.ensure(lh);
        this.y -= lh;
        if (i === 0) {
          this.page.drawText("•", { x, y: this.y, size, font: this.regular, color: NAVY });
        }
        if (ln) {
          this.page.drawText(ln, { x: textX, y: this.y, size, font: this.regular, color: INK });
        }
      });
      this.y -= 1.5;
    }
    this.y -= 2;
  }

  /**
   * Tabela o kolumnach proporcjonalnych do wag. Komórki łamane; po podziale
   * strony nagłówek tabeli rysuje się ponownie (także w środku długiego wiersza).
   */
  table(
    columns: TableColumn[],
    rows: string[][],
    opts: { size?: number; zebra?: boolean } = {},
  ): void {
    if (columns.length === 0) return;
    const size = opts.size ?? 8;
    const lh = size * 1.3;
    const padX = 4;
    const padY = 3;
    const total = columns.reduce((s, c) => s + Math.max(c.width, 0.0001), 0);
    const widths = columns.map((c) => (Math.max(c.width, 0.0001) / total) * CONTENT_W);
    const xs: number[] = [];
    widths.forEach((w, i) => xs.push(i === 0 ? MARGIN.left : xs[i - 1] + widths[i - 1]));

    const cellLines = (cells: string[], font: PDFFont) =>
      columns.map((_, i) => wrap(this.clean(cells[i] ?? ""), font, size, widths[i] - 2 * padX));

    const drawLines = (
      lines: string[][],
      from: number,
      count: number,
      font: PDFFont,
      color: RGB,
    ) => {
      const top = this.y;
      for (let ci = 0; ci < columns.length; ci++) {
        for (let li = 0; li < count; li++) {
          const ln = lines[ci][from + li];
          if (!ln) continue;
          const w = font.widthOfTextAtSize(ln, size);
          const x = columns[ci].align === "right" ? xs[ci] + widths[ci] - padX - w : xs[ci] + padX;
          const baseline = top - padY - lh * (li + 1) + size * 0.25;
          this.page.drawText(ln, { x, y: baseline, size, font, color });
        }
      }
    };

    const headerLines = cellLines(
      columns.map((c) => c.label),
      this.bold,
    );
    const headerN = Math.max(1, ...headerLines.map((l) => l.length));
    const headerH = headerN * lh + 2 * padY;
    const drawHeader = () => {
      this.page.drawRectangle({
        x: MARGIN.left,
        y: this.y - headerH,
        width: CONTENT_W,
        height: headerH,
        color: NAVY_SOFT,
      });
      drawLines(headerLines, 0, headerN, this.bold, NAVY);
      this.y -= headerH;
      this.page.drawLine({
        start: { x: MARGIN.left, y: this.y },
        end: { x: A4.w - MARGIN.right, y: this.y },
        thickness: 0.6,
        color: NAVY,
      });
    };

    this.space(2);
    this.ensure(headerH + lh + 2 * padY);
    drawHeader();

    rows.forEach((cells, ri) => {
      const lines = cellLines(cells, this.regular);
      const n = Math.max(1, ...lines.map((l) => l.length));
      let from = 0;
      while (from < n) {
        let fit = Math.floor((this.y - MARGIN.bottom - 2 * padY) / lh);
        // Nie zaczynamy wiersza na samym dole, jeśli zmieści się w całości na nowej stronie.
        if (fit < Math.min(n - from, 2)) {
          this.newPage();
          drawHeader();
          fit = Math.floor((this.y - MARGIN.bottom - 2 * padY) / lh);
        }
        const count = Math.min(n - from, Math.max(fit, 1));
        const h = count * lh + 2 * padY;
        if (opts.zebra !== false && ri % 2 === 1) {
          this.page.drawRectangle({
            x: MARGIN.left,
            y: this.y - h,
            width: CONTENT_W,
            height: h,
            color: ZEBRA,
          });
        }
        drawLines(lines, from, count, this.regular, INK);
        this.y -= h;
        this.page.drawLine({
          start: { x: MARGIN.left, y: this.y },
          end: { x: A4.w - MARGIN.right, y: this.y },
          thickness: 0.4,
          color: LIGHT,
        });
        from += count;
      }
    });
    this.y -= 6;
  }

  /** Pasek wyniku (domyślnie 0–100) z etykietą, wartością i opcjonalnym opisem. */
  scoreBar(
    label: string,
    value: number,
    opts: { max?: number; color?: string; caption?: string | null } = {},
  ): void {
    const max = opts.max ?? 100;
    const size = 8.6;
    const labelW = 150;
    const valueW = 52;
    const barH = 7;
    const rowH = 14;
    const labelLines = wrap(this.clean(label), this.bold, size, labelW - 10);
    const h = Math.max(rowH, labelLines.length * size * 1.32) + (opts.caption ? 11 : 0);
    this.ensure(h + 2);
    const top = this.y;
    labelLines.forEach((ln, i) => {
      this.page.drawText(ln, {
        x: MARGIN.left,
        y: top - size * 1.32 * (i + 1) + 1.5,
        size,
        font: this.bold,
        color: GRAY,
      });
    });
    const trackX = MARGIN.left + labelW;
    const trackW = CONTENT_W - labelW - valueW;
    const barY = top - rowH + 3;
    const ratio = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
    const color = opts.color ? hexColor(opts.color) : NAVY;
    this.page.drawRectangle({ x: trackX, y: barY, width: trackW, height: barH, color: TRACK });
    if (ratio > 0) {
      this.page.drawRectangle({ x: trackX, y: barY, width: trackW * ratio, height: barH, color });
    }
    const valueText = this.clean(`${Math.round(value)}/${max}`);
    const vw = this.bold.widthOfTextAtSize(valueText, 9);
    this.page.drawText(valueText, {
      x: A4.w - MARGIN.right - vw,
      y: barY,
      size: 9,
      font: this.bold,
      color: INK,
    });
    if (opts.caption) {
      const cap = truncate(this.clean(opts.caption), this.regular, 7.6, trackW + valueW);
      this.page.drawText(cap, {
        x: trackX,
        y: barY - 10,
        size: 7.6,
        font: this.regular,
        color: GRAY,
      });
    }
    this.y = top - h - 3;
  }

  /**
   * Pasek skali A–E (GRADE_BANDS): pięć pól z literą i zakresem punktów,
   * aktywna klasa w pełnym kolorze i z obwódką, pozostałe przygaszone; pod
   * paskiem nazwy klas.
   */
  gradeScale(active: RiskGrade | null): void {
    const gap = 4;
    const cellW = (CONTENT_W - gap * (GRADE_BANDS.length - 1)) / GRADE_BANDS.length;
    const cellH = 30;
    const labelSize = 6.8;
    const h = cellH + 4 + 2 * labelSize * 1.25 + 4;
    this.space(4);
    this.ensure(h);
    const top = this.y;
    GRADE_BANDS.forEach((band, i) => {
      const x = MARGIN.left + i * (cellW + gap);
      const y = top - cellH;
      const color = hexColor(band.color);
      const isActive = band.grade === active;
      this.page.drawRectangle({
        x,
        y,
        width: cellW,
        height: cellH,
        color,
        opacity: isActive ? 1 : 0.16,
        borderColor: isActive ? NAVY : color,
        borderWidth: isActive ? 1.6 : 0.6,
        borderOpacity: isActive ? 1 : 0.5,
      });
      const letterSize = isActive ? 14 : 12;
      const lw = this.bold.widthOfTextAtSize(band.grade, letterSize);
      this.page.drawText(band.grade, {
        x: x + (cellW - lw) / 2,
        y: y + cellH - letterSize - 3,
        size: letterSize,
        font: this.bold,
        color: isActive ? WHITE : color,
      });
      const range = this.clean(gradeRangeLabel(band));
      const rw = this.regular.widthOfTextAtSize(range, 6.8);
      this.page.drawText(range, {
        x: x + (cellW - rw) / 2,
        y: y + 4,
        size: 6.8,
        font: isActive ? this.bold : this.regular,
        color: isActive ? WHITE : GRAY,
      });
      const lines = wrap(this.clean(band.label), this.regular, labelSize, cellW - 4).slice(0, 2);
      lines.forEach((ln, li) => {
        const font = isActive ? this.bold : this.regular;
        const w = font.widthOfTextAtSize(ln, labelSize);
        this.page.drawText(ln, {
          x: x + (cellW - w) / 2,
          y: y - 4 - labelSize * 1.25 * (li + 1) + 1.5,
          size: labelSize,
          font,
          color: isActive ? INK : GRAY,
        });
      });
    });
    this.y = top - h;
  }

  /** Ramka z uwagą (np. wersja przed rezerwacją, blokada licytacji). */
  note(text: string, opts: { tone?: "info" | "warning"; size?: number } = {}): void {
    const size = opts.size ?? 8.4;
    const lh = size * 1.32;
    const pad = 6;
    const textX = MARGIN.left + pad + 4;
    const lines = wrap(this.clean(text), this.regular, size, A4.w - MARGIN.right - pad - textX);
    const warn = opts.tone === "warning";
    this.space(3);
    // Ramka jest rysowana kawałkami — długa uwaga może przejść na kolejną stronę.
    let from = 0;
    while (from < lines.length) {
      let fit = Math.floor((this.y - MARGIN.bottom - 2 * pad) / lh);
      if (fit < Math.min(lines.length - from, 2)) {
        this.newPage();
        fit = Math.floor((this.y - MARGIN.bottom - 2 * pad) / lh);
      }
      const count = Math.min(lines.length - from, Math.max(fit, 1));
      const h = count * lh + 2 * pad;
      this.page.drawRectangle({
        x: MARGIN.left,
        y: this.y - h,
        width: CONTENT_W,
        height: h,
        color: warn ? AMBER_SOFT : NAVY_SOFT,
      });
      this.page.drawRectangle({
        x: MARGIN.left,
        y: this.y - h,
        width: 2.5,
        height: h,
        color: warn ? AMBER : NAVY,
      });
      for (let i = 0; i < count; i++) {
        const ln = lines[from + i];
        if (!ln) continue;
        this.page.drawText(ln, {
          x: textX,
          y: this.y - pad - lh * (i + 1) + size * 0.25,
          size,
          font: this.regular,
          color: INK,
        });
      }
      this.y -= h;
      from += count;
    }
    this.y -= 5;
  }

  /** Pasek górny i stopka na każdej stronie, metadane, zapis. */
  async save(): Promise<Uint8Array> {
    const pages = this.doc.getPages();
    const date = this.date;
    const footerLeft = this.clean(
      `Przygotowano dla ${this.opts.preparedFor} · ${formatWarsawDateTime(date)}`,
    );
    const docTitle = this.clean(this.opts.title);
    pages.forEach((page, i) => {
      const { width: w, height: h } = page.getSize();
      page.drawRectangle({ x: 0, y: h - HEADER_H, width: w, height: HEADER_H, color: NAVY_SOFT });
      page.drawLine({
        start: { x: 0, y: h - HEADER_H },
        end: { x: w, y: h - HEADER_H },
        thickness: 0.8,
        color: NAVY,
      });
      page.drawImage(this.logo, { x: MARGIN.left, y: h - HEADER_H + 10, width: 22, height: 22 });
      const brandW = this.bold.widthOfTextAtSize(BRAND, 10);
      page.drawText(BRAND, {
        x: MARGIN.left + 30,
        y: h - HEADER_H + 17,
        size: 10,
        font: this.bold,
        color: NAVY,
      });
      const titleMaxW = w - MARGIN.right - (MARGIN.left + 30 + brandW + 20);
      const t = truncate(docTitle, this.regular, 8, titleMaxW);
      const tw = this.regular.widthOfTextAtSize(t, 8);
      page.drawText(t, {
        x: w - MARGIN.right - tw,
        y: h - HEADER_H + 17,
        size: 8,
        font: this.regular,
        color: GRAY,
      });

      page.drawLine({
        start: { x: MARGIN.left, y: FOOTER_Y + 12 },
        end: { x: w - MARGIN.right, y: FOOTER_Y + 12 },
        thickness: 0.5,
        color: LIGHT,
      });
      const right = `Strona ${i + 1} z ${pages.length}`;
      const rw = this.regular.widthOfTextAtSize(right, 7.6);
      page.drawText(right, {
        x: w - MARGIN.right - rw,
        y: FOOTER_Y,
        size: 7.6,
        font: this.regular,
        color: GRAY,
      });
      const left = truncate(footerLeft, this.regular, 7.6, CONTENT_W - rw - 16);
      page.drawText(left, {
        x: MARGIN.left,
        y: FOOTER_Y,
        size: 7.6,
        font: this.regular,
        color: GRAY,
      });
    });

    this.doc.setTitle(this.opts.title);
    if (this.opts.subject) this.doc.setSubject(this.opts.subject);
    this.doc.setAuthor("Finance You");
    this.doc.setProducer("Finance You");
    this.doc.setCreator(BRAND);
    this.doc.setLanguage("pl-PL");
    this.doc.setCreationDate(date);
    this.doc.setModificationDate(date);
    return this.doc.save();
  }
}
