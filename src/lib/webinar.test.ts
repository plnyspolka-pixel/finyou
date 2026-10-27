import { describe, expect, it } from "vitest";
import {
  WEBINAR_ENABLED,
  currentSlotStart,
  formatCountdown,
  nextSlotStart,
  roomPlan,
  webinarGrantValid,
  webinarMilestoneEvent,
} from "./webinar";

// 27.10.2026 12:17:18 czasu warszawskiego (CET, UTC+1) = 11:17:18 UTC.
const T = Date.UTC(2026, 9, 27, 11, 17, 18);

describe("webinar — pokaz co 15 minut", () => {
  it("jest wyłączony, dopóki nie ma nagrania", () => {
    expect(WEBINAR_ENABLED).toBe(false);
  });

  it("najbliższy pokaz o pełnym kwadransie czasu warszawskiego", () => {
    expect(new Date(nextSlotStart(T)).toISOString()).toBe("2026-10-27T11:30:00.000Z");
    expect(new Date(currentSlotStart(T)).toISOString()).toBe("2026-10-27T11:15:00.000Z");
    // Latem (UTC+2) granice też wypadają na :00/:15/:30/:45.
    const lato = Date.UTC(2026, 6, 1, 8, 44, 59);
    expect(new Date(nextSlotStart(lato)).getUTCMinutes()).toBe(45);
  });

  it("licznik w formacie mm:ss", () => {
    expect(formatCountdown(nextSlotStart(T) - T)).toBe("12:42");
    expect(formatCountdown(0)).toBe("00:00");
  });

  it("spóźniony < 5 min dołącza do trwającego, później czeka na kolejny", () => {
    const at3min = Date.UTC(2026, 9, 27, 11, 18, 0);
    expect(roomPlan(at3min, 1800)).toEqual({
      mode: "play",
      startedAt: Date.UTC(2026, 9, 27, 11, 15, 0),
      offsetSec: 180,
    });
    const at6min = Date.UTC(2026, 9, 27, 11, 21, 0);
    expect(roomPlan(at6min, 1800)).toEqual({
      mode: "wait",
      startsAt: Date.UTC(2026, 9, 27, 11, 30, 0),
    });
  });

  it("zdarzenia oglądania", () => {
    expect(webinarMilestoneEvent(25)).toBe("webinar_25");
    expect(webinarMilestoneEvent(100)).toBe("webinar_complete");
  });

  it("dostęp tylko z ważnym linkiem do opublikowanego webinaru", () => {
    const ok = {
      consent: true,
      video_expires_at: "2026-11-30T00:00:00Z",
      lead_magnets: { slug: "webinar", published: true },
    };
    expect(webinarGrantValid(ok, T)).toBe(true);
    expect(
      webinarGrantValid({ ...ok, lead_magnets: { slug: "webinar", published: false } }, T),
    ).toBe(false);
    expect(
      webinarGrantValid({ ...ok, lead_magnets: { slug: "darmowa-lekcja", published: true } }, T),
    ).toBe(false);
  });
});
