import { afterEach, describe, expect, it } from "vitest";
import { ensureGtag } from "./google-analytics";

afterEach(() => {
  delete (window as any).gtag;
  delete (window as any).dataLayer;
});

describe("ensureGtag", () => {
  it("pushes the arguments object to dataLayer, like the official gtag snippet", () => {
    ensureGtag();
    window.gtag!("event", "page_view", { page_path: "/" });
    const entries = window.dataLayer as unknown[];
    expect(entries.length).toBe(2);
    const last = entries[entries.length - 1];
    // gtag.js ignores plain arrays; it only processes `arguments` objects.
    expect(Object.prototype.toString.call(last)).toBe("[object Arguments]");
    expect(Array.isArray(last)).toBe(false);
    expect(Array.from(last as ArrayLike<unknown>)).toEqual([
      "event",
      "page_view",
      { page_path: "/" },
    ]);
  });

  it("does not redefine an existing gtag", () => {
    const original = () => undefined;
    (window as any).gtag = original;
    ensureGtag();
    expect(window.gtag).toBe(original);
  });
});
