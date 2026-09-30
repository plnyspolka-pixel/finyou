/**
 * Zgody na pliki cookies (art. 399 Prawa komunikacji elektronicznej + RODO).
 *
 * Kategorie:
 * - `necessary`  — zawsze aktywne (sesja, bezpieczeństwo, zapamiętanie zgód),
 * - `analytics`  — GA4, GTM (statystyka), Microsoft Clarity,
 * - `marketing`  — Meta Pixel + Conversions API, Google Ads.
 *
 * Do chwili wyboru nic poza niezbędnymi się nie ładuje. Wybór trzymamy w
 * cookie pierwszej strony `fy_cookie_consent` (12 miesięcy); zmiana wersji
 * (`CONSENT_VERSION`) wymusza ponowne pytanie. Każda decyzja trafia też do
 * rejestru `cookie_consent_log` (rozliczalność, art. 7 ust. 1 RODO) pod
 * losowym identyfikatorem `id` zapisanym w cookie.
 */
import { useSyncExternalStore } from "react";

export const CONSENT_COOKIE = "fy_cookie_consent";
export const CONSENT_VERSION = 1;
const MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
/** Kotwica otwierająca ustawienia z dowolnego miejsca (`<a href="#ustawienia-cookies">`). */
export const OPEN_SETTINGS_HASH = "#ustawienia-cookies";
const OPEN_SETTINGS_EVENT = "fy:open-cookie-settings";

export type ConsentCategory = "analytics" | "marketing";

export type ConsentSource = "banner_accept_all" | "banner_reject" | "settings";

export type CookieConsent = {
  v: number;
  /** Losowy identyfikator zgody — klucz wpisów w cookie_consent_log. */
  id: string;
  analytics: boolean;
  marketing: boolean;
  /** ISO — moment udzielenia/zmiany zgody. */
  ts: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function newConsentId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function parseConsent(raw: string | undefined | null): CookieConsent | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<CookieConsent>;
    if (o?.v !== CONSENT_VERSION) return null;
    return {
      v: CONSENT_VERSION,
      id: typeof o.id === "string" && UUID_RE.test(o.id) ? o.id : "",
      analytics: o.analytics === true,
      marketing: o.marketing === true,
      ts: typeof o.ts === "string" ? o.ts : "",
    };
  } catch {
    return null;
  }
}

function readCookieRaw(): string | undefined {
  if (typeof document === "undefined") return;
  const m = document.cookie.match(new RegExp("(?:^|; )" + CONSENT_COOKIE + "=([^;]*)"));
  if (!m) return;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return;
  }
}

let current: CookieConsent | null | undefined;
const listeners = new Set<() => void>();

export function getConsent(): CookieConsent | null {
  if (typeof document === "undefined") return null;
  if (current === undefined) current = parseConsent(readCookieRaw());
  return current;
}

export function hasConsent(category: ConsentCategory): boolean {
  return getConsent()?.[category] === true;
}

/** Cookies narzędzi, które usuwamy po wycofaniu zgody (prefiksy nazw). */
const TRACKING_COOKIE_PREFIXES: Record<ConsentCategory, string[]> = {
  analytics: ["_ga", "_gid", "_gat", "_clck", "_clsk"],
  marketing: ["_fbp", "_fbc", "_gcl_"],
};

function deleteCookiesWithPrefixes(prefixes: string[]) {
  if (typeof document === "undefined") return;
  const host = window.location.hostname;
  const parts = host.split(".");
  // Cookies mogą siedzieć na hoście lub domenie nadrzędnej (np. .financeyou.pl).
  const domains = [""];
  for (let i = 0; i < parts.length - 1; i++) domains.push("." + parts.slice(i).join("."));
  for (const c of document.cookie.split("; ")) {
    const name = c.split("=")[0];
    if (!name || !prefixes.some((p) => name === p || name.startsWith(p))) continue;
    for (const d of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/${d ? `; domain=${d}` : ""}`;
    }
  }
}

/** Sygnał Google Consent Mode v2 — musi iść przed/obok ładowania gtag. */
export function googleConsentState(c: CookieConsent | null) {
  const a = c?.analytics ? "granted" : "denied";
  const m = c?.marketing ? "granted" : "denied";
  return {
    analytics_storage: a,
    ad_storage: m,
    ad_user_data: m,
    ad_personalization: m,
  } as const;
}

/** Zapis decyzji w rejestrze na serwerze; błąd nie blokuje strony. */
async function logConsent(c: CookieConsent, source: ConsentSource) {
  try {
    const { logCookieConsent } = await import("./consent/cookie-consent.functions");
    await logCookieConsent({
      data: {
        consentId: c.id,
        version: c.v,
        analytics: c.analytics,
        marketing: c.marketing,
        source,
        pagePath: window.location.pathname.slice(0, 300),
      },
    });
  } catch (e) {
    console.warn("[cookie-consent] log", e);
  }
}

export function saveConsent(
  choice: { analytics: boolean; marketing: boolean },
  source: ConsentSource = "settings",
) {
  if (typeof document === "undefined") return;
  const prev = getConsent();
  const next: CookieConsent = {
    v: CONSENT_VERSION,
    id: prev?.id || newConsentId(),
    analytics: choice.analytics,
    marketing: choice.marketing,
    ts: new Date().toISOString(),
  };
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(next))}; Max-Age=${MAX_AGE_SECONDS}; path=/; SameSite=Lax${secure}`;
  current = next;

  const w = window as any;
  try {
    w.gtag?.("consent", "update", googleConsentState(next));
    w.clarity?.("consentv2", {
      analytics_Storage: next.analytics ? "granted" : "denied",
      ad_Storage: next.marketing ? "granted" : "denied",
    });
    w.fbq?.("consent", next.marketing ? "grant" : "revoke");
  } catch {
    /* ignore */
  }

  const revoked = (["analytics", "marketing"] as const).filter((k) => prev?.[k] && !next[k]);
  listeners.forEach((l) => l());
  const logged = logConsent(next, source);
  if (revoked.length > 0) {
    // Załadowanych skryptów nie da się „wyładować” — czyścimy ich cookies i
    // przeładowujemy stronę, żeby nic już nie działało w tle. Przeładowanie
    // czeka na zapis w rejestrze (maks. 2 s), żeby go nie przerwać.
    deleteCookiesWithPrefixes(revoked.flatMap((k) => TRACKING_COOKIE_PREFIXES[k]));
    void Promise.race([logged, new Promise((r) => setTimeout(r, 2000))]).then(() =>
      window.location.reload(),
    );
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** `undefined` na serwerze / przed hydracją, `null` — brak decyzji. */
export function useCookieConsent(): CookieConsent | null | undefined {
  return useSyncExternalStore(subscribe, getConsent, () => undefined);
}

export function openCookieSettings() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}

export function onOpenCookieSettings(cb: () => void) {
  window.addEventListener(OPEN_SETTINGS_EVENT, cb);
  // Linki `href="#ustawienia-cookies"` (stopka, polityki) — bez importu JS.
  const onClick = (e: MouseEvent) => {
    const a = (e.target as Element | null)?.closest?.("a");
    if (a && a.getAttribute("href") === OPEN_SETTINGS_HASH) {
      e.preventDefault();
      cb();
    }
  };
  document.addEventListener("click", onClick);
  if (window.location.hash === OPEN_SETTINGS_HASH) cb();
  return () => {
    window.removeEventListener(OPEN_SETTINGS_EVENT, cb);
    document.removeEventListener("click", onClick);
  };
}

/** Tylko do testów. */
export function __resetConsentCache() {
  current = undefined;
}
