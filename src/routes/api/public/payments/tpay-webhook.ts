import { createFileRoute } from "@tanstack/react-router";

// Webhook Tpay (powiadomienia o statusie transakcji).
// Tpay wysyła powiadomienia jako application/x-www-form-urlencoded (format
// klasyczny) dla transakcji utworzonych przez Open API. Weryfikujemy przez
// ponowne pobranie transakcji z API Tpay (server-to-server) — nie ufamy
// danym z powiadomienia ani parametrom powrotu z przeglądarki.
// Cała logika (idempotencja, kwoty, faktury, afiliacja, e-maile) w
// src/lib/access/webhook-core.server.ts.
export const Route = createFileRoute("/api/public/payments/tpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const ct = request.headers.get("content-type") ?? "";
          let body: Record<string, string> = {};
          if (ct.includes("application/json")) {
            body = (await request.json()) as Record<string, string>;
          } else {
            const text = await request.text();
            const params = new URLSearchParams(text);
            params.forEach((v, k) => {
              body[k] = v;
            });
          }

          const { handleTpayNotification } = await import("@/lib/access/webhook-core.server");
          const response = await handleTpayNotification(body);
          return new Response(response, { status: 200 });
        } catch (e) {
          console.error("[tpay-webhook] error", e);
          return new Response("FALSE", { status: 500 });
        }
      },
    },
  },
});
