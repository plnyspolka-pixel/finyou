import { Composition, type CalculateMetadataFunction } from "remotion";
import { parseMedia } from "@remotion/media-parser";
import { Reel } from "./Reel";
import type { ReelProps } from "./types";

const FPS = 30;

// Długość rolki = długość mastera: z props albo z samego pliku. parseMedia
// czyta kontener MP4 w JS — <video> w Chromium headless (także na Lambdzie)
// nie dekoduje H.264, więc getVideoMetadata tu nie działa.
const calculateMetadata: CalculateMetadataFunction<ReelProps> = async ({ props }) => {
  let seconds = props.durationSeconds ?? null;
  if (seconds == null) {
    const { durationInSeconds } = await parseMedia({
      src: props.videoUrl,
      fields: { durationInSeconds: true },
    });
    seconds = durationInSeconds ?? 0;
  }
  return { durationInFrames: Math.max(1, Math.ceil(seconds * FPS)) };
};

const PREVIEW_PROPS: ReelProps = {
  videoUrl: "https://remotion.media/video.mp4",
  durationSeconds: 8,
  overlays: {
    tag: "INWESTOWANIE\nW PRYWATNE POŻYCZKI\nPOD ZASTAW NIERUCHOMOŚCI",
    tagHoldSeconds: 1.5,
    headline: "Drukarka do pieniędzy",
    headlineStartSeconds: 1.5,
    headlineEndSeconds: 4,
    cards: [
      {
        title: "PRZYKŁAD",
        startSeconds: 4.2,
        endSeconds: null,
        rows: [
          { icon: "dot", text: "Pożyczka", value: "300 tys. zł" },
          { icon: "dot", text: "Mieszkanie warte", value: "600 tys. zł" },
          { icon: "check", text: "LTV", value: "50%" },
        ],
      },
    ],
  },
  captions: [{ start: 0, end: 3, text: "Wiesz, że banki od\n500 lat zarabiają" }],
  caption: { fontSize: 60, marginBottom: 380, uppercase: false },
  aiBadge: true,
};

export const Root = () => (
  <Composition
    id="Reel"
    component={Reel}
    width={720}
    height={1280}
    fps={FPS}
    durationInFrames={FPS * 8}
    defaultProps={PREVIEW_PROPS}
    calculateMetadata={calculateMetadata}
  />
);
