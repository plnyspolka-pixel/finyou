// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { storageManifest } from "./migration-storage-manifest.server";

function setup(authorized = true, count = 1) {
  const objects = Array.from({ length: count }, (_, i) => ({ name: `file-${i}.pdf`, size: 123, mimetype: "application/pdf", etag: "etag" }));
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), gt: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: authorized ? { token_hash: "hash" } : null, error: null }) };
  const sign = vi.fn().mockResolvedValue({ data: objects.map((o) => ({ path: o.name, signedUrl: `https://example.test/${o.name}` })), error: null });
  const admin = { from: vi.fn(() => query), rpc: vi.fn().mockResolvedValue({ data: objects, error: null }), storage: { from: vi.fn(() => ({ createSignedUrls: sign })) } };
  const getAdmin = vi.fn(async () => admin as unknown as SupabaseClient<Database>);
  return { query, sign, admin, getAdmin };
}
const request = (query = "bucket=documents", token: string | null = "test-secret") => new Request(`https://example.test/api/migration/storage-manifest?${query}`, { headers: token ? { "x-migration-token": token } : {} });

describe("temporary Storage manifest", () => {
  it("rejects absent token without loading the privileged client", async () => {
    const s = setup();
    const response = await storageManifest(request("", null), s.getAdmin);
    expect(response.status).toBe(401);
    expect(s.getAdmin).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("rejects unknown or expired token without listing files", async () => {
    const s = setup(false);
    expect((await storageManifest(request(), s.getAdmin)).status).toBe(401);
    expect(s.admin.rpc).not.toHaveBeenCalled();
    expect(s.query.gt.mock.calls[0][0]).toBe("expires_at");
  });
  it("uses only SHA-256 hex for the lookup", async () => {
    const s = setup();
    await storageManifest(request(), s.getAdmin);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("test-secret"));
    const expected = Buffer.from(digest).toString("hex");
    expect(s.query.eq).toHaveBeenCalledWith("token_hash", expected);
    expect(expected).toHaveLength(64);
  });
  it.each(["bucket=other", "bucket=documents&limit=101", "bucket=documents&limit=0", "bucket=documents&offset=-1", "bucket=documents&offset=1.5", "bucket=documents&offset=2147483648", ""])("rejects invalid query %s", async (query) => {
    const s = setup();
    expect((await storageManifest(request(query), s.getAdmin)).status).toBe(400);
    expect(s.admin.rpc).not.toHaveBeenCalled();
  });
  it("defaults to 100 rows and signs all names in one call for 10800 seconds", async () => {
    const s = setup();
    const response = await storageManifest(request(), s.getAdmin);
    expect(s.admin.rpc).toHaveBeenCalledWith("migration_list_storage_objects", { p_bucket: "documents", p_offset: 0, p_limit: 100 });
    expect(s.sign).toHaveBeenCalledExactlyOnceWith(["file-0.pdf"], 10800);
    expect(await response.json()).toEqual({ items: [{ bucket: "documents", name: "file-0.pdf", size: 123, mimetype: "application/pdf", etag: "etag", url: "https://example.test/file-0.pdf" }], next_offset: null });
  });
  it("returns the next offset on a full page", async () => {
    const s = setup(true, 2);
    const response = await storageManifest(request("bucket=podpisy&limit=2&offset=5"), s.getAdmin);
    expect((await response.json()).next_offset).toBe(7);
  });
  it("does not sign empty pages", async () => {
    const s = setup(true, 0);
    expect(await (await storageManifest(request(), s.getAdmin)).json()).toEqual({ items: [], next_offset: null });
    expect(s.sign).not.toHaveBeenCalled();
  });
  it("fails closed without exposing signing errors or filenames", async () => {
    const s = setup();
    s.sign.mockResolvedValue({ data: null, error: { message: "sensitive filename" } } as never);
    const response = await storageManifest(request(), s.getAdmin);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Export unavailable" });
  });
  it("lists per-item signing failures as missing without failing the page", async () => {
    const s = setup(true, 3);
    s.sign.mockResolvedValue({ data: [
      { path: "file-0.pdf", signedUrl: "https://example.test/file-0.pdf", error: null },
      { path: "file-1.pdf", signedUrl: null, error: "Object not found" },
      { path: "file-2.pdf", signedUrl: "", error: null },
    ], error: null } as never);
    const response = await storageManifest(request("bucket=documents&limit=3"), s.getAdmin);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items.map((i: { name: string }) => i.name)).toEqual(["file-0.pdf"]);
    expect(body.missing).toEqual([
      { bucket: "documents", name: "file-1.pdf", size: 123, etag: "etag" },
      { bucket: "documents", name: "file-2.pdf", size: 123, etag: "etag" },
    ]);
    expect(body.next_offset).toBe(3);
  });
});