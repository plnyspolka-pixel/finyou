import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { bundledTemplateBytes } from "./document-templates/bundled";
import {
  duplicateFieldMap,
  expandDuplicateValues,
  extractOrderedFields,
  normalizePlaceholders,
  xmlToPlainText,
} from "./document-fields";

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
    // Po scaleniu powtórzeń („Nazwa spółki" ×2) każda etykieta w formularzu jest unikalna.
    const dup = duplicateFieldMap(fields);
    expect(Object.keys(dup)).toHaveLength(1);
    const labels = fields.filter((f) => !dup[f.id]).map((f) => f.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("wartość scalonego pola trafia do wszystkich wystąpień", () => {
    const fields = extractOrderedFields(
      "Instytucja: [Nazwa spółki], KRS [KRS]. Procedura AML/CFT w [Nazwa spółki] („Spółka\u201d).",
    );
    const dup = duplicateFieldMap(fields);
    const [first, second] = fields.filter((f) => f.key === "Nazwa spółki");
    expect(dup[second.id]).toBe(first.id);
    expect(expandDuplicateValues({ [first.id]: "ACME sp. z o.o." }, dup)[second.id]).toBe(
      "ACME sp. z o.o.",
    );
  });
});
