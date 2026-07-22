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
        const tries: Array<{ label: string; tok: string }> = [];
        if (userTok) tries.push({ label: "user", tok: userTok });
        if (pageTok) tries.push({ label: "page", tok: pageTok });
        if (igTok) tries.push({ label: "ig", tok: igTok });
        const attempts: unknown[] = [];
        let pages: Array<{ id: string; name: string; access_token?: string }> = [];
        for (const t of tries) {
          const acc = await j(`https://graph.facebook.com/${V}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(t.tok)}`);
          const accBody = acc.body as { data?: Array<{ id: string; name: string; access_token?: string }> };
          if (acc.status === 200 && Array.isArray(accBody.data) && accBody.data.length) {
            pages = accBody.data;
            attempts.push({ token: t.label, via: "me/accounts", count: pages.length });
            break;
          }
          const me = await j(`https://graph.facebook.com/${V}/me?fields=id,name&access_token=${encodeURIComponent(t.tok)}`);
          const meBody = me.body as { id?: string; name?: string };
          if (me.status === 200 && meBody.id) {
            pages = [{ id: meBody.id, name: meBody.name || "", access_token: t.tok }];
            attempts.push({ token: t.label, via: "me", id: meBody.id });
            break;
          }
          attempts.push({ token: t.label, accErr: acc.body, meErr: me.body });
        }
        out.attempts = attempts;
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
