/**
 * Bezpieczniki autopilota (brief 5.8) i decyzje trybu — czysta logika.
 *
 * Tryby (wspólne z silnikiem wzrostu):
 *   off            — agent nic nie robi (poza raportem i alarmami),
 *   manual_review  — agent planuje i produkuje szkice; publikacja, odpowiedzi,
 *                    maile i promocje czekają na człowieka,
 *   semi_auto      — publikuje, odpowiada i wysyła sam; promocje płatne nie,
 *   full_autopilot — wszystko sam, w limitach budżetu (brief 2.1).
 * Wyłącznik awaryjny i automatyczna pauza mają pierwszeństwo przed trybem.
 */

export type AgentMode = "off" | "manual_review" | "semi_auto" | "full_autopilot";

export type AgentAction =
  | "plan"
  | "produce"
  | "publish"
  | "reply"
  | "email"
  | "create_lead_magnet"
  | "promote"
  | "report"
  | "alarm";

export interface AgentSettings {
  mode: AgentMode;
  kill_switch: boolean;
  kill_switch_reason?: string | null;
  auto_paused_at?: string | null;
  auto_pause_reason?: string | null;
  daily_ai_budget_pln: number;
  max_posts_per_day_per_platform: number;
  max_emails_per_recipient_per_week: number;
  disabled_platforms: string[];
  max_consecutive_publish_failures: number;
  cost_spike_factor: number;
  double_opt_in: boolean;
  owner_phone?: string | null;
  owner_email?: string | null;
  daily_report_hour: number;
  weekly_report_dow: number;
  last_daily_report_at?: string | null;
  last_weekly_report_at?: string | null;
}

/** Wartości bezpieczne, gdy tabeli jeszcze nie ma (migracja niewdrożona). */
export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  mode: "manual_review",
  kill_switch: false,
  daily_ai_budget_pln: 50,
  max_posts_per_day_per_platform: 3,
  max_emails_per_recipient_per_week: 3,
  disabled_platforms: ["x"],
  max_consecutive_publish_failures: 3,
  cost_spike_factor: 3,
  double_opt_in: false,
  daily_report_hour: 19,
  weekly_report_dow: 1,
};

const ALWAYS_ALLOWED: AgentAction[] = ["report", "alarm"];
const DRAFT_ACTIONS: AgentAction[] = ["plan", "produce", "create_lead_magnet"];

export interface ActionContext {
  /** Koszt AI wydany dziś (PLN, z ai_growth_action_log.cost_pln). */
  spentTodayPln?: number;
  /** Szacowany koszt tej akcji (PLN). */
  estimatedCostPln?: number;
  platform?: string;
  /** Ile publikacji agent zrobił dziś na tej platformie. */
  postsTodayOnPlatform?: number;
  /** Ile maili agent wysłał temu odbiorcy w 7 dni. */
  emailsThisWeekToRecipient?: number;
  /** Miesięczny budżet reklam toru i wydane już środki. */
  adsBudgetPln?: number;
  adsSpentThisMonthPln?: number;
  adsCostPln?: number;
}

export interface ActionDecision {
  allowed: boolean;
  /** Dozwolone tylko jako szkic do przeglądu (manual_review). */
  draftOnly?: boolean;
  reason?: string;
}

export function isAgentPaused(s: AgentSettings): { paused: boolean; reason?: string } {
  if (s.kill_switch) {
    return {
      paused: true,
      reason: `Wyłącznik awaryjny${s.kill_switch_reason ? `: ${s.kill_switch_reason}` : ""}`,
    };
  }
  if (s.auto_paused_at) {
    return { paused: true, reason: `Automatyczna pauza: ${s.auto_pause_reason ?? "anomalia"}` };
  }
  return { paused: false };
}

export function isPlatformDisabled(
  s: Pick<AgentSettings, "disabled_platforms">,
  platform: string,
): boolean {
  const p = platform.toLowerCase();
  return s.disabled_platforms.some((d) => {
    const x = d.toLowerCase();
    // „youtube” wyłącza też „youtube_shorts”, „facebook” oba formaty FB itd.
    return p === x || p.startsWith(`${x}_`);
  });
}

export function canAgentAct(
  s: AgentSettings,
  action: AgentAction,
  ctx: ActionContext = {},
): ActionDecision {
  if (ALWAYS_ALLOWED.includes(action)) return { allowed: true };
  const pause = isAgentPaused(s);
  if (pause.paused) return { allowed: false, reason: pause.reason };
  if (s.mode === "off") return { allowed: false, reason: "Tryb agenta: off." };

  const cost = ctx.estimatedCostPln ?? 0;
  if (cost > 0 && (ctx.spentTodayPln ?? 0) + cost > s.daily_ai_budget_pln) {
    return {
      allowed: false,
      reason: `Dzienny budżet AI ${s.daily_ai_budget_pln} zł wyczerpany (wydano ${round2(ctx.spentTodayPln ?? 0)} zł).`,
    };
  }
  if (ctx.platform && isPlatformDisabled(s, ctx.platform)) {
    return {
      allowed: false,
      reason: `Platforma ${ctx.platform} jest wyłączona w ustawieniach agenta.`,
    };
  }
  if (
    action === "publish" &&
    ctx.postsTodayOnPlatform != null &&
    ctx.postsTodayOnPlatform >= s.max_posts_per_day_per_platform
  ) {
    return {
      allowed: false,
      reason: `Limit ${s.max_posts_per_day_per_platform} publikacji na dobę na platformę osiągnięty.`,
    };
  }
  if (
    action === "email" &&
    ctx.emailsThisWeekToRecipient != null &&
    ctx.emailsThisWeekToRecipient >= s.max_emails_per_recipient_per_week
  ) {
    return {
      allowed: false,
      reason: `Limit ${s.max_emails_per_recipient_per_week} maili tygodniowo na odbiorcę.`,
    };
  }
  if (action === "promote") {
    const budget = ctx.adsBudgetPln ?? 0;
    if (budget <= 0)
      return { allowed: false, reason: "Budżet reklam toru = 0 zł (podbicia wyłączone)." };
    if ((ctx.adsSpentThisMonthPln ?? 0) + (ctx.adsCostPln ?? 0) > budget) {
      return { allowed: false, reason: `Miesięczny budżet reklam toru ${budget} zł wyczerpany.` };
    }
    if (s.mode !== "full_autopilot") {
      return { allowed: false, reason: "Podbicia płatne tylko w trybie full_autopilot." };
    }
    return { allowed: true };
  }

  if (DRAFT_ACTIONS.includes(action)) return { allowed: true };
  if (s.mode === "manual_review") {
    return {
      allowed: false,
      draftOnly: true,
      reason: "Tryb manual_review: akcja czeka na przegląd.",
    };
  }
  return { allowed: true };
}

// ── Anomalie → automatyczna pauza ──────────────────────────────────────────

export interface AnomalyInput {
  /** Wyniki ostatnich publikacji AGENTA, od najnowszej. */
  recentPublishOutcomes: Array<"published" | "failed">;
  costTodayPln: number;
  /** Mediana dziennego kosztu z 7 dni (bez dziś). */
  costMedian7dPln: number;
  /** Sygnały platform (ostrzeżenie, usunięcie, ograniczenie zasięgu). */
  platformSignals: number;
  /** Udział odrzuceń w bramce compliance z 24 h (0–1) i liczba prób. */
  complianceRejectRate24h?: number;
  complianceChecks24h?: number;
}

export interface Anomaly {
  id: "publish_failures" | "cost_spike" | "platform_signal" | "compliance_quality";
  message: string;
}

export function detectAnomalies(s: AgentSettings, input: AnomalyInput): Anomaly[] {
  const out: Anomaly[] = [];
  let streak = 0;
  for (const o of input.recentPublishOutcomes) {
    if (o !== "failed") break;
    streak += 1;
  }
  if (streak >= s.max_consecutive_publish_failures) {
    out.push({ id: "publish_failures", message: `${streak} nieudane publikacje agenta z rzędu.` });
  }
  const floor = 5; // zł — poniżej szum
  if (
    input.costTodayPln > floor &&
    input.costMedian7dPln > 0 &&
    input.costTodayPln > input.costMedian7dPln * s.cost_spike_factor
  ) {
    out.push({
      id: "cost_spike",
      message: `Koszt AI dziś ${round2(input.costTodayPln)} zł > ${s.cost_spike_factor}× mediany 7 dni (${round2(input.costMedian7dPln)} zł).`,
    });
  }
  if (input.platformSignals > 0) {
    out.push({
      id: "platform_signal",
      message: `Sygnały platform: ${input.platformSignals} (ostrzeżenie/usunięcie/ograniczenie).`,
    });
  }
  if ((input.complianceChecks24h ?? 0) >= 5 && (input.complianceRejectRate24h ?? 0) > 0.6) {
    out.push({
      id: "compliance_quality",
      message: `Spadek jakości: ${Math.round((input.complianceRejectRate24h ?? 0) * 100)}% treści odrzuconych przez bramkę w 24 h.`,
    });
  }
  return out;
}

// ── Podział kadencji między tory (5.1) ─────────────────────────────────────

export interface TrackEconomics {
  /** Szacowana wartość leada (PLN) — z konwersji na wniosek / zakup. */
  leadValuePln: number;
  /** Koszt pozyskania leada (PLN); 0/brak = brak danych. */
  costPerLeadPln: number;
  leads: number;
}

/**
 * Nowy udział toru pożyczkobiorców (w %, reszta = inwestorzy). Zwrot
 * z leada = wartość / koszt; bez danych w obu torach zostaje bez zmian.
 * Zmiana maks. `maxStepPp` p.p. na tydzień, udział w granicach 20–80%.
 */
export function adjustCadenceShare(
  currentBorrowerSharePct: number,
  borrower: TrackEconomics,
  investor: TrackEconomics,
  opts: { maxStepPp?: number; min?: number; max?: number } = {},
): number {
  const step = opts.maxStepPp ?? 10;
  const min = opts.min ?? 20;
  const max = opts.max ?? 80;
  const roi = (t: TrackEconomics) =>
    t.leads > 0 && t.costPerLeadPln > 0 ? t.leadValuePln / t.costPerLeadPln : null;
  const rb = roi(borrower);
  const ri = roi(investor);
  if (rb == null || ri == null) return clamp(currentBorrowerSharePct, min, max);
  const target = (rb / (rb + ri)) * 100;
  const delta = clamp(target - currentBorrowerSharePct, -step, step);
  return round2(clamp(currentBorrowerSharePct + delta, min, max));
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
function round2(v: number) {
  return Math.round(v * 100) / 100;
}
