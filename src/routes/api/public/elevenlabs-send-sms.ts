import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { sendSmsInternal } from "@/lib/voicebot.functions";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BodySchema = z.object({
  phone: z.string().min(6).max(20),
  message: z.string().min(1).max(500).optional(),
  application_url: z.string().url().max(500).optional(),
  // Opcjonalne — gdy podane, wygenerujemy magic link i wyślemy go SMS-em.
  email: z.string().email().max(200).optional(),
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  amount: z.number().positive().max(100_000_000).optional(),
  months: z.number().int().positive().max(600).optional(),
  sec_type: z.string().max(40).optional(),
  next: z.string().max(200).optional(),
});

const DEFAULT_URL = "https://financeyou.pl/klient";
const SITE_URL = "https://financeyou.pl";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function normalizePhone(p: string): string {
  return p.replace(/[^\d+]/g, "");
}

async function lookupProfileByPhone(
  phone: string,
): Promise<{ email: string; first_name?: string; last_name?: string } | null> {
  const norm = normalizePhone(phone);
  const variants = Array.from(
    new Set([phone, norm, norm.replace(/^\+/, ""), "+" + norm.replace(/^\+/, "")]),
  );
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("email, first_name, last_name, phone")
    .in("phone", variants)
    .limit(1);
  const row = data?.[0];
  if (!row?.email) return null;
  return {
    email: row.email,
    first_name: row.first_name ?? undefined,
    last_name: row.last_name ?? undefined,
  };
}

async function generateAutoLoginLink(input: {
  email: string;
  first_name?: string;
  last_name?: string;
  phone: string;
  amount?: number;
  months?: number;
  sec_type?: string;
  next?: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const emailNorm = input.email.toLowerCase().trim();

  // Znajdź lub utwórz użytkownika
  let userId: string | null = null;
  const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = list?.users?.find((u) => (u.email ?? "").toLowerCase() === emailNorm);
  if (existing) {
    userId = existing.id;
  } else {
    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email: emailNorm,
      email_confirm: true,
      user_metadata: {
        first_name: input.first_name,
        last_name: input.last_name,
        phone: input.phone,
      },
    });
    if (cErr || !created.user) {
      return { ok: false, error: "Nie udało się utworzyć użytkownika: " + (cErr?.message ?? "") };
    }
    userId = created.user.id;
  }

  // Wypełnij profil
  await supabaseAdmin.from("profiles").upsert(
    {
      user_id: userId,
      email: emailNorm,
      first_name: input.first_name ?? null,
      last_name: input.last_name ?? null,
      phone: input.phone,
    },
    { onConflict: "user_id" },
  );

  // Zbuduj URL docelowy
  const nextPath = input.next && /^\/[a-z0-9/_-]+$/i.test(input.next) ? input.next : "/klient";
  const ret = new URL(nextPath, SITE_URL);
  if (input.amount) ret.searchParams.set("amount", String(input.amount));
  if (input.months) ret.searchParams.set("months", String(input.months));
  if (input.sec_type) ret.searchParams.set("secType", input.sec_type);
  ret.searchParams.set("source", "ania_voicebot");

  // Wygeneruj magic link
  const { data: link, error: lErr } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: emailNorm,
    options: { redirectTo: ret.toString() },
  });
  if (lErr || !link?.properties?.action_link) {
    return { ok: false, error: "Nie udało się wygenerować linku: " + (lErr?.message ?? "") };
  }
  return { ok: true, url: link.properties.action_link };
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
          process.env.ELEVENLABS_WEBHOOK_SECRET || process.env.FINANCEYOU_WEBHOOK_SECRET;
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
            {
              ok: false,
              error: "Invalid input: " + JSON.stringify(parsed.error.flatten().fieldErrors),
            },
            400,
          );
        }

        const { phone, message } = parsed.data;
        let { email, first_name, last_name } = parsed.data;
        void email;
        void last_name;

        // Jeśli brak emaila — spróbuj znaleźć po numerze telefonu
        if (!email) {
          const found = await lookupProfileByPhone(phone);
          if (found) {
            email = found.email;
            first_name = first_name ?? found.first_name;
            last_name = last_name ?? found.last_name;
          }
        }

        // SMS od Ani prowadzi po prostu na stronę główną financeyou.pl
        const url = "https://financeyou.pl";

        const name = first_name ? ` ${first_name}` : "";
        const body =
          message || `Finance You: Cześć${name}! Tu Ania. Wejdź na ${url} i dokończ wniosek.`;

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
        return json({ ok: true, sid: result.sid ?? null, magic_link: false });
      },
    },
  },
});
