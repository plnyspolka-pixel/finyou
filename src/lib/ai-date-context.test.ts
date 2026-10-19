import { describe, expect, it } from "vitest";
import { currentDateContext } from "./ai-date-context";

describe("currentDateContext", () => {
  it("podaje bieżący rok i datę po polsku", () => {
    const t = currentDateContext(new Date("2026-10-19T10:00:00Z"));
    expect(t).toContain("19 października 2026");
    expect(t).toContain("rok 2026");
    expect(t).toContain("2027");
  });
});
