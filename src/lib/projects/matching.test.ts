import { describe, expect, it } from "vitest";
import {
  rankProjects,
  scoreProject,
  type MatchableProject,
  type MatchPreferences,
} from "./matching";

const NOW = new Date("2026-07-22T12:00:00Z");

const project = (over: Partial<MatchableProject> = {}): MatchableProject => ({
  id: over.id ?? "p1",
  amount: 150_000,
  property_type: "dom",
  city: "Lublin",
  voivodeship: "lubelskie",
  ltv_percent: 45,
  period_months: 24,
  interest_rate_percent: 14,
  security_type: "hipoteka_1",
  last_assigned_at: null,
  rejection_count: 0,
  ...over,
});

const prefs: MatchPreferences = {
  availableCapital: 500_000,
  minInvestment: 50_000,
  maxInvestment: 300_000,
  maxLtvPercent: 60,
  propertyTypes: ["dom", "mieszkanie"],
  locations: ["Lublin", "lubelskie"],
  periodMonthsMin: 6,
  periodMonthsMax: 36,
  expectedReturnPercent: 12,
  preferredSecurities: ["hipoteka_1"],
};

const ctx = { activeAssignments: 0, onTimeDecisionRate: 1, now: NOW };

describe("scoreProject — twarde filtry", () => {
  it("odrzuca typ nieruchomości spoza preferencji", () => {
    const r = scoreProject(project({ property_type: "grunt_rolny" }), prefs, ctx);
    expect(r.eligible).toBe(false);
  });

  it("odrzuca kwotę poza widełkami inwestora", () => {
    expect(scoreProject(project({ amount: 10_000 }), prefs, ctx).eligible).toBe(false);
    expect(scoreProject(project({ amount: 900_000 }), prefs, ctx).eligible).toBe(false);
  });

  it("odrzuca LTV powyżej limitu inwestora", () => {
    const r = scoreProject(project({ ltv_percent: 75 }), prefs, ctx);
    expect(r.eligible).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/LTV/);
  });
});

describe("scoreProject — ranking", () => {
  it("idealne dopasowanie dostaje wysoki wynik", () => {
    const r = scoreProject(project(), prefs, ctx);
    expect(r.eligible).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(85);
  });

  it("dopasowanie lokalizacji po województwie (bez diakrytyków)", () => {
    const r = scoreProject(
      project({ city: "Świdnik", voivodeship: "Lubelskie" }),
      { ...prefs, locations: ["lubelskie"] },
      ctx,
    );
    expect(r.eligible).toBe(true);
    expect(r.reasons).toContain("zgodna lokalizacja");
  });

  it("niższe LTV wygrywa z wyższym przy tych samych pozostałych parametrach", () => {
    const low = scoreProject(project({ id: "low", ltv_percent: 30 }), prefs, ctx);
    const high = scoreProject(project({ id: "high", ltv_percent: 58 }), prefs, ctx);
    expect(low.score).toBeGreaterThan(high.score);
  });

  it("projekt czekający dłużej w puli jest premiowany", () => {
    const fresh = scoreProject(
      project({ id: "fresh", last_assigned_at: NOW.toISOString() }),
      prefs,
      ctx,
    );
    const waiting = scoreProject(
      project({ id: "waiting", last_assigned_at: "2026-07-10T12:00:00Z" }),
      prefs,
      ctx,
    );
    expect(waiting.score).toBeGreaterThan(fresh.score);
  });
});

describe("rankProjects", () => {
  it("filtruje niekwalifikujące się i sortuje malejąco", () => {
    const ranked = rankProjects(
      [
        project({ id: "a", ltv_percent: 58 }),
        project({ id: "b", ltv_percent: 30 }),
        project({ id: "c", property_type: "grunt_rolny" }),
      ],
      prefs,
      ctx,
    );
    expect(ranked.map((r) => r.projectId)).toEqual(["b", "a"]);
  });
});
