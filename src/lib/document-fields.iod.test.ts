import { describe, expect, it } from "vitest";
import {
  extractOrderedFields,
  iodValueFromLender,
  isFinanceYouAccountField,
  isIodField,
} from "./document-fields";

describe("pole IOD w klauzuli RODO (u08)", () => {
  it("rozpoznaje pole inspektora ochrony danych", () => {
    const fields = extractOrderedFields(
      "Administrator: [NAZWA / FIRMA POŻYCZKODAWCY], e-mail: [EMAIL]. Inspektor ochrony danych: [IMIĘ I NAZWISKO IOD].",
    );
    const iod = fields.filter(isIodField);
    expect(iod).toHaveLength(1);
    expect(iod[0].key).toBe("IMIĘ I NAZWISKO IOD");
    expect(fields.filter((f) => !isIodField(f)).map((f) => f.key)).not.toContain(
      "IMIĘ I NAZWISKO IOD",
    );
  });

  it("nie łapie zwykłych pól", () => {
    expect(isIodField({ key: "EMAIL" })).toBe(false);
    expect(isIodField({ key: "PERIODIC" })).toBe(false);
  });
});

describe("pole rachunku Finance You", () => {
  it("rozpoznaje rachunek FY / prowizji, ale nie rachunek Pożyczkodawcy", () => {
    const fields = extractOrderedFields(
      "Pożyczkodawca wypłaci kwotę na rachunek Pożyczkobiorcy nr [RACHUNEK POŻYCZKOBIORCY], a prowizję przekaże na rachunek Finance You nr [RACHUNEK FINANCE YOU].",
    );
    const fy = fields.filter(isFinanceYouAccountField).map((f) => f.key);
    expect(fy).toEqual(["RACHUNEK FINANCE YOU"]);
  });
});

describe("wartość pola IOD = dane Inwestora (Pożyczkodawcy)", () => {
  it("osoba fizyczna: imię i nazwisko + e-mail", () => {
    expect(iodValueFromLender({ name: "Jan Kowalski", email: "jan@example.pl" }, true)).toBe(
      "Jan Kowalski (kontakt: jan@example.pl)",
    );
  });
  it("firma: reprezentant (albo nazwa) + telefon, gdy brak e-maila", () => {
    expect(
      iodValueFromLender(
        { name: "Inwest sp. z o.o.", representativeName: "Anna Nowak", phone: "600 100 200" },
        false,
      ),
    ).toBe("Anna Nowak (kontakt: 600 100 200)");
    expect(iodValueFromLender({ name: "Inwest sp. z o.o." }, false)).toBe("Inwest sp. z o.o.");
  });
  it("bez danych — pole zostaje do uzupełnienia", () => {
    expect(iodValueFromLender({}, true)).toBeNull();
  });
});
