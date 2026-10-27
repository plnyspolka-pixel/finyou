import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Przewijanie do kotwicy (#cennik, #faq, #szkolenie…) po wejściu z innej
 * strony i po każdej zmianie hasha. Przywracanie przewijania routera ustawia
 * stronę na górze po hydratacji, a sekcja może pojawić się dopiero po
 * załadowaniu danych — dlatego szukamy elementu przez kilka klatek (do ~3 s).
 * Odstęp na sticky header daje `scroll-margin-top` w styles.css.
 */
export function HashScroll() {
  const href = useRouterState({ select: (s) => s.location.href });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    let frame = 0;
    let tries = 0;
    const timers: number[] = [];
    const go = () => document.getElementById(id)?.scrollIntoView({ block: "start" });
    const tick = () => {
      if (document.getElementById(id)) {
        go();
        // Powtórka po ustabilizowaniu układu (obrazy, czcionki, dane).
        timers.push(window.setTimeout(go, 300), window.setTimeout(go, 1000));
        return;
      }
      if (++tries < 180) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    // Użytkownik sam przewija — nie wracamy go do kotwicy.
    const stop = () => {
      window.cancelAnimationFrame(frame);
      timers.forEach((t) => window.clearTimeout(t));
    };
    window.addEventListener("wheel", stop, { once: true, passive: true });
    window.addEventListener("touchstart", stop, { once: true, passive: true });
    const onHash = () => {
      const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
      target?.scrollIntoView({ block: "start", behavior: "smooth" });
    };
    window.addEventListener("hashchange", onHash);
    return () => {
      stop();
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("hashchange", onHash);
    };
  }, [href]);
  return null;
}
