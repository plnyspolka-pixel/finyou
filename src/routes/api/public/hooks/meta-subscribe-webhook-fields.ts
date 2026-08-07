// Jednorazowy setup: subskrypcja pól webhooka strony (messages,
// messaging_postbacks, messaging_referrals) tokenem strony z env —
// bez Graph API Explorera. Idempotentny: dokłada pola do już istniejących
// (POST /subscribed_apps NADPISUJE zestaw, więc najpierw czytamy obecny).
// Ochrona: CRON_SECRET / apikey, jak pozostałe hooki.
//
// Wywołanie (raz, z przeglądarki lub curl):
//   GET /api/public/hooks/meta-subscribe-webhook-fields          → Messenger
//   GET /api/public/hooks/meta-subscribe-webhook-fields?platform=instagram → IG
import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth.server";

const GRAPH = "https://graph.facebook.com/v21.0";
const REQUIRED_FIELDS = ["messages", "messaging_postbacks", "messaging_referrals"];

async function run(platform: "messenger" | "instagram") {
  const token =
    (platform === "instagram" ? process.env.META_IG_PAGE_ACCESS_TOKEN : undefined) ??
    process.env.META_PAGE_ACCESS_TOKEN ??
    process.env.META_ACCESS_TOKEN;
  if (!token) return { error: "META_PAGE_ACCESS_TOKEN / META_ACCESS_TOKEN missing" };

  const out: any = { platform };

  // 0) Kim jest token — musi być STRONĄ (nie userem), inaczej #100 nonexisting field.
  const meRes = await fetch(`${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
  const me: any = await meRes.json().catch(() => ({}));
  if (!meRes.ok || me.error)
    return { error: `me: ${JSON.stringify(me.error ?? me).slice(0, 300)}` };
  out.page = { id: me.id, name: me.name };

  // 1) Obecne subskrypcje (per aplikacja)
  const curRes = await fetch(
    `${GRAPH}/me/subscribed_apps?fields=subscribed_fields&access_token=${encodeURIComponent(token)}`,
  );
  const cur: any = await curRes.json().catch(() => ({}));
  if (!curRes.ok || cur.error) {
    return {
      ...out,
      error: `subscribed_apps GET: ${JSON.stringify(cur.error ?? cur).slice(0, 300)}`,
      hint: "Jeśli #100 nonexisting field — token jest userowy, nie strony.",
    };
  }
  const apps: any[] = cur.data ?? [];
  out.before = apps.map((a) => ({ app_id: a.id, subscribed_fields: a.subscribed_fields }));

  // 2) Suma: istniejące pola (ze wszystkich aplikacji tej strony) + wymagane
  const existing = new Set<string>(
    apps.flatMap((a) => (Array.isArray(a.subscribed_fields) ? a.subscribed_fields : [])),
  );
  for (const f of REQUIRED_FIELDS) existing.add(f);
  const fieldsCsv = [...existing].sort().join(",");

  // 3) POST — subskrybuje APLIKACJĘ, do której należy ten token, z pełnym zestawem pól
  const postRes = await fetch(`${GRAPH}/me/subscribed_apps`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ access_token: token, subscribed_fields: fieldsCsv }).toString(),
  });
  const post: any = await postRes.json().catch(() => ({}));
  if (!postRes.ok || post.error) {
    return {
      ...out,
      error: `subscribed_apps POST: ${JSON.stringify(post.error ?? post).slice(0, 300)}`,
      attempted_fields: fieldsCsv,
    };
  }
  out.post = post; // {"success": true}

  // 4) Weryfikacja
  const verRes = await fetch(
    `${GRAPH}/me/subscribed_apps?fields=subscribed_fields&access_token=${encodeURIComponent(token)}`,
  );
  const ver: any = await verRes.json().catch(() => ({}));
  out.after = (ver.data ?? []).map((a: any) => ({
    app_id: a.id,
    subscribed_fields: a.subscribed_fields,
  }));
  out.ok_referrals = (ver.data ?? []).some(
    (a: any) =>
      Array.isArray(a.subscribed_fields) && a.subscribed_fields.includes("messaging_referrals"),
  );
  return out;
}

export const Route = createFileRoute("/api/public/hooks/meta-subscribe-webhook-fields")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const unauth = requireCronSecret(request);
        if (unauth) return unauth;
        const url = new URL(request.url);
        const platform =
          url.searchParams.get("platform") === "instagram" ? "instagram" : "messenger";
        const out = await run(platform);
        return new Response(JSON.stringify({ ok: !out.error, ...out }, null, 2), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
