// Bank klipów hooka — import (kopia do Storage, upsert po slugu) i dobór z tabeli.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeDb } from "./test-support/fake-supabase";

let db: FakeDb;
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return db;
  },
}));

const fetchBytes = vi.fn();
const storeMedia = vi.fn(async (_b: unknown, o: { name?: string }) => ({
  bucket: "studio-media",
  path: `mcp/studio-hook-clips/2026-10/${o.name}-abcd.mp4`,
  url: `https://storage/${o.name}.mp4`,
}));
vi.mock("./media-storage.server", () => ({
  fetchBytes: (...a: unknown[]) => fetchBytes(...a),
  storeMedia: (...a: unknown[]) => storeMedia(...(a as [unknown, { name?: string }])),
}));

import { HOOK_CLIP_MAX_BYTES, importHookClip, pickHookClip } from "./studio-hook-clips.server";

const ITEM = {
  slug: "h01_vault_kling",
  concept: "h01_vault",
  title: "Skarbiec się otwiera",
  track: "both",
  model: "kling",
  rating: 4,
  source_url: "https://v3b.fal.media/files/b/x/output.mp4",
};

beforeEach(() => {
  db = createFakeSupabase({ studio_hook_clips: [] });
  fetchBytes.mockReset();
  storeMedia.mockClear();
  fetchBytes.mockResolvedValue({ bytes: new ArrayBuffer(64), contentType: "video/mp4" });
});

describe("importHookClip", () => {
  it("nowy slug: pobiera (limit 60 MB), kopiuje do Storage i zapisuje wpis", async () => {
    const r = await importHookClip(ITEM);
    expect(r.status).toBe("imported");
    expect(fetchBytes).toHaveBeenCalledWith(ITEM.source_url, HOOK_CLIP_MAX_BYTES);
    expect(storeMedia.mock.calls[0][1]).toMatchObject({
      contentType: "video/mp4",
      visibility: "public",
      prefix: "studio-hook-clips",
    });
    expect(db.tables.studio_hook_clips[0]).toMatchObject({
      slug: "h01_vault_kling",
      track: "both",
      rating: 4,
      media_url: "https://storage/h01_vault_kling.mp4",
      source_url: ITEM.source_url,
    });
  });

  it("slug już w banku: tylko metadane bez pobierania; `force` pobiera od nowa", async () => {
    db.tables.studio_hook_clips = [
      { id: "c1", slug: ITEM.slug, track: "both", rating: 3, media_url: "https://storage/old.mp4" },
    ];
    const r = await importHookClip({ ...ITEM, rating: 2 });
    expect(r.status).toBe("skipped");
    expect(fetchBytes).not.toHaveBeenCalled();
    expect(db.tables.studio_hook_clips[0]).toMatchObject({
      rating: 2,
      media_url: "https://storage/old.mp4",
    });

    const f = await importHookClip(ITEM, { force: true });
    expect(f.status).toBe("updated");
    expect(fetchBytes).toHaveBeenCalledTimes(1);
    expect(db.tables.studio_hook_clips[0].media_url).toBe("https://storage/h01_vault_kling.mp4");
  });

  it("odrzuca nie-wideo; octet-stream z .mp4 przechodzi", async () => {
    fetchBytes.mockResolvedValueOnce({ bytes: new ArrayBuffer(8), contentType: "text/html" });
    await expect(importHookClip({ ...ITEM, source_url: "https://x.test/a" })).rejects.toThrow(
      /nie jest film/,
    );
    fetchBytes.mockResolvedValueOnce({
      bytes: new ArrayBuffer(8),
      contentType: "application/octet-stream",
    });
    await expect(importHookClip(ITEM)).resolves.toMatchObject({ status: "imported" });
  });
});

describe("pickHookClip", () => {
  it("aktywny klip toru albo `both`, nieużyty przed użytym", async () => {
    db.tables.studio_hook_clips = [
      {
        id: "a",
        slug: "a",
        track: "both",
        rating: 4,
        media_url: "https://s/a.mp4",
        active: true,
        last_used_at: "2026-10-21T00:00:00Z",
      },
      {
        id: "b",
        slug: "b",
        track: "inwestor",
        rating: 3,
        media_url: "https://s/b.mp4",
        active: true,
        last_used_at: null,
      },
      {
        id: "c",
        slug: "c",
        track: "pozyczkobiorca",
        rating: 4,
        media_url: "https://s/c.mp4",
        active: true,
        last_used_at: null,
      },
    ];
    expect((await pickHookClip("inwestor"))?.id).toBe("b");
    expect((await pickHookClip(null))?.id).toBe("c");
    db.tables.studio_hook_clips = [];
    expect(await pickHookClip("inwestor")).toBeNull();
  });
});
