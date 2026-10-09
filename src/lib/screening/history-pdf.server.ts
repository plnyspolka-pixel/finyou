// Eksport PDF historii sprawdzeń klienta / inwestora na potrzeby kontroli GIIF:
// podmioty, statusy, wszystkie przebiegi (z wersjami źródeł), trafienia,
// sprawy i decyzje z uzasadnieniem, oświadczenia PEP oraz wpisy dziennika
// audytowego z łańcuchem skrótów. pdf-lib + Liberation Sans (polskie znaki).
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { LIBERATION_SANS } from "@/lib/legal/legal-fonts";

const A4 = { w: 595.28, h: 841.89 };
const M = 48;

export interface HistoryPdfInput {
  title: string;
  generatedAt: Date;
  generatedBy: string;
  sections: Array<{ heading: string; lines: string[] }>;
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/);
    let line = "";
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate;
      else {
        if (line) out.push(line);
        // bardzo długie „słowa” (np. skróty sha256) tniemy twardo
        let rest = w;
        while (font.widthOfTextAtSize(rest, size) > width && rest.length > 8) {
          let cut = rest.length;
          while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--;
          out.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        line = rest;
      }
    }
    out.push(line);
  }
  return out;
}

function sanitize(s: string, font: PDFFont): string {
  const supported = new Set(font.getCharacterSet());
  let out = "";
  for (const ch of s.replace(/\t/g, "  ")) out += supported.has(ch.codePointAt(0)!) ? ch : "?";
  return out;
}

export async function buildHistoryPdf(input: HistoryPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(LIBERATION_SANS.regular, { subset: true });
  const bold = await doc.embedFont(LIBERATION_SANS.bold, { subset: true });
  doc.setTitle(input.title);
  doc.setCreator("Finance You — moduł screeningu PEP i sankcji");
  doc.setCreationDate(input.generatedAt);

  let page: PDFPage = doc.addPage([A4.w, A4.h]);
  let y = A4.h - M;
  const width = A4.w - 2 * M;
  const newPage = () => {
    page = doc.addPage([A4.w, A4.h]);
    y = A4.h - M;
  };
  const write = (
    text: string,
    font: PDFFont,
    size: number,
    color = rgb(0.1, 0.1, 0.1),
    gap = 3,
  ) => {
    for (const l of wrap(sanitize(text, font), font, size, width)) {
      if (y < M + size) newPage();
      page.drawText(l, { x: M, y: y - size, size, font, color });
      y -= size + gap;
    }
  };

  write(input.title, bold, 15, rgb(0, 0, 0), 6);
  write(
    `Wygenerowano: ${input.generatedAt.toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" })} · przez: ${input.generatedBy}`,
    regular,
    9,
    rgb(0.4, 0.4, 0.4),
  );
  write(
    "Dokument z systemu Finance You sp. z o.o. Dziennik audytu jest nieusuwalny (tylko zapis), a wpisy tworzą łańcuch skrótów SHA-256.",
    regular,
    9,
    rgb(0.4, 0.4, 0.4),
    10,
  );
  for (const s of input.sections) {
    y -= 6;
    write(s.heading, bold, 11.5, rgb(0, 0, 0), 5);
    if (s.lines.length === 0) write("— brak —", regular, 9.5);
    for (const l of s.lines) write(l, regular, 9.5);
  }
  const pages = doc.getPages();
  pages.forEach((p, i) =>
    p.drawText(`${i + 1} / ${pages.length}`, {
      x: A4.w - M - 30,
      y: 24,
      size: 8,
      font: regular,
      color: rgb(0.5, 0.5, 0.5),
    }),
  );
  return doc.save();
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
