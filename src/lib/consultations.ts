// Indywidualne konsultacje inwestora (Regulamin abonamentu 1.1, § 3 ust. 3):
// 4 godziny w Okresie Abonamentowym. Inwestor wybiera w panelu PREFEROWANY
// termin — właściciel dostaje SMS i potwierdza termin sam. Czysta logika
// (terminy w czasie polskim, limit godzin, treść SMS) — bez bazy, testowalna.
import { KONSULTACJE_GODZIN } from "@/lib/legal/regulamin-abonamentu";

export const CONSULTATION_TOTAL_MINUTES = KONSULTACJE_GODZIN * 60;
export const CONSULTATION_DURATIONS = [30, 60, 90, 120] as const;
export type ConsultationDuration = (typeof CONSULTATION_DURATIONS)[number];

/** Godziny pracy (czas polski): pierwszy start 9:00, koniec najpóźniej 18:00, co 30 min. */
export const CONSULTATION_DAY_START_MIN = 9 * 60;
export const CONSULTATION_DAY_END_MIN = 18 * 60;
export const CONSULTATION_STEP_MIN = 30;
/** Najwcześniej 24 h od zgłoszenia, najpóźniej 60 dni naprzód. */
export const CONSULTATION_MIN_LEAD_HOURS = 24;
export const CONSULTATION_MAX_DAYS_AHEAD = 60;

/** Statusy, które NIE zużywają godzin. */
export const CONSULTATION_FREE_STATUSES = ["odwolana"] as const;
export type ConsultationStatus = "zgloszona" | "potwierdzona" | "odbyta" | "odwolana";

export const CONSULTATION_STATUS_LABEL: Record<ConsultationStatus, string> = {
  zgloszona: "Zgłoszona — czeka na potwierdzenie",
  potwierdzona: "Potwierdzona",
  odbyta: "Odbyta",
  odwolana: "Odwołana",
};

const TZ = "Europe/Warsaw";

/** Przesunięcie strefy Warszawy względem UTC (minuty) w danej chwili. */
function warsawOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"));
  return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

/** „2026-11-03” + „10:30” w czasie polskim → chwila UTC. */
export function warsawToDate(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  // Dwa przybliżenia wystarczają także w dniach zmiany czasu.
  let t = guess.getTime() - warsawOffsetMinutes(guess) * 60000;
  t = guess.getTime() - warsawOffsetMinutes(new Date(t)) * 60000;
  return new Date(t);
}

/** Data kalendarzowa w Warszawie („RRRR-MM-DD”). */
export function warsawDateKey(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(at);
}

function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Czy w ten dzień w ogóle można wybrać termin (dzień roboczy w oknie 24 h – 60 dni). */
export function isConsultationDay(date: string, now: Date): boolean {
  const wd = weekdayOf(date);
  if (wd === 0 || wd === 6) return false;
  const lastStart = warsawToDate(date, hhmm(CONSULTATION_DAY_END_MIN - CONSULTATION_STEP_MIN));
  if (lastStart.getTime() < now.getTime() + CONSULTATION_MIN_LEAD_HOURS * 3600000) return false;
  const dayStart = warsawToDate(date, "00:00");
  return dayStart.getTime() <= now.getTime() + CONSULTATION_MAX_DAYS_AHEAD * 86400000;
}

/** Godziny startu do wyboru w danym dniu dla danej długości. */
export function consultationTimes(date: string, minutes: number, now: Date): string[] {
  if (!isConsultationDay(date, now)) return [];
  const out: string[] = [];
  for (
    let m = CONSULTATION_DAY_START_MIN;
    m + minutes <= CONSULTATION_DAY_END_MIN;
    m += CONSULTATION_STEP_MIN
  ) {
    const at = warsawToDate(date, hhmm(m));
    if (at.getTime() >= now.getTime() + CONSULTATION_MIN_LEAD_HOURS * 3600000) out.push(hhmm(m));
  }
  return out;
}

/** Minuty wykorzystane w bieżącym okresie (zgłoszenia nieodwołane). */
export function usedConsultationMinutes(
  requests: { duration_minutes: number; status: string }[],
): number {
  return requests
    .filter((r) => !(CONSULTATION_FREE_STATUSES as readonly string[]).includes(r.status))
    .reduce((sum, r) => sum + (r.duration_minutes || 0), 0);
}

export function remainingConsultationMinutes(
  requests: { duration_minutes: number; status: string }[],
): number {
  return Math.max(0, CONSULTATION_TOTAL_MINUTES - usedConsultationMinutes(requests));
}

/** „3 h 30 min”, „1 h”, „30 min”. */
export function minutesLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} h ${m} min`;
  return h ? `${h} h` : `${m} min`;
}

/** Początek bieżącego okresu: 365 dni przed końcem aktywnego abonamentu. */
export function consultationPeriodStart(activeUntil: string | null, now: Date): Date {
  const until = activeUntil ? new Date(activeUntil) : now;
  return new Date(until.getTime() - 365 * 86400000);
}

/** „wt 3.11, 10:30” w czasie polskim. */
export function consultationWhenLabel(at: Date): string {
  const day = new Intl.DateTimeFormat("pl-PL", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "numeric",
  }).format(at);
  const time = new Intl.DateTimeFormat("pl-PL", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
  return `${day}, ${time}`;
}

/** SMS do właściciela — krótko, bez danych wrażliwych poza imieniem i telefonem. */
export function consultationOwnerSms(opts: {
  name: string;
  phone: string | null;
  at: Date;
  minutes: number;
  topic: string | null;
}): string {
  const topic = opts.topic?.trim() ? ` Temat: ${opts.topic.trim().slice(0, 120)}` : "";
  return `Konsultacja: ${opts.name}${opts.phone ? ` (${opts.phone})` : ""} chce ${consultationWhenLabel(opts.at)}, ${minutesLabel(opts.minutes)}.${topic}`;
}
