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
      "send_esign_interim_copy",
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

  it("odrzuca dwa źródła dokumentu naraz", async () => {
    const r = await call(createEsignEnvelope, {
      title: "Umowa pożyczki",
      generated_document_id: "00000000-0000-0000-0000-000000000002",
      document_blocks: [{ t: "tytul", tekst: "UMOWA" }],
      signing_mode: "rownolegle",
      send_now: false,
      signers: [{ kind: "ja" }],
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain("dokładnie jedno źródło");
  });

  it("bloki treści przechodzą walidację i składają się w PDF", async () => {
    const { createEnvelopeInput } = await import("@/lib/esign/esign-schemas");
    const bloki = [
      { t: "tytul", tekst: "UMOWA POŻYCZKI" },
      { t: "podtytul", tekst: "zawarta w dniu 17 września 2026 r." },
      { t: "naglowek", tekst: "§ 1 Przedmiot umowy" },
      { t: "akapit", runs: [{ tekst: "Pożyczkodawca udziela pożyczki — zażółć gęślą jaźń." }], wciecie: "ustep", etykieta: "1." },
      { t: "tabela", szerokosci: [30, 70], wiersze: [{ komorki: [{ tekst: "Kwota", bold: true }, { tekst: "20 000,00 zł" }] }] },
      { t: "podpisy", osoby: [{ rola: "POŻYCZKODAWCA", nazwa: "Finance You sp. z o.o." }, { rola: "POŻYCZKOBIORCA", nazwa: "Fundacja" }] },
    ];
    const data = createEnvelopeInput.parse({ title: "Umowa", documentBlocks: bloki, signers: [{ kind: "ja" }] });
    expect(data.documentBlocks).toHaveLength(6);
    const { pdfZBlokow } = await import("@/lib/legal/pdf-z-tekstu");
    const pdf = await pdfZBlokow({ bloki: data.documentBlocks as any, title: "Umowa", version: "do podpisu" });
    expect(new TextDecoder("latin1").decode(pdf.subarray(0, 5))).toBe("%PDF-");
  });
});
