import { describe, expect, it } from "vitest";
import { matchInvestorToAmount } from "./engine.server";

const base = {
  min_amount: null as number | null,
  max_amount: null as number | null,
  auto_send_enabled: true,
  accepting_applications: true,
  paused_until: null as string | null,
};

describe("matchInvestorToAmount", () => {
  it("brak kryteriów = bez ograniczeń", () => {
    expect(matchInvestorToAmount(null, 500000).ok).toBe(true);
  });

  it("górny limit (Korona: do 350 tys.)", () => {
    const c = { ...base, max_amount: 350000 };
    expect(matchInvestorToAmount(c, 350000).ok).toBe(true);
    expect(matchInvestorToAmount(c, 350001).ok).toBe(false);
  });

  it("dolny próg (JanVest: powyżej 100 tys.)", () => {
    const c = { ...base, min_amount: 100000 };
    expect(matchInvestorToAmount(c, 100000).ok).toBe(true);
    expect(matchInvestorToAmount(c, 99999).ok).toBe(false);
  });

  it("zawieszenie przyjmowania wniosków blokuje niezależnie od kwoty", () => {
    expect(matchInvestorToAmount({ ...base, accepting_applications: false }, 200000).ok).toBe(false);
  });

  it("wyłączona auto-wysyłka blokuje", () => {
    expect(matchInvestorToAmount({ ...base, auto_send_enabled: false }, 200000).ok).toBe(false);
  });

  it("paused_until w przyszłości blokuje, w przeszłości nie", () => {
    const now = new Date("2026-08-31T12:00:00Z");
    expect(
      matchInvestorToAmount({ ...base, paused_until: "2026-09-15T00:00:00Z" }, 200000, now).ok,
    ).toBe(false);
    expect(
      matchInvestorToAmount({ ...base, paused_until: "2026-08-01T00:00:00Z" }, 200000, now).ok,
    ).toBe(true);
  });

  it("widełki obustronne", () => {
    const c = { ...base, min_amount: 100000, max_amount: 350000 };
    expect(matchInvestorToAmount(c, 99999).ok).toBe(false);
    expect(matchInvestorToAmount(c, 200000).ok).toBe(true);
    expect(matchInvestorToAmount(c, 400000).ok).toBe(false);
  });
});
