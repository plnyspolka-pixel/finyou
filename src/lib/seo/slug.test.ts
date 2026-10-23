import { describe, expect, it } from "vitest";
import { asciiSlug } from "./slug";
import { singleH1 } from "./headings";

describe("asciiSlug", () => {
  it("zdejmuje polskie znaki i dekoduje procentowe kodowanie", () => {
    expect(asciiSlug("jak-banki-i-firmy-pożyczkowe-oceniaja")).toBe(
      "jak-banki-i-firmy-pozyczkowe-oceniaja",
    );
    expect(asciiSlug("jak-banki-i-firmy-po%C5%BCyczkowe-oceniaja")).toBe(
      "jak-banki-i-firmy-pozyczkowe-oceniaja",
    );
    expect(asciiSlug("Łódź-Źródła")).toBe("lodz-zrodla");
  });

  it("zostawia poprawny slug bez zmian", () => {
    expect(asciiSlug("pozyczka-pod-hipoteke-ze-zlym-bik")).toBe(
      "pozyczka-pod-hipoteke-ze-zlym-bik",
    );
  });

  it("nie wywraca się na błędnym kodowaniu", () => {
    expect(asciiSlug("abc%E0%A4%A")).toBe("abc-e0-a4-a");
  });
});

describe("singleH1", () => {
  it("zostawia pierwszy nagłówek „#”, kolejne obniża do „##”", () => {
    const md = [
      "# REGULAMIN",
      "## § 1",
      "tekst # nie nagłówek",
      "# ZAŁĄCZNIK NR 1",
      "## Wzór",
    ].join("\n");
    expect(singleH1(md).split("\n")).toEqual([
      "# REGULAMIN",
      "## § 1",
      "tekst # nie nagłówek",
      "## ZAŁĄCZNIK NR 1",
      "## Wzór",
    ]);
  });
});
