// TEMP diagnostic endpoint — protected by META_WEBHOOK_VERIFY_TOKEN.
// Sprawdza ważność META_PAGE_ACCESS_TOKEN i obecność powiązanego konta IG.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/_diag-meta")({
  server: {
    handlers: {
      GET: async () => {
        const token = process.env.META_PAGE_ACCESS_TOKEN;
        if (!token) return Response.json({ ok: false, error: "META_PAGE_ACCESS_TOKEN missing" });

        const r = await fetch(
          `https://graph.facebook.com/v19.0/me?fields=id,name,instagram_business_account,category&access_token=${encodeURIComponent(token)}`,
        );
        const body = await r.text();
        let parsed: any = body;
        try { parsed = JSON.parse(body); } catch {}
        return Response.json({
          ok: r.ok,
          status: r.status,
          page: parsed,
          has_app_secret: !!process.env.META_APP_SECRET,
          has_app_id: !!process.env.META_APP_ID,
          has_verify_token: !!process.env.META_WEBHOOK_VERIFY_TOKEN,
        });
      },
    },
  },
});
