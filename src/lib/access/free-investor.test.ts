import { describe, expect, it } from "vitest";
import {
  FREE_AMOUNT_THRESHOLD_PLN,
  canConcludeFreeLoan,
  canSubmitFreeOffer,
  collectPersonalPhrases,
  isAboveFreeThreshold,
  maskKwNumber,
  redactJson,
  redactText,
  statutoryMaxAnnualRate,
  validateFreeOfferRate,
} from "./free-investor";

describe("odsetki maksymalne (NBP)", () => {
  it("liczy 2 × (stopa referencyjna + 3,5 p.p.)", () => {
    expect(statutoryMaxAnnualRate(3.75)).toBe(14.5);
    expect(statutoryMaxAnnualRate(5.75)).toBe(18.5);
    expect(statutoryMaxAnnualRate(0)).toBe(7);
  });

  it("walidacja oprocentowania oferty względem limitu", () => {
    const max = statutoryMaxAnnualRate(3.75); // 14.5
    expect(validateFreeOfferRate(14.5, max).allowed).toBe(true);
    expect(validateFreeOfferRate(14.51, max).allowed).toBe(true); // tolerancja 0,01
    expect(validateFreeOfferRate(14.6, max).allowed).toBe(false);
    expect(validateFreeOfferRate(0, max).allowed).toBe(false);
  });
});

describe("limity darmowego konta (kwoty ≤ 255 550 zł; powyżej — bez limitu)", () => {
  it("próg kwotowy", () => {
    expect(FREE_AMOUNT_THRESHOLD_PLN).toBe(255_550);
    expect(isAboveFreeThreshold(255_550)).toBe(false);
    expect(isAboveFreeThreshold(255_551)).toBe(true);
  });

  it("do 5 ofert w oknie rocznym dla kwot ≤ progu", () => {
    expect(canSubmitFreeOffer({ offersLast365: 4, loansLast365: 0 }, 200_000).allowed).toBe(true);
    expect(canSubmitFreeOffer({ offersLast365: 5, loansLast365: 0 }, 200_000).allowed).toBe(false);
    expect(canSubmitFreeOffer({ offersLast365: 5, loansLast365: 0 }, 200_000).reason).toBe(
      "offer_limit",
    );
  });

  it("oferty na kwoty powyżej progu — bez limitu liczby", () => {
    expect(canSubmitFreeOffer({ offersLast365: 99, loansLast365: 99 }, 300_000).allowed).toBe(true);
  });

  it("maks. 2 zawarte pożyczki w oknie rocznym dla kwot ≤ progu", () => {
    expect(canConcludeFreeLoan({ offersLast365: 0, loansLast365: 1 }, 255_550).allowed).toBe(true);
    expect(canConcludeFreeLoan({ offersLast365: 0, loansLast365: 2 }, 255_550).allowed).toBe(false);
    expect(canConcludeFreeLoan({ offersLast365: 0, loansLast365: 2 }, 255_550).reason).toBe(
      "loan_limit",
    );
    expect(canConcludeFreeLoan({ offersLast365: 0, loansLast365: 2 }, 400_000).allowed).toBe(true);
  });
});

describe("anonimizacja treści KW", () => {
  it("maskuje numer KW z zachowaniem kodu sądu", () => {
    expect(maskKwNumber("WA1M/00123456/7")).toBe("WA1M/00••••••/•");
    expect(maskKwNumber("zle")).toBe("zle");
  });

  it("zbiera frazy osobowe z owners_json", () => {
    const phrases = collectPersonalPhrases([
      { imiePierwsze: "Jan", nazwisko: "Kowalski", pesel: "80010112345" },
      { nazwa: "Anna Nowak-Wiśniewska" },
    ]);
    expect(phrases.has("Jan")).toBe(true);
    expect(phrases.has("Kowalski")).toBe(true);
    expect(phrases.has("Anna Nowak-Wiśniewska")).toBe(true);
    expect(phrases.has("Nowak-Wiśniewska")).toBe(true);
  });

  it("redaguje PESEL-e, numery KW i nazwiska w tekście/HTML", () => {
    const phrases = collectPersonalPhrases([{ imiePierwsze: "Jan", nazwisko: "Kowalski" }]);
    const html =
      "<td>JAN KOWALSKI</td><td>PESEL: 80010112345</td><td>KW WA1M/00123456/7</td><td>Hipoteka 350 000 zł</td>";
    const redacted = redactText(html, phrases);
    expect(redacted).not.toMatch(/KOWALSKI/i);
    expect(redacted).not.toContain("80010112345");
    expect(redacted).not.toContain("00123456");
    expect(redacted).toContain("Hipoteka 350 000 zł");
    expect(redacted).toContain("WA1M/00••••••/•");
  });

  it("redaguje rekurencyjnie struktury JSON", () => {
    const phrases = new Set(["Kowalski"]);
    const out = redactJson({ a: ["wpis Kowalski"], b: { c: "brak zmian", d: 7 } }, phrases);
    expect(out).toEqual({ a: ["wpis •••"], b: { c: "brak zmian", d: 7 } });
  });
});
