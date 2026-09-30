import { afterEach, describe, expect, it, vi } from "vitest";
import { getHeygenVideoStatus } from "./avatar-faq.server";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("getHeygenVideoStatus", () => {
  it("film spoza v3 (404) czyta z API v1 — Studio nie utknie na „rendering”", async () => {
    vi.stubEnv("HEYGEN_API_KEY", "test");
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("/v3/videos/")) return json(404, { error: "video not found" });
        return json(200, {
          data: {
            status: "completed",
            video_url: "https://files.heygen.ai/v.mp4",
            video_url_caption: "https://files.heygen.ai/v_caption.mp4",
            thumbnail_url: "https://files.heygen.ai/t.jpg",
          },
        });
      }),
    );
    const out = await getHeygenVideoStatus("abc123");
    expect(calls[1]).toContain("/v1/video_status.get?video_id=abc123");
    expect(out).toMatchObject({
      status: "completed",
      video_url: "https://files.heygen.ai/v.mp4",
      captioned_video_url: "https://files.heygen.ai/v_caption.mp4",
    });
  });

  it("inne błędy v3 dalej rzucają", async () => {
    vi.stubEnv("HEYGEN_API_KEY", "test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(500, { error: "boom" })),
    );
    await expect(getHeygenVideoStatus("abc123")).rejects.toThrow(/HeyGen status failed: 500/);
  });
});
