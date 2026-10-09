import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { bundledTemplateBytes } from "./document-templates/bundled";
import { extractOrderedFields, normalizePlaceholders, xmlToPlainText } from "./document-fields";

describe("etykiety pól z tej samej komórki tabeli", () => {
  it("rozróżnia różne pola o wspólnej etykiecie nazwą pola", () => {
    const fields = extractOrderedFields(
      "Instytucja obowiązana\t[Nazwa spółki], KRS [KRS], NIP [NIP]\nPrzyjęta\tUchwała Zarządu nr [Nr uchwały Zarządu] z dnia [Data uchwały Zarządu]",
    );
    const labels = fields.map((f) => f.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("wzór: Procedura AML/CFT B2B", () => {
  it("każde pole ma unikalną etykietę i nie ma anonimowych [●]", () => {
    const zip = new PizZip(bundledTemplateBytes("templates/Procedura_AML_CFT_wzor_B2B.docx")!);
    const xml = normalizePlaceholders(zip.file("word/document.xml")!.asText());
    const fields = extractOrderedFields(xmlToPlainText(xml));
    expect(fields.some((f) => f.key === "●")).toBe(false);
    // „Nazwa spółki" występuje dwa razy celowo (ta sama wartość) — pozostałe etykiety unikalne.
    const labels = fields.filter((f) => f.key !== "Nazwa spółki").map((f) => f.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
