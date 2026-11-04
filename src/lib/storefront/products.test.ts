import { describe, expect, it } from "vitest";
import {
  ACADEMY_MODULES,
  academyModuleForLesson,
  isManagementModulePath,
  managementActiveUntil,
} from "./products";

describe("academy modules", () => {
  it("covers lessons 1..28 without gaps or overlaps", () => {
    for (let n = 1; n <= 28; n++) {
      const matches = ACADEMY_MODULES.filter((m) => n >= m.from && (m.to === null || n <= m.to));
      expect(matches.length, `lesson ${n}`).toBe(1);
    }
  });
  it("maps lessons to modules from the graphics", () => {
    expect(academyModuleForLesson(1)?.number).toBe(1);
    expect(academyModuleForLesson(9)?.number).toBe(2);
    expect(academyModuleForLesson(10)?.number).toBe(3);
    expect(academyModuleForLesson(13)?.number).toBe(5);
    expect(academyModuleForLesson(19)?.number).toBe(6);
    expect(academyModuleForLesson(28)?.number).toBe(7);
    expect(academyModuleForLesson(0)).toBeNull();
  });
});

describe("management module", () => {
  it("stacks paid 30-day periods", () => {
    const until = managementActiveUntil(["2026-11-01T00:00:00Z", "2026-11-10T00:00:00Z"]);
    expect(until?.toISOString()).toBe("2026-12-31T00:00:00.000Z");
  });
  it("restarts after a lapse", () => {
    const until = managementActiveUntil(["2026-01-01T00:00:00Z", "2026-06-01T00:00:00Z"]);
    expect(until?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });
  it("returns null without payments", () => {
    expect(managementActiveUntil([])).toBeNull();
  });
  it("matches panel paths", () => {
    expect(isManagementModulePath("/inwestor/aml/klienci")).toBe(true);
    expect(isManagementModulePath("/inwestor/podpisy/")).toBe(true);
    expect(isManagementModulePath("/inwestor/umowy")).toBe(false);
  });
});
