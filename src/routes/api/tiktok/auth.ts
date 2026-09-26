// Start OAuth TikToka — redirect na ekran zgody (GET /api/tiktok/auth).
//
// Endpoint jest publiczny z konieczności (zwykła nawigacja przeglądarki, a
// sesja Supabase jedzie w nagłówku Authorization, nie w ciasteczku), więc
// wpuszcza WYŁĄCZNIE z jednorazowym `state` wydanym przez admin-only server fn
// `startTiktokConnect`. Bez tego obcy mógłby przejść flow na SWOIM koncie
// TikTok i podmienić firmową integrację na własną.
import { createFileRoute } from "@tanstack/react-router";

const ADMIN_PANEL_PATH = "/admin/studio-publikacji";

function redirectToPanel(request: Request, params: Record<string, string>): Response {
  const url = new URL(request.url);
  const target = new URL(ADMIN_PANEL_PATH, url.origin);
  for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: target.toString() } });
}

export const Route = createFileRoute("/api/tiktok/auth")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const state = url.searchParams.get("state") ?? "";
        try {
          const { assertPendingState, buildAuthorizeUrl, getTiktokEnv } =
            await import("@/lib/tiktok.server");
          if (!getTiktokEnv().configured) {
            return redirectToPanel(request, { tt: "error", reason: "missing_client_config" });
          }
          await assertPendingState(state);
          return new Response(null, {
            status: 302,
            headers: { Location: buildAuthorizeUrl(state) },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return redirectToPanel(request, { tt: "error", reason: msg.slice(0, 200) });
        }
      },
    },
  },
});
