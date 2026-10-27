import { describe, it, expect } from "vitest";
import { FREE_LESSON_ID, lessonGrantValid, newVideoMilestones, VIDEO_TOKEN_TTL_DAYS, VIDEO_URL_TTL_SECONDS } from "./free-lesson";
describe("free lesson access", () => {
  const grant = { consent: true, video_expires_at: "2026-11-25T12:00:00Z", lead_magnets: { slug: "darmowa-lekcja", published: true } };
  const now = new Date("2026-10-26T12:00:00Z").getTime();
  it("requires a grant, rejects other lessons and expired grants", () => {
    expect(lessonGrantValid(null, FREE_LESSON_ID, now)).toBe(false);
    expect(lessonGrantValid(grant, "another-lesson", now)).toBe(false);
    expect(lessonGrantValid({ ...grant, video_expires_at: "2026-10-25" }, FREE_LESSON_ID, now)).toBe(false);
    expect(lessonGrantValid(grant, FREE_LESSON_ID, now)).toBe(true);
  });
  it("30-day access and short-lived media URLs", () => { expect(VIDEO_TOKEN_TTL_DAYS).toBe(30); expect(VIDEO_URL_TTL_SECONDS).toBe(900); });
  it("each viewing milestone fires once despite rewind or repeated updates", () => {
    const seen = new Set<number>();
    expect(newVideoMilestones(0, seen)).toEqual([0]);
    expect(newVideoMilestones(50, seen)).toEqual([25, 50]);
    expect(newVideoMilestones(10, seen)).toEqual([]);
    expect(newVideoMilestones(100, seen)).toEqual([75, 100]);
    expect(newVideoMilestones(100, seen)).toEqual([]);
  });
});