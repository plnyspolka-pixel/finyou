import { describe, expect, it } from "vitest";
import { extractCompanyOwnersFromKw, identifierMatch } from "./owner-intelligence.server";

describe("wywiad gospodarczy właściciela KW", () => {
  it("rozpoznaje osobę prawną i REGON tylko z działu II", () => {
    const dzial2 =
      '<table><tr><td>Nazwa</td><td>ALFA SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ</td></tr>' +
      '<tr><td>Siedziba</td><td>LUBLIN</td></tr>' +
      '<tr><td>REGON</td><td>123456789</td></tr></table>';
    expect(extractCompanyOwnersFromKw(dzial2)).toEqual([
      { kind: "company", name: "ALFA SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ",
        regon: "123456789", krs: null, nip: null },
    ]);
  });

  it("nie bierze danych osoby fizycznej za spółkę", () => {
    expect(extractCompanyOwnersFromKw("Imię pierwsze JAN Nazwisko KOWALSKI PESEL 85010112345")).toEqual([]);
  });

  it("potwierdza tożsamość po numerze, nie po identycznym nazwisku", () => {
    const owner = { kind: "person" as const, name: "Jan Kowalski", pesel: "85010112345" };
    expect(identifierMatch(owner, { info: { cleaned_name: "Jan Kowalski" },
      numbers: { pesel: "85010112345" } })).toBe(true);
    expect(identifierMatch(owner, { info: { cleaned_name: "Jan Kowalski" },
      numbers: { pesel: "80010112345" } })).toBe(false);
  });

  it("porównuje identyfikatory podmiotu prawnego", () => {
    const company = { kind: "company" as const, name: "ALFA sp. z o.o.", krs: "0000123456" };
    expect(identifierMatch(company, { numbers: { krs: "0000123456" } })).toBe(true);
    expect(identifierMatch(company, { numbers: { krs: "0000654321" } })).toBe(false);
  });
});
