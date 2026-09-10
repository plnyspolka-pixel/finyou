import { describe, it, expect } from "vitest";
import { buildWelcomeSmsBody } from "./lead-welcome-sms.server";
import { randomShortCode, shortLinkUrl } from "./short-link.server";
import { decideSms, type SmsLimits } from "./sms-guard.server";

const LIMITS: SmsLimits = {
  automatedMaxPer24h: 1,
  automatedMaxPer7d: 3,
  conversationalMaxPer24h: 8,
  duplicateWindowDays: 14,
  windowStartHour: 8,
  windowEndHour: 20,
};

describe("krótki link SMS", () => {
  it("kod jest krótki i bez znaków mylących na ekranie (0/o, 1/l/i)", () => {
    for (let i = 0; i < 200; i++) {
      const code = randomShortCode();
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^[a-z2-9]+$/);
      expect(code).not.toMatch(/[oil01]/);
    }
  });

  it("URL idzie na główną domenę i mieści się w SMS-ie", () => {
    const url = shortLinkUrl("ab3x9k");
    expect(url).toBe("https://financeyou.pl/s/ab3x9k");
    expect(url.length).toBeLessThan(32);
  });
});

describe("treść SMS-a powitalnego", () => {
  const body = buildWelcomeSmsBody(shortLinkUrl("ab3x9k"));

  it("zawiera ofertę i link", () => {
    expect(body).toContain("pozyczki pod zastaw nieruchomosci");
    expect(body).toContain("1,79%");
    expect(body).toContain("https://financeyou.pl/s/ab3x9k");
  });

  it("mieści się w jednym segmencie GSM-7 (bez polskich znaków)", () => {
    expect(body).not.toMatch(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/);
    expect(body.length).toBeLessThanOrEqual(160);
  });
});

describe("wejście leada = dokładnie jeden SMS", () => {
  // Wtorek 12:00 Warszawy.
  const now = new Date("2026-09-08T10:00:00Z");
  const welcome = buildWelcomeSmsBody(shortLinkUrl("ab3x9k"));

  const decide = (body: string, recent: Array<{ body: string; createdAt: Date }>) =>
    decideSms({
      category: "automated",
      body,
      now,
      recent,
      optedOut: false,
      limits: LIMITS,
    });

  it("SMS powitalny przechodzi jako pierwszy", () => {
    expect(decide(welcome, []).allowed).toBe(true);
  });

  it("po nim tego samego dnia nie przechodzi już nic innego", () => {
    const sent = [{ body: welcome, createdAt: new Date(now.getTime() - 60_000) }];
    // zapowiedź telefonu Ani
    expect(decide("Czesc! Tu Finance You. Za chwile zadzwoni Ania.", sent).allowed).toBe(false);
    // link wysłany przez agenta w trakcie rozmowy
    expect(decide("Finance You: Czesc! Tu Ania. Wejdz na financeyou.pl", sent).allowed).toBe(false);
    // kolejny krok kadencji
    expect(decide("Finance You: Policz swoja rate", sent).allowed).toBe(false);
  });

  it("ten sam SMS powitalny nie powtórzy się przy ponownym wejściu leada", () => {
    const sent = [{ body: welcome, createdAt: new Date(now.getTime() - 5 * 24 * 3600_000) }];
    expect(decide(buildWelcomeSmsBody(shortLinkUrl("zz7q4m")), sent)).toMatchObject({
      allowed: false,
      reason: "duplicate",
    });
  });
});
