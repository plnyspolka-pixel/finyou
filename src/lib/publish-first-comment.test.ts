import { describe, it, expect } from "vitest";
import { buildFirstComment } from "./publish-first-comment.server";

describe("buildFirstComment", () => {
  it("YouTube dostaje wariant o inwestowaniu z linkiem", () => {
    const t = buildFirstComment("youtube", "https://financeyou.pl/r/abc123");
    expect(t).toContain("https://financeyou.pl/r/abc123");
    expect(t).toMatch(/inwestowani/i);
  });

  it("Meta (FB/IG) dostaje wariant kontaktowy z linkiem", () => {
    for (const p of ["facebook_post", "facebook_reels", "instagram_reels"] as const) {
      const t = buildFirstComment(p, "https://financeyou.pl/r/abc123");
      expect(t).toContain("https://financeyou.pl/r/abc123");
      expect(t.length).toBeLessThan(200);
    }
  });
});
