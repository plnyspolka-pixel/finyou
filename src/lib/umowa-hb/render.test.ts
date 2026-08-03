/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { WZOR_UMOWY_DOCX_B64 } from "./wzor-docx.b64";
import { renderujXml, renderujTekst, type WzorData } from "./render";
import { xmlToPlainText } from "@/lib/document-fields";

const XML = new PizZip(WZOR_UMOWY_DOCX_B64, { base64: true })
  .file("word/document.xml")!
  .asText();

const baseData = (over: Partial<WzorData> = {}): WzorData => ({
  pola: {
    pozyczkobiorca_nazwa: "Jan Kowalski",
    pozyczkodawca_nazwa: "Finance You sp. z o.o.",
    kwota_pozyczki: "100 000,00 zł",
    numer_kw: "LU1I/00012345/6",
    ...(over.pola ?? {}),
  },
  flagi: { ma_poreczyciela: false, wyplata_gotowka: false, roszczenie_oproznione_miejsce: false, ma_posrednika: false, ...(over.flagi ?? {}) },
  raty: over.raty ?? [
    { nr: "1", data: "05.09.2026", kapital: "8 000,00", odsetki: "500,00", rata_prowizji: "200,00", rata_laczna: "8 700,00", saldo: "92 000,00" },
    { nr: "2", data: "05.10.2026", kapital: "8 000,00", odsetki: "450,00", rata_prowizji: "200,00", rata_laczna: "8 650,00", saldo: "84 000,00" },
  ],
});

describe("renderer wzoru umowy (Handlebars-DOCX)", () => {
  it("nie zostawia tokenów sterujących ({{#if}}, {{#each}}, {{n}}, {{ref}}, {{else}})", () => {
    const out = renderujXml(XML, baseData());
    expect(out.match(/\{\{#if/g)).toBeNull();
    expect(out.match(/\{\{\/if\}\}/g)).toBeNull();
    expect(out.match(/\{\{#each/g)).toBeNull();
    expect(out.match(/\{\{n[:}]/g)).toBeNull();
    expect(out.match(/\{\{ref/g)).toBeNull();
    expect(out.match(/\{\{else\}\}/g)).toBeNull();
  });

  it("usuwa akapit-instrukcję generatora", () => {
    const txt = renderujTekst(XML, baseData());
    expect(txt.includes("Wzór do zasilenia przez generator")).toBe(false);
  });

  it("klauzula poręczyciela: wyłączona gdy flaga false, włączona gdy true", () => {
    expect(renderujTekst(XML, baseData({ flagi: { ma_poreczyciela: false } as any })).includes("Poręczycielem")).toBe(false);
    expect(renderujTekst(XML, baseData({ flagi: { ma_poreczyciela: true } as any })).includes("Poręczycielem")).toBe(true);
  });

  it("harmonogram: wiersz {{#each raty}} powtarza się per rata", () => {
    const txt = renderujTekst(XML, baseData());
    expect(txt.includes("8 700,00")).toBe(true);
    expect(txt.includes("8 650,00")).toBe(true);
    expect(txt.includes("05.09.2026") && txt.includes("05.10.2026")).toBe(true);
  });

  it("numeracja {{n}} resetuje się w każdym § (1. 2. 3. w §1)", () => {
    const txt = renderujTekst(XML, baseData());
    const i = txt.indexOf("PRZEDMIOT UMOWY");
    const frag = txt.slice(i, i + 260);
    expect(/1\.\s+Przedmiotem Umowy/.test(frag)).toBe(true);
    expect(/2\.\s+Pożyczkobiorca oświadcza/.test(frag)).toBe(true);
  });

  it("podstawia pola i produkuje poprawny (re-otwieralny) .docx", () => {
    const data = baseData();
    const zip = new PizZip(WZOR_UMOWY_DOCX_B64, { base64: true });
    zip.file("word/document.xml", renderujXml(zip.file("word/document.xml")!.asText(), data));
    const bytes: Uint8Array = zip.generate({ type: "uint8array", compression: "DEFLATE" });
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K'
    const reopened = xmlToPlainText(new PizZip(bytes).file("word/document.xml")!.asText());
    expect(reopened.includes("Jan Kowalski")).toBe(true);
    expect(reopened.includes("Finance You")).toBe(true);
  });
});
