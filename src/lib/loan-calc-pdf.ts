// ════════════════════════════════════════════════════════════════════
// PDF kalkulatora pożyczki z WBUDOWANYM, maszynowo-czytelnym blokiem danych.
//
// Cel: operator pobiera z kalkulatora PDF, a Kreator dokumentów odczytuje z tego
// samego PDF wszystkie dane finansowe DETERMINISTYCZNIE (bez AI) i uzupełnia wzór
// „umowa pożyczki z załącznikami REDLINE" — łącznie z całym harmonogramem.
//
// Mechanizm: sami generujemy PDF (bez zewnętrznych bibliotek — w tym środowisku
// nie da się ich doinstalować), więc kontrolujemy bajty. Payload zapisujemy jako
// Base64(JSON) w polu /Keywords słownika Info oraz jako komentarz `%FINYOU1:` —
// odczyt to zwykłe wyszukanie markera w bajtach pliku (100% powtarzalne).
//
// Tekst widoczny w PDF jest ASCII-fold (bez polskich znaków), bo standardowe
// fonty PDF (Courier) nie mają pełnego zestawu — pełne dane (z ogonkami) są
// w bloku JSON, więc nic nie ginie.
// ════════════════════════════════════════════════════════════════════

export interface LoanCalcScheduleRow {
  idx: number;
  /** Termin raty w formacie DD.MM.RRRR (lub tekstowym z kalkulatora). */
  date: string;
  rata: number;
  kap: number;
  ods: number;
  /** Część prowizji przypadająca na ratę (model silnika). Opcjonalne dla starszych PDF-ów. */
  prow?: number;
  saldo: number;
}

export interface LoanCalcPayload {
  v: 1;
  generatedAt: string;
  /** Kwota do wypłaty na rękę (netto dla klienta). */
  onHand: number;
  /** Kwota nominalna pożyczki (brutto z umowy). */
  nominal: number;
  months: number;
  annualRate: number;
  commissionPct: number;
  /** Prowizja inwestora (PLN). */
  commissionPln: number;
  financeYouFeePct: number;
  financeYouFeePln: number;
  /** Rata miesięczna (po ograniczeniu maks. ratą). */
  monthlyPayment: number;
  /** Rata balonowa (ostatnia nadwyżka), 0 gdy brak. */
  balloon: number;
  totalInterest: number;
  totalCost: number;
  /** Łączna kwota do spłaty = suma rat = należność inwestora. */
  totalToRepay: number;
  /** Proponowana kwota hipoteki. */
  mortgageAmount: number;
  /** Kwota poddania się egzekucji z art. 777 § 1 pkt 5 k.p.c. */
  art777Amount: number;
  /** Data umowy DD.MM.RRRR (jeśli ustawiona). */
  agreementDate?: string;
  clientName?: string | null;
  schedule: LoanCalcScheduleRow[];
}

const MARKER = "%FINYOU1:";

// ─────────────────────────────────────────────────────────────────────
// Pomocnicze
// ─────────────────────────────────────────────────────────────────────

const PLN = (n: number) =>
  new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Math.round((Number(n) || 0) * 100) / 100,
  );

/** Usuwa polskie znaki diakrytyczne — do tekstu widocznego w PDF (font Courier). */
function fold(s: string): string {
  const map: Record<string, string> = {
    ą: "a",
    ć: "c",
    ę: "e",
    ł: "l",
    ń: "n",
    ó: "o",
    ś: "s",
    ź: "z",
    ż: "z",
    Ą: "A",
    Ć: "C",
    Ę: "E",
    Ł: "L",
    Ń: "N",
    Ó: "O",
    Ś: "S",
    Ź: "Z",
    Ż: "Z",
    "–": "-",
    "—": "-",
    "„": '"',
    "”": '"',
    "…": "...",
    " ": " ",
  };
  return (s ?? "")
    .replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ–—„”… ]/g, (c) => map[c] ?? c)
    .replace(/[^\x20-\x7e]/g, "");
}

/** Base64 z UTF-8 (działa w przeglądarce i w Node). */
function toBase64Utf8(s: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(s, "utf-8").toString("base64");
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));

  return btoa(bin);
}

function fromBase64Utf8(b64: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(b64, "base64").toString("utf-8");

  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function pdfEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

// ─────────────────────────────────────────────────────────────────────
// Budowa treści (linie tekstu)
// ─────────────────────────────────────────────────────────────────────

function buildLines(p: LoanCalcPayload): string[] {
  const L: string[] = [];
  L.push("FINANCE YOU - KALKULACJA POZYCZKI");
  L.push("");
  if (p.clientName) L.push(`Klient: ${p.clientName}`);
  if (p.agreementDate) L.push(`Data umowy: ${p.agreementDate}`);
  L.push(`Wygenerowano: ${p.generatedAt}`);
  L.push("");
  L.push("PARAMETRY");
  L.push(`  Kwota do wyplaty na reke:   ${PLN(p.onHand)} zl`);
  L.push(`  Kwota nominalna pozyczki:   ${PLN(p.nominal)} zl`);
  L.push(`  Okres:                      ${p.months} mies.`);
  L.push(`  Oprocentowanie roczne:      ${PLN(p.annualRate)} %`);
  L.push(`  Rata miesieczna:            ${PLN(p.monthlyPayment)} zl`);
  if (p.balloon > 0) L.push(`  Rata balonowa (ostatnia):   ${PLN(p.balloon)} zl`);
  L.push(`  Prowizja inwestora:         ${PLN(p.commissionPln)} zl (${PLN(p.commissionPct)}%)`);
  L.push(
    `  Prowizja Finance You:       ${PLN(p.financeYouFeePln)} zl (koszt inwestora, platna na wejsciu)`,
  );
  L.push(`  Suma odsetek:               ${PLN(p.totalInterest)} zl`);
  L.push(`  Calkowity koszt pozyczki:   ${PLN(p.totalCost)} zl (po stronie klienta)`);
  L.push(`  Laczna kwota do splaty:     ${PLN(p.totalToRepay)} zl`);
  L.push("");
  L.push("ZABEZPIECZENIA (PROPONOWANE)");
  L.push(`  Kwota hipoteki:             ${PLN(p.mortgageAmount)} zl`);
  L.push(`  Kwota art. 777 k.p.c.:      ${PLN(p.art777Amount)} zl`);
  L.push("");
  L.push("HARMONOGRAM SPLAT");
  L.push("  Nr  Termin       Rata         Kapital      Odsetki      Prowizja     Saldo");
  const col = (s: string, w: number) =>
    s.length >= w ? s.slice(0, w) : s + " ".repeat(w - s.length);
  for (const r of p.schedule) {
    L.push(
      "  " +
        col(String(r.idx), 4) +
        col(r.date, 13) +
        col(PLN(r.rata), 13) +
        col(PLN(r.kap), 13) +
        col(PLN(r.ods), 13) +
        col(PLN(r.prow ?? 0), 13) +
        col(PLN(r.saldo), 13),
    );
  }
  L.push(
    "  " +
      col("", 4) +
      col("RAZEM", 13) +
      col(PLN(p.totalToRepay), 13) +
      col("", 13) +
      col(PLN(p.totalInterest), 13),
  );
  L.push("");
  L.push("Dokument informacyjny wygenerowany w kalkulatorze Finance You.");
  L.push("Nie stanowi oferty w rozumieniu art. 66 KC.");
  return L.map(fold);
}

// ─────────────────────────────────────────────────────────────────────
// Generator PDF (bez zależności)
// ─────────────────────────────────────────────────────────────────────

/** Buduje bajty PDF z wbudowanym payloadem. */
export function buildLoanCalcPdfBytes(payload: LoanCalcPayload): Uint8Array {
  const lines = buildLines(payload);

  // Strona A4 (punkty), font Courier 9pt.
  const PAGE_W = 595,
    PAGE_H = 842,
    MARGIN = 40,
    FS = 9,
    LH = 12;
  const linesPerPage = Math.floor((PAGE_H - 2 * MARGIN) / LH);
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += linesPerPage) pages.push(lines.slice(i, i + linesPerPage));
  if (pages.length === 0) pages.push([""]);

  const b64 = toBase64Utf8(JSON.stringify(payload));

  // Obiekty: 1 Catalog, 2 Pages, 3 Font, 4 Info, potem pary (Page, Content).
  const pageObjIds: number[] = [];
  const objects: string[] = [];
  const add = (body: string) => objects.push(body); // id = objects.length (1-based)

  add("<< /Type /Catalog /Pages 2 0 R >>"); // 1
  add("PAGES_PLACEHOLDER"); // 2 (uzupełnimy po zebraniu kidsów)
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>"); // 3
  add(`<< /Producer (Finance You) /Title (Kalkulacja pozyczki) /Keywords (${b64}) >>`); // 4

  let nextId = 5;
  for (const pageLines of pages) {
    const pageId = nextId++;
    const contentId = nextId++;
    pageObjIds.push(pageId);

    let stream =
      "BT\n/F1 " + FS + " Tf\n" + LH + " TL\n" + MARGIN + " " + (PAGE_H - MARGIN) + " Td\n";
    pageLines.forEach((ln, i) => {
      if (i > 0) stream += "T*\n";
      stream += "(" + pdfEscape(ln) + ") Tj\n";
    });
    stream += "ET";

    // Page
    objects[pageId - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    // Content
    objects[contentId - 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  }

  // Uzupełnij Pages
  objects[1] = `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjIds.length} >>`;

  // Złóż plik z tablicą xref.
  let pdf = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets: number[] = [];
  for (let i = 0; i < objects.length; i++) {
    offsets[i] = pdf.length;
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 0; i < objects.length; i++) {
    pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  }
  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 4 0 R >>\n` +
    `startxref\n${xrefStart}\n%%EOF\n`;
  // Marker z payloadem jako komentarz na końcu (druga, redundantna droga odczytu).
  pdf += `${MARKER}${b64}\n`;

  // Zamiana na bajty (latin1 — wszystkie znaki < 256).
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

/** Blob PDF do pobrania w przeglądarce. */
export function buildLoanCalcPdfBlob(payload: LoanCalcPayload): Blob {
  const bytes = buildLoanCalcPdfBytes(payload);
  const buf = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Blob([buf], { type: "application/pdf" });
}

// ─────────────────────────────────────────────────────────────────────
// Odczyt payloadu z pliku PDF (deterministyczny)
// ─────────────────────────────────────────────────────────────────────

function bytesToLatin1(input: ArrayBuffer | Uint8Array | string): string {
  if (typeof input === "string") return input;
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return s;
}

/**
 * Wyciąga payload z PDF wygenerowanego przez kalkulator Finance You.
 * Szuka markera `%FINYOU1:` lub pola `/Keywords (...)`. Zwraca null, gdy to nie
 * jest nasz PDF (wtedy brak deterministycznych danych — bez zgadywania AI).
 */
export function extractLoanCalcPayload(
  input: ArrayBuffer | Uint8Array | string,
): LoanCalcPayload | null {
  const raw = bytesToLatin1(input);
  let b64: string | null = null;

  const mIdx = raw.lastIndexOf(MARKER);
  if (mIdx >= 0) {
    const rest = raw.slice(mIdx + MARKER.length);
    const m = rest.match(/^([A-Za-z0-9+/=]+)/);
    if (m) b64 = m[1];
  }
  if (!b64) {
    const k = raw.match(/\/Keywords\s*\(([A-Za-z0-9+/=]+)\)/);
    if (k) b64 = k[1];
  }
  if (!b64) return null;

  try {
    const json = fromBase64Utf8(b64);
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.schedule)) {
      return parsed as LoanCalcPayload;
    }
  } catch {
    /* nie nasz PDF / uszkodzony blok */
  }
  return null;
}
