// Temporary diagnostic; delete after use.
Deno.serve(async () => {
  const token = Deno.env.get("META_ACCESS_TOKEN") || Deno.env.get("META_PAGE_ACCESS_TOKEN") || "";
  const appId = Deno.env.get("META_APP_ID") || "";
  const pageTok = Deno.env.get("META_PAGE_ACCESS_TOKEN") || "";
  const V = "v21.0";
  const out: any = { appId, pages: [] };
  if (!token) return new Response(JSON.stringify({ error: "no token" }), { status: 500 });

  async function j(url: string) {
    const r = await fetch(url);
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }

  let pages: Array<{ id: string; name: string; access_token?: string }> = [];
  const acc = await j(`https://graph.facebook.com/${V}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(token)}`);
  if (acc.status === 200 && Array.isArray(acc.body?.data) && acc.body.data.length) {
    pages = acc.body.data;
  } else {
    const me = await j(`https://graph.facebook.com/${V}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
    if (me.status === 200 && me.body?.id) pages = [{ id: me.body.id, name: me.body.name, access_token: pageTok || token }];
    else out.meError = me.body;
  }

  for (const p of pages) {
    const pt = p.access_token || pageTok || token;
    const sub = await j(`https://graph.facebook.com/${V}/${p.id}/subscribed_apps?access_token=${encodeURIComponent(pt)}`);
    out.pages.push({ id: p.id, name: p.name, subscribed_apps: sub.body });
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { "content-type": "application/json" } });
});
