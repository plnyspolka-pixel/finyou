import { describe, expect, it } from "vitest";
import { extractOrderedFields, isIodField } from "./document-fields";

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
