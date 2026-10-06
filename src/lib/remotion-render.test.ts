import { describe, expect, it } from "vitest";
import {
  buildStudioReelInput,
  REMOTION_JOB_PREFIX,
  isRemotionJobId,
} from "./remotion-render.server";

const SRT = `1
00:00:00,300 --> 00:00:02,500
Pożyczka pod zastaw nieruchomości bez BIK

2
00:00:02,500 --> 00:00:05,000
Ile kosztuje pożyczka pod zastaw?
`;

describe("buildStudioReelInput", () => {
  it("tnie kwestie pod styl i dopasowuje nakładki do SRT", () => {
    const out = buildStudioReelInput({
      videoUrl: "https://example.com/a.mp4",
      srt: SRT,
      styleId: "tiktok",
      aiBadge: true,
      overlays: { headline: "Ile kosztuje pożyczka pod zastaw?", headlineEndSeconds: 9 },
    });
    expect(out).not.toBeNull();
    expect(out!.style?.id).toBe("tiktok");
    // tiktok: 13 znaków, 1 wiersz — pierwsza kwestia rozpada się na kilka porcji.
    expect(out!.cues.length).toBeGreaterThan(2);
    for (const cue of out!.cues) {
      for (const line of cue.text.split("\n")) expect(line.length).toBeLessThanOrEqual(13);
      expect(cue.end).toBeGreaterThan(cue.start);
    }
    // Koniec pytania z kwestii SRT (5 s + 0,25), nie z szacunku (9 s).
    expect(out!.overlays?.headlineEndSeconds).toBeCloseTo(5.25, 2);
    expect(out!.aiBadge).toBe(true);
  });

  it("bez stylu nie wysyła kwestii, ale nakładki i tak dostają czasy z SRT", () => {
    const out = buildStudioReelInput({
      videoUrl: "https://example.com/a.mp4",
      srt: SRT,
      styleId: null,
      aiBadge: false,
      overlays: { headline: "Ile kosztuje pożyczka pod zastaw?" },
    });
    expect(out!.cues).toEqual([]);
    expect(out!.style).toBeNull();
    expect(out!.overlays?.headlineEndSeconds).toBeCloseTo(5.25, 2);
  });

  it("zwraca null, gdy nie ma czego renderować albo SRT jest pusty przy napisach", () => {
    expect(
      buildStudioReelInput({
        videoUrl: "https://x/a.mp4",
        srt: null,
        styleId: null,
        aiBadge: false,
        overlays: null,
      }),
    ).toBeNull();
    expect(
      buildStudioReelInput({
        videoUrl: "https://x/a.mp4",
        srt: "",
        styleId: "reels",
        aiBadge: true,
        overlays: null,
      }),
    ).toBeNull();
    expect(
      buildStudioReelInput({
        videoUrl: "https://x/a.mp4",
        srt: null,
        styleId: null,
        aiBadge: true,
        overlays: null,
      }),
    ).toMatchObject({ cues: [], style: null, aiBadge: true });
  });
});

describe("isRemotionJobId", () => {
  it("rozpoznaje prefiks", () => {
    expect(isRemotionJobId(`${REMOTION_JOB_PREFIX}abc123`)).toBe(true);
    expect(isRemotionJobId("abc123")).toBe(false);
  });
});
