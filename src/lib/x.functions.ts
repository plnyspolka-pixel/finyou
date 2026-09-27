// Server functions panelu dla integracji X (dawniej Twitter) — status
// połączenia OAuth, start połączenia i rozłączenie. Logika: src/lib/x.server.ts.
//
// Wzorowane na src/lib/tiktok.functions.ts. Endpoint /api/x/auth jest publiczny
// (nawigacja przeglądarki nie nosi nagłówka Authorization), dlatego
// `startXConnect` — chronione rolą administratora — wydaje jednorazowy `state`,
// a dopiero z nim tamten endpoint przepuszcza redirect.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (!(data ?? []).some((r) => r.role === "administrator")) {
    throw new Error("Brak uprawnień");
  }
}

export type XIntegrationStatus = {
  envConfigured: boolean;
  redirectUri: string;
  /** Diagnostyka `client_id` — patrz describeClientId w x.server.ts. */
  clientIdPreview: string;
  clientIdLength: number;
  clientIdHadWhitespace: boolean;
  /** Limit znaków posta (280, chyba że podniesiony sekretem dla X Premium). */
  postLimit: number;
  connected: boolean;
  username: string | null;
  scope: string | null;
  tokenExpiresAt: string | null;
  connectedAt: string | null;
  lastError: string | null;
};

export const getXIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<XIntegrationStatus> => {
    await assertAdmin(context.userId);
    const { getXEnv, getIntegrationRow, describeClientId } = await import("@/lib/x.server");
    const env = getXEnv();
    const id = describeClientId();
    const row = await getIntegrationRow();
    // Tokenów NIE zwracamy — tylko metadane do panelu.
    return {
      envConfigured: env.configured,
      redirectUri: env.redirectUri,
      clientIdPreview: id.preview,
      clientIdLength: id.length,
      clientIdHadWhitespace: id.hadWhitespace,
      postLimit: env.postLimit,
      connected: !!row.refresh_token && row.connected,
      username: row.username,
      scope: row.scope,
      tokenExpiresAt: row.token_expires_at,
      connectedAt: row.connected_at,
      lastError: row.last_error,
    };
  });

export const startXConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { startConnect } = await import("@/lib/x.server");
    const { authPath } = await startConnect();
    return { url: authPath };
  });

export const disconnectXAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { disconnectX } = await import("@/lib/x.server");
    await disconnectX();
    return { ok: true };
  });
