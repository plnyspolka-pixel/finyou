import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  row: { track: "inwestor", studio_job_id: null } as Record<string, unknown> | null,
  job: { track: null, material_audience: "inwestor" },
  profiles: {} as Record<string, unknown>,
  claim: false,
  saves: [] as Record<string, unknown>[],
  logs: [] as Record<string, unknown>[],
  requests: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: (table: string) => {
    let patch: Record<string, unknown> | undefined;
    const q: any = {
      update: (p: Record<string, unknown>) => { patch = p; state.saves.push(p); return q; },
      insert: (p: Record<string, unknown>) => { state.logs.push(p); return Promise.resolve({ error: null }); },
      eq: () => q, is: () => q, select: () => q, limit: () => q,
      maybeSingle: async () => {
        if (table === "youtube_publish_queue") {
          const row = state.claim ? null : state.row;
          state.claim = true;
          return { data: row, error: null };
        }
        return { data: table === "studio_video_jobs" ? state.job : { audience_profiles: state.profiles }, error: null };
      },
      then: (resolve: (v: unknown) => unknown) => resolve({ error: null }),
    };
    return q;
  },
} }));
vi.mock("./youtube-api.server", () => ({ youtubeRequest: state.requests }));
import { addYoutubeFirstComment, resolveCommentTrack } from "./youtube-first-comment.server";

beforeEach(() => {
  state.claim = false; state.row = { track: "inwestor", studio_job_id: null };
  state.profiles = {}; state.saves = []; state.logs = [];
  state.requests.mockReset().mockResolvedValue({ snippet: { topLevelComment: { id: "comment-1" } } });
});
describe("YouTube first comment", () => {
  it("posts investor CTA via commentThreads and persists the top-level comment ID", async () => {
    await addYoutubeFirstComment("queue-1", "video-1");
    expect(state.requests).toHaveBeenCalledWith("/commentThreads", {
      method: "POST", query: { part: "snippet" },
      json: { snippet: { videoId: "video-1", topLevelComment: { snippet: {
        textOriginal: "👉 Jak zarabiać na pożyczkach zabezpieczonych hipoteką — i jakie ryzyko się z tym wiąże: https://financeyou.pl/r/0eurrzyb",
      } } } },
    });
    expect(state.saves).toContainEqual({ first_comment_id: "comment-1", first_comment_error: null });
  });
  it("unknown track uses borrower CTA", async () => {
    state.row = { track: null, studio_job_id: null };
    await addYoutubeFirstComment("q", "v");
    expect(state.requests.mock.calls[0]?.[1].json.snippet.topLevelComment.snippet.textOriginal)
      .toBe("👉 Sprawdź, ile możesz uzyskać pod swoją nieruchomość — złóż bezpłatny wniosek: https://financeyou.pl/r/kuugaim5");
  });
  it("uses Studio audience if the queue track is absent", async () => {
    state.row = { track: null, studio_job_id: "job-1" };
    await addYoutubeFirstComment("q", "v");
    expect(state.requests.mock.calls[0]?.[1].json.snippet.topLevelComment.snippet.textOriginal)
      .toContain("https://financeyou.pl/r/0eurrzyb");
  });
  it("queue track takes precedence over Studio metadata", () => {
    expect(resolveCommentTrack("pozyczkobiorca", { track: "inwestor" })).toBe("pozyczkobiorca");
    expect(resolveCommentTrack(null, { track: "inwestor", material_audience: "klient" })).toBe("inwestor");
  });
  it("supports changing text/link via existing audience profile configuration", async () => {
    state.profiles = { inwestor: { youtubeFirstComment: { text: "Nowa treść", url: "https://financeyou.pl/r/updated" } } };
    await addYoutubeFirstComment("q", "v");
    expect(state.requests.mock.calls[0]?.[1].json.snippet.topLevelComment.snippet.textOriginal)
      .toBe("Nowa treść https://financeyou.pl/r/updated");
  });
  it("never posts twice on retry", async () => {
    await addYoutubeFirstComment("q", "v");
    await addYoutubeFirstComment("q", "v");
    expect(state.requests).toHaveBeenCalledTimes(1);
  });
  it("API failure is warning only and an ambiguous failure is not blindly retried", async () => {
    state.requests.mockRejectedValue(new Error("YouTube API 403: commentsDisabled"));
    await expect(addYoutubeFirstComment("q", "v")).resolves.toBeUndefined();
    await addYoutubeFirstComment("q", "v");
    expect(state.requests).toHaveBeenCalledTimes(1);
    expect(state.logs).toContainEqual(expect.objectContaining({ module: "growth_engine", status: "warning" }));
    expect(state.saves).toContainEqual({ first_comment_error: "YouTube API 403: commentsDisabled" });
    expect(state.saves.some((p) => "status" in p)).toBe(false);
  });
  it("does not call API for a historical/unclaimed/already commented entry", async () => {
    state.row = null;
    await addYoutubeFirstComment("q", "v");
    expect(state.requests).not.toHaveBeenCalled();
  });
});