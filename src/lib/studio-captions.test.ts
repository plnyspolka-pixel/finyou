import { describe, it, expect } from "vitest";
import {
  CAPTION_BURN_MAX_ATTEMPTS,
  CAPTION_BURN_TIMEOUT_MS,
  CAPTION_GRACE_MS,
  captionBadgeLabel,
  planCaptionBurn,
  resolveCaptionBurn,
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

describe("planCaptionBurn", () => {
  const outputs = { video_url: CLEAN, captioned_video_url: BURNED, subtitle_url: SRT };

  it("wypala u siebie, gdy styl własny, usługa jest i HeyGen oddał SRT", () => {
    expect(
      planCaptionBurn({ captions: true, captionStyle: "reels", burnerConfigured: true, outputs }),
    ).toEqual({ action: "burn", videoUrl: CLEAN, srtUrl: SRT, styleId: "reels" });
  });

  it("styl heygen, wyłączone napisy albo nieznany styl = bez powodu do zgłaszania", () => {
    for (const captionStyle of ["heygen", undefined, null, "obcy"]) {
      expect(
        planCaptionBurn({ captions: true, captionStyle, burnerConfigured: true, outputs }),
      ).toEqual({ action: "heygen", reason: null });
    }
    expect(
      planCaptionBurn({ captions: false, captionStyle: "reels", burnerConfigured: true, outputs }),
    ).toEqual({ action: "heygen", reason: null });
  });

  it("brak usługi i brak SRT tłumaczą się w powodzie", () => {
    expect(
      planCaptionBurn({ captions: true, captionStyle: "box", burnerConfigured: false, outputs })
        .action,
    ).toBe("heygen");
    const noSrt = planCaptionBurn({
      captions: true,
      captionStyle: "box",
      burnerConfigured: true,
      outputs: { video_url: CLEAN },
    });
    expect(noSrt).toMatchObject({ action: "heygen" });
    expect((noSrt as { reason: string }).reason).toMatch(/SRT/);
  });
});

describe("resolveCaptionBurn", () => {
  const started = new Date(NOW.getTime() - 5 * 60_000).toISOString();
  const heygen = { video_url: CLEAN, captioned_video_url: BURNED, subtitle_url: SRT };
  const base = { error: null, startedAt: started, attempts: 1, now: NOW };

  it("gotowe → zapis; w toku → czekamy", () => {
    expect(
      resolveCaptionBurn({ ...base, status: "done", fallback: { previous: null, heygen } }),
    ).toEqual({ state: "store" });
    expect(
      resolveCaptionBurn({ ...base, status: "processing", fallback: { previous: null, heygen } }),
    ).toEqual({ state: "waiting" });
  });

  it("po przekroczeniu czasu schodzi na wersję HeyGena z napisami", () => {
    const old = new Date(NOW.getTime() - CAPTION_BURN_TIMEOUT_MS - 1000).toISOString();
    const r = resolveCaptionBurn({
      ...base,
      status: "queued",
      startedAt: old,
      fallback: { previous: null, heygen },
    });
    expect(r).toMatchObject({
      state: "fallback",
      videoUrl: BURNED,
      captionsBurned: true,
      captionStyle: "heygen",
    });
    expect((r as { note: string }).note).toMatch(/min/);
  });

  it("błąd i zaginione zadanie: najpierw ponowienie, potem wersja zapasowa", () => {
    expect(
      resolveCaptionBurn({
        ...base,
        status: "missing",
        attempts: 1,
        fallback: { previous: null, heygen },
      }),
    ).toMatchObject({ state: "retry" });
    const r = resolveCaptionBurn({
      ...base,
      status: "failed",
      error: "ffmpeg zakończył się kodem 1",
      attempts: CAPTION_BURN_MAX_ATTEMPTS,
      fallback: { previous: null, heygen: { video_url: CLEAN } },
    });
    expect(r).toMatchObject({ state: "fallback", videoUrl: CLEAN, captionsBurned: false });
    expect((r as { note: string }).note).toMatch(/ffmpeg/);
    expect((r as { note: string }).note).toMatch(/bez napisów/);
  });

  it("przy zmianie napisów gotowego wideo wraca poprzedni plik", () => {
    const r = resolveCaptionBurn({
      ...base,
      status: "failed",
      error: "x",
      attempts: 5,
      fallback: {
        previous: { videoUrl: "https://cdn/prev.mp4", captions: true, captionStyle: "tiktok" },
        heygen,
      },
    });
    expect(r).toMatchObject({
      state: "fallback",
      videoUrl: "https://cdn/prev.mp4",
      captionsBurned: true,
      captionStyle: "tiktok",
    });
  });
});

describe("captionBadgeLabel — styl własny", () => {
  it("pokazuje nazwę stylu, gdy napisy wypaliliśmy sami", () => {
    expect(captionBadgeLabel({ captions: true, subtitle_url: SRT, caption_style: "reels" })).toBe(
      "napisy: Rolka — duże z obrysem",
    );
    expect(captionBadgeLabel({ captions: true, subtitle_url: SRT, caption_style: "heygen" })).toBe(
      "napisy na wideo",
    );
  });
});
