/**
 * Kolejność panelu inwestora: bez abonamentu tylko zakup, płatności, profil
 * i odstąpienie; moduł ofert (Moje oferty, wniosek, umowa z oferty) czeka
 * dodatkowo na akceptację pakietu umów. Pipeline z umowami jest za abonamentem.
 */
import { describe, expect, it } from "vitest";
import { isFreeInvestorPath, isInvestorOffersPath } from "./subscription-gate";

describe("bramki panelu inwestora", () => {
  it("bez abonamentu: zakup, płatności, profil, odstąpienie", () => {
    for (const p of [
      "/inwestor/abonament",
      "/inwestor/abonament/",
      "/inwestor/platnosci",
      "/inwestor/profil",
      "/inwestor/odstapienie",
    ]) {
      expect(isFreeInvestorPath(p), p).toBe(true);
    }
  });

  it("pipeline z umowami, pulpit i moduły są za abonamentem", () => {
    for (const p of [
      "/inwestor",
      "/inwestor/umowy",
      "/inwestor/oferty",
      "/inwestor/analityka",
      "/inwestor/abonamentowy",
    ]) {
      expect(isFreeInvestorPath(p), p).toBe(false);
    }
  });

  it("moduł ofert: Moje oferty, wniosek i umowa z oferty — nie pipeline", () => {
    expect(isInvestorOffersPath("/inwestor/oferty")).toBe(true);
    expect(isInvestorOffersPath("/inwestor/wniosek/123")).toBe(true);
    expect(isInvestorOffersPath("/inwestor/umowa/abc")).toBe(true);
    expect(isInvestorOffersPath("/inwestor/umowy")).toBe(false);
    expect(isInvestorOffersPath("/inwestor/abonament")).toBe(false);
  });
});
