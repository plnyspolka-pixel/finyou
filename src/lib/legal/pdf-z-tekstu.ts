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
import type { Blok, Komorka, Podpisujacy, Run } from "@/lib/contract-engine/umowa-docx";
import { blokiZTekstu } from "./docx-z-tekstu";
import { LIBERATION_SANS, LIBERATION_SERIF } from "./legal-fonts";

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
  /** Wersja (np. `1.0`) — stopka. */
  version: string;
  /** SHA-256 treści — drukowany na końcu jako identyfikator dokumentu. */
  sha256?: string | null;
  /** Identyfikator pakietu (np. `FY-LEGAL-1.0`). */
  packageId?: string | null;
  /** Data utworzenia w metadanych (stała data → powtarzalny plik w testach). */
  date?: Date;
  /** Fonty (data-URI/base64/bajty); domyślnie Liberation Sans. */
  fonts?: { regular: string | Uint8Array; bold: string | Uint8Array };
}

/** Fonty dokumentu (data-URI/base64/bajty); kursywa opcjonalna. */
export interface FontyPdf {
  regular: string | Uint8Array;
  bold: string | Uint8Array;
  italic?: string | Uint8Array;
}

export interface PdfZBlokowOpts extends Omit<PdfZTekstuOpts, "contentText" | "fonts"> {
  /** Bloki dokumentu (np. `blokiZDocx` wygenerowanej umowy). */
  bloki: Blok[];
  /** Domyślnie Liberation Serif (metryka Times New Roman — jak w .docx). */
  fonts?: FontyPdf;
  /** Metadane „Creator”; domyślnie „Finance You — dokument do podpisu”. */
  creator?: string;
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

type RodzajStylu = "tytul" | "podtytul" | "naglowek" | "akapit" | "stopka";

/** Pakiet inwestora (`pdfZTekstu`) — układ bez zmian. */
const STYLE_PAKIET: Record<RodzajStylu, Styl> = {
  tytul: { size: 15, lh: 19, bold: true, before: 10, after: 6, color: BLACK },
  podtytul: { size: 11, lh: 14, bold: false, before: 0, after: 10, color: GRAY },
  naglowek: { size: 11, lh: 14, bold: true, before: 10, after: 4, color: BLACK },
  akapit: { size: 10, lh: 13.5, bold: false, before: 0, after: 4, color: BLACK },
  stopka: { size: 8, lh: 10, bold: false, before: 10, after: 0, color: GRAY },
};

/** Umowa z .docx (`pdfZBlokow`) — rozmiary i odstępy jak w `blokiDoXml`. */
const STYLE_UMOWA: Record<RodzajStylu, Styl> = {
  tytul: { size: 14, lh: 17, bold: true, before: 0, after: 6, color: BLACK },
  podtytul: { size: 12, lh: 15, bold: true, before: 0, after: 6, color: BLACK },
  naglowek: { size: 10.5, lh: 13.9, bold: true, before: 12, after: 6, color: BLACK },
  akapit: { size: 10.5, lh: 13.9, bold: false, before: 0, after: 4, color: BLACK },
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
  italic: PDFFont;
  obslugiwane: Set<number>;
  style: Record<RodzajStylu, Styl>;
  /** Układ umowy: tytuły na środku, akapity „both” wyjustowane. */
  umowa: boolean;
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

/** Wiersze akapitu złamane do szerokości `maxW` (fonty wg runów). */
function wierszeRunow(ctx: Ctx, runs: Run[], styl: Styl, maxW: number): Slowo[][] {
  const slowa: Slowo[] = [];
  for (const run of runs) {
    const font = styl.bold || run.bold ? ctx.bold : run.italic ? ctx.italic : ctx.regular;
    const tekst = oczysc(run.tekst, ctx.obslugiwane);
    for (const s of tekst.split(" ")) {
      if (!s) continue;
      for (const kawalek of podzielDlugie(s, font, styl.size, maxW)) {
        slowa.push({ tekst: kawalek, font, w: font.widthOfTextAtSize(kawalek, styl.size) });
      }
    }
  }
  const spacja = ctx.regular.widthOfTextAtSize(" ", styl.size);
  return slowa.length ? lamanie(slowa, spacja, maxW) : [[]];
}

type Wyrownanie = "left" | "center" | "right" | "both";

/** Rysuje jeden wiersz słów od `x` w polu szerokości `maxW` na wysokości `y`. */
function rysujWiersz(
  ctx: Ctx,
  wiersz: Slowo[],
  styl: Styl,
  x: number,
  y: number,
  maxW: number,
  align: Wyrownanie,
  ostatni: boolean,
): void {
  const spacja = ctx.regular.widthOfTextAtSize(" ", styl.size);
  const szer = wiersz.reduce((a, s) => a + s.w, 0) + spacja * Math.max(0, wiersz.length - 1);
  let odstep = spacja;
  let px = x;
  if (align === "center") px = x + (maxW - szer) / 2;
  else if (align === "right") px = x + maxW - szer;
  else if (align === "both" && !ostatni && wiersz.length > 1) {
    odstep = spacja + (maxW - szer) / (wiersz.length - 1);
  }
  for (const s of wiersz) {
    ctx.page.drawText(s.tekst, { x: px, y, size: styl.size, font: s.font, color: styl.color });
    px += s.w + odstep;
  }
}

function rysujAkapit(
  ctx: Ctx,
  runs: Run[],
  styl: Styl,
  opcje: {
    wciecie?: number;
    etykieta?: string;
    etykietaBold?: boolean;
    trzymajZNastepnym?: boolean;
    align?: Wyrownanie;
  } = {},
): void {
  const wciecie = opcje.wciecie ?? 0;
  const maxW = TEXT_W - wciecie;
  const wiersze = wierszeRunow(ctx, runs, styl, maxW);

  if (!naPoczatkuStrony(ctx)) ctx.y -= styl.before;
  // Nagłówek nie zostaje sam na dole strony: potrzebujemy miejsca na niego
  // i dwa wiersze tekstu pod nim.
  const minWys = opcje.trzymajZNastepnym
    ? wiersze.length * styl.lh + 2 * ctx.style.akapit.lh
    : Math.min(wiersze.length, 2) * styl.lh;
  zapewnij(ctx, minWys);

  wiersze.forEach((wiersz, i) => {
    zapewnij(ctx, styl.lh);
    ctx.y -= styl.lh;
    const x = MARGIN.left + wciecie;
    if (i === 0 && opcje.etykieta) {
      const et = oczysc(opcje.etykieta, ctx.obslugiwane);
      // Wysunięcie jak `w:hanging` w .docx: etykieta w polu wcięcia.
      const ex = ctx.umowa ? x - Math.min(18, wciecie) : Math.max(MARGIN.left, x - 14);
      ctx.page.drawText(et, {
        x: ex,
        y: ctx.y,
        size: styl.size,
        font: opcje.etykietaBold ? ctx.bold : ctx.regular,
        color: styl.color,
      });
    }
    rysujWiersz(ctx, wiersz, styl, x, ctx.y, maxW, opcje.align ?? "left", i === wiersze.length - 1);
  });
  ctx.y -= styl.after;
}

const tekstKomorki = (k: Komorka): Run[] =>
  typeof k.tekst === "string" ? [{ tekst: k.tekst, bold: k.bold }] : k.tekst;

/** Tabela z ramką; wiersz nie dzieli się między strony, nagłówek powtarzany. */
function rysujTabele(ctx: Ctx, blok: Extract<Blok, { t: "tabela" }>): void {
  const suma = blok.szerokosci.reduce((a, x) => a + x, 0) || 1;
  const pelna = Math.min(TEXT_W, (suma / 9638) * TEXT_W);
  const kolumny = blok.szerokosci.map((w) => (w / suma) * pelna);
  const male = blok.szerokosci.length > 4;
  const bazowy = ctx.style.akapit;
  const styl: Styl = male
    ? { ...bazowy, size: 9, lh: 11.2 }
    : { ...bazowy, lh: Math.min(bazowy.lh, bazowy.size * 1.25) };
  const PAD_X = 4;
  const PAD_Y = 2;
  const RAMKA = rgb(0.5, 0.5, 0.5);

  const przygotuj = (w: (typeof blok.wiersze)[number]) => {
    const komorki = w.komorki.map((k, i) => {
      const runs = tekstKomorki(k).map((r) => (w.naglowek ? { ...r, bold: true } : r));
      const szer = Math.max(8, (kolumny[i] ?? kolumny[kolumny.length - 1]) - 2 * PAD_X);
      return { k, wiersze: wierszeRunow(ctx, runs, styl, szer), szer };
    });
    const linie = Math.max(1, ...komorki.map((c) => c.wiersze.length));
    return { komorki, wys: linie * styl.lh + 2 * PAD_Y + 2 };
  };

  const naglowki = blok.wiersze.filter((w) => w.naglowek).map(przygotuj);
  const rysujRzad = (rz: ReturnType<typeof przygotuj>) => {
    const gora = ctx.y;
    let x = MARGIN.left;
    rz.komorki.forEach((c, i) => {
      const w = kolumny[i] ?? 0;
      ctx.page.drawRectangle({
        x,
        y: gora - rz.wys,
        width: w,
        height: rz.wys,
        borderColor: RAMKA,
        borderWidth: 0.5,
      });
      c.wiersze.forEach((wiersz, j) => {
        const y = gora - PAD_Y - (j + 1) * styl.lh + (styl.lh - styl.size) / 2;
        rysujWiersz(ctx, wiersz, styl, x + PAD_X, y, c.szer, c.k.align ?? "left", true);
      });
      x += w;
    });
    ctx.y = gora - rz.wys;
  };

  if (!naPoczatkuStrony(ctx)) ctx.y -= 2;
  let pierwszy = true;
  for (const w of blok.wiersze) {
    const rz = przygotuj(w);
    if (ctx.y - rz.wys < MARGIN.bottom) {
      nowaStrona(ctx);
      if (!w.naglowek) for (const n of naglowki) rysujRzad(n);
    } else if (pierwszy && naglowki.length && w.naglowek) {
      // Nagłówek tabeli nie zostaje sam na dole strony.
      const nast = blok.wiersze.find((x) => !x.naglowek);
      const zapas = nast ? przygotuj(nast).wys : 0;
      if (ctx.y - rz.wys - zapas < MARGIN.bottom) nowaStrona(ctx);
    }
    pierwszy = false;
    rysujRzad(rz);
  }
  ctx.y -= 8;
}

/** Podpisy obok siebie (maks. 3 w rzędzie): linia kropek, rola, nazwa, reprezentacja. */
function rysujPodpisy(ctx: Ctx, osoby: Podpisujacy[]): void {
  const kol = Math.min(3, Math.max(1, osoby.length));
  const szer = TEXT_W / kol;
  const baz = ctx.style.akapit;
  const styl: Styl = { ...baz, after: 0 };
  const maly: Styl = { ...baz, size: 9, lh: 11.5, after: 0 };
  const LUKA = 36;
  for (let i = 0; i < osoby.length; i += kol) {
    const grupa = osoby.slice(i, i + kol);
    const kolumny = grupa.map((o) => {
      const linie: { wiersze: Slowo[][]; styl: Styl }[] = [
        { wiersze: wierszeRunow(ctx, [{ tekst: "……………………………………" }], styl, szer - 12), styl },
        { wiersze: wierszeRunow(ctx, [{ tekst: o.rola, italic: true }], styl, szer - 12), styl },
      ];
      if (o.nazwa)
        linie.push({ wiersze: wierszeRunow(ctx, [{ tekst: o.nazwa }], styl, szer - 12), styl });
      for (const x of o.wImieniu ?? [])
        linie.push({ wiersze: wierszeRunow(ctx, [{ tekst: x }], maly, szer - 12), styl: maly });
      const wys = linie.reduce((a, l) => a + l.wiersze.length * l.styl.lh, 0);
      return { linie, wys };
    });
    const wys = LUKA + Math.max(...kolumny.map((k) => k.wys));
    zapewnij(ctx, wys + 6);
    const gora = ctx.y - LUKA;
    kolumny.forEach((k, j) => {
      let y = gora;
      const x = MARGIN.left + j * szer + 6;
      for (const l of k.linie) {
        for (const w of l.wiersze) {
          y -= l.styl.lh;
          rysujWiersz(ctx, w, l.styl, x, y, szer - 12, "center", true);
        }
      }
    });
    ctx.y -= wys + 6;
  }
}

function rysujBlok(ctx: Ctx, blok: Blok): void {
  const S = ctx.style;
  const srodek: Wyrownanie | undefined = ctx.umowa ? "center" : undefined;
  switch (blok.t) {
    case "tytul":
      if (blok.nowaStrona && !naPoczatkuStrony(ctx)) nowaStrona(ctx);
      rysujAkapit(ctx, [{ tekst: blok.tekst }], S.tytul, {
        trzymajZNastepnym: true,
        align: srodek,
      });
      return;
    case "podtytul":
      rysujAkapit(ctx, [{ tekst: blok.tekst }], S.podtytul, {
        trzymajZNastepnym: ctx.umowa,
        align: srodek,
      });
      return;
    case "naglowek":
      rysujAkapit(ctx, [{ tekst: blok.tekst }], S.naglowek, { trzymajZNastepnym: true });
      return;
    case "akapit": {
      const wciecie = ctx.umowa
        ? blok.wciecie === "podpunkt"
          ? 36
          : blok.wciecie
            ? 18
            : 0
        : blok.wciecie === "ustep"
          ? 14
          : blok.wciecie === "podpunkt" || blok.wciecie === "lista"
            ? 28
            : 0;
      rysujAkapit(ctx, blok.runs, S.akapit, {
        wciecie,
        etykieta: blok.etykieta,
        etykietaBold: ctx.umowa && blok.wciecie === "ustep",
        align: ctx.umowa ? (blok.align ?? "both") : undefined,
      });
      return;
    }
    case "tabela":
      rysujTabele(ctx, blok);
      return;
    case "podpisy":
      rysujPodpisy(ctx, blok.osoby);
      return;
  }
}

function rysujStopki(ctx: Ctx, title: string, version: string): void {
  const strony = ctx.doc.getPages();
  const lewy = oczysc(`Finance You · ${title} · ${version}`, ctx.obslugiwane);
  const S = ctx.style.stopka;
  strony.forEach((page, i) => {
    const prawy = `Strona ${i + 1} z ${strony.length}`;
    const prawyW = ctx.regular.widthOfTextAtSize(prawy, S.size);
    // Lewa część stopki nie może nachodzić na numer strony — przycinamy.
    let l = lewy;
    while (l && ctx.regular.widthOfTextAtSize(l, S.size) > TEXT_W - prawyW - 12) {
      l = l.slice(0, -2).trimEnd() + "…";
    }
    page.drawText(l, { x: MARGIN.left, y: 36, size: S.size, font: ctx.regular, color: GRAY });
    page.drawText(prawy, {
      x: A4.w - MARGIN.right - prawyW,
      y: 36,
      size: S.size,
      font: ctx.regular,
      color: GRAY,
    });
  });
}

interface BudujOpts extends Omit<PdfZTekstuOpts, "contentText" | "fonts"> {
  bloki: Blok[];
  fonts: FontyPdf;
  umowa: boolean;
  creator?: string;
}

async function budujPdf(opts: BudujOpts): Promise<PDFDocument> {
  const fonts = opts.fonts;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fonts.regular, { subset: true });
  const bold = await doc.embedFont(fonts.bold, { subset: true });
  const italic = fonts.italic ? await doc.embedFont(fonts.italic, { subset: true }) : regular;
  const obslugiwane = new Set(regular.getCharacterSet());

  const ctx: Ctx = {
    doc,
    page: doc.addPage([A4.w, A4.h]),
    y: A4.h - MARGIN.top,
    regular,
    bold,
    italic,
    obslugiwane,
    style: opts.umowa ? STYLE_UMOWA : STYLE_PAKIET,
    umowa: opts.umowa,
  };

  for (const blok of opts.bloki) rysujBlok(ctx, blok);

  if (opts.sha256) {
    const id = [
      opts.packageId ? `Pakiet ${opts.packageId}` : null,
      `wersja ${opts.version}`,
      `SHA-256 treści: ${opts.sha256}`,
    ]
      .filter(Boolean)
      .join(" · ");
    rysujAkapit(ctx, [{ tekst: `Identyfikator dokumentu — ${id}` }], ctx.style.stopka);
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
  doc.setCreator(
    opts.creator ??
      (opts.umowa ? "Finance You — dokument do podpisu" : "Finance You — pakiet umów inwestora"),
  );
  doc.setLanguage("pl-PL");
  doc.setCreationDate(date);
  doc.setModificationDate(date);
  return doc;
}

const budujPakiet = (opts: PdfZTekstuOpts) =>
  budujPdf({
    ...opts,
    bloki: blokiZTekstu(opts.contentText),
    fonts: opts.fonts ?? LIBERATION_SANS,
    umowa: false,
  });

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
  const doc = await budujPakiet(opts);
  return doc.save();
}

/** PDF jako base64 (załącznik e-mail) — bez `Buffer`, działa w Workerze. */
export async function pdfZTekstuBase64(opts: PdfZTekstuOpts): Promise<string> {
  const doc = await budujPakiet(opts);
  return doc.saveAsBase64();
}

/**
 * PDF z bloków dokumentu (umowa z .docx) — układ jak w pliku Word: tytuły na
 * środku, wyjustowane ustępy z wysuniętą etykietą, tabele z ramką (nagłówek
 * powtarzany na kolejnej stronie), podpisy obok siebie.
 */
export async function pdfZBlokow(opts: PdfZBlokowOpts): Promise<Uint8Array> {
  const doc = await budujPdf({ ...opts, fonts: opts.fonts ?? LIBERATION_SERIF, umowa: true });
  return doc.save();
}
