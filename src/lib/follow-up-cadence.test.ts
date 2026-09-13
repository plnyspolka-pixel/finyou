import { describe, it, expect } from "vitest";
import { CADENCE } from "./follow-up-plan.server";
import { LEAD_CONTACT_WINDOW } from "./follow-up-config";

const calls = CADENCE.filter((s) => s.channel === "call");

describe("godziny telefonów w kadencji", () => {
  it("dzwonimy w oknach, które realnie odbierają (13/19/17), a nie w 11:00", () => {
    const godziny = new Set(calls.map((s) => s.hourWarsaw));
    expect([...godziny].sort((a, b) => a - b)).toEqual([13, 17, 19]);
  });

  it("żaden telefon nie ląduje w najsłabszym przedziale 10:00–12:00", () => {
    expect(calls.filter((s) => s.hourWarsaw >= 10 && s.hourWarsaw <= 12)).toHaveLength(0);
  });

  it("dzień 1 ma dwa podejścia: popołudniowe i wieczorne", () => {
    const dzien1 = calls.filter((s) => s.day === 1).map((s) => s.hourWarsaw);
    expect(dzien1).toEqual([13, 19]);
  });

  it("wszystko mieści się w oknie kontaktu", () => {
    for (const slot of calls) {
      expect(slot.hourWarsaw).toBeGreaterThanOrEqual(LEAD_CONTACT_WINDOW.startHour);
      expect(slot.hourWarsaw).toBeLessThan(LEAD_CONTACT_WINDOW.endHour);
    }
  });
});
