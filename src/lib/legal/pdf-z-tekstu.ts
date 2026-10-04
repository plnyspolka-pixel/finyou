/**
 * Dokumenty pakietu inwestora jako PDF — trwały nośnik wysyłany e-mailem.
 *
 * Źródłem jest `legal_documents.content_text` (kanoniczna treść, z której
 * liczony jest SHA-256 zapisywany przy akceptacji), rozbita na bloki tym
 * samym `blokiZTekstu`, co plik .docx — PDF i DOCX mają więc identyczną
 * treść i podział na nagłówki/załączniki. Czysty JS (pdf-lib + fontkit):
 * działa w Workerze, bez LibreOffice i bez dostępu do dysku.
 */
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Blok, Run } from "@/lib/contract-engine/umowa-docx";
import { blokiZTekstu } from "./docx-z-tekstu";
import { LIBERATION_SANS } from "./legal-fonts";

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = { top: 64, right: 56, bottom: 64, left: 56 };
const TEXT_W = A4.w - MARGIN.left - MARGIN.right;
const BLACK = rgb(0.1, 0.1, 0.1);
const GRAY = rgb(0.42, 0.42, 0.42);

export interface PdfZTekstuOpts {
  /** Kanoniczna treść (`legal_documents.content_text`). */
  contentText: string;
  /** Tytuł dokumentu — metadane PDF i stopka. */
  title: string;
  /** Wersja (np. `v7`) — stopka. */
  version: string;
  /** SHA-256 treści — drukowany na końcu jako identyfikator dokumentu. */
  sha256?: string | null;
  /** Identyfikator pakietu (np. `FY-LEGAL-2026-09-29`). */
  packageId?: string | null;
  /** Data utworzenia w metadanych (stała data → powtarzalny plik w testach). */
  date?: Date;
  /** Fonty (data-URI/base64/bajty); domyślnie Liberation Sans. */
  fonts?: { regular: string | Uint8Array; bold: string | Uint8Array };
}

/** Nazwa załącznika PDF z nazwy pliku .docx (`x.docx` → `x.pdf`). */
export function pdfFilename(docxFilename: string | null | undefined, fallback: string): string {
  const base = (docxFilename ?? "").trim();
  if (!base) return `${fallback}.pdf`;
  return /\.docx$/i.test(base) ? base.replace(/\.docx$/i, ".pdf") : `${base}.pdf`;
}

/** Znaki spoza fontu zamieniane na czytelne odpowiedniki ASCII. */
const znak = (cp: number) => String.fromCodePoint(cp);
const klasa = (...cps: number[]) => new RegExp(`[${cps.map(znak).join("")}]`, "g");
const ZAMIANY: Array<[RegExp, string]> = [
  [klasa(0x2610), "[ ]"], // ballot box
  [klasa(0x2611, 0x2612), "[x]"], // ballot box with check / x
  [/\t/g, "  "],
  [klasa(0x00a0), " "], // twarda spacja
  [klasa(0x2011), "-"], // twardy łącznik
  [klasa(0x00ad, 0x200b, 0x200c, 0x200d, 0xfeff), ""], // miękki łącznik, znaki zerowej szerokości
  [/\r/g, ""],
];

function oczysc(tekst: string, obslugiwane: Set<number>): string {
  let t = tekst;
  for (const [re, na] of ZAMIANY) t = t.replace(re, na);
  let out = "";
  for (const ch of t) {
    const cp = ch.codePointAt(0) ?? 0;
    out += cp < 0x80 || obslugiwane.has(cp) ? ch : "?";
  }
  return out;
}

interface Styl {
  size: number;
  lh: number;
  bold: boolean;
  before: number;
  after: number;
  color: RGB;
}

const STYLE: Record<"tytul" | "podtytul" | "naglowek" | "akapit" | "stopka", Styl> = {
  tytul: { size: 15, lh: 19, bold: true, before: 10, after: 6, color: BLACK },
  podtytul: { size: 11, lh: 14, bold: false, before: 0, after: 10, color: GRAY },
  naglowek: { size: 11, lh: 14, bold: true, before: 10, after: 4, color: BLACK },
  akapit: { size: 10, lh: 13.5, bold: false, before: 0, after: 4, color: BLACK },
  stopka: { size: 8, lh: 10, bold: false, before: 10, after: 0, color: GRAY },
};

interface Slowo {
  tekst: string;
  font: PDFFont;
  w: number;
}

interface Ctx {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  regular: PDFFont;
  bold: PDFFont;
  obslugiwane: Set<number>;
}

function nowaStrona(ctx: Ctx): void {
  ctx.page = ctx.doc.addPage([A4.w, A4.h]);
  ctx.y = A4.h - MARGIN.top;
}

function naPoczatkuStrony(ctx: Ctx): boolean {
  return ctx.y >= A4.h - MARGIN.top - 0.01;
}

/** Zapewnia miejsce na `wysokosc` pt — inaczej nowa strona. */
function zapewnij(ctx: Ctx, wysokosc: number): void {
  if (ctx.y - wysokosc < MARGIN.bottom) nowaStrona(ctx);
}

/** Łamanie słów (różne fonty w jednym akapicie) na wiersze o szerokości `maxW`. */
function lamanie(slowa: Slowo[], spacja: number, maxW: number): Slowo[][] {
  const wiersze: Slowo[][] = [];
  let biezacy: Slowo[] = [];
  let szer = 0;
  for (const s of slowa) {
    const dod = biezacy.length ? spacja + s.w : s.w;
    if (szer + dod <= maxW || biezacy.length === 0) {
      biezacy.push(s);
      szer += dod;
      continue;
    }
    wiersze.push(biezacy);
    biezacy = [s];
    szer = s.w;
  }
  if (biezacy.length) wiersze.push(biezacy);
  return wiersze;
}

/** Słowo szersze niż kolumna (np. długi ciąg podkreśleń) dzielimy na kawałki. */
function podzielDlugie(tekst: string, font: PDFFont, size: number, maxW: number): string[] {
  if (font.widthOfTextAtSize(tekst, size) <= maxW) return [tekst];
  const out: string[] = [];
  let kawalek = "";
  for (const ch of tekst) {
    if (kawalek && font.widthOfTextAtSize(kawalek + ch, size) > maxW) {
      out.push(kawalek);
      kawalek = "";
    }
    kawalek += ch;
  }
  if (kawalek) out.push(kawalek);
  return out;
}

function rysujAkapit(
  ctx: Ctx,
  runs: Run[],
  styl: Styl,
  opcje: { wciecie?: number; etykieta?: string; trzymajZNastepnym?: boolean } = {},
): void {
  const wciecie = opcje.wciecie ?? 0;
  const maxW = TEXT_W - wciecie;
  const spacja = ctx.regular.widthOfTextAtSize(" ", styl.size);
  const slowa: Slowo[] = [];
  for (const run of runs) {
    const font = styl.bold || run.bold ? ctx.bold : ctx.regular;
    const tekst = oczysc(run.tekst, ctx.obslugiwane);
    for (const s of tekst.split(" ")) {
      if (!s) continue;
      for (const kawalek of podzielDlugie(s, font, styl.size, maxW)) {
        slowa.push({ tekst: kawalek, font, w: font.widthOfTextAtSize(kawalek, styl.size) });
      }
    }
  }
  const wiersze = slowa.length ? lamanie(slowa, spacja, maxW) : [[]];

  if (!naPoczatkuStrony(ctx)) ctx.y -= styl.before;
  // Nagłówek nie zostaje sam na dole strony: potrzebujemy miejsca na niego
  // i dwa wiersze tekstu pod nim.
  const minWys = opcje.trzymajZNastepnym
    ? wiersze.length * styl.lh + 2 * STYLE.akapit.lh
    : Math.min(wiersze.length, 2) * styl.lh;
  zapewnij(ctx, minWys);

  wiersze.forEach((wiersz, i) => {
    zapewnij(ctx, styl.lh);
    ctx.y -= styl.lh;
    let x = MARGIN.left + wciecie;
    if (i === 0 && opcje.etykieta) {
      const et = oczysc(opcje.etykieta, ctx.obslugiwane);
      ctx.page.drawText(et, {
        x: Math.max(MARGIN.left, x - 14),
        y: ctx.y,
        size: styl.size,
        font: ctx.regular,
        color: styl.color,
      });
    }
    for (const s of wiersz) {
      ctx.page.drawText(s.tekst, { x, y: ctx.y, size: styl.size, font: s.font, color: styl.color });
      x += s.w + spacja;
    }
  });
  ctx.y -= styl.after;
}

function rysujBlok(ctx: Ctx, blok: Blok): void {
  switch (blok.t) {
    case "tytul":
      if (blok.nowaStrona && !naPoczatkuStrony(ctx)) nowaStrona(ctx);
      rysujAkapit(ctx, [{ tekst: blok.tekst }], STYLE.tytul, { trzymajZNastepnym: true });
      return;
    case "podtytul":
      rysujAkapit(ctx, [{ tekst: blok.tekst }], STYLE.podtytul);
      return;
    case "naglowek":
      rysujAkapit(ctx, [{ tekst: blok.tekst }], STYLE.naglowek, { trzymajZNastepnym: true });
      return;
    case "akapit": {
      const wciecie =
        blok.wciecie === "ustep"
          ? 14
          : blok.wciecie === "podpunkt" || blok.wciecie === "lista"
            ? 28
            : 0;
      rysujAkapit(ctx, blok.runs, STYLE.akapit, { wciecie, etykieta: blok.etykieta });
      return;
    }
    case "tabela":
      for (const w of blok.wiersze) {
        const tekst = w.komorki
          .map((k) =>
            typeof k.tekst === "string" ? k.tekst : k.tekst.map((r) => r.tekst).join(""),
          )
          .join(" | ");
        rysujAkapit(ctx, [{ tekst, bold: Boolean(w.naglowek) }], STYLE.akapit);
      }
      return;
    case "podpisy":
      for (const o of blok.osoby) {
        const linie = [o.rola, o.nazwa ?? "", ...(o.wImieniu ?? [])].filter(Boolean);
        rysujAkapit(ctx, [{ tekst: linie.join(" — ") }], STYLE.akapit);
      }
      return;
  }
}

function rysujStopki(ctx: Ctx, title: string, version: string): void {
  const strony = ctx.doc.getPages();
  const lewy = oczysc(`Finance You · ${title} · ${version}`, ctx.obslugiwane);
  strony.forEach((page, i) => {
    const prawy = `Strona ${i + 1} z ${strony.length}`;
    const prawyW = ctx.regular.widthOfTextAtSize(prawy, STYLE.stopka.size);
    // Lewa część stopki nie może nachodzić na numer strony — przycinamy.
    let l = lewy;
    while (l && ctx.regular.widthOfTextAtSize(l, STYLE.stopka.size) > TEXT_W - prawyW - 12) {
      l = l.slice(0, -2).trimEnd() + "…";
    }
    page.drawText(l, {
      x: MARGIN.left,
      y: 36,
      size: STYLE.stopka.size,
      font: ctx.regular,
      color: GRAY,
    });
    page.drawText(prawy, {
      x: A4.w - MARGIN.right - prawyW,
      y: 36,
      size: STYLE.stopka.size,
      font: ctx.regular,
      color: GRAY,
    });
  });
}

async function budujPdf(opts: PdfZTekstuOpts): Promise<PDFDocument> {
  const fonts = opts.fonts ?? LIBERATION_SANS;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fonts.regular, { subset: true });
  const bold = await doc.embedFont(fonts.bold, { subset: true });
  const obslugiwane = new Set(regular.getCharacterSet());

  const ctx: Ctx = {
    doc,
    page: doc.addPage([A4.w, A4.h]),
    y: A4.h - MARGIN.top,
    regular,
    bold,
    obslugiwane,
  };

  for (const blok of blokiZTekstu(opts.contentText)) rysujBlok(ctx, blok);

  if (opts.sha256) {
    const id = [
      opts.packageId ? `Pakiet ${opts.packageId}` : null,
      `wersja ${opts.version}`,
      `SHA-256 treści: ${opts.sha256}`,
    ]
      .filter(Boolean)
      .join(" · ");
    rysujAkapit(ctx, [{ tekst: `Identyfikator dokumentu — ${id}` }], STYLE.stopka);
  }

  rysujStopki(ctx, opts.title, opts.version);

  const date = opts.date ?? new Date();
  doc.setTitle(opts.title);
  doc.setSubject(
    [opts.packageId, opts.version, opts.sha256 ? `SHA-256 ${opts.sha256}` : null]
      .filter(Boolean)
      .join(" · "),
  );
  doc.setAuthor("Finance You");
  doc.setProducer("Finance You");
  doc.setCreator("Finance You — pakiet umów inwestora");
  doc.setLanguage("pl-PL");
  doc.setCreationDate(date);
  doc.setModificationDate(date);
  return doc;
}

/**
 * Znaki treści, których font nie ma (po zamianach ☐/☒ itp.) — w PDF-ie
 * wyszłyby jako „?". Do testów pakietu i kontroli przy nowych wersjach umów.
 */
export async function znakiPozaFontem(
  contentText: string,
  fonts: PdfZTekstuOpts["fonts"] = LIBERATION_SANS,
): Promise<string[]> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fonts.regular);
  const obslugiwane = new Set(regular.getCharacterSet());
  let t = contentText;
  for (const [re, na] of ZAMIANY) t = t.replace(re, na);
  const brak = new Set<string>();
  for (const ch of t) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x80 && cp !== 0x0a && !obslugiwane.has(cp)) brak.add(ch);
  }
  return [...brak];
}

/** PDF jako bajty. */
export async function pdfZTekstu(opts: PdfZTekstuOpts): Promise<Uint8Array> {
  const doc = await budujPdf(opts);
  return doc.save();
}

/** PDF jako base64 (załącznik e-mail) — bez `Buffer`, działa w Workerze. */
export async function pdfZTekstuBase64(opts: PdfZTekstuOpts): Promise<string> {
  const doc = await budujPdf(opts);
  return doc.saveAsBase64();
}
