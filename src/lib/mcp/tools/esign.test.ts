import { beforeAll, describe, expect, it } from "vitest";
import type { ToolContext } from "@lovable.dev/mcp-js";
import { createEsignEnvelope, esignTools } from "./esign";

const ctx = {
  isAuthenticated: () => true,
  getToken: () => "test-token",
  getUserId: () => "00000000-0000-0000-0000-000000000001",
  getClaims: () => ({ email: "test@example.com" }),
} as unknown as ToolContext;

type Result = { isError?: boolean; content: { text: string }[] };
const call = async (tool: any, args: Record<string, unknown>) =>
  (await tool.handler(args, ctx)) as Result;

beforeAll(() => {
  process.env.SUPABASE_URL ??= "http://localhost:54321";
  process.env.SUPABASE_PUBLISHABLE_KEY ??= "test-key";
});

describe("narzędzia e-podpisu w MCP", () => {
  it("mają ustalone nazwy", () => {
    const names = esignTools.map((t: any) => t.name);
    expect(names).toEqual([
      "create_esign_envelope",
      "send_esign_envelope",
      "list_esign_envelopes",
      "get_esign_envelope",
      "get_esign_envelope_file",
      "resend_esign_link",
      "cancel_esign_envelope",
    ]);
  });

  it("koperta bez dokumentu jest odrzucana przed dostępem do bazy", async () => {
    const r = await call(createEsignEnvelope, {
      title: "Umowa pożyczki",
      signing_mode: "rownolegle",
      send_now: false,
      signers: [{ kind: "ja" }],
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain("Wgraj plik PDF albo wskaż wygenerowaną umowę.");
  });

  it("niezalogowany użytkownik nie utworzy koperty", async () => {
    const anon = { ...ctx, isAuthenticated: () => false } as unknown as ToolContext;
    const r = (await (createEsignEnvelope as any).handler(
      {
        title: "Umowa",
        generated_document_id: "00000000-0000-0000-0000-000000000002",
        signing_mode: "rownolegle",
        send_now: false,
        signers: [{ kind: "ja" }],
      },
      anon,
    )) as Result;
    expect(r.isError).toBe(true);
  });
});
