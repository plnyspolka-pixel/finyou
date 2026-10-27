import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FocusShell } from "@/components/marketing/focus-shell";
import { Eyebrow, MktButton } from "@/components/marketing/primitives";
import { hasConsent } from "@/lib/cookie-consent";
import { getWebinarRoom } from "@/lib/webinar.functions";
import {
  WEBINAR_MILESTONES,
  currentSlotStart,
  formatCountdown,
  roomPlan,
  webinarMilestoneEvent,
} from "@/lib/webinar";

export const Route = createFileRoute("/webinar/pokoj")({
  validateSearch: (s: Record<string, unknown>) => ({ t: typeof s.t === "string" ? s.t : "" }),
  head: () => ({
    meta: [
      { title: "Pokój webinaru — Finance You" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: WebinarRoom,
});

type Room = Awaited<ReturnType<typeof getWebinarRoom>>;

function track(event: string, params?: Record<string, unknown>) {
  if (hasConsent("marketing"))
    (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq?.("trackCustom", event, params);
  if (hasConsent("analytics")) window.gtag?.("event", event, params);
}

function WebinarRoom() {
  const { t } = Route.useSearch();
  const roomFn = useServerFn(getWebinarRoom);
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const media = useRef<HTMLVideoElement>(null);
  const seen = useRef(new Set<number>());

  useEffect(() => {
    if (!t) {
      setError("Brak linku do pokoju. Zapisz się na webinar.");
      return;
    }
    roomFn({ data: { token: t } })
      .then(setRoom)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Link nieważny."));
  }, [t, roomFn]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const ready = room?.ready ? room : null;
  const plan = ready ? roomPlan(now, ready.durationSec) : null;

  // Dołączenie: odtwarzanie od pozycji wynikającej z czasu pokazu.
  const join = async () => {
    const v = media.current;
    if (!v || !plan || plan.mode !== "play") return;
    setStartedAt(plan.startedAt);
    v.currentTime = Math.max(0, (Date.now() - plan.startedAt) / 1000);
    try {
      await v.play();
      track("webinar_join");
    } catch {
      /* przeglądarka zablokowała odtwarzanie — widz kliknie ponownie */
    }
  };

  // Bez przewijania do przodu: pozycja nie może wyprzedzić czasu pokazu.
  const guardSeek = () => {
    const v = media.current;
    if (!v || startedAt == null) return;
    const allowed = (Date.now() - startedAt) / 1000;
    if (v.currentTime > allowed + 2) v.currentTime = allowed;
  };

  const progress = () => {
    const v = media.current;
    if (!v || !v.duration) return;
    const pct = (v.currentTime / v.duration) * 100;
    for (const p of WEBINAR_MILESTONES)
      if (pct >= p && !seen.current.has(p)) {
        seen.current.add(p);
        track(webinarMilestoneEvent(p));
      }
  };

  return (
    <FocusShell>
      <section className="mx-auto w-full max-w-4xl px-4 py-10">
        <Eyebrow tone="gold">Webinar dla inwestorów</Eyebrow>
        {error ? (
          <p role="alert" className="mt-4 text-destructive">
            {error}
          </p>
        ) : !room ? (
          <p className="mt-4 text-muted-foreground">Ładuję pokój…</p>
        ) : !ready ? (
          <>
            <h1 className="mt-3 text-3xl font-black">Webinar startuje wkrótce</h1>
            <p className="mt-4 text-muted-foreground">
              Przygotowujemy nagranie. Damy znać e‑mailem, gdy ruszą pokazy.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-3 text-2xl font-black md:text-3xl">{ready.title}</h1>
            <div className="fy-sales-video-box mt-6">
              <video
                ref={media}
                playsInline
                preload="metadata"
                className="fy-sales-video"
                src={ready.url}
                poster={ready.poster ?? undefined}
                controls={startedAt != null}
                onSeeking={guardSeek}
                onTimeUpdate={progress}
                onEnded={() => setStartedAt(null)}
              />
              {plan?.mode === "wait" && startedAt == null && (
                <p className="mt-4 text-center text-lg">
                  Najbliższy pokaz za{" "}
                  <strong className="tabular-nums">{formatCountdown(plan.startsAt - now)}</strong>
                </p>
              )}
              {plan?.mode === "play" && startedAt == null && (
                <div className="mt-4 text-center">
                  <MktButton variant="gold" onClick={() => void join()}>
                    {now - currentSlotStart(now) < 2000
                      ? "Pokaz startuje — dołącz"
                      : "Dołącz do trwającego pokazu"}
                  </MktButton>
                </div>
              )}
            </div>
          </>
        )}
        <div className="fy-sales-actions">
          <MktButton variant="gold" href="/#cennik">
            Zobacz program i cenę
          </MktButton>
          <MktButton variant="outline" href="/abonament-inwestora?okres=rocznie&kod=">
            Mam kod rabatowy
          </MktButton>
        </div>
      </section>
    </FocusShell>
  );
}
