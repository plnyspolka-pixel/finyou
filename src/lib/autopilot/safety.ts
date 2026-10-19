// Bezpieczniki autopilota (brief 5.8): tryb, wyłącznik awaryjny, limity
// i automatyczna pauza przy anomaliach. Limity są w kodzie + w
// ai_growth_settings.autopilot_limits (zapis przez właściciela) – agent ich
// nie podnosi sam. Czysty moduł – bez I/O.
import { z } from "zod";
import type { AutopilotMode, PublishPlatform, Track } from "./types";

export const autopilotLimitsSchema = z.object({
  /** Dzienny budżet AI (LLM, TTS, HeyGen, wideo-AI) – PLN. */
  dailyAiBudgetPln: z.number().min(0).max(1000),
  /** Minimum kredytów HeyGen, poniżej którego nie zlecamy renderów. */
  heygenMinRemainingCredits: z.number().min(0),
  /** Budżet podbić na tor i miesiąc (domyślnie 0 = podbicia wyłączone). */
  monthlyAdBudgetPln: z.object({ pozyczkobiorca: z.number().min(0), inwestor: z.number().min(0) }),
  /** Maks. publikacji na dobę na jedno konto/platformę. */
  maxPostsPerDayPerPlatform: z.number().int().min(0).max(20),
  /** Maks. maili marketingowych na odbiorcę na 7 dni. */
  maxEmailsPerRecipientPerWeek: z.number().int().min(0).max(14),
  /** Ile nieudanych publikacji z rzędu → automatyczna pauza. */
  maxConsecutivePublishFailures: z.number().int().min(1).max(50),
  /** Skok kosztu dziennego względem średniej 7 dni → pauza. */
  costSpikeFactor: z.number().min(1.5).max(20),
  /** Odsetek odrzuceń kontroli jakości (24 h) → pauza. */
  maxQcRejectRate: z.number().min(0).max(1),
});
export type AutopilotLimits = z.infer<typeof autopilotLimitsSchema>;

/** Wartości domyślne do czasu decyzji właściciela (brief p. 8.2). */
export const DEFAULT_LIMITS: AutopilotLimits = {
  dailyAiBudgetPln: 50,
  heygenMinRemainingCredits: 5,
  monthlyAdBudgetPln: { pozyczkobiorca: 0, inwestor: 0 },
  maxPostsPerDayPerPlatform: 3,
  maxEmailsPerRecipientPerWeek: 3,
  maxConsecutivePublishFailures: 5,
  costSpikeFactor: 3,
  maxQcRejectRate: 0.5,
};

export function resolveLimits(stored: unknown, dailyAiBudgetPln?: number | null): AutopilotLimits {
  const base: AutopilotLimits = {
    ...DEFAULT_LIMITS,
    ...(dailyAiBudgetPln != null && Number.isFinite(Number(dailyAiBudgetPln))
      ? { dailyAiBudgetPln: Number(dailyAiBudgetPln) }
      : {}),
  };
  const parsed = autopilotLimitsSchema.partial().safeParse(stored ?? {});
  if (!parsed.success) return base;
  return { ...base, ...parsed.data } as AutopilotLimits;
}

export interface AutopilotState {
  mode: AutopilotMode;
  paused: boolean;
  pausedReason?: string | null;
}

export interface AutopilotUsage {
  aiSpentTodayPln: number;
  aiSpentAvg7dPln: number;
  postsToday: Partial<Record<PublishPlatform, number>>;
  consecutivePublishFailures: number;
  heygenRemainingCredits: number | null;
  adSpentMonthPln: Record<Track, number>;
  /** Ostrzeżenia/usunięcia/ograniczenia zasięgu z platform w ostatnich 24 h. */
  platformWarnings24h: number;
  qcChecks24h: number;
  qcRejects24h: number;
}

export type ActionKind = "llm" | "produce_video" | "publish" | "boost" | "email";

export interface PlannedAction {
  kind: ActionKind;
  estCostPln?: number;
  platform?: PublishPlatform;
  track?: Track;
}

export interface GuardDecision {
  allowed: boolean;
  /** Akcja dozwolona, ale w trybie z przeglądem trafia jako szkic/propozycja. */
  asDraft: boolean;
  reasons: string[];
}

/**
 * Czy autopilot może wykonać akcję. Kolejność: wyłącznik → tryb → limity.
 *   off            – nic,
 *   manual_review  – tylko szkice (nic nie wychodzi na zewnątrz),
 *   semi_auto      – produkcja automatyczna, publikacja/podbicia/maile jako szkic,
 *   full_autopilot – wszystko w limitach.
 */
export function evaluateGuards(
  state: AutopilotState,
  limits: AutopilotLimits,
  usage: AutopilotUsage,
  action: PlannedAction,
): GuardDecision {
  const reasons: string[] = [];
  if (state.paused) {
    return {
      allowed: false,
      asDraft: false,
      reasons: [
        `Wyłącznik awaryjny włączony${state.pausedReason ? `: ${state.pausedReason}` : ""}.`,
      ],
    };
  }
  if (state.mode === "off")
    return { allowed: false, asDraft: false, reasons: ["Tryb autopilota: off."] };

  const cost = Math.max(0, action.estCostPln ?? 0);
  if (usage.aiSpentTodayPln + cost > limits.dailyAiBudgetPln + 1e-9 && action.kind !== "publish") {
    reasons.push(
      `Dzienny budżet AI wyczerpany (${usage.aiSpentTodayPln.toFixed(2)} + ${cost.toFixed(2)} > ${limits.dailyAiBudgetPln} zł).`,
    );
  }
  if (action.kind === "produce_video" && usage.heygenRemainingCredits != null) {
    if (usage.heygenRemainingCredits < limits.heygenMinRemainingCredits) {
      reasons.push(`Za mało kredytów HeyGen (${usage.heygenRemainingCredits}).`);
    }
  }
  if (action.kind === "publish" && action.platform) {
    const n = usage.postsToday[action.platform] ?? 0;
    if (n >= limits.maxPostsPerDayPerPlatform) {
      reasons.push(
        `Limit publikacji na dobę (${action.platform}: ${n}/${limits.maxPostsPerDayPerPlatform}).`,
      );
    }
  }
  if (action.kind === "boost") {
    if (!action.track) reasons.push("Podbicie bez toru.");
    else {
      const budget = limits.monthlyAdBudgetPln[action.track];
      if (budget <= 0) reasons.push(`Podbicia w torze ${action.track} wyłączone (budżet 0 zł).`);
      else if (usage.adSpentMonthPln[action.track] + cost > budget + 1e-9)
        reasons.push(`Miesięczny budżet reklam w torze ${action.track} wyczerpany.`);
    }
  }
  if (reasons.length) return { allowed: false, asDraft: false, reasons };

  const external = action.kind === "publish" || action.kind === "boost" || action.kind === "email";
  if (state.mode === "manual_review") {
    return {
      allowed: true,
      asDraft: true,
      reasons: ["Tryb manual_review: tylko szkic/propozycja."],
    };
  }
  if (state.mode === "semi_auto" && external) {
    return {
      allowed: true,
      asDraft: true,
      reasons: ["Tryb semi_auto: wyjście na zewnątrz jako szkic."],
    };
  }
  return { allowed: true, asDraft: false, reasons: [] };
}

export interface Anomaly {
  code: "publish_failures" | "cost_spike" | "platform_warning" | "qc_degradation";
  message: string;
}

/** Anomalie → automatyczna pauza modułu + SMS do właściciela. */
export function detectAnomalies(limits: AutopilotLimits, usage: AutopilotUsage): Anomaly[] {
  const out: Anomaly[] = [];
  if (usage.consecutivePublishFailures >= limits.maxConsecutivePublishFailures) {
    out.push({
      code: "publish_failures",
      message: `${usage.consecutivePublishFailures} nieudanych publikacji z rzędu.`,
    });
  }
  // Skok kosztów liczymy dopiero od sensownej kwoty (pierwsze dni bez historii).
  if (
    usage.aiSpentAvg7dPln > 1 &&
    usage.aiSpentTodayPln > usage.aiSpentAvg7dPln * limits.costSpikeFactor
  ) {
    out.push({
      code: "cost_spike",
      message: `Koszt AI dziś ${usage.aiSpentTodayPln.toFixed(2)} zł vs średnia ${usage.aiSpentAvg7dPln.toFixed(2)} zł.`,
    });
  }
  if (usage.platformWarnings24h > 0) {
    out.push({
      code: "platform_warning",
      message: `${usage.platformWarnings24h} sygnał(y) platform (ostrzeżenie/usunięcie/ograniczenie) w 24 h.`,
    });
  }
  if (usage.qcChecks24h >= 4 && usage.qcRejects24h / usage.qcChecks24h > limits.maxQcRejectRate) {
    out.push({
      code: "qc_degradation",
      message: `Kontrola jakości odrzuciła ${usage.qcRejects24h}/${usage.qcChecks24h} materiałów w 24 h.`,
    });
  }
  return out;
}
