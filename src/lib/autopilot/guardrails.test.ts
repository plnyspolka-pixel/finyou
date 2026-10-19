import { describe, expect, it } from "vitest";
import {
  consecutiveFailures,
  detectAnomalies,
  nextFreeSlot,
  rebalanceCadence,
  warsawLocalToUtc,
} from "./guardrails";
import { findOutliers, insightValue, median, summarizeByTrack, type MetricPoint } from "./metrics";

const o = (platform: string, status: string, h: number, lastError: string | null = null) => ({
  platform,
  status,
  lastError,
  updatedAt: new Date(Date.UTC(2026, 9, 19, h)).toISOString(),
});

describe("bezpieczniki", () => {
  it("seria błędów liczy się od najnowszego wpisu", () => {
    const list = [
      o("tiktok", "failed", 10),
      o("tiktok", "failed", 9),
      o("tiktok", "failed", 8),
      o("tiktok", "published", 7),
    ];
    expect(consecutiveFailures(list, 3)).toEqual([{ platform: "tiktok", failures: 3 }]);
    expect(
      consecutiveFailures(
        [o("x", "published", 11), ...list.map((x) => ({ ...x, platform: "x" }))],
        3,
      ),
    ).toEqual([]);
  });
  it("blokady bramki i wyłączone kanały to nie awaria", () => {
    const list = [1, 2, 3].map((h) =>
      o("facebook_reels", "failed", h, "Bramka compliance: guarantee"),
    );
    expect(consecutiveFailures(list, 3)).toEqual([]);
  });
  it("anomalie: budżet AI i ostrzeżenia platform", () => {
    const a = detectAnomalies({
      outcomes: [],
      failuresThreshold: 3,
      aiCostTodayPln: 61,
      dailyAiBudgetPln: 50,
      complianceBlockedToday: 0,
      platformWarningsToday: 1,
    });
    expect(a.map((x) => x.code)).toEqual(["ai_budget", "platform_warning"]);
  });
});

describe("sloty", () => {
  it("czas Warszawy → UTC (lato i zima)", () => {
    expect(warsawLocalToUtc(2026, 10, 19, 16, 5).toISOString()).toBe("2026-10-19T14:05:00.000Z");
    expect(warsawLocalToUtc(2026, 11, 2, 16, 5).toISOString()).toBe("2026-11-02T15:05:00.000Z");
  });
  const slots = [{ platform: "instagram_reels", time: "16:05", weekdays: [1, 2, 3, 4, 5, 6] }];
  it("najbliższy wolny slot, bez kolizji i z limitem na dobę", () => {
    const now = new Date("2026-10-19T08:00:00Z"); // poniedziałek
    const first = nextFreeSlot({
      slots,
      platform: "instagram_reels",
      now,
      taken: [],
      maxPerDay: 4,
    });
    expect(first?.toISOString()).toBe("2026-10-19T14:05:00.000Z");
    const second = nextFreeSlot({
      slots,
      platform: "instagram_reels",
      now,
      taken: [first!],
      maxPerDay: 4,
    });
    expect(second?.toISOString()).toBe("2026-10-20T14:05:00.000Z");
  });
  it("niedziela poza slotami, po godzinie slotu — następny dzień", () => {
    const sat = new Date("2026-10-24T15:00:00Z"); // sobota 17:00 w Warszawie
    expect(
      nextFreeSlot({
        slots,
        platform: "instagram_reels",
        now: sat,
        taken: [],
        maxPerDay: 4,
      })?.toISOString(),
    ).toBe("2026-10-26T15:05:00.000Z");
  });
  it("brak slotów platformy → null", () => {
    expect(
      nextFreeSlot({ slots, platform: "youtube", now: new Date(), taken: [], maxPerDay: 4 }),
    ).toBeNull();
  });
  it("podział kadencji zmienia się maks. o 10 p.p.", () => {
    expect(
      rebalanceCadence(
        0.5,
        { valuePerLead: 100, costPerLead: 10 },
        { valuePerLead: 100, costPerLead: 100 },
      ),
    ).toBe(0.6);
    expect(rebalanceCadence(0.5, null, { valuePerLead: 1, costPerLead: 1 })).toBe(0.5);
  });
});

describe("metryki", () => {
  const now = new Date("2026-10-19T00:00:00Z");
  const p = (views: number, track = "inwestor", daysAgo = 5): MetricPoint => ({
    platform: "instagram_reels",
    externalId: `${views}-${track}-${daysAgo}`,
    track,
    series: null,
    publishedAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
    views,
    likes: 0,
    comments: 1,
    shares: 1,
    saves: 0,
    follows: 0,
  });
  it("mediana", () => {
    expect(median([5, 1, 35, 9])).toBe(7);
    expect(median([])).toBe(0);
  });
  it("outliery ≥ 3× mediany w grupie platforma+tor, min. 72 h", () => {
    const pts = [p(5), p(6), p(4), p(5), p(30), p(500, "inwestor", 1), p(1000, "pozyczkobiorca")];
    const out = findOutliers(pts, now);
    expect(out.map((x) => x.views)).toEqual([30]);
  });
  it("podsumowanie per tor i wartości insights", () => {
    const s = summarizeByTrack([p(1000), p(1000)]);
    expect(s[0]).toMatchObject({ track: "inwestor", posts: 2, sharesPer1k: 1 });
    expect(insightValue([{ name: "views", values: [{ value: 12 }] }], "views")).toBe(12);
    expect(insightValue([{ name: "reach", total_value: { value: 7 } }], "reach")).toBe(7);
    expect(insightValue([], "views")).toBeNull();
  });
});
