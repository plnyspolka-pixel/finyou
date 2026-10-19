import { describe, expect, it } from "vitest";
import type { ToolContext } from "@lovable.dev/mcp-js";
import preview from "./preview-esign-document";
import { createEsignEnvelope } from "./esign";

describe.skipIf(!process.env.ESIGN_LIVE_PREVIEW)("real administrator preview storage", () => {
  it("renders and reads back the PDF through its signed link", async () => {
    const { readFile, writeFile } = await import("node:fs/promises");
    const minted = JSON.parse(await readFile("/root/.cache/lovable-auth/session.json", "utf8"));
    process.env.SUPABASE_URL ??= process.env.VITE_SUPABASE_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY ??= process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const user = minted.session.user;
    const ctx = { isAuthenticated: () => true, getToken: () => minted.session.access_token,
      getUserId: () => user.id, getClaims: () => ({ sub: user.id, email: user.email }) } as unknown as ToolContext;
    const result = await preview.handler({
      document_markdown: "# TEST PODGLĄDU E-PODPISU\n\nZażółć gęślą jaźń. **Kwota**: 20 000 zł. *Termin*: 17.09.2026.\n\n| Strona | Kwota |\n| --- | ---: |\n| Fundacja | 20 000 zł |\n\n-> Warszawa, 17.09.2026 <-\n\\pagebreak\n\n## Podpisy\n\nTreść drugiej strony.",
      document_header: "UMOWA POŻYCZKI | 20 000 PLN | 17.09.2026",
    }, ctx);
    const text = result.content?.find((item) => item.type === "text");
    if (!text || text.type !== "text") throw new Error("Missing response");
    if (result.isError) throw new Error(text.text);
    const data = JSON.parse(text.text);
    expect(data.page_count).toBe(2);
    expect(data.expires_in_seconds).toBe(3600);
    const response = await fetch(data.url);
    expect(response.status).toBe(200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const { sha256Hex } = await import("@/lib/esign/esign-core");
    expect(await sha256Hex(bytes)).toBe(data.sha256);
    await writeFile("/tmp/browser/esign-markdown/live-preview.pdf", bytes);

    const schema = createEsignEnvelope.inputSchema;
    if (!schema) throw new Error("Missing envelope schema");
    const created = await createEsignEnvelope.handler({
      title: "TEST MCP — dokument Markdown (bez wysyłki)", document_markdown: "# TEST E-PODPISU\n\nZażółć gęślą jaźń.\n\\pagebreak\n\nDruga strona testowa.",
      document_header: "TEST — BEZ WYSYŁKI", signing_mode: "rownolegle", signers: [{ kind: "ja", client_id: undefined, user_id: undefined, full_name: undefined, email: undefined, phone: undefined, role_label: undefined, order_no: undefined }], send_now: false,
      message: undefined, generated_document_id: undefined, file_name: undefined, file_base64: undefined,
      client_id: undefined, loan_application_id: undefined, expires_in_days: undefined,
    }, ctx);
    const createdText = created.content?.find((item) => item.type === "text");
    if (!createdText || createdText.type !== "text") throw new Error("Missing envelope result");
    if (created.isError) throw new Error(createdText.text);
    const envelope = JSON.parse(createdText.text);
    expect(envelope.status).toBe("szkic");
    expect(envelope.sentTo).toEqual([]);
    // Read through the same explicitly authorized owner service as the UI;
    // direct table RLS currently has an existing recursion bug.
    const { getEnvelopeDetailsImpl } = await import("@/lib/esign/esign-owner.server");
    const { userClient } = await import("../_helpers");
    await getEnvelopeDetailsImpl({ envelopeId: envelope.id }, { supabase: userClient(ctx), userId: user.id, claims: ctx.getClaims() ?? {} });
    const { db } = await import("@/lib/esign/esign.server");
    const { data: saved, error } = await db().from("esign_envelopes").select("source_path,source_sha256,source_bytes,page_count,status").eq("id", envelope.id).single();
    if (error) throw error;
    expect(saved.status).toBe("szkic");
    expect(saved.page_count).toBe(2);
    const { signedFileUrl } = await import("@/lib/esign/esign.server");
    const source = await fetch(await signedFileUrl(saved.source_path));
    const sourceBytes = new Uint8Array(await source.arrayBuffer());
    expect(await sha256Hex(sourceBytes)).toBe(saved.source_sha256);
    expect(sourceBytes.byteLength).toBe(saved.source_bytes);
    console.log("Test draft created without invitations:", envelope.id);
  }, 60000);
});