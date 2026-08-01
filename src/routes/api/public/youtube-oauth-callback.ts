// Callback OAuth Google dla połączenia kanału YouTube (moduł YouTube Shorts).
// Publiczny z konieczności (redirect z accounts.google.com); chroniony
// jednorazowym stanem anty-CSRF zapisanym przy starcie połączenia w adminie.
import { createFileRoute } from "@tanstack/react-router";

const ADMIN_PANEL_PATH = "/admin/youtube-shorts";

function redirectToPanel(request: Request, params: Record<string, string>): Response {
  const url = new URL(request.url);
  const target = new URL(ADMIN_PANEL_PATH, url.origin);
  for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: target.toString() } });
}

export const Route = createFileRoute("/api/public/youtube-oauth-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const error = url.searchParams.get("error");
        if (error) return redirectToPanel(request, { yt: "error", reason: error });

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state) {
          return redirectToPanel(request, { yt: "error", reason: "missing_code_or_state" });
        }

        try {
          const { handleOauthCallback } = await import("@/lib/youtube-shorts.server");
          await handleOauthCallback(code, state);
          return redirectToPanel(request, { yt: "connected" });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return redirectToPanel(request, { yt: "error", reason: msg.slice(0, 200) });
        }
      },
    },
  },
});
