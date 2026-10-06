import { Composition } from "remotion";
import { ALL_FORMATS, Input, UrlSource } from "mediabunny";
import { HelloFinanceYou, helloSchemaDefaults } from "./HelloFinanceYou";
import { StudioReel, studioReelDefaults, type StudioReelProps } from "./StudioReel";

/** Klatkaż renderu rolek — HeyGen oddaje 25/30 kl./s, 30 wystarcza każdej platformie. */
const REEL_FPS = 30;

/**
 * Długość i kadr mastera z samego kontenera MP4 (mediabunny czyta nagłówki
 * zakresami HTTP, bez dekodowania obrazu — działa też tam, gdzie Chromium
 * nie ma kodeka H.264). Backend nie musi sondować pliku.
 */
async function probeVideo(url: string): Promise<{ seconds: number; width: number; height: number }> {
  const input = new Input({ source: new UrlSource(url), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error(`Plik ${url} nie ma ścieżki wideo.`);
    const seconds = await input.computeDuration();
    return { seconds, width: track.displayWidth, height: track.displayHeight };
  } finally {
    input.dispose();
  }
}

// Rejestr kompozycji. Każda <Composition> to osobny film, który Lambda
// renderuje po `id` (np. `node render.mjs HelloFinanceYou`).
export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="HelloFinanceYou"
      component={HelloFinanceYou}
      durationInFrames={150}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={helloSchemaDefaults}
    />
    <Composition
      id="StudioReel"
      component={StudioReel}
      durationInFrames={150}
      fps={REEL_FPS}
      width={720}
      height={1280}
      defaultProps={studioReelDefaults}
      calculateMetadata={async ({ props }: { props: StudioReelProps }) => {
        if (!props.videoUrl) return {};
        const meta = await probeVideo(props.videoUrl);
        return {
          durationInFrames: Math.max(1, Math.ceil(meta.seconds * REEL_FPS)),
          width: Math.round(meta.width / 2) * 2,
          height: Math.round(meta.height / 2) * 2,
          fps: REEL_FPS,
        };
      }}
    />
  </>
);
