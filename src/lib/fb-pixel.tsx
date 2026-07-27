import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
    __fbPixelLoaded?: Record<string, boolean>;
    __fbPixelActive?: string | null;
  }
}

type Settings = {
  client_pixel_id: string | null;
  investor_pixel_id: string | null;
  track_lead: boolean;
  track_registration: boolean;
  track_subscribe: boolean;
  track_contact: boolean;
};

let cached: Settings | null = null;

export async function loadTrackingSettings(): Promise<Settings | null> {
  if (cached) return cached;
  const { data } = await supabase.rpc("get_public_tracking_settings");
  const row = Array.isArray(data) ? data[0] : data;
  if (row) cached = row as Settings;
  return cached;
}

function injectPixelScript() {
  if (typeof window === "undefined" || window.fbq) return;
  /* eslint-disable */
  // @ts-ignore
  (function (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
    if (f.fbq) return;
    n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!f._fbq) f._fbq = n;
    n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
    t = b.createElement(e); t.async = true; t.src = v;
    s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  /* eslint-enable */
}

function initPixel(id: string) {
  if (typeof window === "undefined" || !window.fbq) return;
  window.__fbPixelLoaded = window.__fbPixelLoaded || {};
  if (!window.__fbPixelLoaded[id]) {
    window.fbq("init", id);
    window.__fbPixelLoaded[id] = true;
  }
  window.__fbPixelActive = id;
}

export function trackFbEvent(event: string, params?: Record<string, unknown>, eventId?: string) {
  if (typeof window === "undefined" || !window.fbq || !window.__fbPixelActive) return;
  if (eventId) {
    window.fbq("track", event, params || {}, { eventID: eventId });
  } else {
    window.fbq("track", event, params || {});
  }
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return;
  const esc = name.replace(/[.$?*|{}()[\]\\/+^]/g, "\\$&");
  const m = document.cookie.match(new RegExp("(?:^|; )" + esc + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : undefined;
}

export async function trackEvent(
  event: string,
  params?: Record<string, unknown>,
  user?: { email?: string; phone?: string; firstName?: string; lastName?: string },
) {
  if (typeof window === "undefined") return;
  const eventId =
    (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)) +
    "-" +
    Date.now().toString(36);
  trackFbEvent(event, params, eventId);
  // Mirror to Google Analytics 4 (gtag) with mapped event name
  try {
    const gaMap: Record<string, string> = {
      Lead: "generate_lead",
      CompleteRegistration: "sign_up",
      StartApplication: "sign_up",
      SubmitApplication: "submit_application",
      Subscribe: "purchase",
      Contact: "contact",
      Purchase: "purchase",
    };
    const gaEvent = gaMap[event] ?? event;
    (window as any).gtag?.("event", gaEvent, { ...(params || {}), event_id: eventId });
  } catch {
    /* ignore */
  }
  // Mirror to Google Ads conversion (if AW id + label configured for this event)
  try {
    const w = window as any;
    const adsId: string | null | undefined = w.__gAdsConversionId;
    const labels = w.__gAdsLabels || {};
    const adsMap: Record<string, string | undefined> = {
      CompleteRegistration: labels.registration,
      StartApplication: labels.registration,
      Lead: labels.lead,
      SubmitApplication: labels.submit,
      Subscribe: labels.subscribe,
      Purchase: labels.subscribe,
    };
    const label = adsMap[event];
    if (adsId && label && w.gtag) {
      const payload: Record<string, unknown> = {
        send_to: `${adsId}/${label}`,
        transaction_id: eventId,
      };
      if (typeof params?.value === "number") payload.value = params.value;
      if (typeof params?.currency === "string") payload.currency = params.currency;
      w.gtag("event", "conversion", payload);
    }
  } catch {
    /* ignore */
  }

  try {
    const area: "client" | "investor" = window.location.pathname.startsWith("/inwestor")
      ? "investor"
      : "client";
    const { sendFbCapiEvent } = await import("./fb-capi.functions");
    const value = typeof params?.value === "number" ? (params.value as number) : undefined;
    const currency = typeof params?.currency === "string" ? (params.currency as string) : undefined;
    await sendFbCapiEvent({
      data: {
        event,
        area,
        eventId,
        sourceUrl: window.location.href,
        fbp: readCookie("_fbp"),
        fbc: readCookie("_fbc"),
        email: user?.email,
        phone: user?.phone,
        firstName: user?.firstName,
        lastName: user?.lastName,
        value,
        currency,
        customData: params,
      },
    });
  } catch (e) {
    console.warn("[fb-capi]", e);
  }
}

function pixelForPath(path: string, s: Settings): string | null {
  if (path.startsWith("/inwestor")) return s.investor_pixel_id;
  return s.client_pixel_id;
}

export function FacebookPixel() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: settings } = useQuery({
    queryKey: ["tracking-settings"],
    queryFn: loadTrackingSettings,
    staleTime: 5 * 60 * 1000,
  });
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    const id = pixelForPath(path, settings);
    if (!id) return;
    injectPixelScript();
    initPixel(id);
    if (lastPath.current !== path) {
      lastPath.current = path;
      window.fbq?.("track", "PageView");
    }
  }, [path, settings]);

  return null;
}

export function useTrackingFlags() {
  const { data } = useQuery({
    queryKey: ["tracking-settings"],
    queryFn: loadTrackingSettings,
    staleTime: 5 * 60 * 1000,
  });
  return data;
}
