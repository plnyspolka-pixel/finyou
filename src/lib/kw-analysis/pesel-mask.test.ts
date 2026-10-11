import { describe, expect, it } from "vitest";
import { maskPeselInText } from "./pesel-mask";

describe("maskPeselInText", () => {
  it("maskuje 11 cyfr także przyklejonych do liter i interpunkcji", () => {
    expect(maskPeselInText("Żukowska Grażyna, PESEL 80010112345, córka Jana")).toBe(
      "Żukowska Grażyna, PESEL 80*******45, córka Jana",
    );
    expect(maskPeselInText("PESEL:80010112345;90020254321")).toBe("PESEL:80*******45;90*******21");
    expect(maskPeselInText("80010112345")).toBe("80*******45");
  });

  it("nie rusza krótszych i dłuższych ciągów cyfr ani numerów KW", () => {
    expect(maskPeselInText("KW SL1S/00012344/8, suma 1200000 zł")).toBe(
      "KW SL1S/00012344/8, suma 1200000 zł",
    );
    expect(maskPeselInText("rachunek 123456789012345")).toBe("rachunek 123456789012345");
  });
});
