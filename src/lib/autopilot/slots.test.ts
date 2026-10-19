import { describe, expect, it } from "vitest";
import { defaultProfiles } from "./profiles";
import { nextFreeSlot, warsawLocalToUtc } from "./slots";

describe("sloty publikacji", () => {
  it("czas Warszawy → UTC (lato i zima)", () => {
    expect(warsawLocalToUtc(2026, 10, 19, 16, 0).toISOString()).toBe("2026-10-19T14:00:00.000Z");
    expect(warsawLocalToUtc(2026, 11, 2, 16, 0).toISOString()).toBe("2026-11-02T15:00:00.000Z");
  });

  const slots = defaultProfiles().pozyczkobiorca.slots;
  const now = new Date("2026-10-19T08:00:00Z"); // poniedziałek

  it("najbliższy wolny slot z profilu i bez kolizji", () => {
    const first = nextFreeSlot({
      slots,
      platform: "instagram_reels",
      now,
      taken: [],
      maxPerDay: 3,
    });
    expect(first?.toISOString()).toBe("2026-10-19T14:00:00.000Z");
    const second = nextFreeSlot({
      slots,
      platform: "instagram_reels",
      now,
      taken: [first!],
      maxPerDay: 3,
    });
    expect(second?.toISOString()).toBe("2026-10-20T14:00:00.000Z");
  });

  it("limit publikacji na dobę", () => {
    const busy = [new Date("2026-10-19T09:00:00Z"), new Date("2026-10-19T10:00:00Z")];
    expect(
      nextFreeSlot({ slots, platform: "youtube", now, taken: busy, maxPerDay: 2 })?.toISOString(),
    ).toBe("2026-10-20T16:00:00.000Z");
  });

  it("niedziela poza slotami; brak slotów platformy → null", () => {
    const sat = new Date("2026-10-24T15:00:00Z"); // sobota 17:00
    expect(
      nextFreeSlot({
        slots,
        platform: "instagram_reels",
        now: sat,
        taken: [],
        maxPerDay: 3,
      })?.toISOString(),
    ).toBe("2026-10-26T15:00:00.000Z");
    expect(nextFreeSlot({ slots, platform: "tiktok", now, taken: [], maxPerDay: 3 })).toBeNull();
  });
});
