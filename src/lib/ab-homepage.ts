import { supabase } from "@/integrations/supabase/client";

export type ABVariant = "A" | "B";

export type ABEventType =
  | "view"
  | "step_contact"
  | "step_path"
  | "step_property"
  | "step_kw"
  | "step_photos"
  | "step_calculator"
  | "submit"
  | "cta_click";

const STORAGE_KEY = "fy_ab_variant";
const SESSION_KEY = "fy_ab_session";

function generateSessionId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("");
}

function detectDevice(): "mobile" | "tablet" | "desktop" {
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth;
  if (w < 768) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

function getUtmParams(): { utm_source?: string; utm_medium?: string; utm_campaign?: string } {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  return {
    utm_source: p.get("utm_source") || undefined,
    utm_medium: p.get("utm_medium") || undefined,
    utm_campaign: p.get("utm_campaign") || undefined,
  };
}

export function getOrAssignVariant(): ABVariant {
  if (typeof window === "undefined") return "A";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "A" || stored === "B") return stored;

  const variant: ABVariant = Math.random() < 0.5 ? "A" : "B";
  localStorage.setItem(STORAGE_KEY, variant);
  return variant;
}

export function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  let sid = sessionStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = generateSessionId();
    sessionStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

export function getCurrentVariant(): ABVariant | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "A" || v === "B" ? v : null;
}

const firedEvents = new Set<string>();

export function trackABEvent(
  variant: ABVariant,
  eventType: ABEventType,
  meta?: Record<string, unknown>,
) {
  const dedup = `${variant}:${eventType}`;
  if (eventType !== "cta_click" && firedEvents.has(dedup)) return;
  firedEvents.add(dedup);

  const sessionId = getSessionId();
  const device = detectDevice();
  const utmParams = getUtmParams();

  void supabase.from("homepage_ab_events").insert({
    variant,
    event_type: eventType,
    session_id: sessionId,
    device,
    referrer: typeof document !== "undefined" ? document.referrer || null : null,
    ...utmParams,
    meta: meta ?? {},
  } as any);
}
