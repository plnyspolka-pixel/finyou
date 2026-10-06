import { Composition } from "remotion";
import { HelloFinanceYou, helloSchemaDefaults } from "./HelloFinanceYou";

// Rejestr kompozycji. Każda <Composition> to osobny film, który Lambda
// renderuje po `id` (np. `node render.mjs HelloFinanceYou`).
export const RemotionRoot: React.FC = () => (
  <Composition
    id="HelloFinanceYou"
    component={HelloFinanceYou}
    durationInFrames={150}
    fps={30}
    width={1080}
    height={1920}
    defaultProps={helloSchemaDefaults}
  />
);
