/**
 * Rejestr zgód na cookies (cookie_consent_log). Publiczne — baner widzą też
 * niezalogowani; jeśli żądanie niesie token sesji, dopisujemy user_id.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { truncateIp } from "./ip-truncate";

const loose = (c: unknown) => c as any;

const LogSchema = z.object({
  consentId: z.string().uuid(),
  version: z.number().int().min(1).max(1000),
  analytics: z.boolean(),
  marketing: z.boolean(),
  source: z.enum(["banner_accept_all", "banner_reject", "settings"]),
  pagePath: z.string().max(300).optional(),
});

export const logCookieConsent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => LogSchema.parse(d))
  .handler(async ({ data }) => {
    const request = getRequest();
    const ip =
      request?.headers.get("cf-connecting-ip") ||
      request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;
    const userAgent = request?.headers.get("user-agent")?.slice(0, 500) ?? null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let userId: string | null = null;
    const auth = request?.headers.get("authorization");
    if (auth?.startsWith("Bearer ")) {
      const { data: u } = await supabaseAdmin.auth.getUser(auth.slice(7));
      userId = u?.user?.id ?? null;
    }

    const { error } = await loose(supabaseAdmin)
      .from("cookie_consent_log")
      .insert({
        consent_id: data.consentId,
        user_id: userId,
        consent_version: data.version,
        analytics: data.analytics,
        marketing: data.marketing,
        source: data.source,
        page_path: data.pagePath ?? null,
        ip_truncated: truncateIp(ip),
        user_agent: userAgent,
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
