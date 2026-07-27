// Meta webhook: Messenger (page messages) + Instagram Direct.
// GET = handshake (hub.verify_token), POST = wiadomości + załączniki.
// Weryfikacja HMAC X-Hub-Signature-256 (META_APP_SECRET) — jeśli sekret jest
// skonfigurowany. Gdy nie jest, przetwarzamy mimo to (tak jak meta-leads-webhook),
// aby nie porzucać po cichu wszystkich wiadomości z powodu braku jednej zmiennej.
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { handleMetaMessagingBody } from "@/lib/meta-messaging.server";

function verifySig(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/meta-messenger-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        // Do handshake używamy wyłącznie dedykowanych tokenów weryfikacyjnych.
        // META_APP_SECRET to sekret do podpisu HMAC — nie może pełnić roli
        // tokenu echo-wanego w query stringu.
        const accepted = [
          process.env.META_WEBHOOK_VERIFY_TOKEN,
          process.env.META_IG_WEBHOOK_VERIFY_TOKEN,
        ].filter(Boolean);
        if (mode === "subscribe" && token && accepted.includes(token) && challenge) {
          return new Response(challenge, { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const raw = await request.text();
        const sig = request.headers.get("x-hub-signature-256");
        const secret = process.env.META_APP_SECRET;
        // Fail-closed: bez skonfigurowanego sekretu nie przetwarzamy
        // niepodpisanych wiadomości (mogłyby wywołać wysyłkę odpowiedzi).
        if (!secret) {
          console.error("[meta-messenger-webhook] META_APP_SECRET not set — rejecting");
          return new Response("Server misconfigured", { status: 500 });
        }
        if (!verifySig(raw, sig, secret)) {
          console.warn("[meta-messenger-webhook] invalid signature");
          return new Response("Forbidden", { status: 403 });
        }
        let body: any;
        try {
          body = JSON.parse(raw);
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        await handleMetaMessagingBody(body);
        return new Response("ok", { status: 200 });
      },
    },
  },
});
