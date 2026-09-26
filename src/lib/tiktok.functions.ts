// Server functions panelu dla integracji TikTok — status połączenia OAuth,
// start połączenia i rozłączenie. Logika: src/lib/tiktok.server.ts.
//
// Wzorowane na src/lib/youtube-shorts.functions.ts. Endpoint /api/tiktok/auth
// jest publiczny (nawigacja przeglądarki nie nosi nagłówka Authorization),
// dlatego `startTiktokConnect` — chronione rolą administratora — wydaje
// jednorazowy `state`, a dopiero z nim tamten endpoint przepuszcza redirect.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (!(data ?? []).some((r) => r.role === "administrator")) {
    throw new Error("Brak uprawnień");
  }
}

export type TiktokIntegrationStatus = {
  envConfigured: boolean;
  redirectUri: string;
  connected: boolean;
  openId: string | null;
  tokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  connectedAt: string | null;
  lastError: string | null;
};

export const getTiktokIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TiktokIntegrationStatus> => {
    await assertAdmin(context.userId);
    const { getTiktokEnv, getIntegrationRow } = await import("@/lib/tiktok.server");
    const env = getTiktokEnv();
    const row = await getIntegrationRow();
    // Tokenów NIE zwracamy — tylko metadane do panelu.
    return {
      envConfigured: env.configured,
      redirectUri: env.redirectUri,
      connected: !!row.refresh_token && row.connected,
      openId: row.open_id,
      tokenExpiresAt: row.token_expires_at,
      refreshTokenExpiresAt: row.refresh_token_expires_at,
      connectedAt: row.connected_at,
      lastError: row.last_error,
    };
  });

export const startTiktokConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { startConnect } = await import("@/lib/tiktok.server");
    const { authPath } = await startConnect();
    return { url: authPath };
  });

export const disconnectTiktokAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { disconnectTiktok } = await import("@/lib/tiktok.server");
    await disconnectTiktok();
    return { ok: true };
  });
