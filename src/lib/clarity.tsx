import { useEffect } from "react";

const CLARITY_ID = "x4ab9cyghc";

export function MicrosoftClarity() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).clarity) return;
    (function (c: any, l: Document, a: string, r: string, i: string) {
      c[a] =
        c[a] ||
        function () {
          // Vendorowy snippet Microsoft Clarity — kolejka oczekuje obiektu `arguments`.
          // eslint-disable-next-line prefer-rest-params
          (c[a].q = c[a].q || []).push(arguments);
        };
      const t = l.createElement(r) as HTMLScriptElement;
      t.async = true;
      t.src = "https://www.clarity.ms/tag/" + i;
      const y = l.getElementsByTagName(r)[0];
      y.parentNode?.insertBefore(t, y);
    })(window, document, "clarity", "script", CLARITY_ID);
  }, []);
  return null;
}
