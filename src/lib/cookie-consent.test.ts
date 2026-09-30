import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./consent/cookie-consent.functions", () => ({
  logCookieConsent: vi.fn(async () => ({ ok: true })),
}));
import {
  __resetConsentCache,
  CONSENT_COOKIE,
  CONSENT_VERSION,
  getConsent,
  googleConsentState,
  hasConsent,
  parseConsent,
  saveConsent,
} from "./cookie-consent";

afterEach(() => {
  document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; path=/`;
  __resetConsentCache();
});

describe("parseConsent", () => {
  it("returns null for missing, malformed or outdated values", () => {
    expect(parseConsent(undefined)).toBeNull();
    expect(parseConsent("nie-json")).toBeNull();
    expect(parseConsent(JSON.stringify({ v: CONSENT_VERSION - 1, analytics: true }))).toBeNull();
  });

  it("treats anything other than true as refusal", () => {
    const c = parseConsent(JSON.stringify({ v: CONSENT_VERSION, analytics: "yes", marketing: 1 }));
    expect(c).toMatchObject({ analytics: false, marketing: false });
  });
});

describe("consent storage", () => {
  it("has no consent before the user decides", () => {
    expect(getConsent()).toBeNull();
    expect(hasConsent("analytics")).toBe(false);
    expect(hasConsent("marketing")).toBe(false);
  });

  it("persists the choice in a first-party cookie", () => {
    saveConsent({ analytics: true, marketing: false });
    expect(document.cookie).toContain(`${CONSENT_COOKIE}=`);
    __resetConsentCache();
    expect(hasConsent("analytics")).toBe(true);
    expect(hasConsent("marketing")).toBe(false);
  });

  it("keeps the same consent id across changes (one browser = one log key)", () => {
    saveConsent({ analytics: false, marketing: false });
    const id = getConsent()!.id;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    saveConsent({ analytics: false, marketing: true });
    expect(getConsent()!.id).toBe(id);
  });
});

describe("googleConsentState", () => {
  it("maps categories to Consent Mode v2 signals", () => {
    expect(
      googleConsentState({ v: CONSENT_VERSION, id: "", analytics: true, marketing: false, ts: "" }),
    ).toEqual({
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  });
});
