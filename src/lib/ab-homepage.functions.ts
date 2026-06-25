import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getHomepageABStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    const { data: events } = await supabase
      .from("homepage_ab_events")
      .select("variant, event_type, session_id, device, utm_source, created_at")
      .order("created_at", { ascending: false })
      .limit(50_000);

    const rows = (events ?? []) as Array<{
      variant: string;
      event_type: string;
      session_id: string;
      device: string | null;
      utm_source: string | null;
      created_at: string;
    }>;

    type VariantStats = {
      views: number;
      uniqueSessions: Set<string>;
      stepContact: number;
      stepPath: number;
      stepProperty: number;
      stepKw: number;
      stepPhotos: number;
      stepCalculator: number;
      submits: number;
      ctaClicks: number;
      devices: Record<string, number>;
      sources: Record<string, number>;
      hourly: Record<string, number>;
      daily: Record<string, number>;
    };

    const makeStats = (): VariantStats => ({
      views: 0,
      uniqueSessions: new Set(),
      stepContact: 0,
      stepPath: 0,
      stepProperty: 0,
      stepKw: 0,
      stepPhotos: 0,
      stepCalculator: 0,
      submits: 0,
      ctaClicks: 0,
      devices: {},
      sources: {},
      hourly: {},
      daily: {},
    });

    const byVariant: Record<string, VariantStats> = { A: makeStats(), B: makeStats() };

    for (const r of rows) {
      const v = byVariant[r.variant];
      if (!v) continue;

      v.uniqueSessions.add(r.session_id);

      const d = r.device ?? "unknown";
      v.devices[d] = (v.devices[d] ?? 0) + 1;

      const src = r.utm_source ?? "direct";
      v.sources[src] = (v.sources[src] ?? 0) + 1;

      const date = r.created_at.slice(0, 10);
      const hour = r.created_at.slice(0, 13);

      switch (r.event_type) {
        case "view":
          v.views++;
          v.hourly[hour] = (v.hourly[hour] ?? 0) + 1;
          v.daily[date] = (v.daily[date] ?? 0) + 1;
          break;
        case "step_contact": v.stepContact++; break;
        case "step_path": v.stepPath++; break;
        case "step_property": v.stepProperty++; break;
        case "step_kw": v.stepKw++; break;
        case "step_photos": v.stepPhotos++; break;
        case "step_calculator": v.stepCalculator++; break;
        case "submit": v.submits++; break;
        case "cta_click": v.ctaClicks++; break;
      }
    }

    const serialize = (s: VariantStats) => ({
      views: s.views,
      uniqueVisitors: s.uniqueSessions.size,
      funnel: {
        stepContact: s.stepContact,
        stepPath: s.stepPath,
        stepProperty: s.stepProperty,
        stepKw: s.stepKw,
        stepPhotos: s.stepPhotos,
        stepCalculator: s.stepCalculator,
        submits: s.submits,
      },
      ctaClicks: s.ctaClicks,
      cr: s.views > 0 ? (s.submits / s.views) * 100 : 0,
      devices: s.devices,
      sources: s.sources,
      hourly: s.hourly,
      daily: s.daily,
    });

    return {
      A: serialize(byVariant.A!),
      B: serialize(byVariant.B!),
      totalEvents: rows.length,
    };
  });
