// Czas kroków pipeline'u analitycznego — czyste reguły wspólne dla serwera
// (przebiegi wniosków w engine.server, szybka analiza KW inwestora w
// investor-analytics/kw-checks.server, cron tick) i panelu inwestora.
//
// Obietnica dla inwestora: ocena ryzyka i wycena w ciągu ok. 15 minut od
// uruchomienia analizy. Sama ocena (krok 4) trwa 30–50 s, więc:
//  • panel zleca krok 4 od razu po krokach 1–3 (runMyRiskStep), a cron tick
//    (co 5 min) jest siatką bezpieczeństwa;
//  • krok 4 ma zajęcie (claim): `running` + `claimed_at`, ustawiane warunkowym
//    UPDATE-em (compare-and-set na stanie kroku) — dwa wywołania nie liczą
//    tej samej oceny; zajęcie starsze niż RISK_CLAIM_STALE_MS (przerwana
//    praca) wolno przejąć;
//  • odczyt szczegółów popycha kroki 1–3, gdy ostatni ruch był ≥ 45 s temu;
//  • czekanie na KW z EKW liczymy czasem, nie liczbą prób — próby są teraz
//    częstsze (odczyt szczegółów, cron co 5 min).

export type PipelineStepKey = "kw" | "coowners" | "kw_analysis" | "risk";

/** Stan kroku w jsonb `steps` (analysis_pipeline_runs / investor_kw_checks). */
export interface StepTiming {
  status?: string;
  finished_at?: string;
  error?: string;
  /** Krok 4: kiedy przebieg zajął ocenę ryzyka (status `running`). */
  claimed_at?: string;
  /** Krok 1: pierwsza próba, przy której EKW jeszcze przygotowywał księgę. */
  waiting_since?: string;
  /** Krok 1: ostatnia próba pobrania przy czekaniu na EKW. */
  checked_at?: string;
  /** Krok 1: liczba prób bez wyniku (diagnostyka). */
  waits?: number;
}

export type StepsLike = Partial<Record<PipelineStepKey, StepTiming | undefined>> | null | undefined;

/** Zajęcie oceny ryzyka starsze niż to uznajemy za porzucone (przerwane żądanie). */
export const RISK_CLAIM_STALE_MS = 10 * 60 * 1000;
/** Po jakim czasie od ostatniego ruchu odczyt szczegółów sam popycha kroki 1–3. */
export const ADVANCE_ON_READ_AFTER_MS = 45_000;
/** Limit czekania na EKW w żądaniu z przeglądarki (cron czeka dłużej). */
export const INTERACTIVE_KW_POLL_MS = 20_000;
/**
 * Jak długo czekamy na treść KW z EKW, zanim krok 1 kończy się błędem — 5 h,
 * jak dawne 20 prób co 15 minut (cron był jedynym, który próbował).
 */
export const MAX_KW_WAIT_MS = 5 * 60 * 60 * 1000;
/**
 * Budżet cron ticku: po tylu ms od startu ticku nie zaczynamy kolejnych
 * przebiegów ani ocen ryzyka (pg_net czeka 240 s — praca zaczęta przed
 * budżetem musi się zmieścić: KW do 45 s, ocena ryzyka 30–60 s).
 */
export const TICK_BUDGET_MS = 150_000;
/** Kwalifikacja nowych wniosków (sync) — jak dotąd co 15 minut, choć tick jest co 5. */
export const PIPELINE_SYNC_EVERY_MINUTES = 15;

const PRE_RISK_STEPS: PipelineStepKey[] = ["kw", "coowners", "kw_analysis"];

function resolved(s: StepTiming | undefined): boolean {
  return s?.status === "done" || s?.status === "error";
}

function ms(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : NaN;
}

/** Kroki 1–3 rozstrzygnięte (gotowe albo z błędem) — krok 4 może ruszyć. */
export function preRiskStepsResolved(steps: StepsLike): boolean {
  return PRE_RISK_STEPS.every((k) => resolved(steps?.[k]));
}

/**
 * Faza kroku 4:
 *  • `waiting_for_steps` — kroki 1–3 jeszcze trwają,
 *  • `ready` — ocena wolna, można ją zająć,
 *  • `running` — ktoś ją liczy (świeże zajęcie),
 *  • `stale` — zajęcie porzucone (starsze niż RISK_CLAIM_STALE_MS) — do przejęcia,
 *  • `resolved` — ocena gotowa albo z błędem.
 */
export type RiskStepPhase = "waiting_for_steps" | "ready" | "running" | "stale" | "resolved";

export function riskStepPhase(steps: StepsLike, now: number = Date.now()): RiskStepPhase {
  const risk = steps?.risk;
  if (resolved(risk)) return "resolved";
  if (!preRiskStepsResolved(steps)) return "waiting_for_steps";
  if (risk?.status === "running") {
    const at = ms(risk.claimed_at);
    return Number.isFinite(at) && now - at < RISK_CLAIM_STALE_MS ? "running" : "stale";
  }
  return "ready";
}

/** Czy wolno zająć krok 4: kroki 1–3 rozstrzygnięte, ocena wolna albo porzucona. */
export function canClaimRiskStep(steps: StepsLike, now: number = Date.now()): boolean {
  const phase = riskStepPhase(steps, now);
  return phase === "ready" || phase === "stale";
}

/** Stan kroku 4 po zajęciu. */
export function claimedRiskStep(now: number = Date.now()): {
  status: "running";
  claimed_at: string;
} {
  return { status: "running", claimed_at: new Date(now).toISOString() };
}

/** Minimalny kształt zapytania PostgREST (supabase-js) — filtry na ścieżce jsonb. */
export interface JsonFilterBuilder<T> {
  eq(column: string, value: string): T;
  is(column: string, value: null): T;
}

/**
 * Compare-and-set zajęcia: UPDATE trafia w wiersz tylko wtedy, gdy krok 4
 * w bazie jest dokładnie w stanie, który widzieliśmy (wolny albo to samo
 * porzucone zajęcie). Drugi wołający — po pierwszym — nie trafia w nic.
 */
export function withRiskClaimConditions<T extends JsonFilterBuilder<T>>(
  q: T,
  risk: StepTiming | undefined,
): T {
  if (!risk) return q.is("steps->risk", null);
  if (risk.status === "running" && risk.claimed_at) {
    return q.eq("steps->risk->>claimed_at", risk.claimed_at);
  }
  if (risk.status === "running") {
    return q.eq("steps->risk->>status", "running").is("steps->risk->>claimed_at", null);
  }
  if (risk.status) return q.eq("steps->risk->>status", risk.status);
  return q.is("steps->risk->>status", null);
}

/**
 * Strażnik zapisu kroków: kroki 1–3 zapisujemy tylko, gdy ocena ryzyka jest
 * w bazie wciąż wolna (`pending` — nikt jej nie zajął, więc nie nadpiszemy
 * cudzego zajęcia ani wyniku), a wynik oceny — tylko z własnym zajęciem.
 */
export type RiskSaveGuard = "risk_pending" | { claimedAt: string };

export function withRiskSaveGuard<T extends JsonFilterBuilder<T>>(q: T, guard: RiskSaveGuard): T {
  return guard === "risk_pending"
    ? q.eq("steps->risk->>status", "pending")
    : q.eq("steps->risk->>claimed_at", guard.claimedAt);
}

/** Ostatni ruch przebiegu: start, zakończenia kroków, próby pobrania KW, zajęcie oceny. */
export function lastStepActivityAt(startedAt: string | null | undefined, steps: StepsLike): number {
  let last = ms(startedAt);
  for (const s of Object.values(steps ?? {})) {
    for (const t of [s?.finished_at, s?.checked_at, s?.claimed_at]) {
      const v = ms(t);
      if (Number.isFinite(v) && (!Number.isFinite(last) || v > last)) last = v;
    }
  }
  return last;
}

/**
 * Advance-on-read: trwający przebieg z otwartymi krokami 1–3, bez ruchu od
 * ≥ 45 s, odczyt szczegółów popycha sam (bez czekania na cron tick). Krok 4
 * zleca panel osobno (runMyRiskStep), więc gdy zostaje tylko on — nie ruszamy.
 */
export function shouldAdvanceOnRead(
  status: string | null | undefined,
  steps: StepsLike,
  lastActivityAt: number,
  now: number = Date.now(),
): boolean {
  if (status !== "running") return false;
  if (riskStepPhase(steps, now) !== "waiting_for_steps") return false;
  return !Number.isFinite(lastActivityAt) || now - lastActivityAt >= ADVANCE_ON_READ_AFTER_MS;
}

/**
 * Kolejna próba pobrania KW bez wyniku (EKW jeszcze przygotowuje księgę):
 * stan „czeka" albo `expired`, gdy od pierwszej takiej próby minęło
 * MAX_KW_WAIT_MS.
 */
export function nextKwWait(
  kw: StepTiming | undefined,
  now: number = Date.now(),
): {
  expired: boolean;
  state: { status: "running"; waits: number; waiting_since: string; checked_at: string };
} {
  const nowIso = new Date(now).toISOString();
  const since = Number.isFinite(ms(kw?.waiting_since)) ? (kw?.waiting_since as string) : nowIso;
  return {
    expired: now - ms(since) >= MAX_KW_WAIT_MS,
    state: {
      status: "running",
      waits: (kw?.waits ?? 0) + 1,
      waiting_since: since,
      checked_at: nowIso,
    },
  };
}

/**
 * Kolejność w cron ticku (stabilna — w grupie najstarsze najpierw): najpierw
 * przebiegi czekające tylko na ocenę ryzyka (zdążą przed budżetem), potem
 * z gotową księgą, na końcu czekające na EKW (każdy do 45 s czekania).
 */
export function tickPriority(steps: StepsLike, now: number = Date.now()): number {
  if (canClaimRiskStep(steps, now)) return 0;
  return resolved(steps?.kw) ? 1 : 2;
}

export function orderForTick<T extends { steps: StepsLike }>(
  rows: T[],
  now: number = Date.now(),
): T[] {
  return rows
    .map((row, i) => ({ row, i, p: tickPriority(row.steps, now) }))
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .map((x) => x.row);
}

/** Czy minął termin budżetu (brak terminu = bez limitu). */
export function pastDeadline(
  deadline: number | null | undefined,
  now: number = Date.now(),
): boolean {
  return deadline != null && now >= deadline;
}

/** Kwalifikacja nowych wniosków w tym ticku (co 15 min — ticki :00, :15, :30, :45). */
export function shouldSyncPipelineThisTick(now: Date): boolean {
  return now.getUTCMinutes() % PIPELINE_SYNC_EVERY_MINUTES < 5;
}

/**
 * Wynik zlecenia oceny ryzyka z panelu inwestora: `done` / `error` — krok 4
 * rozstrzygnięty; `running` — ocena się liczy (to albo inne żądanie, albo
 * cron); `not_ready` — kroki 1–3 jeszcze trwają; `not_running` — brak
 * trwającego przebiegu.
 */
export type RiskStepRequestStatus = "done" | "error" | "running" | "not_ready" | "not_running";

export function riskStepRequestStatus(
  rowStatus: string | null | undefined,
  steps: StepsLike,
  now: number = Date.now(),
): RiskStepRequestStatus {
  const risk = steps?.risk?.status;
  if (risk === "done" || risk === "error") return risk;
  if (rowStatus !== "running") return "not_running";
  return riskStepPhase(steps, now) === "waiting_for_steps" ? "not_ready" : "running";
}

/** Czy panel ma zlecić ocenę ryzyka: przebieg trwa, kroki 1–3 rozstrzygnięte, krok 4 wolny. */
export function shouldRequestRiskStep(
  status: string | null | undefined,
  steps: StepsLike,
  now: number = Date.now(),
): boolean {
  return status === "running" && canClaimRiskStep(steps, now);
}
