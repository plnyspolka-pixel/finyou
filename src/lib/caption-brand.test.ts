import { describe, it, expect } from "vitest";
import { BRAND_DOMAIN, BRAND_NAME, fixBrandInCues, fixBrandInText } from "./caption-brand";
import { srtToAss } from "./caption-style";

describe("fixBrandInText", () => {
  it.each([
    "fajnasiu",
    "Fajnasiu",
    "fajnans ju",
    "fajnens you",
    "finans ju",
    "Finansju",
    "fajna siu",
    "finance ju",
    "Finance You",
    "financeyou",
    "FAJNANSE-JU",
  ])("„%s” → Finance You", (heard) => {
    expect(fixBrandInText(`Zobacz ${heard}. Link w bio.`)).toBe(
      `Zobacz ${BRAND_NAME}. Link w bio.`,
    );
  });

  it.each([
    "fajnasiu.pl",
    "fajnasiu pl",
    "fajnasiu kropka pl",
    "finans ju . pl",
    "www.fajnasiu.pl",
    "Finance You.pl",
    "financeyou.pl",
  ])("„%s” → financeyou.pl", (heard) => {
    expect(fixBrandInText(`Wejdź na ${heard}, zakładka Dla inwestora.`)).toBe(
      `Wejdź na ${BRAND_DOMAIN}, zakładka Dla inwestora.`,
    );
  });

  it("nie rusza zwykłych słów", () => {
    const text = "Finansujemy firmy, finanse są fajne, fajna sjesta, już jutro, finansowy plan.";
    expect(fixBrandInText(text)).toBe(text);
  });
});

describe("fixBrandInCues", () => {
  it("skleja nazwę rozciętą między kwestie", () => {
    const out = fixBrandInCues([
      { start: 0, end: 1, text: "Zobacz fajna" },
      { start: 1, end: 2, text: "siu. Link w bio." },
    ]);
    expect(out.map((c) => c.text)).toEqual(["Zobacz Finance You.", "Link w bio."]);
  });

  it("rozcięty adres i pusta kwestia wypada", () => {
    const out = fixBrandInCues([
      { start: 0, end: 1, text: "Wejdź na fajnans" },
      { start: 1, end: 2, text: "ju kropka pl" },
    ]);
    expect(out).toEqual([{ start: 0, end: 1, text: `Wejdź na ${BRAND_DOMAIN}` }]);
  });
});

describe("srtToAss — nazwa firmy w wypalanych napisach", () => {
  it("wypala poprawną nazwę zamiast przekręconej", () => {
    const srt =
      "1\n00:00:00,000 --> 00:00:02,000\nWejdź na fajnasiu.pl\n\n2\n00:00:02,000 --> 00:00:04,000\nZobacz fajnasiu\n";
    const ass = srtToAss(srt, "minimal") ?? "";
    expect(ass).not.toMatch(/fajna/i);
    expect(ass).toContain("financeyou.pl");
    expect(ass).toContain("Finance You");
  });
});
