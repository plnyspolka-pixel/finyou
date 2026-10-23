import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  comment: vi.fn(), updates: [] as Record<string, unknown>[],
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: (table: string) => {
    const q: any = {
      update: (p: Record<string, unknown>) => { state.updates.push(p); return q; },
      eq: () => q, in: () => q, select: () => q,
      maybeSingle: async () => ({ data: table === "youtube_integration" ? {
        access_token: "test-token", refresh_token: "test-refresh", access_token_expires_at: "2099-01-01",
      } : { id: "q", title: "Test", description: "Test", tags: [], source_video_url: "https://example.com/video.mp4", attempt_count: 0 }, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve({ error: null }),
    }; return q;
  },
} }));
vi.mock("./autopilot/state.server", () => ({ withOriginFilter: (q: unknown) => q }));
vi.mock("./autopilot/publish-gate.server", () => ({ gateClaimedItem: async () => ({ proceed: true, message: "Test" }) }));
vi.mock("./video-rendition.server", () => ({ ensurePublishableVideo: async (url: string) => url }));
vi.mock("./youtube-first-comment.server", () => ({ addYoutubeFirstComment: state.comment }));
import { processQueueItem } from "./youtube-shorts.server";
beforeEach(() => {
  state.updates = []; state.comment.mockReset().mockResolvedValue(undefined);
  vi.stubEnv("YOUTUBE_CLIENT_ID", "test"); vi.stubEnv("YOUTUBE_CLIENT_SECRET", "test");
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])))
    .mockResolvedValueOnce(new Response("", { headers: { Location: "https://example.com/upload" } }))
    .mockResolvedValueOnce(Response.json({ id: "new-video" })));
});
it("all queue publishers invoke first comment only after successful publication", async () => {
  expect(await processQueueItem("q")).toEqual({ ok: true, videoId: "new-video" });
  expect(state.updates).toContainEqual(expect.objectContaining({ status: "published", youtube_video_id: "new-video" }));
  expect(state.comment).toHaveBeenCalledWith("q", "new-video");
});
it("even an unexpected comment failure cannot requeue or fail the upload", async () => {
  state.comment.mockRejectedValue(new Error("unexpected"));
  expect(await processQueueItem("q")).toEqual({ ok: true, videoId: "new-video" });
  expect(state.updates.some((p) => p.status === "pending" || p.status === "failed")).toBe(false);
});
it("failed uploads never post comments", async () => {
  vi.mocked(fetch).mockReset().mockResolvedValue(new Response("failed", { status: 500 }));
  expect((await processQueueItem("q")).ok).toBe(false);
  expect(state.comment).not.toHaveBeenCalled();
});