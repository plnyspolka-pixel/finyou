import { createFileRoute } from "@tanstack/react-router";
import { runDailyBlogTick } from "@/lib/blog-autopilot.server";
import { requireCronSecret, hasPrivateCronSecret } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/daily-blog-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        try {
          const url = new URL(request.url);
          const force = url.searchParams.get("force") === "1" && hasPrivateCronSecret(request);
          const result = await runDailyBlogTick({ force });
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
        const force = url.searchParams.get("force") === "1" && hasPrivateCronSecret(request);
        const result = await runDailyBlogTick({ force });
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
