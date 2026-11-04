import { createFileRoute } from "@tanstack/react-router";
import { runDailyBlogTick, type BlogTickKind } from "@/lib/blog-autopilot.server";

const KINDS: BlogTickKind[] = [
  "evergreen_guide",
  "legal_market_monitor",
  "investor_review",
  "investor_news",
  "borrower_news",
];

/** `?force=1` — poradnik od ręki; `?kind=<rodzaj>` — wybrany rodzaj (oba tylko z prywatnym sekretem). */
function manualOpts(request: Request) {
  if (!hasPrivateCronSecret(request)) return {};
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") as BlogTickKind | null;
  return {
    force: url.searchParams.get("force") === "1",
    kind: kind && KINDS.includes(kind) ? kind : undefined,
  };
}
import { requireCronSecret, hasPrivateCronSecret } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/daily-blog-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        try {
          const result = await runDailyBlogTick(manualOpts(request));
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
      GET: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        const url = new URL(request.url);
        if (url.searchParams.get("run") !== "1") {
          return new Response(JSON.stringify({ ok: true, hint: "POST or GET ?run=1 to trigger" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        const result = await runDailyBlogTick(manualOpts(request));
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
