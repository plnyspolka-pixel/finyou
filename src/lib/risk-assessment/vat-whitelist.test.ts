import { describe, expect, it } from "vitest";
import { extractNipCandidates, isValidNip, subjectMatchesPerson } from "./vat-whitelist.server";

describe("wykaz podatników VAT — pomocnicze", () => {
  it("waliduje sumę kontrolną NIP", () => {
    expect(isValidNip("5260250274")).toBe(true);
    expect(isValidNip("526-025-02-74")).toBe(true);
    expect(isValidNip("5260250275")).toBe(false);
    expect(isValidNip("123")).toBe(false);
  });

  it("wyciąga z tekstu tylko poprawne numery NIP", () => {
    const text =
      "Monika Hadyniak Usługi, NIP: 526-025-02-74, tel. 509790141; REGON 0123456789; 5260250275";
    expect(extractNipCandidates(text)).toEqual(["5260250274"]);
  });

  it("dopasowuje nazwę JDG do właściciela (bez polskich znaków i wielkości liter)", () => {
    expect(subjectMatchesPerson("MONIKA HADYNIAK USŁUGI KSIĘGOWE", "Monika", "Hadyniak")).toBe(
      true,
    );
    expect(subjectMatchesPerson("Łukasz Żółć Transport", "Lukasz", "Zolc")).toBe(true);
    expect(subjectMatchesPerson("ANNA HADYNIAK SKLEP", "Monika", "Hadyniak")).toBe(false);
    expect(subjectMatchesPerson("HADYNIAKOWA SP. Z O.O.", "Monika", "Hadyniak")).toBe(false);
  });
});
