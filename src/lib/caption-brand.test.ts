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
    // z prawdziwych plików SRT HeyGena
    "FinanceYou",
    "financYou",
    "finansyou",
    "finansu",
    "Finanseu",
    "Finanse.eu",
    "Finance",
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
    // z prawdziwych plików SRT HeyGena
    "FinanceYou.pl",
    "financYou.pl",
    "finansyou.pl",
    "finansu.pl",
    "finansu pl",
    "www.finansu.pl",
    "Finanse.eu.pl",
    "finansuj.pl",
    "finanse u.pl",
    "finans.pl",
  ])("„%s” → financeyou.pl", (heard) => {
    expect(fixBrandInText(`Wejdź na ${heard}, zakładka Dla inwestora.`)).toBe(
      `Wejdź na ${BRAND_DOMAIN}, zakładka Dla inwestora.`,
    );
  });

  it("nie rusza zwykłych słów", () => {
    const text = "Finansujemy firmy, finanse są fajne, fajna sjesta, już jutro, finansowy plan.";
    expect(fixBrandInText(text)).toBe(text);
  });

  it.each([
    "mieszkasz u siebie, a finanse u nas są jasne",
    "Finanse. U nas pożyczysz pod hipotekę.",
    "finansuj plan, finansujemy, finansowanie. Plan jest prosty",
    "finanse są ważne, ale nie wszystko",
  ])("nie rusza „%s”", (text) => {
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

  it("skleja nazwę rozciętą po kropce („Finance.” | „You.”)", () => {
    const out = fixBrandInCues([
      { start: 0, end: 1, text: "współpraca z Finance." },
      { start: 1, end: 2, text: "You. Zobacz sam." },
    ]);
    expect(out.map((c) => c.text)).toEqual(["współpraca z Finance You.", "Zobacz sam."]);
  });

  it("samo „Finance.” na końcu kwestii dostaje pełną nazwę", () => {
    const out = fixBrandInCues([
      { start: 0, end: 1, text: "Finance." },
      { start: 1, end: 2, text: "Udaję tę wiedzę już dziś" },
    ]);
    expect(out.map((c) => c.text)).toEqual(["Finance You.", "Udaję tę wiedzę już dziś"]);
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

  it("końcówka rolki jak z HeyGena: „szczegóły wejdź na” | „finansu.pl”", () => {
    const srt =
      "23\n00:00:25,470 --> 00:00:26,730\nszczegóły wejdź na\n\n24\n00:00:26,990 --> 00:00:28,310\nfinansu.pl\n";
    const ass = srtToAss(srt, "reels") ?? "";
    expect(ass).not.toMatch(/finansu/i);
    expect(ass).toContain("financeyou.pl");
  });
});
