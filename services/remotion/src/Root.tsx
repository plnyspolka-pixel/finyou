import { Composition } from "remotion";
import { HelloFinanceYou, helloSchemaDefaults } from "./HelloFinanceYou";
import {
  STUDIO_REEL_FPS,
  StudioReel,
  calculateStudioReelMetadata,
  studioReelDefaults,
} from "./StudioReel";

// Rejestr kompozycji. Każda <Composition> to osobny film, który Lambda
// renderuje po `id` (np. `node render.mjs HelloFinanceYou`).
// `StudioReel` renderuje Studio (render_engine = "remotion") — długość i kadr
// bierze z pliku mastera (calculateMetadata), plan rysunku z inputProps.
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
      durationInFrames={STUDIO_REEL_FPS * 5}
      fps={STUDIO_REEL_FPS}
      width={1080}
      height={1920}
      defaultProps={studioReelDefaults}
      calculateMetadata={calculateStudioReelMetadata}
    />
  </>
);
