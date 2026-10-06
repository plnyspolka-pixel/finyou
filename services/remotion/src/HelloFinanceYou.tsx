import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export type HelloProps = { title: string; subtitle: string };

export const helloSchemaDefaults: HelloProps = {
  title: "Finance You",
  subtitle: "Remotion Lambda działa",
};

// Testowa rolka 9:16 (5 s) — sprawdza, że render na Lambdzie przechodzi.
export const HelloFinanceYou: React.FC<HelloProps> = ({ title, subtitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, config: { damping: 200 } });
  const subtitleOpacity = interpolate(frame, [30, 50], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(160deg, #0f172a 0%, #1e3a8a 100%)",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "Inter, Arial, sans-serif",
        color: "white",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 120, fontWeight: 800, transform: `scale(${scale})` }}>{title}</div>
      <div style={{ fontSize: 56, marginTop: 40, opacity: subtitleOpacity }}>{subtitle}</div>
    </AbsoluteFill>
  );
};
