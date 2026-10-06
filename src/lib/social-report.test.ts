import { describe, it, expect } from "vitest";
import {
  buildWeeklyReportEmail,
  computeTakeaways,
  engagement,
  followerDelta,
  isZeroReach,
  topItems,
  type PublishedItem,
  type WeeklyReportData,
} from "./social-report";

function item(over: Partial<PublishedItem> = {}): PublishedItem {
  return {
    platform: "youtube",
    title: "Materiał",
    publishedAt: "2026-10-03T10:00:00Z",
    url: null,
    views: null,
    likes: null,
    comments: null,
    ...over,
  };
}

function report(over: Partial<WeeklyReportData> = {}): WeeklyReportData {
  return {
    periodStart: "2026-09-29T06:00:00Z",
    periodEnd: "2026-10-06T06:00:00Z",
    followers: [
      { platform: "facebook", followers: 1200, previous: 1180 },
      { platform: "instagram", followers: 800, previous: 750 },
      { platform: "youtube", followers: null, previous: 90, error: "brak tokena" },
    ],
    published: { ok: true, data: [] },
    clicks: { ok: true, data: { total: 0, previousTotal: 0, campaigns: [] } },
    replies: { ok: true, data: { counts: {}, escalated: [] } },
    ...over,
  };
}

describe("metryki materiałów", () => {
  it("engagement = reakcje + komentarze, null bez danych", () => {
    expect(engagement(item({ likes: 3, comments: 2 }))).toBe(5);
    expect(engagement(item({ likes: 3 }))).toBe(3);
    expect(engagement(item())).toBeNull();
  });

  it("zero zasięgu: 0 wyświetleń albo (bez wyświetleń) 0 reakcji; brak danych to nie zero", () => {
    expect(isZeroReach(item({ views: 0, likes: 0 }))).toBe(true);
    expect(isZeroReach(item({ views: 10, likes: 0 }))).toBe(false);
    expect(isZeroReach(item({ likes: 0, comments: 0 }))).toBe(true);
    expect(isZeroReach(item())).toBe(false);
  });

  it("topItems: po zaangażowaniu, remis po wyświetleniach, bez materiałów bez danych", () => {
    const top = topItems([
      item({ title: "A", likes: 1, comments: 0, views: 100 }),
      item({ title: "B", likes: 5, comments: 1 }),
      item({ title: "C", likes: 1, comments: 0, views: 500 }),
      item({ title: "D" }),
    ]);
    expect(top.map((t) => t.title)).toEqual(["B", "C", "A"]);
  });

  it("followerDelta tylko przy obu pomiarach", () => {
    expect(followerDelta({ platform: "facebook", followers: 10, previous: 7 })).toBe(3);
    expect(followerDelta({ platform: "facebook", followers: 10, previous: null })).toBeNull();
  });
});

describe("computeTakeaways", () => {
  it("brak publikacji, najszybszy wzrost, platforma bez danych pominięta", () => {
    const t = computeTakeaways(report());
    expect(t.some((x) => x.includes("nic nie zostało opublikowane"))).toBe(true);
    expect(t.some((x) => x.includes("Najszybciej rośnie Instagram: +50"))).toBe(true);
  });

  it("najlepszy materiał i ostrzeżenie o zerowym zasięgu", () => {
    const t = computeTakeaways(
      report({
        published: {
          ok: true,
          data: [
            item({ title: "Hit", views: 900, likes: 40, comments: 5 }),
            item({ title: "Cisza", platform: "instagram_reels", likes: 0, comments: 0 }),
          ],
        },
      }),
    );
    expect(t.some((x) => x.startsWith("Najlepszy materiał tygodnia: „Hit”"))).toBe(true);
    expect(
      t.some((x) => x.includes("1 z 2 publikacji bez żadnego zasięgu") && x.includes("Cisza")),
    ).toBe(true);
    // Publikacje były, kliknięć zero → sygnał do sprawdzenia CTA.
    expect(t.some((x) => x.includes("Zero kliknięć"))).toBe(true);
  });

  it("spadek obserwujących i brak wzrostu nigdzie", () => {
    const t = computeTakeaways(
      report({
        followers: [
          { platform: "facebook", followers: 100, previous: 110 },
          { platform: "instagram", followers: 50, previous: 50 },
          { platform: "youtube", followers: 5, previous: 5 },
        ],
      }),
    );
    expect(t).toContain("Żadna platforma nie zyskała obserwujących w tym tygodniu.");
    expect(t.some((x) => x.includes("Facebook traci obserwujących (-10)"))).toBe(true);
  });

  it("pierwszy pomiar — bez bazy porównania", () => {
    const t = computeTakeaways(
      report({ followers: [{ platform: "facebook", followers: 100, previous: null }] }),
    );
    expect(t.some((x) => x.startsWith("Pierwszy pomiar"))).toBe(true);
  });

  it("eskalacje i nieudane sekcje nie wywracają wniosków", () => {
    const t = computeTakeaways(
      report({
        published: { ok: false, error: "Meta 500" },
        clicks: { ok: false, error: "db" },
        replies: { ok: true, data: { counts: { escalated: 2, replied: 5 }, escalated: [] } },
      }),
    );
    expect(t.some((x) => x.startsWith("2 komentarzy czekało"))).toBe(true);
  });
});

describe("buildWeeklyReportEmail", () => {
  it("sekcje z błędem pokazują „brak danych”, reszta normalnie; HTML escapowany", () => {
    const data = report({
      published: {
        ok: true,
        data: [
          item({
            title: "<b>Tytuł</b>",
            views: 10,
            likes: 1,
            comments: 0,
            url: "https://youtu.be/x",
          }),
        ],
      },
      clicks: { ok: false, error: "campaign_clicks: timeout" },
      replies: {
        ok: true,
        data: {
          counts: { replied: 3, escalated: 1 },
          escalated: [
            {
              platform: "facebook",
              authorName: "Jan",
              text: "Gdzie moje pieniądze?",
              reason: "konkretna sprawa",
              permalink: "https://facebook.com/c/1",
              createdAt: "2026-10-05T10:00:00Z",
            },
          ],
        },
      },
    });
    const mail = buildWeeklyReportEmail(data, computeTakeaways(data));
    expect(mail.subject).toBe("Raport social media: 2026-09-29 – 2026-10-06");
    expect(mail.html).toContain("brak danych");
    expect(mail.html).toContain("&lt;b&gt;Tytuł&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>Tytuł</b>");
    expect(mail.html).toContain("odpowiedziano: 3");
    expect(mail.html).toContain("Gdzie moje pieniądze?");
    // YouTube bez danych o obserwujących → „brak danych" w tabeli obserwujących.
    expect(mail.text).toContain("YouTube: brak danych");
    expect(mail.text).toContain("Instagram: 800 (+50)");
  });
});
