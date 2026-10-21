import { describe, expect, it } from "vitest";
import {
  FLOWS_VIDEO_MODEL,
  flowsImageBody,
  flowsVideoBody,
  isFlowsPlanError,
  parseFlowsGeneration,
  snapVeoDuration,
} from "./elevenlabs-flows";

describe("ElevenLabs Flows", () => {
  it("wideo: Veo 3.1 Fast, pion, czas 4/6/8 s, bez dźwięku modelu", () => {
    expect(flowsVideoBody({ prompt: "vault", durationSeconds: 2.5 })).toEqual({
      model_id: FLOWS_VIDEO_MODEL,
      prompt: "vault",
      duration_secs: 4,
      aspect_ratio: "9:16",
      resolution: "720p",
      generate_audio: false,
    });
    expect(snapVeoDuration(5)).toBe(6);
    expect(snapVeoDuration(30)).toBe(8);
    expect(flowsVideoBody({ prompt: "x", startFrameUrl: "https://a/b.png" }).start_frame).toEqual({
      url: "https://a/b.png",
    });
  });
  it("obraz: pion 9:16", () => {
    expect(flowsImageBody({ prompt: "x" })).toMatchObject({ aspect_ratio: "9:16", prompt: "x" });
  });
  it("status generacji", () => {
    expect(
      parseFlowsGeneration({
        id: "g1",
        status: "completed",
        content_url: "https://s/v.mp4",
        content_mime_type: "video/mp4",
      }),
    ).toEqual({
      id: "g1",
      status: "completed",
      contentUrl: "https://s/v.mp4",
      mimeType: "video/mp4",
      failure: null,
    });
    expect(
      parseFlowsGeneration({ id: "g2", status: "failed", failure_reason: "moderated" }).failure,
    ).toBe("moderated");
    expect(parseFlowsGeneration(null).status).toBe("unknown");
  });
  it("402 bez planu Pro rozpoznany", () => {
    expect(
      isFlowsPlanError(
        new Error("ElevenLabs HTTP 402: This endpoint requires a Pro plan or above."),
      ),
    ).toBe(true);
    expect(isFlowsPlanError(new Error("ElevenLabs HTTP 500"))).toBe(false);
  });
});
