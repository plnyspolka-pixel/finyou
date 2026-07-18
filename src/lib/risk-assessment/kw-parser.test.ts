import { describe, expect, it } from "vitest";
import { extractKwOwnerPersons } from "./kw-parser.server";

describe("extractKwOwnerPersons — dział II KW", () => {
  it("czyta układ etykietowany EKW: Imię przed Nazwiskiem", () => {
    const html =
      "<table><tr><td>Imię pierwsze:</td><td>JAN</td></tr>" +
      "<tr><td>Nazwisko:</td><td>KOWALSKI</td></tr></table>";
    expect(extractKwOwnerPersons(html)).toEqual([{ firstName: "JAN", lastName: "KOWALSKI" }]);
  });

  it("czyta układ odwrotny: Nazwisko przed Imieniem", () => {
    const html = "<div>Nazwisko: NOWAK-KOWALSKA</div><div>Imię: ANNA</div>";
    expect(extractKwOwnerPersons(html)).toEqual([
      { firstName: "ANNA", lastName: "NOWAK-KOWALSKA" },
    ]);
  });

  it("deduplikuje tę samą osobę z obu układów", () => {
    const html = "Imię: JAN Nazwisko: KOWALSKI ... Nazwisko: KOWALSKI Imię: JAN";
    expect(extractKwOwnerPersons(html)).toHaveLength(1);
  });

  it("fallback: para pisana mieszaną wielkością liter to Imię Nazwisko", () => {
    expect(extractKwOwnerPersons("Właściciel: Jan Kowalski, udział 1/1")).toEqual([
      { firstName: "Jan", lastName: "Kowalski" },
    ]);
  });

  it("pomija słowa-etykiety KW (nie bierze 'Księga Wieczysta' za osobę)", () => {
    const persons = extractKwOwnerPersons("Księga Wieczysta prowadzona dla nieruchomości");
    expect(persons).toEqual([]);
  });

  it("pusty/brakujący dział II daje pustą listę", () => {
    expect(extractKwOwnerPersons(null)).toEqual([]);
    expect(extractKwOwnerPersons("")).toEqual([]);
  });
});
