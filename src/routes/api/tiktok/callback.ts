// Callback OAuth TikToka (GET /api/tiktok/callback) — ścieżka musi się zgadzać
// z TIKTOK_REDIRECT_URI zarejestrowanym w TikTok for Developers.
// Publiczny z konieczności (redirect z www.tiktok.com); chroniony jednorazowym
// stanem anty-CSRF zapisanym przy starcie połączenia w panelu.
import { createFileRoute } from "@tanstack/react-router";

const ADMIN_PANEL_PATH = "/admin/studio-publikacji";

function redirectToPanel(request: Request, params: Record<string, string>): Response {
  const url = new URL(request.url);
  const target = new URL(ADMIN_PANEL_PATH, url.origin);
  for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: target.toString() } });
}

export const Route = createFileRoute("/api/tiktok/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        // TikTok zwraca błąd jako `error` + `error_description`.
        const error = url.searchParams.get("error");
        if (error) {
          return redirectToPanel(request, {
            tt: "error",
            reason: (url.searchParams.get("error_description") || error).slice(0, 200),
          });
        }

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state) {
          return redirectToPanel(request, { tt: "error", reason: "missing_code_or_state" });
        }

        try {
          const { handleOauthCallback } = await import("@/lib/tiktok.server");
          await handleOauthCallback(code, state);
          return redirectToPanel(request, { tt: "connected" });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return redirectToPanel(request, { tt: "error", reason: msg.slice(0, 200) });
        }
      },
    },
  },
});
