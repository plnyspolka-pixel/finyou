// Sloty publikacji torów (czas Europe/Warsaw) — czysta logika, testy:
// slots.test.ts. Najbliższy wolny termin dla platformy z profilu toru
// (ai_growth_settings.audience_profiles[track].slots), z limitem publikacji
// na dobę na konto i bez kolizji z już zaplanowanymi wpisami (± 30 min).

const TZ = "Europe/Warsaw";

function warsawOffsetMinutes(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
  return Math.round((asUtc - Math.floor(utcMs / 60_000) * 60_000) / 60_000);
}

/** Lokalny czas Warszawy → Date (UTC), z obsługą zmiany czasu. */
export function warsawLocalToUtc(y: number, m: number, d: number, hh: number, mm: number): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off1 = warsawOffsetMinutes(guess - 60 * 60_000);
  const t = guess - off1 * 60_000;
  const off2 = warsawOffsetMinutes(t);
  return new Date(guess - off2 * 60_000);
}

export type Slot = { platform: string; time: string; weekdays: number[] };

/** ISO weekday 1–7 (pon–nd) dla daty w Warszawie. */
function warsawWeekday(date: Date): { y: number; m: number; d: number; wd: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wdMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    y: Number(g("year")),
    m: Number(g("month")),
    d: Number(g("day")),
    wd: wdMap[g("weekday")],
  };
}

/**
 * Najbliższy wolny slot dla platformy: stała godzina z profilu toru, dzień
 * dozwolony w `weekdays`, termin nie zajęty (± 30 min) i nie więcej niż
 * `maxPerDay` publikacji tego konta (platformy) danego dnia. Brak slotów → null.
 */
export function nextFreeSlot(opts: {
  slots: Slot[];
  platform: string;
  now: Date;
  taken: Date[];
  maxPerDay: number;
  horizonDays?: number;
  /** Minimalny odstęp od teraz (np. na kompresję). */
  leadMinutes?: number;
}): Date | null {
  const slots = opts.slots.filter((s) => s.platform === opts.platform);
  if (!slots.length || opts.maxPerDay <= 0) return null;
  const earliest = opts.now.getTime() + (opts.leadMinutes ?? 30) * 60_000;
  const horizon = opts.horizonDays ?? 14;
  for (let day = 0; day <= horizon; day++) {
    const date = new Date(opts.now.getTime() + day * 86_400_000);
    const w = warsawWeekday(date);
    const dayStart = warsawLocalToUtc(w.y, w.m, w.d, 0, 0).getTime();
    const dayEnd = dayStart + 86_400_000;
    const sameDay = opts.taken.filter((t) => t.getTime() >= dayStart && t.getTime() < dayEnd);
    if (sameDay.length >= opts.maxPerDay) continue;
    const candidates = slots
      .filter((s) => s.weekdays.includes(w.wd))
      .map((s) => {
        const [hh, mm] = s.time.split(":").map(Number);
        return warsawLocalToUtc(w.y, w.m, w.d, hh, mm);
      })
      .sort((a, b) => a.getTime() - b.getTime());
    for (const c of candidates) {
      if (c.getTime() < earliest) continue;
      const clash = opts.taken.some((t) => Math.abs(t.getTime() - c.getTime()) < 30 * 60_000);
      if (!clash) return c;
    }
  }
  return null;
}
