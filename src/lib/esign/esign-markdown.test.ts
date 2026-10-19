import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { markdownBlocks, renderEsignMarkdown, previewDocumentInput } from "./esign-markdown";
import { CreateInput } from "./esign-schemas";

const base = { title: "Umowa pożyczki", signers: [{ kind: "ja" }] };
describe("Markdown e-signature source rules", () => {
  it("requires exactly one of the three sources", () => {
    const sources = { generatedDocumentId: "00000000-0000-0000-0000-000000000002", fileBase64: "a".repeat(16), documentMarkdown: "# Umowa" };
    for (let mask = 0; mask < 8; mask++) {
      const selected = Object.fromEntries(Object.entries(sources).filter((_, i) => mask & (1 << i)));
      expect(CreateInput.safeParse({ ...base, ...selected }).success).toBe([1, 2, 4].includes(mask));
    }
  });
  it("limits Markdown to 200000 characters", () => {
    expect(previewDocumentInput.safeParse({ document_markdown: "a".repeat(200000) }).success).toBe(true);
    expect(previewDocumentInput.safeParse({ document_markdown: "a".repeat(200001) }).success).toBe(false);
  });
  it("rejects empty content and headers without Markdown", () => {
    expect(CreateInput.safeParse({ ...base, documentMarkdown: "   " }).success).toBe(false);
    expect(CreateInput.safeParse({ ...base, fileBase64: "a".repeat(16), documentHeader: "UMOWA" }).success).toBe(false);
  });
  it("maps headings, emphasis, numbered lists, tables and centered text", () => {
    const { bloki, pageBreakBefore } = markdownBlocks("# Umowa\n\n## Strony\n\n### Warunki\n\n**Kwota** i *termin*.\n\n3. Trzecia\n4. Czwarta\n\n- Punkt\n\n| Strona | Kwota |\n| --- | ---: |\n| Fundacja | 20 000 zł |\n\n-> Warszawa <-\n\\pagebreak\n\nDruga strona.");
    expect(bloki.slice(0, 3).map((b) => b.t)).toEqual(["tytul", "podtytul", "naglowek"]);
    expect(bloki).toContainEqual(expect.objectContaining({ t: "akapit", runs: expect.arrayContaining([{ tekst: "Kwota", bold: true }, { tekst: "termin", italic: true }]) }));
    expect(bloki).toContainEqual(expect.objectContaining({ etykieta: "3." }));
    expect(bloki).toContainEqual(expect.objectContaining({ etykieta: "–" }));
    expect(bloki).toContainEqual(expect.objectContaining({ t: "tabela", wiersze: expect.arrayContaining([expect.objectContaining({ naglowek: true })]) }));
    expect(bloki).toContainEqual({ t: "akapit", runs: [{ tekst: "Warszawa" }], align: "center" });
    expect(pageBreakBefore).toEqual([bloki.length - 1]);
  });
  it("renders embedded-font A4 PDF with two explicit pages", async () => {
    const bytes = await renderEsignMarkdown("# UMOWA POŻYCZKI\n\nZażółć gęślą jaźń. **Kwota**: 20 000 zł, *termin* uzgodniony.\n\n| Strona | Kwota |\n| --- | ---: |\n| Fundacja | 20 000 zł |\n\n-> Warszawa, 17.09.2026 <-\n\\pagebreak\n\n## Podpisy\n\nTreść drugiej strony.", "UMOWA POŻYCZKI | 20 000 PLN | 17.09.2026");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    expect(Math.round(doc.getPage(0).getSize().width)).toBe(595);
    expect(Math.round(doc.getPage(0).getSize().height)).toBe(842);
    if (process.env.ESIGN_MARKDOWN_TEST_PDF) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(process.env.ESIGN_MARKDOWN_TEST_PDF, bytes);
    }
  });
});