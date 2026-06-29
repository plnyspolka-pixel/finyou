import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { captureReferral } from "@/lib/affiliate/referral.functions";

/**
 * Bezgłowy komponent: przechwytuje ?ref= z dowolnej strony do localStorage,
 * a po zalogowaniu zapisuje polecenie na profilu (first-touch). Dzięki temu
 * zdarzenia prowizyjne (opłacone konto, wypłata środków) są naliczane partnerowi
 * automatycznie, bez działania administratora.
 */
export function ReferralCapture() {
  const { user } = useAuth();
  const capture = useServerFn(captureReferral);

  // 1) Zapis kodu z URL (działa na każdej stronie).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref) localStorage.setItem("fy_ref", ref.slice(0, 60));
    } catch {
      /* localStorage niedostępny */
    }
  }, []);

  // 2) Po zalogowaniu — utrwalenie polecenia na profilu (raz na kod/użytkownika).
  useEffect(() => {
    if (!user) return;
    let ref: string | null = null;
    let done: string | null = null;
    try {
      ref = localStorage.getItem("fy_ref");
      done = localStorage.getItem("fy_ref_done");
    } catch {
      return;
    }
    if (!ref || done === `${user.id}:${ref}`) return;
    capture({ data: { code: ref } })
      .then(() => {
        try {
          localStorage.setItem("fy_ref_done", `${user.id}:${ref}`);
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        /* nie blokujemy UX */
      });
  }, [user, capture]);

  return null;
}
