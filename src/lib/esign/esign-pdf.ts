/**
 * Podpis dokumentowy — plik końcowy PDF.
 *
 * Z dokumentu źródłowego budujemy nowy PDF (pdf-lib, czysty JS — działa w
 * Workerze i w testach):
 *  • każda strona oryginału jest osadzona w całości (tekst pozostaje
 *    zaznaczalny), lekko pomniejszona, tak by zwolnić górny pasek i dolną
 *    stopkę — znaczniki NIGDY nie zasłaniają treści;
 *  • górny pasek (jak w Autenti): znak FY, „Podpisano elektronicznie
 *    w Finance You”, identyfikator dokumentu, adres weryfikacji, skrót
 *    SHA-256 oryginału, numer strony „n z N”;
 *  • dolna stopka (jak znacznik podpisu zaufanego): kto podpisał, w czyim
 *    imieniu, kiedy, jak potwierdzono tożsamość;
 *  • na końcu „Karta podpisów”: dane dokumentu, każdego podpisującego
 *    (tożsamość Didit, kod jednorazowy, czas, IP, urządzenie, oświadczenia,
 *    identyfikator podpisu), „Historia dokumentu” i informacja prawna.
 */
import { PDFDocument, degrees, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { LIBERATION_SANS } from "@/lib/legal/legal-fonts";
import {
  capacityLabel,
  describeIdentity,
  formatSignedAt,
  formatSignedAtShort,
  type IdentitySnapshot,
  type SignedCapacity,
  type SigningMode,
} from "./esign-core";

export { describeIdentity };

const A4 = { w: 595.28, h: 841.89 };
const TOP_BAND = 38;
const BOTTOM_BASE = 12;
const BOTTOM_LINE = 9;
const KARTA_MARGIN = 48;

const NAVY = rgb(0.11, 0.16, 0.36);
const NAVY_SOFT = rgb(0.93, 0.95, 0.99);
const INK = rgb(0.12, 0.12, 0.14);
const GRAY = rgb(0.42, 0.44, 0.5);
const LIGHT = rgb(0.86, 0.88, 0.92);
const GREEN = rgb(0.13, 0.6, 0.33);
const WHITE = rgb(1, 1, 1);

export interface StampSigner {
  /** Imię i nazwisko (z dokumentu tożsamości, gdy potwierdzone). */
  fullName: string;
  roleLabel: string | null;
  email: string;
  phone: string | null;
  capacity: SignedCapacity | null;
  identity: IdentitySnapshot | null;
  otpChannel: string | null;
  /** Zamaskowany cel kodu (np. „*********800”). */
  otpTarget: string | null;
  signedAt: string;
  ip: string | null;
  userAgent: string | null;
  /** Treści złożonych oświadczeń. */
  statements: string[];
  signatureHash: string;
}

export interface StampEvent {
  at: string;
  label: string;
  actor: string;
  ip: string | null;
}

export interface StampInput {
  sourceBytes: Uint8Array;
  publicId: string;
  title: string;
  sourceFilename: string;
  sourceSha256: string;
  /** Pełny adres strony weryfikacji. */
  verifyUrl: string;
  /** Skrócony adres do paska (bez https://). */
  verifyUrlShort: string;
  sender: { name: string | null; email: string | null };
  operatorName: string;
  createdAt: string;
  sentAt: string | null;
  completedAt: string;
  signingMode: SigningMode;
  signers: StampSigner[];
  events: StampEvent[];
  fonts?: { regular: string | Uint8Array; bold: string | Uint8Array };
  now?: Date;
}

export interface StampResult {
  bytes: Uint8Array;
  /** Liczba stron dokumentu źródłowego. */
  sourcePages: number;
  /** Liczba stron Karty podpisów. */
  kartaPages: number;
}

// ── pomocnicze ─────────────────────────────────────────────────────────────

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  charset: Set<number>;
}

const REPLACEMENTS: Array<[RegExp, string]> = [
  [/\u00a0/g, " "], // twarda spacja
  [/\u2011/g, "-"], // twardy łącznik
  [/\u00ad|\u200b|\u200c|\u200d|\ufeff/g, ""], // miękki łącznik, znaki zerowej szerokości
  [/\t/g, "  "],
  [/\r/g, ""],
];

function clean(text: string, charset: Set<number>): string {
  let t = text ?? "";
  for (const [re, by] of REPLACEMENTS) t = t.replace(re, by);
  let out = "";
  for (const ch of t) {
    const cp = ch.codePointAt(0) ?? 0;
    out += cp < 0x80 || charset.has(cp) ? ch : "?";
  }
  return out;
}

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
        if (font.widthOfTextAtSize(cand, size) <= maxW || !cur) cur = cand;
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

function normRotation(angle: number): 0 | 90 | 180 | 270 {
  const a = (((Math.round(angle / 90) * 90) % 360) + 360) % 360;
  return a as 0 | 90 | 180 | 270;
}

function identityShort(identity: IdentitySnapshot | null): string {
  if (!identity) return "tożsamość: brak potwierdzenia";
  const doc = [identity.documentType ?? "dokument tożsamości", identity.documentNumberMasked]
    .filter(Boolean)
    .join(" ");
  return `tożsamość: Didit (${doc})`;
}

/** Liczba stron i blokada plików zaszyfrowanych — używane przy przyjmowaniu PDF. */
export async function inspectPdf(
  bytes: Uint8Array,
): Promise<{ pages: number; encrypted: boolean }> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  return { pages: doc.getPageCount(), encrypted: doc.isEncrypted };
}

// ── pasek górny i stopka na każdej stronie ─────────────────────────────────

function bottomBandHeight(signers: StampSigner[]): number {
  const lines = signers.length === 0 ? 1 : signers.length <= 2 ? signers.length : 1;
  return BOTTOM_BASE + BOTTOM_LINE * lines;
}

function drawMark(page: PDFPage, x: number, y: number, size: number, fonts: Fonts): void {
  page.drawRectangle({
    x,
    y,
    width: size,
    height: size,
    color: NAVY,
    borderColor: NAVY,
    borderWidth: 0,
  });
  const fs = size * 0.46;
  const t = "FY";
  const tw = fonts.bold.widthOfTextAtSize(t, fs);
  page.drawText(t, {
    x: x + (size - tw) / 2,
    y: y + size * 0.3,
    size: fs,
    font: fonts.bold,
    color: WHITE,
  });
}

function drawCheck(page: PDFPage, cx: number, cy: number, r: number): void {
  page.drawCircle({ x: cx, y: cy, size: r, color: GREEN });
  page.drawLine({
    start: { x: cx - r * 0.45, y: cy },
    end: { x: cx - r * 0.1, y: cy - r * 0.38 },
    thickness: r * 0.32,
    color: WHITE,
  });
  page.drawLine({
    start: { x: cx - r * 0.1, y: cy - r * 0.38 },
    end: { x: cx + r * 0.5, y: cy + r * 0.4 },
    thickness: r * 0.32,
    color: WHITE,
  });
}

function drawBands(
  page: PDFPage,
  index: number,
  total: number,
  input: StampInput,
  fonts: Fonts,
  kartaRange: [number, number],
): void {
  const { width: w, height: h } = page.getSize();
  const c = (s: string) => clean(s, fonts.charset);

  // Pasek górny.
  page.drawRectangle({ x: 0, y: h - TOP_BAND, width: w, height: TOP_BAND, color: NAVY_SOFT });
  page.drawLine({
    start: { x: 0, y: h - TOP_BAND },
    end: { x: w, y: h - TOP_BAND },
    thickness: 1,
    color: NAVY,
  });
  drawMark(page, 12, h - TOP_BAND + 9, 20, fonts);

  const leftX = 38;
  const rightText = `Strona ${index + 1} z ${total}`;
  const rightW = fonts.bold.widthOfTextAtSize(rightText, 7.5);
  const rightX = w - 12 - rightW;
  page.drawText(c(rightText), { x: rightX, y: h - 15, size: 7.5, font: fonts.bold, color: NAVY });
  const legal = "Podpis dokumentowy · art. 77² KC · eIDAS art. 25";
  const legalW = fonts.regular.widthOfTextAtSize(c(legal), 6);
  page.drawText(c(legal), {
    x: w - 12 - legalW,
    y: h - 26,
    size: 6,
    font: fonts.regular,
    color: GRAY,
  });

  const maxLeft = Math.min(rightX, w - 12 - legalW) - leftX - 10;
  page.drawText(c(truncate("Podpisano elektronicznie w Finance You", fonts.bold, 8.5, maxLeft)), {
    x: leftX,
    y: h - 15,
    size: 8.5,
    font: fonts.bold,
    color: NAVY,
  });
  const line2 = `ID dokumentu: ${input.publicId}  ·  Weryfikacja: ${input.verifyUrlShort}  ·  SHA-256 oryginału: ${input.sourceSha256.slice(0, 16)}…`;
  page.drawText(c(truncate(line2, fonts.regular, 6.3, maxLeft)), {
    x: leftX,
    y: h - 26,
    size: 6.3,
    font: fonts.regular,
    color: INK,
  });

  // Stopka z podpisami.
  const bh = bottomBandHeight(input.signers);
  page.drawLine({ start: { x: 0, y: bh }, end: { x: w, y: bh }, thickness: 0.6, color: LIGHT });
  const textX = 24;
  const maxW = w - textX - 12;
  const lines: string[] = [];
  if (input.signers.length === 0) {
    lines.push("Dokument w trakcie podpisywania.");
  } else if (input.signers.length <= 2) {
    for (const s of input.signers) {
      const base = `${capacityLabel(s.fullName, s.capacity)} — podpisano ${formatSignedAtShort(s.signedAt)}`;
      const full = `${base} · ${identityShort(s.identity)}`;
      // Gdy pełny opis się nie mieści, zostaje część kluczowa (kto, kiedy).
      lines.push(fonts.regular.widthOfTextAtSize(c(full), 6.4) <= maxW ? full : base);
    }
  } else {
    const names = input.signers.map((s) => s.fullName).join(", ");
    lines.push(
      `Podpisano elektronicznie przez ${input.signers.length} osoby: ${names} — szczegóły w Karcie podpisów (str. ${kartaRange[0]}–${kartaRange[1]})`,
    );
  }
  lines.forEach((ln, i) => {
    const y = bh - 8 - i * BOTTOM_LINE + 1.5;
    drawCheck(page, 12, y + 2.2, 3.4);
    page.drawText(c(truncate(ln, fonts.regular, 6.4, maxW)), {
      x: textX,
      y,
      size: 6.4,
      font: fonts.regular,
      color: INK,
    });
  });
}

// ── Karta podpisów (prosty silnik tekstu) ──────────────────────────────────

interface Writer {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  fonts: Fonts;
  bottomLimit: number;
  pages: PDFPage[];
}

function newKartaPage(wr: Writer): void {
  wr.page = wr.doc.addPage([A4.w, A4.h]);
  wr.pages.push(wr.page);
  wr.y = A4.h - TOP_BAND - 30;
}

function ensure(wr: Writer, height: number): void {
  if (wr.y - height < wr.bottomLimit) newKartaPage(wr);
}

function para(
  wr: Writer,
  text: string,
  opts: {
    size?: number;
    bold?: boolean;
    color?: RGB;
    x?: number;
    maxW?: number;
    after?: number;
    lh?: number;
  } = {},
): void {
  const size = opts.size ?? 8.5;
  const font = opts.bold ? wr.fonts.bold : wr.fonts.regular;
  const x = opts.x ?? KARTA_MARGIN;
  const maxW = opts.maxW ?? A4.w - x - KARTA_MARGIN;
  const lh = opts.lh ?? size * 1.32;
  const lines = wrap(clean(text, wr.fonts.charset), font, size, maxW);
  for (const ln of lines) {
    ensure(wr, lh);
    wr.y -= lh;
    wr.page.drawText(ln, { x, y: wr.y, size, font, color: opts.color ?? INK });
  }
  wr.y -= opts.after ?? 3;
}

function heading(wr: Writer, text: string): void {
  ensure(wr, 30);
  wr.y -= 10;
  para(wr, text.toUpperCase(), { size: 9.5, bold: true, color: NAVY, after: 2 });
  wr.page.drawLine({
    start: { x: KARTA_MARGIN, y: wr.y },
    end: { x: A4.w - KARTA_MARGIN, y: wr.y },
    thickness: 0.8,
    color: NAVY,
  });
  wr.y -= 6;
}

function kv(wr: Writer, key: string, value: string, opts: { labelW?: number } = {}): void {
  const labelW = opts.labelW ?? 150;
  const size = 8.5;
  const lh = size * 1.32;
  const valueX = KARTA_MARGIN + labelW;
  const lines = wrap(
    clean(value, wr.fonts.charset),
    wr.fonts.regular,
    size,
    A4.w - valueX - KARTA_MARGIN,
  );
  ensure(wr, lh * Math.max(1, Math.min(lines.length, 2)));
  const startY = wr.y;
  wr.page.drawText(clean(key, wr.fonts.charset), {
    x: KARTA_MARGIN,
    y: startY - lh,
    size,
    font: wr.fonts.bold,
    color: GRAY,
  });
  let first = true;
  for (const ln of lines) {
    if (!first) ensure(wr, lh);
    wr.y -= lh;
    wr.page.drawText(ln, { x: valueX, y: wr.y, size, font: wr.fonts.regular, color: INK });
    first = false;
  }
  if (lines.length === 0) wr.y -= lh;
  wr.y -= 2.5;
}

function signerBlock(wr: Writer, index: number, s: StampSigner): void {
  ensure(wr, 90);
  wr.y -= 4;
  const who = `${index + 1}. ${s.fullName}${s.roleLabel ? ` — ${s.roleLabel}` : ""}`;
  para(wr, who, { size: 10, bold: true, color: NAVY, after: 4 });
  kv(
    wr,
    "Podpisuje",
    s.capacity?.mode === "firma" && s.capacity.company
      ? `w imieniu: ${capacityLabel(s.fullName, s.capacity)}`
      : "we własnym imieniu",
  );
  if (s.capacity?.company) {
    const c = s.capacity.company;
    const extra = [c.legalForm, c.regon ? `REGON ${c.regon}` : null, c.address]
      .filter(Boolean)
      .join(" · ");
    if (extra) kv(wr, "Dane podmiotu", extra);
  }
  kv(wr, "E-mail", s.email);
  if (s.phone) kv(wr, "Telefon", s.phone);
  kv(wr, "Weryfikacja tożsamości", describeIdentity(s.identity));
  kv(
    wr,
    "Kod jednorazowy",
    s.otpChannel
      ? `${s.otpChannel === "sms" ? "SMS" : "e-mail"} → ${s.otpTarget ?? "—"} (potwierdzony przed podpisem)`
      : "—",
  );
  kv(wr, "Data i czas podpisu", formatSignedAt(s.signedAt));
  kv(wr, "Adres IP", s.ip ?? "—");
  kv(wr, "Urządzenie / przeglądarka", (s.userAgent ?? "—").slice(0, 180));
  if (s.statements.length) {
    kv(wr, "Oświadczenia", "");
    wr.y += 2;
    for (const st of s.statements) {
      para(wr, `• ${st}`, { size: 7.6, x: KARTA_MARGIN + 150, color: INK, after: 1.5 });
    }
  }
  kv(wr, "Identyfikator podpisu", s.signatureHash);
  wr.y -= 2;
  wr.page.drawLine({
    start: { x: KARTA_MARGIN, y: wr.y },
    end: { x: A4.w - KARTA_MARGIN, y: wr.y },
    thickness: 0.5,
    color: LIGHT,
  });
  wr.y -= 10;
}

function eventsTable(wr: Writer, events: StampEvent[]): void {
  const size = 7.6;
  const lh = size * 1.35;
  const cols = {
    at: KARTA_MARGIN,
    label: KARTA_MARGIN + 104,
    actor: KARTA_MARGIN + 290,
    ip: KARTA_MARGIN + 436,
  };
  const header = () => {
    ensure(wr, lh * 2);
    wr.y -= lh;
    wr.page.drawText("Data i czas", {
      x: cols.at,
      y: wr.y,
      size,
      font: wr.fonts.bold,
      color: GRAY,
    });
    wr.page.drawText("Zdarzenie", {
      x: cols.label,
      y: wr.y,
      size,
      font: wr.fonts.bold,
      color: GRAY,
    });
    wr.page.drawText("Kto", { x: cols.actor, y: wr.y, size, font: wr.fonts.bold, color: GRAY });
    wr.page.drawText("IP", { x: cols.ip, y: wr.y, size, font: wr.fonts.bold, color: GRAY });
    wr.y -= 3;
    wr.page.drawLine({
      start: { x: KARTA_MARGIN, y: wr.y },
      end: { x: A4.w - KARTA_MARGIN, y: wr.y },
      thickness: 0.5,
      color: LIGHT,
    });
    wr.y -= 2;
  };
  header();
  for (const e of events) {
    const labelLines = wrap(
      clean(e.label, wr.fonts.charset),
      wr.fonts.regular,
      size,
      cols.actor - cols.label - 8,
    );
    const actorLines = wrap(
      clean(e.actor, wr.fonts.charset),
      wr.fonts.regular,
      size,
      cols.ip - cols.actor - 8,
    );
    const rows = Math.max(labelLines.length, actorLines.length, 1);
    if (wr.y - lh * rows < wr.bottomLimit) {
      newKartaPage(wr);
      header();
    }
    const y0 = wr.y;
    wr.page.drawText(clean(formatSignedAtShort(e.at), wr.fonts.charset), {
      x: cols.at,
      y: y0 - lh,
      size,
      font: wr.fonts.regular,
      color: INK,
    });
    labelLines.forEach((ln, i) =>
      wr.page.drawText(ln, {
        x: cols.label,
        y: y0 - lh * (i + 1),
        size,
        font: wr.fonts.regular,
        color: INK,
      }),
    );
    actorLines.forEach((ln, i) =>
      wr.page.drawText(ln, {
        x: cols.actor,
        y: y0 - lh * (i + 1),
        size,
        font: wr.fonts.regular,
        color: INK,
      }),
    );
    wr.page.drawText(clean(e.ip ?? "—", wr.fonts.charset), {
      x: cols.ip,
      y: y0 - lh,
      size,
      font: wr.fonts.regular,
      color: GRAY,
    });
    wr.y -= lh * rows + 1.5;
  }
}

function buildKarta(doc: PDFDocument, fonts: Fonts, input: StampInput): PDFPage[] {
  const bottomLimit = bottomBandHeight(input.signers) + 28;
  const wr: Writer = { doc, page: null as unknown as PDFPage, y: 0, fonts, bottomLimit, pages: [] };
  newKartaPage(wr);

  para(wr, "KARTA PODPISÓW", { size: 17, bold: true, color: NAVY, after: 2 });
  para(
    wr,
    `Protokół złożenia podpisów w formie dokumentowej (art. 77² Kodeksu cywilnego). Karta stanowi integralną część dokumentu ${input.publicId} i została dołączona przez system ${input.operatorName}.`,
    { size: 8.5, color: GRAY, after: 6 },
  );

  heading(wr, "Dokument");
  kv(wr, "Identyfikator", input.publicId);
  kv(wr, "Tytuł", input.title);
  kv(wr, "Plik źródłowy", input.sourceFilename);
  kv(wr, "SHA-256 pliku źródłowego", input.sourceSha256);
  kv(
    wr,
    "Nadawca",
    [input.sender.name, input.sender.email ? `<${input.sender.email}>` : null]
      .filter(Boolean)
      .join(" ") || "—",
  );
  kv(wr, "Utworzono", formatSignedAt(input.createdAt));
  kv(wr, "Wysłano do podpisu", formatSignedAt(input.sentAt));
  kv(wr, "Zamknięto (ostatni podpis)", formatSignedAt(input.completedAt));
  kv(
    wr,
    "Tryb podpisywania",
    input.signingMode === "kolejno" ? "kolejno (wg kolejności)" : "równolegle",
  );
  kv(wr, "Liczba podpisujących", String(input.signers.length));
  kv(wr, "Strona weryfikacji", input.verifyUrl);

  heading(wr, "Podpisujący");
  input.signers.forEach((s, i) => signerBlock(wr, i, s));

  heading(wr, "Historia dokumentu");
  eventsTable(wr, input.events);

  heading(wr, "Informacje prawne i weryfikacja");
  const legal = [
    "1. Dokument został podpisany podpisem elektronicznym w rozumieniu art. 3 pkt 10 rozporządzenia Parlamentu Europejskiego i Rady (UE) nr 910/2014 (eIDAS). Zgodnie z art. 25 ust. 1 eIDAS podpisowi elektronicznemu nie można odmówić skutku prawnego ani dopuszczalności jako dowodu w postępowaniu sądowym wyłącznie z tego powodu, że ma postać elektroniczną lub nie spełnia wymogów kwalifikowanego podpisu elektronicznego.",
    "2. Oświadczenia woli złożono w formie dokumentowej (art. 77² KC): w postaci dokumentu (art. 77³ KC) i w sposób umożliwiający ustalenie osoby składającej oświadczenie. Tożsamość każdego podpisującego potwierdzono zdalną weryfikacją dokumentu tożsamości z testem żywotności i porównaniem twarzy (Didit), a wyłączną kontrolę nad kanałem komunikacji — kodem jednorazowym doręczonym na wskazany numer telefonu albo adres e-mail. Każdy podpisujący przed podpisem złożył oświadczenia wymienione przy jego danych.",
    "3. Integralność: skrót SHA-256 dokumentu źródłowego podano wyżej. Skrót SHA-256 niniejszego pliku (ze znacznikami na stronach i Kartą podpisów) jest opublikowany na stronie weryfikacji; każda zmiana pliku zmienia jego skrót. Historia dokumentu jest rejestrem tylko-do-dopisywania z łańcuchem skrótów (każde zdarzenie wiąże poprzednie).",
    `4. Weryfikacja: ${input.verifyUrl} — strona pokazuje status dokumentu, podpisujących, czas złożenia podpisów oraz pozwala porównać skrót posiadanego pliku z oryginałem przechowywanym przez ${input.operatorName}. Podpisany dokument doręczono każdemu podpisującemu na adres e-mail (trwały nośnik).`,
    "5. Podpis dokumentowy nie jest kwalifikowanym podpisem elektronicznym (art. 78¹ KC) i nie zastępuje formy pisemnej, formy z podpisami notarialnie poświadczonymi ani aktu notarialnego tam, gdzie ustawa wymaga ich pod rygorem nieważności (np. poręczenie, przeniesienie własności nieruchomości, ustanowienie hipoteki). Jest właściwy m.in. dla umowy pożyczki (art. 720 § 2 KC), umów o świadczenie usług, oświadczeń, zgód i porozumień, dla których ustawa nie zastrzega formy szczególnej.",
  ];
  for (const p of legal) para(wr, p, { size: 7.8, after: 3.5 });
  const now = input.now ?? new Date();
  para(
    wr,
    `Kartę wygenerował system ${input.operatorName} — ${formatSignedAt(now.toISOString())}.`,
    {
      size: 7.4,
      color: GRAY,
    },
  );
  return wr.pages;
}

// ── główna funkcja ─────────────────────────────────────────────────────────

export async function stampSignedPdf(input: StampInput): Promise<StampResult> {
  const fontSrc = input.fonts ?? LIBERATION_SANS;
  const src = await PDFDocument.load(input.sourceBytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  if (src.isEncrypted)
    throw new Error(
      "Dokument PDF jest zaszyfrowany — zdejmij zabezpieczenie przed wysłaniem do podpisu.",
    );

  const out = await PDFDocument.create();
  out.registerFontkit(fontkit);
  const regular = await out.embedFont(fontSrc.regular, { subset: true });
  const bold = await out.embedFont(fontSrc.bold, { subset: true });
  const fonts: Fonts = { regular, bold, charset: new Set(regular.getCharacterSet()) };

  const bottom = bottomBandHeight(input.signers);
  const srcPages = src.getPages();
  const embedded = await out.embedPdf(
    src,
    srcPages.map((_, i) => i),
  );

  srcPages.forEach((srcPage, i) => {
    const emb = embedded[i];
    const rot = normRotation(srcPage.getRotation().angle);
    const w = emb.width;
    const h = emb.height;
    const swapped = rot === 90 || rot === 270;
    const dispW = swapped ? h : w;
    const dispH = swapped ? w : h;
    const page = out.addPage([dispW, dispH]);
    const s = Math.max(0.5, (dispH - TOP_BAND - bottom) / dispH);
    const dW = dispW * s;
    const dH = dispH * s;
    const left = (dispW - dW) / 2;
    const bottomY = bottom;
    const W = w * s;
    const H = h * s;
    if (rot === 0) {
      page.drawPage(emb, { x: left, y: bottomY, width: W, height: H });
    } else if (rot === 90) {
      page.drawPage(emb, { x: left, y: bottomY + W, width: W, height: H, rotate: degrees(-90) });
    } else if (rot === 180) {
      page.drawPage(emb, {
        x: left + W,
        y: bottomY + H,
        width: W,
        height: H,
        rotate: degrees(180),
      });
    } else {
      page.drawPage(emb, { x: left + H, y: bottomY, width: W, height: H, rotate: degrees(90) });
    }
    // Delikatna ramka wokół oryginalnej treści — widać, że to osadzony dokument.
    page.drawRectangle({
      x: left,
      y: bottomY,
      width: dW,
      height: dH,
      borderColor: LIGHT,
      borderWidth: 0.4,
      color: undefined,
    });
  });

  const kartaPages = buildKarta(out, fonts, input);
  const all = out.getPages();
  const total = all.length;
  const kartaStart = srcPages.length + 1;
  all.forEach((page, i) => drawBands(page, i, total, input, fonts, [kartaStart, total]));

  const now = input.now ?? new Date();
  out.setTitle(`${input.title} — podpisany elektronicznie (${input.publicId})`);
  out.setSubject(
    `Podpis dokumentowy Finance You · ${input.publicId} · SHA-256 oryginału ${input.sourceSha256}`,
  );
  out.setKeywords(["podpis dokumentowy", "art. 77(2) KC", "eIDAS", input.publicId]);
  out.setAuthor(input.operatorName);
  out.setProducer("Finance You — podpis dokumentowy");
  out.setCreator("Finance You — podpis dokumentowy");
  out.setLanguage("pl-PL");
  out.setCreationDate(now);
  out.setModificationDate(now);

  const bytes = await out.save({ useObjectStreams: true });
  return { bytes, sourcePages: srcPages.length, kartaPages: kartaPages.length };
}
