import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
    __ga4Loaded?: Record<string, boolean>;
    __gtmLoaded?: Record<string, boolean>;
    __gAdsLoaded?: Record<string, boolean>;
    __gAdsConversionId?: string | null;
    __gAdsLabels?: {
      registration?: string | null;
      lead?: string | null;
      submit?: string | null;
      subscribe?: string | null;
    };
  }
}

type Settings = {
  ga4_measurement_id: string | null;
  gtm_container_id: string | null;
  google_ads_conversion_id: string | null;
  google_ads_label_registration: string | null;
  google_ads_label_lead: string | null;
  google_ads_label_submit: string | null;
  google_ads_label_subscribe: string | null;
};

async function loadGoogleSettings(): Promise<Settings | null> {
  const { data } = await supabase.rpc("get_public_tracking_settings");
  const row = Array.isArray(data) ? data[0] : data;
  return (row as Settings) ?? null;
}

function ensureGtag() {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag(...args: unknown[]) {
      (window.dataLayer as unknown[]).push(args);
    } as any;
    window.gtag!("js", new Date());
  }
}

function loadGa4(id: string) {
  if (typeof window === "undefined") return;
  window.__ga4Loaded = window.__ga4Loaded || {};
  if (window.__ga4Loaded[id]) return;
  ensureGtag();
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.appendChild(s);
  window.gtag!("config", id, { send_page_view: false });
  window.__ga4Loaded[id] = true;
}

function loadGtm(id: string) {
  if (typeof window === "undefined") return;
  window.__gtmLoaded = window.__gtmLoaded || {};
  if (window.__gtmLoaded[id]) return;
  window.dataLayer = window.dataLayer || [];
  (window.dataLayer as unknown[]).push({ "gtm.start": Date.now(), event: "gtm.js" });
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtm.js?id=${id}`;
  document.head.appendChild(s);
  window.__gtmLoaded[id] = true;
}

function loadGoogleAds(id: string) {
  if (typeof window === "undefined") return;
  window.__gAdsLoaded = window.__gAdsLoaded || {};
  if (window.__gAdsLoaded[id]) return;
  ensureGtag();
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.appendChild(s);
  window.gtag!("config", id);
  window.__gAdsLoaded[id] = true;
}

export function trackGoogleEvent(event: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", event, params || {});
}

export function GoogleAnalytics() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: settings } = useQuery({
    queryKey: ["google-tracking-settings"],
    queryFn: loadGoogleSettings,
    staleTime: 5 * 60 * 1000,
  });
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    if (settings.ga4_measurement_id) loadGa4(settings.ga4_measurement_id);
    if (settings.gtm_container_id) loadGtm(settings.gtm_container_id);
    if (settings.google_ads_conversion_id) loadGoogleAds(settings.google_ads_conversion_id);
    if (typeof window !== "undefined") {
      window.__gAdsConversionId = settings.google_ads_conversion_id;
      window.__gAdsLabels = {
        registration: settings.google_ads_label_registration,
        lead: settings.google_ads_label_lead,
        submit: settings.google_ads_label_submit,
        subscribe: settings.google_ads_label_subscribe,
      };
    }
  }, [settings]);

  useEffect(() => {
    if (!settings?.ga4_measurement_id || typeof window === "undefined" || !window.gtag) return;
    if (lastPath.current === path) return;
    lastPath.current = path;
    window.gtag("event", "page_view", {
      page_path: path,
      page_location: window.location.href,
      page_title: document.title,
      send_to: settings.ga4_measurement_id,
    });
  }, [path, settings]);

  return null;
}
