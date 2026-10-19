import { describe, expect, it } from "vitest";
import {
  adjustCadenceShare,
  canAgentAct,
  DEFAULT_AGENT_SETTINGS,
  detectAnomalies,
  isPlatformDisabled,
  type AgentSettings,
} from "./safeguards";

const s = (over: Partial<AgentSettings> = {}): AgentSettings => ({
  ...DEFAULT_AGENT_SETTINGS,
  ...over,
});

describe("canAgentAct", () => {
  it("wyłącznik i auto-pauza blokują wszystko poza raportem i alarmem", () => {
    const k = s({ mode: "full_autopilot", kill_switch: true, kill_switch_reason: "test" });
    expect(canAgentAct(k, "publish").allowed).toBe(false);
    expect(canAgentAct(k, "plan").reason).toContain("Wyłącznik");
    expect(canAgentAct(k, "report").allowed).toBe(true);
    expect(canAgentAct(s({ mode: "full_autopilot", auto_paused_at: "x" }), "produce").allowed).toBe(
      false,
    );
  });

  it("manual_review: szkice tak, publikacja jako szkic do przeglądu", () => {
    expect(canAgentAct(s(), "produce").allowed).toBe(true);
    const d = canAgentAct(s(), "publish");
    expect(d.allowed).toBe(false);
    expect(d.draftOnly).toBe(true);
  });

  it("off blokuje akcje", () => {
    expect(canAgentAct(s({ mode: "off" }), "plan").allowed).toBe(false);
  });

  it("budżet AI, limity publikacji i maili", () => {
    const a = s({ mode: "full_autopilot", daily_ai_budget_pln: 50 });
    expect(canAgentAct(a, "produce", { spentTodayPln: 48, estimatedCostPln: 3 }).allowed).toBe(
      false,
    );
    expect(canAgentAct(a, "produce", { spentTodayPln: 40, estimatedCostPln: 3 }).allowed).toBe(
      true,
    );
    expect(canAgentAct(a, "publish", { postsTodayOnPlatform: 3 }).allowed).toBe(false);
    expect(canAgentAct(a, "email", { emailsThisWeekToRecipient: 3 }).allowed).toBe(false);
    expect(canAgentAct(a, "publish", { platform: "x" }).allowed).toBe(false);
  });

  it("promocje tylko w full_autopilot i w budżecie toru", () => {
    expect(canAgentAct(s({ mode: "full_autopilot" }), "promote", { adsBudgetPln: 0 }).allowed).toBe(
      false,
    );
    expect(canAgentAct(s({ mode: "semi_auto" }), "promote", { adsBudgetPln: 500 }).allowed).toBe(
      false,
    );
    expect(
      canAgentAct(s({ mode: "full_autopilot" }), "promote", {
        adsBudgetPln: 500,
        adsSpentThisMonthPln: 480,
        adsCostPln: 30,
      }).allowed,
    ).toBe(false);
    expect(
      canAgentAct(s({ mode: "full_autopilot" }), "promote", { adsBudgetPln: 500, adsCostPln: 30 })
        .allowed,
    ).toBe(true);
  });
});

describe("isPlatformDisabled", () => {
  it("dopasowuje prefiks platformy", () => {
    expect(isPlatformDisabled({ disabled_platforms: ["x"] }, "x")).toBe(true);
    expect(isPlatformDisabled({ disabled_platforms: ["facebook"] }, "facebook_reels")).toBe(true);
    expect(isPlatformDisabled({ disabled_platforms: ["x"] }, "youtube")).toBe(false);
  });
});

describe("detectAnomalies", () => {
  it("wykrywa serię błędów, skok kosztów, sygnały i jakość", () => {
    const a = detectAnomalies(s(), {
      recentPublishOutcomes: ["failed", "failed", "failed", "published"],
      costTodayPln: 40,
      costMedian7dPln: 10,
      platformSignals: 1,
      complianceChecks24h: 10,
      complianceRejectRate24h: 0.8,
    });
    expect(a.map((x) => x.id)).toEqual([
      "publish_failures",
      "cost_spike",
      "platform_signal",
      "compliance_quality",
    ]);
  });

  it("spokojny dzień = brak anomalii", () => {
    expect(
      detectAnomalies(s(), {
        recentPublishOutcomes: ["published", "failed", "failed"],
        costTodayPln: 3,
        costMedian7dPln: 0,
        platformSignals: 0,
      }),
    ).toEqual([]);
  });
});

describe("adjustCadenceShare", () => {
  const t = (leadValuePln: number, costPerLeadPln: number, leads = 5) => ({
    leadValuePln,
    costPerLeadPln,
    leads,
  });
  it("bez danych zostaje", () => {
    expect(adjustCadenceShare(50, t(0, 0, 0), t(100, 10))).toBe(50);
  });
  it("przesuwa maks. o 10 p.p. w stronę lepszego toru", () => {
    expect(adjustCadenceShare(50, t(1000, 10), t(100, 10))).toBe(60);
    expect(adjustCadenceShare(50, t(100, 10), t(1000, 10))).toBe(40);
  });
  it("trzyma granice 20–80%", () => {
    expect(adjustCadenceShare(78, t(1000, 1), t(1, 1000))).toBe(80);
  });
});
