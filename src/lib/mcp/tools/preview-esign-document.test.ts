import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "@lovable.dev/mcp-js";
import preview from "./preview-esign-document";
import { createEsignEnvelope } from "./esign";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), upload: vi.fn(), url: vi.fn(), insert: vi.fn() }));
vi.mock("../_helpers", async (load) => ({ ...await load<typeof import("../_helpers")>(), requireRolesAdmin: mocks.admin }));
vi.mock("@/lib/esign/esign.server", () => ({ uploadBytes: mocks.upload, signedFileUrl: mocks.url }));
const ctx = { isAuthenticated: () => true, getUserId: () => "00000000-0000-0000-0000-000000000001" } as unknown as ToolContext;
beforeEach(() => { vi.clearAllMocks(); mocks.admin.mockResolvedValue({ from: () => ({ insert: mocks.insert }) }); mocks.insert.mockResolvedValue({ error: null }); mocks.url.mockResolvedValue("https://example.test/private-preview.pdf"); });
describe("administrator document preview", () => {
  it("checks administrator before rendering or uploading", async () => {
    mocks.admin.mockRejectedValue(new Error("Wymagane uprawnienia: administrator"));
    const result = await preview.handler({ document_markdown: "# Umowa", document_header: undefined }, ctx);
    expect(result.isError).toBe(true);
    expect(mocks.admin).toHaveBeenCalledWith(ctx, ["administrator"]);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("uploads private preview, audits it and signs for one hour", async () => {
    const result = await preview.handler({ document_markdown: "# Umowa\n\n20 000 zł", document_header: undefined }, ctx);
    expect(result.isError).not.toBe(true);
    expect(mocks.upload.mock.calls[0][0]).toMatch(/^podglady\/00000000-0000-0000-0000-000000000001\/.+\.pdf$/);
    expect(mocks.url).toHaveBeenCalledWith(mocks.upload.mock.calls[0][0], 3600);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ action: "esign_document_preview", user_id: ctx.getUserId() }));
    const block = result.content?.find((item) => item.type === "text");
    if (!block || block.type !== "text") throw new Error("Missing preview result");
    const output = JSON.parse(block.text);
    expect(output.page_count).toBe(1);
    expect(output.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("MCP creation defaults to a draft", () => {
    expect(createEsignEnvelope.inputSchema?.send_now.parse(undefined)).toBe(false);
  });
});