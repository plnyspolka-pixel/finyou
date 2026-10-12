/**
 * PDF do e-podpisu z wygenerowanego .docx kompletu: bloki odczytane z
 * word/document.xml (tytuły, ustępy, tabele, podpisy) i wydrukowane z
 * zachowaniem układu — zamiast spłaszczonego tekstu z „ | ” w miejscu tabel.
 */
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { przetworzSzkic } from "@/lib/contract-engine/umowa-agent-core";
import { generujKomplet } from "@/lib/contract-engine/komplet";
import {
  blokiDoXml,
  blokiZDocumentXml,
  blokiZDocx,
  tekstZDocumentXml,
  tekstZDocx,
  type Blok,
} from "@/lib/contract-engine/umowa-docx";
import {
  przypadekA,
  przypadekB,
  przypadekC,
} from "@/lib/contract-engine/fixtures/komplet-przypadki";
import { pdfZBlokow } from "./pdf-z-tekstu";

/* eslint-disable @typescript-eslint/no-explicit-any */

const DATE = new Date(Date.UTC(2026, 9, 12, 12, 0, 0));

async function komplet(dane: any) {
  const { umowa } = przetworzSzkic(dane);
  return generujKomplet(umowa);
}

const PRZYPADKI = [
  ["a — JDG, balon", przypadekA],
  ["b — dwoje pożyczkobiorców", przypadekB],
  ["c — sp. z o.o. + poręczyciel", przypadekC],
] as const;

describe("blokiZDocx", () => {
  for (const [nazwa, dane] of PRZYPADKI) {
    it(`${nazwa}: odczytane bloki dają z powrotem ten sam tekst umowy`, async () => {
      const k = await komplet(dane());
      const bloki = await blokiZDocx(k.bytes);
      expect(tekstZDocumentXml(blokiDoXml(bloki))).toBe(await tekstZDocx(k.bytes));
    });
  }

  it("rozpoznaje części, tabele z nagłówkiem i podpisy", async () => {
    const k = await komplet(przypadekA());
    const bloki = await blokiZDocx(k.bytes);
    const tytuly = bloki.filter((b): b is Extract<Blok, { t: "tytul" }> => b.t === "tytul");
    expect(tytuly[0].tekst).toBe("WNIOSEK O UDZIELENIE POŻYCZKI PIENIĘŻNEJ");
    expect(tytuly.slice(1).every((t) => t.nowaStrona)).toBe(true);
    expect(tytuly.map((t) => t.tekst)).toContain("UMOWA POŻYCZKI");

    const harmonogram = bloki.find(
      (b): b is Extract<Blok, { t: "tabela" }> =>
        b.t === "tabela" && b.wiersze.some((w) => w.naglowek) && b.szerokosci.length === 7,
    );
    expect(harmonogram).toBeDefined();
    expect(harmonogram!.wiersze.length).toBeGreaterThan(10);

    const podpisy = bloki.filter((b) => b.t === "podpisy");
    expect(podpisy.length).toBeGreaterThanOrEqual(4);
    for (const p of podpisy) {
      if (p.t !== "podpisy") continue;
      expect(p.osoby.every((o) => o.rola && !o.rola.startsWith("…"))).toBe(true);
    }

    const ustepy = bloki.filter((b) => b.t === "akapit" && b.wciecie === "ustep" && b.etykieta);
    expect(ustepy.length).toBeGreaterThan(20);
    expect(ustepy.every((b) => b.t === "akapit" && /^\d+\.$/.test(b.etykieta!))).toBe(true);
  });

  it("obcy .docx: akapity, pogrubienia, wyrównanie i tabela", () => {
    const xml =
      '<?xml version="1.0"?><w:document xmlns:w="x"><w:body>' +
      '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Tytuł &amp; co</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t xml:space="preserve">Zwykły </w:t></w:r><w:r><w:rPr><w:b w:val="1"/></w:rPr><w:t>gruby</w:t></w:r></w:p>' +
      '<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single"/></w:tblBorders></w:tblPr>' +
      '<w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="2000"/></w:tblGrid>' +
      "<w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr>" +
      "</w:tbl></w:body></w:document>";
    expect(blokiZDocumentXml(xml)).toEqual([
      { t: "podtytul", tekst: "Tytuł & co" },
      {
        t: "akapit",
        runs: [{ tekst: "Zwykły " }, { tekst: "gruby", bold: true }],
        align: "left",
      },
      {
        t: "tabela",
        szerokosci: [4000, 2000],
        wiersze: [
          {
            komorki: [{ tekst: [{ tekst: "A" }] }, { tekst: [{ tekst: "B" }] }],
          },
        ],
      },
    ]);
  });
});

describe("pdfZBlokow", () => {
  it("drukuje komplet jako A4 z metadanymi, powtarzalnie dla stałej daty", async () => {
    const k = await komplet(przypadekA());
    const bloki = await blokiZDocx(k.bytes);
    const opts = { bloki, title: "Komplet", version: "do podpisu", sha256: "abc", date: DATE };
    const a = await pdfZBlokow(opts);
    const b = await pdfZBlokow(opts);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    const doc = await PDFDocument.load(a);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(6);
    expect(Math.round(doc.getPage(0).getSize().width)).toBe(595);
    expect(doc.getTitle()).toBe("Komplet");
    expect(doc.getSubject()).toBe("do podpisu · SHA-256 abc");
    if (process.env.PDF_Z_BLOKOW_OUT) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(process.env.PDF_Z_BLOKOW_OUT, a);
    }
  });
});
