import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./caption-burner.server", () => ({
  isCaptionBurnerConfigured: () => true,
  submitTranscode: vi.fn(async () => "burner-job"),
  getBurnerJobStatus: vi.fn(async () => ({ status: "processing", error: null })),
  discardBurnerJob: vi.fn(async () => {}),
  fetchBurnerFile: vi.fn(async () => new ArrayBuffer(1)),
}));

import {
  getTranscodeJobStatus,
  submitTranscodeJob,
  transcodeEngine,
} from "./video-transcoder.server";
import * as burner from "./caption-burner.server";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("video-transcoder — wybór silnika", () => {
  it("bez sekretów AWS zostaje caption-burner", async () => {
    expect(await transcodeEngine()).toBe("caption-burner");
    const id = await submitTranscodeJob({
      videoUrl: "https://a/v.mp4",
      uploadUrl: null,
      target: {},
    });
    expect(id).toBe("burner-job");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("z sekretami nowe zlecenia idą na AWS z Bearerem", async () => {
    vi.stubEnv("VIDEO_TRANSCODER_URL", "https://lambda.example/");
    vi.stubEnv("VIDEO_TRANSCODER_SECRET", "s3cret");
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "aws-1", status: "queued" }), { status: 202 }),
    );
    expect(await transcodeEngine()).toBe("aws-lambda");
    const id = await submitTranscodeJob({
      videoUrl: "https://a/v.mp4",
      uploadUrl: "https://up",
      target: { max_bytes: 1 },
    });
    expect(id).toBe("aws-1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://lambda.example/jobs");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer s3cret");
  });

  it("stare zadania (bez prefiksu aws-) domyka caption-burner, nowe — AWS", async () => {
    vi.stubEnv("VIDEO_TRANSCODER_URL", "https://lambda.example");
    vi.stubEnv("VIDEO_TRANSCODER_SECRET", "s3cret");
    await getTranscodeJobStatus("old-burner-id");
    expect(burner.getBurnerJobStatus).toHaveBeenCalledWith("old-burner-id");

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ status: "done", uploaded: true, bytes: 5, note: "przekodowanie" }),
      ),
    );
    const s = await getTranscodeJobStatus("aws-xyz");
    expect(s).toMatchObject({ status: "done", uploaded: true, bytes: 5 });
    expect(s.note).toContain("AWS Lambda");

    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 404 }));
    expect((await getTranscodeJobStatus("aws-gone")).status).toBe("missing");
  });
});
