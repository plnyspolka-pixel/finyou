// Stan konfiguracji kanałów publikacji (sekrety Meta, połączone konta
// YouTube / TikTok / X, klucze HeyGen / ElevenLabs / AI) — wspólne dla server
// function Studia (getStudioStatus) i narzędzia MCP get_marketing_overview.
import type { StudioStatus } from "./studio.functions";

export async function collectStudioStatus(): Promise<StudioStatus> {
  const { getIntegrationRow } = await import("./youtube-shorts.server");
  const { getMetaPublishEnv } = await import("./studio-publishing.server");
  const tiktok = await import("./tiktok.server");
  const x = await import("./x.server");
  const meta = getMetaPublishEnv();
  let youtubeConnected = false;
  try {
    youtubeConnected = !!(await getIntegrationRow()).refresh_token;
  } catch {
    // Brak tabeli/tokenu nie blokuje panelu.
  }
  let tiktokConnected = false;
  try {
    tiktokConnected = !!(await tiktok.getIntegrationRow()).refresh_token;
  } catch {
    // Brak tabeli/tokenu nie blokuje panelu.
  }
  let xConnected = false;
  try {
    xConnected = !!(await x.getIntegrationRow()).refresh_token;
  } catch {
    // Brak tabeli/tokenu nie blokuje panelu.
  }
  return {
    youtubeConnected,
    facebookConfigured: meta.facebookConfigured,
    instagramConfigured: meta.instagramConfigured,
    tiktokConfigured: tiktok.getTiktokEnv().configured,
    tiktokConnected,
    xConfigured: x.getXEnv().configured,
    xConnected,
    heygenConfigured: !!process.env.HEYGEN_API_KEY,
    elevenlabsConfigured: !!process.env.ELEVENLABS_API_KEY,
    aiConfigured: !!process.env.LOVABLE_API_KEY,
    captionBurnerConfigured: (await import("./caption-burner.server")).isCaptionBurnerConfigured(),
    aiBadgeEnabled: (await import("./caption-burner.server")).isAiBadgeEnabled(),
    remotionConfigured: (await import("./remotion-render.server")).isRemotionConfigured(),
    defaultRenderEngine: (await import("./studio-render-engine")).resolveRenderEngine("auto"),
  };
}
