// Resend webhook — odbiera zdarzenia delivered/opened/clicked/bounced/complained.
// Wymagana weryfikacja Svix (RESEND_WEBHOOK_SECRET, format whsec_...).
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

function verifySvix(req: Request, body: string): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return false;
  const id = req.headers.get("svix-id") ?? req.headers.get("webhook-id");
  const ts = req.headers.get("svix-timestamp") ?? req.headers.get("webhook-timestamp");
  const sigHeader = req.headers.get("svix-signature") ?? req.headers.get("webhook-signature");
  if (!id || !ts || !sigHeader) return false;
  const keyB64 = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBuf: Buffer;
  try {
    keyBuf = Buffer.from(keyB64, "base64");
  } catch {
    return false;
  }
  const signed = `${id}.${ts}.${body}`;
  const expected = createHmac("sha256", keyBuf).update(signed).digest("base64");
  for (const part of sigHeader.split(" ")) {
    const [, sig] = part.split(",");
    if (!sig) continue;
    try {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      /* noop */
    }
  }
  return false;
}

export const Route = createFileRoute("/api/public/resend-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const raw = await request.text();
        if (!process.env.RESEND_WEBHOOK_SECRET) {
          return new Response("Server misconfigured", { status: 500 });
        }
        if (!verifySvix(request, raw)) {
          return new Response("Forbidden", { status: 403 });
        }
        let payload: any;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        const type: string = payload?.type ?? "";
        const data = payload?.data ?? {};
        const resendId: string | undefined = data.email_id ?? data.id;
        if (!resendId) return new Response("ok", { status: 200 });

        const now = new Date().toISOString();
        const patch: Record<string, unknown> = {};
        switch (type) {
          case "email.delivered":
            patch.delivered_at = now;
            patch.status = "dostarczone";
            break;
          case "email.opened":
            patch.opened_at = now;
            break;
          case "email.clicked":
            patch.clicked_at = now;
            break;
          case "email.bounced":
            patch.bounced_at = now;
            patch.status = "odbity";
            break;
          case "email.complained":
            patch.complained_at = now;
            break;
          default:
            return new Response("ignored", { status: 200 });
        }

        // Zaktualizuj odbiorcę
        const { data: rec } = await supabaseAdmin
          .from("email_campaign_recipients")
          .update(patch as never)
          .eq("resend_id", resendId)
          .select("campaign_id, recipient_email")
          .maybeSingle();

        // Zaktualizuj liczniki kampanii
        if (rec?.campaign_id) {
          const counterField =
            type === "email.delivered"
              ? "delivered_count"
              : type === "email.opened"
                ? "opened_count"
                : type === "email.clicked"
                  ? "clicked_count"
                  : type === "email.bounced"
                    ? "bounced_count"
                    : type === "email.complained"
                      ? "complained_count"
                      : null;
          if (counterField) {
            const { data: camp } = await supabaseAdmin
              .from("email_campaigns")
              .select(counterField)
              .eq("id", rec.campaign_id)
              .single();
            const current = ((camp as any)?.[counterField] as number) ?? 0;
            await supabaseAdmin
              .from("email_campaigns")
              .update({ [counterField]: current + 1 } as never)
              .eq("id", rec.campaign_id);
          }
        }

        // Bounce/complaint → oznacz subskrybenta
        if (rec?.recipient_email && (type === "email.bounced" || type === "email.complained")) {
          await supabaseAdmin
            .from("email_subscribers")
            .update({
              status: type === "email.bounced" ? "bounced" : "unsubscribed",
              bounced_at: type === "email.bounced" ? now : null,
            })
            .eq("email", rec.recipient_email);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
