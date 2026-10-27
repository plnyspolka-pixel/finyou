import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  WEBINAR_DISMISS_HOURS,
  WEBINAR_DISMISS_KEY,
  WEBINAR_ENABLED,
  formatCountdown,
  nextSlotStart,
} from "@/lib/webinar";
import { MktButton } from "./primitives";

/**
 * Widżet „Webinar dla inwestorów — najbliższy pokaz za mm:ss”. Desktop:
 * kafelek w prawym dolnym rogu nad przyciskiem czatu; mobile: belka przy
 * dolnej krawędzi (czat stoi wyżej). Zamknięcie pamiętamy 24 h. Ukryty
 * flagą WEBINAR_ENABLED, dopóki nie ma nagrania.
 */
export function WebinarWidget({ enabled = WEBINAR_ENABLED }: { enabled?: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    let until = 0;
    try {
      until = Number(localStorage.getItem(WEBINAR_DISMISS_KEY) ?? 0);
    } catch {
      /* localStorage niedostępny — pokazujemy widżet */
    }
    setHidden(until > Date.now());
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [enabled]);

  if (!enabled || hidden || now == null) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(
        WEBINAR_DISMISS_KEY,
        String(Date.now() + WEBINAR_DISMISS_HOURS * 3_600_000),
      );
    } catch {
      /* ignorujemy */
    }
  };

  return (
    <aside className="fy-webinar-widget" aria-label="Webinar dla inwestorów">
      <div className="fy-webinar-widget__text">
        <strong>Webinar dla inwestorów</strong>
        <span>
          najbliższy pokaz za{" "}
          <span className="tabular-nums">{formatCountdown(nextSlotStart(now) - now)}</span>
        </span>
      </div>
      <MktButton size="sm" variant="gold" href="/webinar">
        Zapisz się
      </MktButton>
      <button
        type="button"
        className="fy-webinar-widget__close"
        onClick={dismiss}
        aria-label="Zamknij"
      >
        <X size={16} />
      </button>
    </aside>
  );
}
