import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

type Args = { landingId: string; variantId: string | null; source: string };

/**
 * Tracks scroll depth (25/50/75/100), clicks with element selector + relative coords,
 * and total time on page. All recorded into ai_landing_events.
 */
export function useLandingEngagement({ landingId, variantId, source }: Args) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const startedAt = Date.now();
    const reached = new Set<number>();
    const thresholds = [25, 50, 75, 100];

    const record = (event_type: string, meta: Record<string, any> = {}) => {
      void supabase.from("ai_landing_events").insert({
        landing_id: landingId,
        variant_id: variantId,
        event_type,
        source,
        meta,
      });
    };

    const onScroll = () => {
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      const pct = Math.min(100, Math.round((scrollTop / max) * 100));
      for (const t of thresholds) {
        if (pct >= t && !reached.has(t)) {
          reached.add(t);
          record(`scroll_${t}`);
        }
      }
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName.toLowerCase();
      const id = target.id || null;
      const cls =
        target.className && typeof target.className === "string"
          ? target.className.slice(0, 100)
          : null;
      const text = (target.innerText || "").slice(0, 80);
      const role = target.getAttribute("role");
      const href = (target.closest("a") as HTMLAnchorElement | null)?.href ?? null;
      const rect = document.documentElement.getBoundingClientRect();
      const x = Math.round(e.clientX);
      const y = Math.round(e.clientY + window.scrollY);
      const xPct = Math.round((x / Math.max(1, document.documentElement.clientWidth)) * 100);
      const yPct = Math.round((y / Math.max(1, document.documentElement.scrollHeight)) * 100);
      record("click", {
        tag,
        id,
        cls,
        role,
        text,
        href,
        x,
        y,
        xPct,
        yPct,
        vw: window.innerWidth,
        vh: window.innerHeight,
      });
    };

    const flushTime = () => {
      const sec = Math.round((Date.now() - startedAt) / 1000);
      if (sec < 2) return;
      const data = JSON.stringify([
        {
          landing_id: landingId,
          variant_id: variantId,
          event_type: "time_on_page",
          source,
          meta: { seconds: sec, max_scroll: Math.max(0, ...Array.from(reached)) },
        },
      ]);
      try {
        // sendBeacon for reliability on unload
        const url = `${(import.meta as any).env.VITE_SUPABASE_URL}/rest/v1/ai_landing_events`;
        const blob = new Blob([data], { type: "application/json" });
        const ok = navigator.sendBeacon?.(
          `${url}?apikey=${(import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          blob,
        );
        if (!ok) record("time_on_page", { seconds: sec });
      } catch {
        record("time_on_page", { seconds: sec });
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("click", onClick, { passive: true });
    window.addEventListener("pagehide", flushTime);
    window.addEventListener("beforeunload", flushTime);

    // initial check (in case content is shorter than viewport)
    onScroll();

    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("click", onClick);
      window.removeEventListener("pagehide", flushTime);
      window.removeEventListener("beforeunload", flushTime);
    };
  }, [landingId, variantId, source]);
}
