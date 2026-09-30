import { useEffect } from "react";
import { useCookieConsent } from "@/lib/cookie-consent";

const CLARITY_ID = "x4ab9cyghc";

/** Ładowany wyłącznie za zgodą na cookies analityczne. */
export function MicrosoftClarity() {
  const consent = useCookieConsent();
  const allowed = consent?.analytics === true;
  useEffect(() => {
    if (!allowed || typeof window === "undefined") return;
    if ((window as any).clarity) return;
    (function (c: any, l: Document, a: string, r: string, i: string) {
      c[a] =
        c[a] ||
        function () {
          // eslint-disable-next-line prefer-rest-params -- oficjalny snippet Clarity, kolejka czyta `arguments`
          (c[a].q = c[a].q || []).push(arguments);
        };
      const t = l.createElement(r) as HTMLScriptElement;
      t.async = true;
      t.src = "https://www.clarity.ms/tag/" + i;
      const y = l.getElementsByTagName(r)[0];
      y.parentNode?.insertBefore(t, y);
    })(window, document, "clarity", "script", CLARITY_ID);
    (window as any).clarity("consentv2", {
      analytics_Storage: "granted",
      ad_Storage: consent?.marketing ? "granted" : "denied",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ładujemy raz, zmiany idą przez saveConsent
  }, [allowed]);
  return null;
}
