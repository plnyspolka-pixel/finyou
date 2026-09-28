import { describe, it, expect } from "vitest";
import { channelReadiness, summarizeQueue, youtubeRowToQueueRow } from "./marketing-overview";

const row = (p: Partial<Parameters<typeof summarizeQueue>[0][number]> & { id: string }) => ({
  platform: "facebook_post",
  title: null,
  status: "pending",
  scheduled_at: "2026-09-28T10:00:00.000Z",
  published_at: null,
  last_error: null,
  ...p,
});

describe("summarizeQueue", () => {
  it("liczy statusy i platformy, sortuje nadchodzące rosnąco, opublikowane malejąco", () => {
    const s = summarizeQueue([
      row({ id: "a", scheduled_at: "2026-09-29T10:00:00.000Z" }),
      row({ id: "b", scheduled_at: "2026-09-28T10:00:00.000Z", platform: "x" }),
      row({ id: "c", status: "processing", platform: "instagram_reels" }),
      row({ id: "d", status: "failed", last_error: "token" }),
      row({ id: "e", status: "published", published_at: "2026-09-20T10:00:00.000Z" }),
      row({ id: "f", status: "published", published_at: "2026-09-25T10:00:00.000Z" }),
    ]);
    expect(s.total).toBe(6);
    expect(s.by_status).toEqual({ pending: 2, processing: 1, failed: 1, published: 2 });
    expect(s.by_platform).toEqual({ facebook_post: 4, x: 1, instagram_reels: 1 });
    expect(s.upcoming.map((r) => r.id)).toEqual(["b", "a"]);
    expect(s.in_progress.map((r) => r.id)).toEqual(["c"]);
    expect(s.failed.map((r) => r.id)).toEqual(["d"]);
    expect(s.recently_published.map((r) => r.id)).toEqual(["f", "e"]);
  });

  it("obcina listy do limitu", () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      row({ id: `p${i}`, scheduled_at: `2026-10-${String(i + 1).padStart(2, "0")}T10:00:00.000Z` }),
    );
    expect(summarizeQueue(rows, 5).upcoming).toHaveLength(5);
    expect(summarizeQueue(rows, 5).upcoming[0].id).toBe("p0");
  });
});

describe("youtubeRowToQueueRow", () => {
  it("oznacza wiersz platformą youtube", () => {
    expect(
      youtubeRowToQueueRow({
        id: "y",
        title: "T",
        status: "pending",
        scheduled_at: "2026-09-28T10:00:00.000Z",
        published_at: null,
        last_error: null,
      }).platform,
    ).toBe("youtube");
  });
});

describe("channelReadiness", () => {
  it("dzieli kanały na gotowe i brakujące z instrukcją naprawy", () => {
    const r = channelReadiness({
      youtubeConnected: true,
      facebookConfigured: true,
      instagramConfigured: false,
      tiktokConfigured: true,
      tiktokConnected: false,
      xConfigured: false,
      xConnected: false,
      heygenConfigured: true,
      elevenlabsConfigured: true,
      aiConfigured: true,
    });
    expect(r.ready).toEqual(["youtube", "facebook", "heygen", "elevenlabs", "ai"]);
    expect(r.missing.map((m) => m.channel)).toEqual(["instagram", "tiktok", "x"]);
    expect(r.missing[1].fix).toMatch(/Połącz konto/);
    expect(r.missing[2].fix).toMatch(/X_CLIENT_ID/);
  });
});
