// Webinar dla inwestorów — pokaz nagrania co 15 minut (:00, :15, :30, :45
// czasu Europe/Warsaw). Czysta logika, bez I/O; import po obu stronach.
// Nigdzie nie piszemy „na żywo” / „live” — to „pokaz”.

/**
 * Włącznik całości: widżet na stronach, formularz zapisu i pokój. Dopóki nie
 * ma nagrania — false (zaślepka „Webinar startuje wkrótce”, widżet ukryty).
 */
export const WEBINAR_ENABLED = false;

/** Rekord training_videos z nagraniem webinaru (jedno miejsce konfiguracji). */
export const WEBINAR_VIDEO_ID: string | null = null;

/** Lead magnet obsługujący zapis (subskrybent z tagiem „webinar”, mail z linkiem). */
export const WEBINAR_SLUG = "webinar";
export const WEBINAR_SLOT_MINUTES = 15;
/** Spóźniony widz dołącza do trwającego pokazu, jeśli minęło mniej niż 5 min. */
export const WEBINAR_LATE_JOIN_MINUTES = 5;
export const WEBINAR_DISMISS_KEY = "fy_webinar_widget_hidden_until";
export const WEBINAR_DISMISS_HOURS = 24;

const SLOT_MS = WEBINAR_SLOT_MINUTES * 60_000;

// Strefa Europe/Warsaw ma przesunięcie o pełne godziny, więc granice
// kwadransów są te same w UTC i w czasie warszawskim.
export function currentSlotStart(now: number): number {
  return Math.floor(now / SLOT_MS) * SLOT_MS;
}

export function nextSlotStart(now: number): number {
  const cur = currentSlotStart(now);
  return cur === now ? now : cur + SLOT_MS;
}

/** „07:42” — minuty i sekundy do startu (zaokrąglone w górę do sekundy). */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export type RoomPlan =
  | { mode: "wait"; startsAt: number }
  | { mode: "play"; startedAt: number; offsetSec: number };

/**
 * Co zobaczy widz wchodzący o `now`: pokaz ruszył mniej niż 5 min temu i
 * jeszcze trwa → dołącza w odpowiednim momencie; inaczej czeka na najbliższy.
 */
export function roomPlan(now: number, durationSec: number | null): RoomPlan {
  const start = currentSlotStart(now);
  const elapsed = (now - start) / 1000;
  const running = durationSec == null || elapsed < durationSec;
  if (elapsed < WEBINAR_LATE_JOIN_MINUTES * 60 && running) {
    return { mode: "play", startedAt: start, offsetSec: Math.floor(elapsed) };
  }
  return { mode: "wait", startsAt: start + SLOT_MS };
}

/** Kamienie milowe oglądania: webinar_25 / _50 / _75 / _complete. */
export const WEBINAR_MILESTONES = [25, 50, 75, 100] as const;
export function webinarMilestoneEvent(p: (typeof WEBINAR_MILESTONES)[number]): string {
  return p === 100 ? "webinar_complete" : `webinar_${p}`;
}

/** Dostęp do pokoju: zgoda, opublikowany lead magnet „webinar”, ważny link. */
export function webinarGrantValid(
  grant: {
    video_expires_at: string | null;
    consent: boolean;
    lead_magnets: { slug: string; published: boolean } | null;
  } | null,
  now = Date.now(),
): boolean {
  return Boolean(
    grant?.consent &&
    grant.lead_magnets?.published &&
    grant.lead_magnets.slug === WEBINAR_SLUG &&
    grant.video_expires_at &&
    new Date(grant.video_expires_at).getTime() > now,
  );
}
