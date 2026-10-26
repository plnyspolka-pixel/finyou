import { useEffect, useRef } from "react";
import {
  TRUSTBOX_SCRIPT_URL,
  TRUSTBOX_TEMPLATES,
  TRUSTPILOT_BUSINESS_UNIT_ID,
  TRUSTPILOT_PROFILE_URL,
  type TrustBoxTemplate,
} from "@/lib/trustpilot";

declare global {
  interface Window {
    Trustpilot?: { loadFromElement: (el: HTMLElement, force?: boolean) => void };
  }
}

const SCRIPT_ID = "trustpilot-trustbox-bootstrap";

/**
 * Ładuje skrypt TrustBox raz na stronę i woła callback, gdy jest gotowy
 * (także gdy inny widżet już go załadował).
 */
function withTrustpilotScript(onReady: () => void): () => void {
  let cancelled = false;
  const ready = () => {
    if (!cancelled) onReady();
  };
  if (window.Trustpilot) {
    ready();
    return () => {
      cancelled = true;
    };
  }
  let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = TRUSTBOX_SCRIPT_URL;
    script.async = true;
    document.head.appendChild(script);
  }
  script.addEventListener("load", ready);
  return () => {
    cancelled = true;
    script?.removeEventListener("load", ready);
  };
}

/**
 * Oficjalny widżet opinii Trustpilot (TrustBox) dla profilu financeyou.pl.
 * Na serwerze renderuje się sam kontener z zapasowym linkiem do profilu, na
 * kliencie skrypt Trustpilot wstawia do niego ramkę z ocenami. TrustBoxy nie
 * zapisują ciasteczek, więc nie podlegają zgodzie cookies.
 */
export function TrustpilotBox({
  template = "reviewCollector",
  theme = "light",
  height,
}: {
  template?: TrustBoxTemplate;
  theme?: "light" | "dark";
  /** Wysokość ramki; domyślnie zalecana dla szablonu. */
  height?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const tpl = TRUSTBOX_TEMPLATES[template];

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return withTrustpilotScript(() => {
      window.Trustpilot?.loadFromElement(el, true);
    });
  }, [template]);

  return (
    <div
      ref={ref}
      className="trustpilot-widget"
      data-locale="pl-PL"
      data-template-id={tpl.id}
      data-businessunit-id={TRUSTPILOT_BUSINESS_UNIT_ID}
      data-style-height={height ?? tpl.height}
      data-style-width="100%"
      data-theme={theme}
    >
      <a
        href={TRUSTPILOT_PROFILE_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: "0.9rem", color: "var(--muted-foreground)" }}
      >
        Opinie o Finance You na Trustpilot
      </a>
    </div>
  );
}
