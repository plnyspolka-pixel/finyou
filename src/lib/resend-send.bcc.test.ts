import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({ insert: vi.fn(async () => ({ error: null })) })),
  },
}));
vi.mock("./email-unsubscribe.server", () => ({
  canSendEmail: vi.fn(async () => ({ allowed: true })),
  unsubscribeUrlFor: vi.fn(async () => null),
  unsubscribeHeaders: vi.fn(async () => ({})),
}));
vi.mock("./email-branding.server", () => ({
  wrapBrandedEmail: vi.fn(() => "<html>x</html>"),
  isAlreadyBranded: vi.fn(() => false),
}));

describe("sendResendEmail — ukryta kopia (bcc)", () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];

  beforeEach(() => {
    calls.length = 0;
    process.env.LOVABLE_API_KEY = "lovable-test";
    process.env.RESEND_API_KEY = "resend-test";
    vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return { ok: true, status: 200, json: async () => ({ id: "msg-1" }) };
    });
  });

  it("przekazuje bcc do Resend tylko wtedy, gdy zostało podane", async () => {
    const { sendResendEmail } = await import("./resend-send.server");

    const withBcc = await sendResendEmail({
      to: "osoba@example.com",
      subject: "Twój plik",
      text: "Link: https://financeyou.pl/pobierz-plik/x",
      bcc: ["1234567890@invite.trustpilot.com"],
    });
    expect(withBcc.ok).toBe(true);
    expect(calls[0].url).toMatch(/\/emails$/);
    expect(calls[0].body.to).toEqual(["osoba@example.com"]);
    expect(calls[0].body.bcc).toEqual(["1234567890@invite.trustpilot.com"]);

    await sendResendEmail({ to: "osoba@example.com", subject: "Twój plik", text: "t" });
    expect(calls[1].body.bcc).toBeUndefined();

    await sendResendEmail({ to: "osoba@example.com", subject: "Twój plik", text: "t", bcc: [] });
    expect(calls[2].body.bcc).toBeUndefined();

    vi.unstubAllGlobals();
  });
});
