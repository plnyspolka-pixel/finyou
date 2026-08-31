// Narzędzie dla agenta ElevenLabs: odczyt historii SMS dla danego numeru
// (agent głosowy/SMS-owy widzi ten sam wątek co karta leada w panelu).
// Autoryzacja nagłówkiem x-webhook-secret (ten sam sekret co przy wysyłce SMS).
// (Endpoint z sandboxa Lovable — „Dodano SMS w systemie"; ujednolicona
// normalizacja numeru przez normalizePolishPhone.)
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizePolishPhone } from "@/lib/phone";

const BodySchema = z.object({
  phone: z.string().min(6).max(20),
  limit: z.number().int().min(1).max(50).optional(),
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

export const Route = createFileRoute("/api/public/elevenlabs-read-sms")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, x-webhook-secret",
          },
        }),
      POST: async ({ request }) => {
        const expected =
          process.env.ELEVENLABS_WEBHOOK_SECRET || process.env.FINANCEYOU_WEBHOOK_SECRET;
        const provided = request.headers.get("x-webhook-secret");
        if (!expected) return json({ ok: false, error: "Webhook secret not configured" }, 500);
        if (!provided || provided !== expected)
          return json({ ok: false, error: "Unauthorized" }, 401);

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ ok: false, error: "Invalid JSON body" }, 400);
        }
        const parsed = BodySchema.safeParse(raw);
        if (!parsed.success) return json({ ok: false, error: "Invalid input" }, 400);

        const { normalized: phone } = normalizePolishPhone(parsed.data.phone);
        if (!phone) return json({ ok: false, error: "Invalid phone" }, 400);
        const limit = parsed.data.limit ?? 15;

        const { data, error } = await supabaseAdmin
          .from("lead_communications")
          .select("created_at, direction, status, content")
          .eq("channel", "sms")
          .eq("phone_normalized", phone)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (error) return json({ ok: false, error: error.message }, 500);

        const messages = (data ?? [])
          .slice()
          .reverse()
          .map((m) => ({
            at: m.created_at,
            direction: m.direction,
            status: m.status,
            text: m.content ?? "",
          }));

        return json({ ok: true, phone, count: messages.length, messages });
      },
    },
  },
});
