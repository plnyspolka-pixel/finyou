import { createFileRoute } from "@tanstack/react-router";

// Webhook TubaPay (zmiany statusu umowy płatności podzielonej).
// Adres z podpisem (`?payment=<uuid>&sig=<hmac>`) przekazujemy TubaPay
// w callbackUrl każdej transakcji — patrz startTubapayPayment. Cała logika
// (weryfikacja podpisu, idempotencja, faktury, afiliacja, e-maile)
// w src/lib/access/webhook-core.server.ts → handleTubapayNotification.
export const Route = createFileRoute("/api/public/payments/tubapay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const url = new URL(request.url);
          let body: unknown = null;
          try {
            body = await request.json();
          } catch {
            return new Response("Invalid JSON payload", { status: 400 });
          }
          const { handleTubapayNotification } = await import("@/lib/access/webhook-core.server");
          const res = await handleTubapayNotification({
            paymentId: url.searchParams.get("payment"),
            signature: url.searchParams.get("sig"),
            body,
          });
          return new Response(res.body, { status: res.status });
        } catch (e) {
          console.error("[tubapay-webhook] error", e);
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
