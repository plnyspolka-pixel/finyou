/**
 * PDF na trwały nośnik: treść z `content_text`, polskie znaki z fontu
 * Liberation Sans, załączniki od nowej strony, stopka z numeracją, SHA-256
 * treści w identyfikatorze. Realne dokumenty v7 budujemy tak jak skrypt
 * `scripts/legal/build-pakiet-v7.ts`.
 */
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildPakietV7 } from "./build-v7";
import { pdfFilename, pdfZTekstu, pdfZTekstuBase64, znakiPozaFontem } from "./pdf-z-tekstu";

const DATE = new Date(Date.UTC(2026, 9, 3, 12, 0, 0));

const PROBKA = [
  "PAKIET UMOWNY",
  "Umowa testowa pośrednictwa — zażółć gęślą jaźń",
  "Wersja",
  "TEST.v1 • 3 października 2026 r.",
  "Preambuła",
  "Strony zgodnie oświadczają, że ".repeat(40).trim(),
  "§ 1. Definicje",
  "☐ osoba fizyczna  ☐ osoba fizyczna prowadząca działalność  ☐ osoba prawna",
  "________________________________________________________________",
  ...Array.from(
    { length: 120 },
    (_, i) => `${i + 1}. Postanowienie numer ${i + 1} — treść ustępu.`,
  ),
  "ZAŁĄCZNIK NR 1",
  "Karta Leada",
  "Treść załącznika.",
].join("\n");

describe("pdfZTekstu", () => {
  it("renders Polish text as a multi-page A4 PDF with metadata", async () => {
    const bytes = await pdfZTekstu({
      contentText: PROBKA,
      title: "Umowa testowa",
      version: "v1",
      sha256: "abc123",
      packageId: "FY-TEST",
      date: DATE,
    });
    expect(bytes.subarray(0, 5)).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])); // %PDF-
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
    expect(doc.getTitle()).toBe("Umowa testowa");
    expect(doc.getSubject()).toBe("FY-TEST · v1 · SHA-256 abc123");
    expect(doc.getAuthor()).toBe("Finance You");
    expect(doc.getCreationDate()?.toISOString()).toBe(DATE.toISOString());
  });

  it("ZAŁĄCZNIK starts a new page and the output is deterministic for a fixed date", async () => {
    const krotki = ["TYTUŁ", "Podtytuł", "Akapit.", "ZAŁĄCZNIK NR 1", "Zał.", "Treść."].join("\n");
    const a = await pdfZTekstu({ contentText: krotki, title: "T", version: "v1", date: DATE });
    const b = await pdfZTekstu({ contentText: krotki, title: "T", version: "v1", date: DATE });
    expect((await PDFDocument.load(a)).getPageCount()).toBe(2);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it("base64 variant decodes to the same kind of document", async () => {
    const b64 = await pdfZTekstuBase64({ contentText: "A\nB\nC", title: "T", version: "v1" });
    expect(Buffer.from(b64, "base64").subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // pdf-lib przyjmuje base64 wprost (w jsdom Buffer nie przechodzi walidacji Uint8Array).
    expect((await PDFDocument.load(b64)).getPageCount()).toBe(1);
  });

  it("maps .docx attachment names to .pdf", () => {
    expect(pdfFilename("FY-umowa-ramowa-v7.docx", "umowa_ramowa")).toBe("FY-umowa-ramowa-v7.pdf");
    expect(pdfFilename("FY-NDA-v6.DOCX", "nda")).toBe("FY-NDA-v6.pdf");
    expect(pdfFilename("bez-rozszerzenia", "nda")).toBe("bez-rozszerzenia.pdf");
    expect(pdfFilename(null, "rodo")).toBe("rodo.pdf");
    expect(pdfFilename("  ", "rodo")).toBe("rodo.pdf");
  });

  it("every character of the real v7 pack is covered by the embedded font", async () => {
    const docs = await buildPakietV7();
    expect(docs.map((d) => d.code).sort()).toEqual(["nda", "rodo", "umowa_ramowa"]);
    for (const d of docs) {
      expect(await znakiPozaFontem(d.content_text), d.code).toEqual([]);
      const bytes = await pdfZTekstu({
        contentText: d.content_text,
        title: d.title,
        version: d.version,
        sha256: d.sha256,
        packageId: d.package_id,
        date: DATE,
      });
      const pdf = await PDFDocument.load(bytes);
      expect(pdf.getPageCount(), d.code).toBeGreaterThan(1);
      expect(pdf.getSubject()).toContain(d.sha256);
    }
  }, 60_000);
});
