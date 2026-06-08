import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { sendSmsInternal } from "@/lib/voicebot.functions";

const BodySchema = z.object({
  phone: z.string().min(6).max(20),
  message: z.string().min(1).max(500).optional(),
  application_url: z.string().url().max(500).optional(),
});

const DEFAULT_URL = "https://financeyou.pl/wniosek-warunki";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export const Route = createFileRoute("/api/public/elevenlabs-send-sms")({
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
          process.env.ELEVENLABS_WEBHOOK_SECRET ||
          process.env.FINANCEYOU_WEBHOOK_SECRET;
        const provided = request.headers.get("x-webhook-secret");

        console.log("[elevenlabs-send-sms] hit", {
          hasExpected: Boolean(expected),
          hasProvided: Boolean(provided),
          providedLen: provided?.length ?? 0,
        });

        if (!expected) {
          return json({ ok: false, error: "Webhook secret not configured on server" }, 500);
        }
        if (!provided || provided !== expected) {
          return json({ ok: false, error: "Unauthorized: invalid x-webhook-secret" }, 401);
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ ok: false, error: "Invalid JSON body" }, 400);
        }

        const parsed = BodySchema.safeParse(raw);
        if (!parsed.success) {
          return json(
            { ok: false, error: "Invalid input: " + JSON.stringify(parsed.error.flatten().fieldErrors) },
            400,
          );
        }

        const { phone, message, application_url } = parsed.data;
        const url = application_url || DEFAULT_URL;
        const body =
          message ||
          `FinanceYou: Aby kontynuować wniosek o kredyt hipoteczny, wypełnij formularz: ${url}`;

        const result = await sendSmsInternal({
          phone,
          body,
          source: "elevenlabs_agent",
        });

        console.log("[elevenlabs-send-sms] sms result", {
          ok: result.ok,
          sid: result.sid,
          error: result.error,
        });

        if (!result.ok) {
          return json({ ok: false, error: result.error ?? "SMS send failed" }, 502);
        }
        return json({ ok: true, sid: result.sid ?? null });
      },
    },
  },
});
