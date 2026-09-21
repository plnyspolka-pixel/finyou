// One-click unsubscribe (RFC 8058). Adres tego endpointu jest w nagłówku
// `List-Unsubscribe` każdego maila — Gmail/Outlook pokazują wtedy własny
// przycisk „Wypisz się" i wysyłają tu POST bez udziału klienta.
//
// GET obsługujemy tak samo (niektóre klienty pocztowe i skanery linków robią
// GET) i przekierowujemy na stronę z potwierdzeniem.
import { createFileRoute } from "@tanstack/react-router";
import { applyOptOutByToken, baseUrl } from "@/lib/email-unsubscribe.server";

async function unsubscribe(request: Request, source: string) {
  const url = new URL(request.url);
  let token = url.searchParams.get("t") ?? "";
  if (!token && request.method === "POST") {
    // Część klientów wysyła parametry w ciele (List-Unsubscribe=One-Click).
    try {
      const body = await request.text();
      token = new URLSearchParams(body).get("t") ?? "";
    } catch {
      /* brak ciała — zostaje token z query */
    }
  }
  if (!token) return { ok: false };
  try {
    const res = await applyOptOutByToken(token, source);
    return { ok: !!res?.ok };
  } catch (e) {
    console.error("[email-unsubscribe] one-click failed", e);
    return { ok: false };
  }
}

export const Route = createFileRoute("/api/public/email/unsubscribe")({
  server: {
    handlers: {
      // One-click z klienta pocztowego — odpowiedź musi być krótka i zawsze 200.
      POST: async ({ request }) => {
        await unsubscribe(request, "one_click");
        return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
      },
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("t") ?? "";
        await unsubscribe(request, "one_click_get");
        return new Response(null, {
          status: 302,
          headers: {
            location: `${baseUrl()}/email/unsubscribe?t=${encodeURIComponent(token)}`,
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
