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
        let pages: Array<{ id: string; name: string; access_token?: string }> = [];
        const acc = await j(`https://graph.facebook.com/${V}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(token)}`);
        const accBody = acc.body as { data?: Array<{ id: string; name: string; access_token?: string }> };
        if (acc.status === 200 && Array.isArray(accBody.data) && accBody.data.length) {
          pages = accBody.data;
        } else {
          const me = await j(`https://graph.facebook.com/${V}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
          const meBody = me.body as { id?: string; name?: string };
          if (me.status === 200 && meBody.id) pages = [{ id: meBody.id, name: meBody.name || "", access_token: pageTok || token }];
          else (out as Record<string, unknown>).meError = me.body;
        }
        const pagesOut: unknown[] = [];
        for (const p of pages) {
          const pt = p.access_token || pageTok || token;
          const sub = await j(`https://graph.facebook.com/${V}/${p.id}/subscribed_apps?access_token=${encodeURIComponent(pt)}`);
          pagesOut.push({ id: p.id, name: p.name, subscribed_apps: sub.body });
        }
        out.pages = pagesOut;
        return new Response(JSON.stringify(out, null, 2), { headers: { "content-type": "application/json" } });
      },
    },
  },
});
