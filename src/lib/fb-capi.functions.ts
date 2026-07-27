import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { createHash } from "crypto";

const Schema = z.object({
  event: z.string().min(1).max(64),
  area: z.enum(["client", "investor"]),
  eventId: z.string().min(1).max(128),
  sourceUrl: z.string().url().max(2048).optional(),
  fbp: z.string().max(256).optional(),
  fbc: z.string().max(512).optional(),
  email: z.string().email().max(255).optional(),
  phone: z.string().max(32).optional(),
  firstName: z.string().max(64).optional(),
  lastName: z.string().max(64).optional(),
  value: z.number().optional(),
  currency: z.string().length(3).optional(),
  customData: z.record(z.string(), z.unknown()).optional(),
});

const sha = (v: string) => createHash("sha256").update(v.trim().toLowerCase()).digest("hex");
const normPhone = (v: string) => v.replace(/[^0-9]/g, "");

export const sendFbCapiEvent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ data }) => {
    const token = process.env.FB_PIXEL_ACCESS_TOKEN;
    if (!token) {
      console.warn("[fb-capi] FB_PIXEL_ACCESS_TOKEN is not set");
      return { ok: false, error: "missing_token" as const };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: settings } = await supabaseAdmin
      .from("tracking_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (!settings) return { ok: false, error: "no_settings" as const };

    const pixelId =
      data.area === "investor"
        ? (settings as { investor_pixel_id: string | null }).investor_pixel_id
        : (settings as { client_pixel_id: string | null }).client_pixel_id;
    if (!pixelId) return { ok: false, error: "no_pixel_id" as const };

    const ua = getRequestHeader("user-agent") ?? undefined;
    const ip =
      getRequestHeader("cf-connecting-ip") ??
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
      undefined;

    const user_data: Record<string, unknown> = {};
    if (ua) user_data.client_user_agent = ua;
    if (ip) user_data.client_ip_address = ip;
    if (data.fbp) user_data.fbp = data.fbp;
    if (data.fbc) user_data.fbc = data.fbc;
    if (data.email) user_data.em = [sha(data.email)];
    if (data.phone) user_data.ph = [sha(normPhone(data.phone))];
    if (data.firstName) user_data.fn = [sha(data.firstName)];
    if (data.lastName) user_data.ln = [sha(data.lastName)];

    const custom_data: Record<string, unknown> = { ...(data.customData ?? {}) };
    if (data.value !== undefined) custom_data.value = data.value;
    if (data.currency) custom_data.currency = data.currency;

    const payload = {
      data: [
        {
          event_name: data.event,
          event_time: Math.floor(Date.now() / 1000),
          event_id: data.eventId,
          action_source: "website",
          event_source_url: data.sourceUrl,
          user_data,
          custom_data,
        },
      ],
    };

    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[fb-capi] graph error", res.status, body);
        return { ok: false, error: "graph_error" as const, status: res.status, body };
      }
      return { ok: true as const, body };
    } catch (e) {
      console.error("[fb-capi] fetch failed", e);
      return { ok: false, error: "fetch_failed" as const };
    }
  });
