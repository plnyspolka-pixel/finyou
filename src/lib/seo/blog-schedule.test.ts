import { describe, it, expect } from "vitest";
import {
  EVERGREEN_GUIDES,
  REVIEW_TOPICS,
  isDue,
  pickGuide,
  pickReviewTopic,
} from "./blog-schedule";

describe("harmonogram bloga", () => {
  const now = new Date("2026-11-09T04:00:00Z");

  it("rodzaj bez publikacji jest do zrobienia", () => {
    expect(isDue(null, 7, now)).toBe(true);
  });

  it("poradnik co 7 dni — z zapasem na przesunięcie crona", () => {
    expect(isDue("2026-11-02T04:05:00Z", 7, now)).toBe(true); // tydzień minus 5 min
    expect(isDue("2026-11-05T04:00:00Z", 7, now)).toBe(false);
  });

  it("przegląd co 14 dni", () => {
    expect(isDue("2026-11-02T04:00:00Z", 14, now)).toBe(false);
    expect(isDue("2026-10-26T04:00:00Z", 14, now)).toBe(true);
  });
});

describe("tematy", () => {
  it("poradnik: pierwszy nieopisany, bez powtórek", () => {
    expect(pickGuide([])).toBe(EVERGREEN_GUIDES[0]);
    expect(pickGuide([EVERGREEN_GUIDES[0].topic])).toBe(EVERGREEN_GUIDES[1]);
    const topics = new Set(EVERGREEN_GUIDES.map((g) => g.topic));
    expect(topics.size).toBe(EVERGREEN_GUIDES.length);
    for (const g of EVERGREEN_GUIDES) expect(g.target.startsWith("/")).toBe(true);
  });

  it("przegląd inwestycyjny: najdawniej użyty temat", () => {
    expect(pickReviewTopic([])).toBe(REVIEW_TOPICS[0]);
    const all = [...REVIEW_TOPICS].reverse(); // najnowszy = ostatni z listy
    expect(pickReviewTopic(all)).toBe(REVIEW_TOPICS[0]);
  });
});
