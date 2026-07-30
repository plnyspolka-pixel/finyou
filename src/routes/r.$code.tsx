import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/r/$code")({
  ssr: false,
  beforeLoad: async ({ params }) => {
    const { data: c } = await supabase
      .from("marketing_campaigns")
      .select("id, target_url, utm_source, utm_medium, utm_campaign, utm_term, utm_content")
      .eq("short_code", params.code)
      .eq("is_active", true)
      .maybeSingle();
    if (!c) throw redirect({ to: "/" });

    // Fire-and-forget click log (no await on next)
    try {
      const ua = typeof navigator !== "undefined" ? navigator.userAgent : null;
      const ref = typeof document !== "undefined" ? document.referrer : null;
      await supabase.from("campaign_clicks").insert({
        campaign_id: c.id,
        user_agent: ua,
        referrer: ref,
        device: /Mobi|Android/i.test(ua ?? "") ? "mobile" : "desktop",
      });
    } catch {
      /* ignore */
    }

    const url = new URL(c.target_url);
    if (c.utm_source) url.searchParams.set("utm_source", c.utm_source);
    if (c.utm_medium) url.searchParams.set("utm_medium", c.utm_medium);
    if (c.utm_campaign) url.searchParams.set("utm_campaign", c.utm_campaign);
    if (c.utm_term) url.searchParams.set("utm_term", c.utm_term);
    if (c.utm_content) url.searchParams.set("utm_content", c.utm_content);

    if (typeof window !== "undefined") {
      window.location.replace(url.toString());
    }
    throw redirect({ to: "/" });
  },
  component: () => (
    <div className="grid min-h-screen place-items-center text-muted-foreground">Przekierowuję…</div>
  ),
});
