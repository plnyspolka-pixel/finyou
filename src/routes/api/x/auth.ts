// Start OAuth X-a — redirect na ekran zgody (GET /api/x/auth).
//
// Endpoint jest publiczny z konieczności (zwykła nawigacja przeglądarki, a
// sesja Supabase jedzie w nagłówku Authorization, nie w ciasteczku), więc
// wpuszcza WYŁĄCZNIE z jednorazowym `state` wydanym przez admin-only server fn
// `startXConnect`. Bez tego obcy mógłby przejść flow na SWOIM koncie X
// i podmienić firmową integrację na własną.
import { createFileRoute } from "@tanstack/react-router";

const ADMIN_PANEL_PATH = "/admin/ustawienia";

function redirectToPanel(request: Request, params: Record<string, string>): Response {
  const url = new URL(request.url);
  const target = new URL(ADMIN_PANEL_PATH, url.origin);
  for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: target.toString() } });
}

export const Route = createFileRoute("/api/x/auth")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const state = url.searchParams.get("state") ?? "";
        try {
          const { assertPendingState, buildAuthorizeUrl, getXEnv } = await import("@/lib/x.server");
          if (!getXEnv().configured) {
            return redirectToPanel(request, { x: "error", reason: "missing_client_config" });
          }
          const row = await assertPendingState(state);
          return new Response(null, {
            status: 302,
            headers: { Location: await buildAuthorizeUrl(row) },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return redirectToPanel(request, { x: "error", reason: msg.slice(0, 200) });
        }
      },
    },
  },
});
