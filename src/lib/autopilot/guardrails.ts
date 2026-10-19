// Bezpieczniki autopilota (brief 5.8) — czysta logika: wykrywanie anomalii,
// limity dobowe, rozkład w slotach. Testy: guardrails.test.ts.

export type QueueOutcome = {
  platform: string;
  status: string;
  lastError: string | null;
  updatedAt: string;
};

/** Błędy, które nie są awarią kanału (świadoma blokada, wyłączony kanał). */
const NON_INCIDENT = /Bramka compliance|wyłączony w ustawieniach|Wyłącznik awaryjny/i;

/**
 * Seria nieudanych publikacji z rzędu na jednej platformie (najnowsze
 * zakończone wpisy). Zwraca platformy, które przekroczyły próg.
 */
export function consecutiveFailures(
  outcomes: QueueOutcome[],
  threshold: number,
): { platform: string; failures: number }[] {
  const byPlatform = new Map<string, QueueOutcome[]>();
  for (const o of outcomes) {
    if (o.status !== "failed" && o.status !== "published") continue;
    if (o.status === "failed" && NON_INCIDENT.test(o.lastError ?? "")) continue;
    byPlatform.set(o.platform, [...(byPlatform.get(o.platform) ?? []), o]);
  }
  const out: { platform: string; failures: number }[] = [];
  for (const [platform, list] of byPlatform) {
    const sorted = [...list].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    let n = 0;
    for (const o of sorted) {
      if (o.status !== "failed") break;
      n += 1;
    }
    if (n >= threshold) out.push({ platform, failures: n });
  }
  return out;
}

export type AnomalyInput = {
  outcomes: QueueOutcome[];
  failuresThreshold: number;
  aiCostTodayPln: number;
  dailyAiBudgetPln: number;
  complianceBlockedToday: number;
  /** Sygnały platform po publikacji (ostrzeżenia, usunięcia) — z dziennika. */
  platformWarningsToday: number;
};

export type Anomaly = { code: string; message: string };

export function detectAnomalies(i: AnomalyInput): Anomaly[] {
  const out: Anomaly[] = [];
  for (const f of consecutiveFailures(i.outcomes, i.failuresThreshold)) {
    out.push({
      code: `publish_failures:${f.platform}`,
      message: `${f.failures} nieudanych publikacji z rzędu na ${f.platform}`,
    });
  }
  if (i.dailyAiBudgetPln >= 0 && i.aiCostTodayPln > i.dailyAiBudgetPln) {
    out.push({
      code: "ai_budget",
      message: `Koszt AI dziś ${i.aiCostTodayPln.toFixed(2)} zł > budżet ${i.dailyAiBudgetPln} zł`,
    });
  }
  // Spadek jakości: wiele odrzuceń bramki w jeden dzień = autor generuje źle.
  if (i.complianceBlockedToday >= 10) {
    out.push({
      code: "compliance_quality",
      message: `${i.complianceBlockedToday} treści zablokowanych przez bramkę compliance dziś`,
    });
  }
  if (i.platformWarningsToday > 0) {
    out.push({
      code: "platform_warning",
      message: `${i.platformWarningsToday} sygnałów ostrzegawczych platform dziś`,
    });
  }
  return out;
}

// ── Sloty publikacji (czas Europe/Warsaw) ─────────────────────────────────

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

/**
 * Dynamiczny podział kadencji między tory (brief 5.1): udział toru rośnie,
 * gdy lead z niego jest tańszy względem wartości; zmiana maks. 10 p.p./tydz.
 * `valuePerLead` / `costPerLead` per tor; brak danych → bez zmian.
 */
export function rebalanceCadence(
  current: number,
  a: { valuePerLead: number; costPerLead: number } | null,
  b: { valuePerLead: number; costPerLead: number } | null,
): number {
  if (!a || !b || a.costPerLead <= 0 || b.costPerLead <= 0) return current;
  const ra = a.valuePerLead / a.costPerLead;
  const rb = b.valuePerLead / b.costPerLead;
  if (ra + rb <= 0) return current;
  const target = ra / (ra + rb);
  const step = Math.max(-0.1, Math.min(0.1, target - current));
  return Math.round(Math.min(0.9, Math.max(0.1, current + step)) * 100) / 100;
}
