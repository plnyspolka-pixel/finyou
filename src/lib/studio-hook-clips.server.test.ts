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

const matchClip = vi.fn(async (_i: unknown): Promise<Record<string, unknown>> => {
  throw new Error("brak AI w teście");
});
vi.mock("./studio-ai.server", () => ({ matchHookClipConcept: (i: unknown) => matchClip(i) }));

import {
  HOOK_CLIP_MAX_BYTES,
  getHookClipBySlug,
  importHookClip,
  pickHookClip,
} from "./studio-hook-clips.server";

const ITEM = {
  slug: "h01_vault_kling",
  concept: "h01_vault",
  title: "Skarbiec się otwiera",
  track: "both",
  model: "kling",
  rating: 4,
  description: "Otwarcie dostępu do pieniędzy.",
  tags: ["skarbiec", "zabezpieczenie"],
  source_url: "https://v3b.fal.media/files/b/x/output.mp4",
};

beforeEach(() => {
  db = createFakeSupabase({ studio_hook_clips: [] });
  fetchBytes.mockReset();
  storeMedia.mockClear();
  matchClip.mockClear();
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
      description: "Otwarcie dostępu do pieniędzy.",
      tags: ["skarbiec", "zabezpieczenie"],
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

describe("pickHookClip — dobór do treści", () => {
  const row = (id: string, concept: string, track: string, rating: number, tags: string[]) => ({
    id,
    slug: id,
    concept,
    track,
    rating,
    tags,
    description: "",
    media_url: `https://s/${id}.mp4`,
    active: true,
    last_used_at: null,
  });
  const bank = () => [
    row("jar_k", "h24_jar", "inwestor", 4, ["pieniądze nudzą się", "pieniądze na koncie"]),
    row("jar_f", "h24_jar", "inwestor", 3, ["pieniądze nudzą się", "pieniądze na koncie"]),
    row("stamp", "h02_stamp", "pozyczkobiorca", 4, ["bank powiedział nie", "odmowa banku"]),
    row("vault", "h01_vault", "both", 3, ["skarbiec", "zabezpieczenie"]),
  ];

  it("AI: koncept z toru, najlepszy klip konceptu; inny tor nie trafia na listę", async () => {
    db.tables.studio_hook_clips = bank();
    matchClip.mockResolvedValueOnce({
      concept: "h24_jar",
      score: 77,
      reason: "pieniądze na koncie",
    });
    const p = await pickHookClip({
      track: "inwestor",
      script: "Pieniądze nudzą Ci się na koncie?",
      hookText: "NUDNE PIENIĄDZE?",
    });
    expect(p).toMatchObject({
      method: "ai",
      clip: { id: "jar_k" },
      concept: { concept: "h24_jar" },
    });
    const list = (matchClip.mock.calls[0][0] as { conceptList: string }).conceptList;
    expect(list).toMatch(/h01_vault/);
    expect(list).not.toMatch(/h02_stamp/);
  });

  it("AI poniżej progu → null (bez zapasu na słowa kluczowe)", async () => {
    db.tables.studio_hook_clips = bank();
    matchClip.mockResolvedValueOnce({ concept: "h24_jar", score: 40 });
    expect(
      await pickHookClip({ track: "inwestor", script: "Pieniądze nudzą Ci się na koncie?" }),
    ).toBeNull();
  });

  it("bez AI: słowa kluczowe; brak dopasowania albo pusty bank → null", async () => {
    db.tables.studio_hook_clips = bank();
    const p = await pickHookClip({ track: "pozyczkobiorca", script: "Bank powiedział nie?" });
    expect(p).toMatchObject({ method: "keywords", clip: { id: "stamp" } });
    expect(await pickHookClip({ track: "inwestor", script: "Pogoda w górach." })).toBeNull();
    db.tables.studio_hook_clips = [];
    expect(await pickHookClip({ track: "inwestor", script: "Pieniądze na koncie" })).toBeNull();
  });

  it("getHookClipBySlug", async () => {
    db.tables.studio_hook_clips = bank();
    expect((await getHookClipBySlug("JAR_F"))?.id).toBe("jar_f");
    expect(await getHookClipBySlug("nie-ma")).toBeNull();
  });
});
