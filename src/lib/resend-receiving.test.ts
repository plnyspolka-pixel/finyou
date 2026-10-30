import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  senderAddress,
  isFinanceYouMessage,
  isResendEmailId,
  headerValue,
  textFromHtml,
  listReceivedEmails,
  getReceivedEmail,
} from "./resend-receiving.server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Finance You — direct Resend Receiving API", () => {
  it("recognizes the real From address and Finance You aliases", () => {
    expect(senderAddress('"Fundusz Korona" <info@funduszkorona.pl>'))
      .toBe("info@funduszkorona.pl");
    expect(isFinanceYouMessage({
      to: ["oferta+a60924c1-af3a-44dd-98f1-6a57dd8bf460@financeyou.pl"],
    })).toBe(true);
    expect(isFinanceYouMessage({ to: ["kontakt@financeyou.pl"] })).toBe(true);
    expect(isFinanceYouMessage({ to: ["other@another-company.pl"] })).toBe(false);
  });

  it("validates Resend IDs, normalizes email headers and extracts text", () => {
    expect(isResendEmailId("a60924c1-af3a-44dd-98f1-6a57dd8bf460")).toBe(true);
    expect(isResendEmailId("../../secrets")).toBe(false);
    expect(headerValue({ "In-Reply-To": "<original@domain.pl>" }, "in-reply-to"))
      .toBe("<original@domain.pl>");
    expect(textFromHtml("<p>Prosimy o kontakt z &amp; partnerem.</p>"))
      .toContain("Prosimy o kontakt z & partnerem.");
  });

  it("queries the documented Resend endpoint using a server-only key and cursor", async () => {
    vi.stubEnv("RESEND_READ_API_KEY", "re_test_read_key");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ object: "list", data: [], has_more: false }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const after = "a60924c1-af3a-44dd-98f1-6a57dd8bf460";
    const result = await listReceivedEmails({ limit: 20, after });
    expect(result.has_more).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("https://api.resend.com/emails/receiving?");
    expect(String(url)).toContain("limit=20");
    expect(String(url)).toContain("after=" + after);
    expect(options.headers.Authorization).toBe("Bearer re_test_read_key");
  });

  it("fetches received email body without send endpoints", async () => {
    vi.stubEnv("RESEND_READ_API_KEY", "re_test_read_key");
    const id = "a60924c1-af3a-44dd-98f1-6a57dd8bf460";
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ id, from: "info@funduszkorona.pl", subject: "Partner", text: "Nowy partner" }),
      { status: 200 },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const email = await getReceivedEmail(id);
    expect(email.subject).toBe("Partner");
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/emails/receiving/" + id + "?html_format=cid",
    );
  });
});

describe("API and sync safety invariants", () => {
  const source = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  it("authenticates a real staff JWT before all API operations", () => {
    const route = source("src/routes/api/admin/resend-inbox.ts");
    expect(route).toContain("supabaseAdmin.auth.getUser");
    expect(route).toContain("isInternalStaff");
    expect(route).toContain("if (denied) return denied");
    expect(route).toContain("data: page.data.filter(isFinanceYouMessage)");
    expect(route).toContain("if (!isFinanceYouMessage(email))");
    expect(route).not.toContain("requireCronSecret");
  });
  it("backfill bypasses outgoing notifications and records original received timestamps", () => {
    const sync = source("src/lib/resend-received-sync.server.ts");
    expect(sync).toContain("created_at: normalDate(mail.created_at)");
    expect(sync).toContain("email_id: mail.id");
    expect(sync).toContain("contains(");
    expect(sync).toContain("preserveOfferThread");
    expect(sync).not.toContain("sendResendEmail");
    expect(sync).not.toContain("runAgentTurn");
    expect(sync).not.toContain("logLeadCommunication");
  });
});
