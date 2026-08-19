import { describe, it, expect } from "vitest";
import {
  CAPTION_GRACE_MS,
  captionBadgeLabel,
  resolveCaptionedOutput,
  type CaptionMode,
} from "./studio-captions";

const NOW = new Date("2026-08-18T12:00:00.000Z");
const CLEAN = "https://files.heygen.ai/video/abc123.mp4";
const BURNED = "https://files.heygen.ai/video/abc123_captioned.mp4";
const SRT = "https://files.heygen.ai/srt/abc123.srt";

const resolve = (
  want: CaptionMode,
  outputs: Parameters<typeof resolveCaptionedOutput>[0]["outputs"],
  waitSince: string | null = null,
  now: Date = NOW,
) => resolveCaptionedOutput({ want, outputs, waitSince, now });

describe("resolveCaptionedOutput", () => {
  it("publikuje wersję z wypalonymi napisami i zachowuje czysty master", () => {
    const r = resolve("burned", {
      video_url: CLEAN,
      captioned_video_url: BURNED,
      subtitle_url: SRT,
    });
    expect(r.state).toBe("ready");
    if (r.state !== "ready") return;
    expect(r.videoUrl).toBe(BURNED);
    expect(r.cleanVideoUrl).toBe(CLEAN);
    expect(r.subtitleUrl).toBe(SRT);
    expect(r.captionsBurned).toBe(true);
    expect(r.note).toBeNull();
  });

  it("nie duplikuje mastera, gdy HeyGen zwrócił ten sam URL w obu polach", () => {
    const r = resolve("burned", { video_url: BURNED, captioned_video_url: BURNED });
    expect(r.state).toBe("ready");
    if (r.state !== "ready") return;
    expect(r.videoUrl).toBe(BURNED);
    expect(r.cleanVideoUrl).toBeNull();
  });

  it("czeka, gdy wideo jest gotowe, a wypalonej wersji jeszcze nie ma", () => {
    const r = resolve("burned", { video_url: CLEAN, subtitle_url: SRT });
    expect(r).toEqual({ state: "waiting", waitSince: NOW.toISOString() });
  });

  it("czeka dalej w oknie karencji, nie przesuwając znacznika", () => {
    const started = new Date(NOW.getTime() - 60_000).toISOString();
    const r = resolve("burned", { video_url: CLEAN }, started);
    expect(r).toEqual({ state: "waiting", waitSince: started });
  });

  it("po karencji publikuje czysty plik i mówi wprost, że jest bez napisów", () => {
    const started = new Date(NOW.getTime() - CAPTION_GRACE_MS - 1_000).toISOString();
    const r = resolve("burned", { video_url: CLEAN, subtitle_url: SRT }, started);
    expect(r.state).toBe("ready");
    if (r.state !== "ready") return;
    expect(r.videoUrl).toBe(CLEAN);
    expect(r.captionsBurned).toBe(false);
    expect(r.subtitleUrl).toBe(SRT);
    expect(r.note).toMatch(/bez napisów/);
  });

  it("traktuje uszkodzony znacznik czekania jak brak znacznika", () => {
    const r = resolve("burned", { video_url: CLEAN }, "nie-data");
    expect(r).toEqual({ state: "waiting", waitSince: NOW.toISOString() });
  });

  it("dla trybu sidecar nie czeka i publikuje czysty plik", () => {
    const r = resolve("sidecar", { video_url: CLEAN, subtitle_url: SRT });
    expect(r.state).toBe("ready");
    if (r.state !== "ready") return;
    expect(r.videoUrl).toBe(CLEAN);
    expect(r.captionsBurned).toBe(false);
    expect(r.subtitleUrl).toBe(SRT);
    expect(r.cleanVideoUrl).toBeNull();
  });

  it("dla trybu off ignoruje nawet zwróconą wersję z napisami", () => {
    const r = resolve("off", { video_url: CLEAN, captioned_video_url: BURNED });
    expect(r.state).toBe("ready");
    if (r.state !== "ready") return;
    expect(r.videoUrl).toBe(CLEAN);
    expect(r.captionsBurned).toBe(false);
  });
});

describe("captionBadgeLabel", () => {
  it("rozróżnia napisy na wideo, sam plik SRT i brak napisów", () => {
    expect(captionBadgeLabel({ captions: true, subtitle_url: SRT })).toBe("napisy na wideo");
    expect(captionBadgeLabel({ captions: false, subtitle_url: SRT })).toBe("tylko plik SRT");
    expect(captionBadgeLabel({ captions: false, subtitle_url: null })).toBe("bez napisów");
  });
});
