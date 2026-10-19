import { describe, expect, it } from "vitest";
import {
  buildReportText,
  findOutliers,
  median,
  optInRate,
  per1000,
  reportDue,
  type PublicationMetricRow,
} from "./publication-metrics";

const row = (views: number, over: Partial<PublicationMetricRow> = {}): PublicationMetricRow => ({
  platform: "instagram_reels",
  external_id: String(views),
  audience_track: "inwestor",
  views,
  ...over,
});

describe("metryki", () => {
  it("mediana", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("outliery liczone per platforma i tor, z minimalną próbą", () => {
    const rows = [5, 5, 6, 4, 5, 40].map((v) => row(v));
    const o = findOutliers(rows);
    expect(o).toHaveLength(1);
    expect(o[0].row.views).toBe(40);
    expect(o[0].multiple).toBe(8);
    // inny tor nie miesza mediany
    expect(findOutliers([...rows, row(1000, { audience_track: "pozyczkobiorca" })])).toHaveLength(
      1,
    );
    // za mała próba
    expect(findOutliers([row(1), row(100)])).toEqual([]);
  });

  it("wskaźniki na 1000 i opt-in", () => {
    expect(per1000(3, 1500)).toBe(2);
    expect(per1000(3, 0)).toBeNull();
    expect(optInRate(12, 300)).toBe(4);
    expect(optInRate(1, 0)).toBeNull();
  });
});

describe("raporty", () => {
  it("tekst raportu zawiera oba tory i alarmy", () => {
    const t = {
      publications: 5,
      medianViews: 12,
      shareRatePer1000: 1.5,
      followsPer1000: 0.4,
      signups: 3,
      leads: 1,
      costPln: 20,
    };
    const txt = buildReportText({
      period: "daily",
      label: "19.10.2026",
      tracks: { pozyczkobiorca: t, inwestor: { ...t, leads: 0 } },
      outliers: [],
      compliance: { checks: 10, rejected: 1, fixed: 4 },
      publishFailures: 0,
      agentChanges: ["Sloty IG przesunięte o 15 min"],
      alarms: ["Token Meta wygasa za 3 dni"],
      aiCostPln: 12,
      aiBudgetPln: 50,
      mode: "manual_review",
      paused: null,
    });
    expect(txt).toContain("Pożyczkobiorcy: 5 publikacji");
    expect(txt).toContain("koszt/lead 20 zł");
    expect(txt).toContain("Inwestorzy");
    expect(txt).toContain("koszt/lead —");
    expect(txt).toContain("Token Meta");
  });

  it("raport wychodzi raz o ustalonej godzinie", () => {
    const now = new Date("2026-10-19T17:07:00Z");
    expect(reportDue({ now, hourWarsaw: 19, dowWarsaw: 1, reportHour: 19, weeklyDow: 1 })).toEqual({
      daily: true,
      weekly: true,
    });
    expect(
      reportDue({
        now,
        hourWarsaw: 19,
        dowWarsaw: 1,
        reportHour: 19,
        weeklyDow: 1,
        lastDaily: "2026-10-19T17:00:00Z",
      }).daily,
    ).toBe(false);
    expect(
      reportDue({ now, hourWarsaw: 18, dowWarsaw: 1, reportHour: 19, weeklyDow: 1 }).daily,
    ).toBe(false);
  });
});
