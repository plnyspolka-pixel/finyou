import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendSmsInternal } from "@/lib/voicebot.functions";

const BodySchema = z.object({
  phone: z.string().min(6).max(20),
  email: z.string().email().max(200),
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  amount: z.number().positive().max(100_000_000).optional(),
  months: z.number().int().positive().max(600).optional(),
  sec_type: z.string().max(40).optional(),
  next: z.string().max(200).optional(),
  send_sms: z.boolean().optional(),
});

const SITE_URL = "https://financeyou.pl";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

export const Route = createFileRoute("/api/public/elevenlabs-magic-link")({
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
        if (!expected) return json({ ok: false, error: "Webhook secret not configured" }, 500);
        if (!provided || provided !== expected) return json({ ok: false, error: "Unauthorized" }, 401);

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

        const { phone, email, first_name, last_name, amount, months, sec_type, next, send_sms } = parsed.data;
        const emailNorm = email.toLowerCase().trim();

        // 1. Find or create user
        let userId: string | null = null;
        const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
        const existing = list?.users?.find((u) => (u.email ?? "").toLowerCase() === emailNorm);
        if (existing) {
          userId = existing.id;
        } else {
          const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
            email: emailNorm,
            email_confirm: true,
            user_metadata: { first_name, last_name, phone },
          });
          if (cErr || !created.user) {
            return json({ ok: false, error: "Nie udało się utworzyć użytkownika: " + (cErr?.message ?? "") }, 500);
          }
          userId = created.user.id;
        }

        // 2. Prefill profile
        await supabaseAdmin
          .from("profiles")
          .upsert(
            {
              user_id: userId,
              email: emailNorm,
              first_name: first_name ?? null,
              last_name: last_name ?? null,
              phone,
            },
            { onConflict: "user_id" },
          );

        // 3. Build redirect URL with calc params
        const nextPath = next && /^\/[a-z0-9/_-]+$/i.test(next) ? next : "/wniosek-start";
        const ret = new URL(nextPath, SITE_URL);
        if (amount) ret.searchParams.set("amount", String(amount));
        if (months) ret.searchParams.set("months", String(months));
        if (sec_type) ret.searchParams.set("secType", sec_type);
        ret.searchParams.set("source", "ania_voicebot");

        // 4. Generate magic link
        const { data: link, error: lErr } = await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email: emailNorm,
          options: { redirectTo: ret.toString() },
        });
        if (lErr || !link?.properties?.action_link) {
          return json({ ok: false, error: "Nie udało się wygenerować linku: " + (lErr?.message ?? "") }, 500);
        }
        const actionLink = link.properties.action_link;

        // 5. Optional SMS
        let smsResult: { ok: boolean; sid?: string; error?: string } | null = null;
        if (send_sms !== false) {
          const name = first_name ? ` ${first_name}` : "";
          const body = `Finance You: Cześć${name}! Tu Ania. Kliknij, aby kontynuować wniosek (zalogujemy Cię automatycznie): ${actionLink}`;
          smsResult = await sendSmsInternal({ phone, body, source: "ania_magic_link" });
        }

        return json({
          ok: true,
          user_id: userId,
          magic_link: actionLink,
          sms: smsResult,
        });
      },
    },
  },
});
