import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/diag-meta-subs")({
  server: {
    handlers: {
      GET: async () => {
        const userTok = process.env.META_ACCESS_TOKEN || "";
        const pageTok = process.env.META_PAGE_ACCESS_TOKEN || "";
        const igTok = process.env.META_IG_PAGE_ACCESS_TOKEN || "";
        const token = userTok || pageTok;
        const appId = process.env.META_APP_ID || "";
        const V = "v21.0";
        const out: Record<string, unknown> = { appId, pages: [] as unknown[] };
        if (!token) return new Response(JSON.stringify({ error: "no token" }), { status: 500 });
        const j = async (url: string) => {
          const r = await fetch(url);
          return { status: r.status, body: await r.json().catch(() => ({})) };
        };
        const KNOWN_PAGE_ID = "661893307005604";
        const tokens: Array<{ label: string; tok: string }> = [];
        if (pageTok) tokens.push({ label: "page", tok: pageTok });
        if (userTok) tokens.push({ label: "user", tok: userTok });
        if (igTok) tokens.push({ label: "ig", tok: igTok });
        const results: unknown[] = [];
        for (const t of tokens) {
          const sub = await j(`https://graph.facebook.com/${V}/${KNOWN_PAGE_ID}/subscribed_apps?access_token=${encodeURIComponent(t.tok)}`);
          results.push({ token: t.label, status: sub.status, body: sub.body });
        }
        out.pageId = KNOWN_PAGE_ID;
        out.subscribed_apps_attempts = results;
        return new Response(JSON.stringify(out, null, 2), { headers: { "content-type": "application/json" } });
      },
    },
  },
});
