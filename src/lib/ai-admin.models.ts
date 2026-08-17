/**
 * Modele Anthropica dopuszczone dla asystenta panelu.
 *
 * Osobny, „czysty" moduł (bez `createServerFn`), żeby lista dała się bezpiecznie
 * importować i w walidacji serwerowej, i w selekcie ustawień po stronie klienta.
 *
 * Poza etykietami trzymamy tu dwie różnice API, które przy złym ustawieniu
 * wywalają całą rozmowę:
 *
 *  1. `rejectsSamplingParams` — najnowsze modele (rodzina Claude 5 i Opus 4.7/4.8)
 *     ODRZUCAJĄ `temperature` / `top_p` / `top_k` błędem 400. Dla nich
 *     `callAnthropic` nie wysyła `temperature` (patrz `ai-admin.server.ts`).
 *  2. `thinkingByDefault` — tam myślenie modelu jest włączone domyślnie, a
 *     `max_tokens` obejmuje myślenie RAZEM z odpowiedzią. Za mały limit tokenów
 *     obcina odpowiedź w połowie, więc UI ostrzega o zbyt niskiej wartości.
 *
 * Modele wycofane (`claude-3-5-*`, `claude-3-7-*`) są tu świadomie nieobecne —
 * API zwraca dla nich 404. Migracja `20260811120000_ai_admin_model_refresh.sql`
 * przepisuje takie wartości z bazy na model domyślny.
 */

export const AI_ADMIN_MODEL_IDS = [
  "claude-opus-5",
  "claude-sonnet-5",
  "claude-opus-4-8",
  "claude-opus-4-5",
  "claude-sonnet-4-5",
  "claude-haiku-4-5",
] as const;

export type AiAdminModelId = (typeof AI_ADMIN_MODEL_IDS)[number];

/** Model domyślny — ten sam, co DEFAULT kolumny `ai_admin_settings.model`. */
export const AI_ADMIN_DEFAULT_MODEL: AiAdminModelId = "claude-opus-5";

export type AiAdminModel = {
  id: AiAdminModelId;
  label: string;
  /** Odrzuca `temperature` / `top_p` / `top_k` (HTTP 400) — nie wysyłamy ich. */
  rejectsSamplingParams: boolean;
  /** Myślenie włączone domyślnie; `max_tokens` = myślenie + odpowiedź. */
  thinkingByDefault: boolean;
};

const MODEL_META: Record<AiAdminModelId, Omit<AiAdminModel, "id">> = {
  "claude-opus-5": {
    label: "Claude Opus 5 — najmocniejszy (zalecany)",
    rejectsSamplingParams: true,
    thinkingByDefault: true,
  },
  "claude-sonnet-5": {
    label: "Claude Sonnet 5 — szybki, blisko Opusa",
    rejectsSamplingParams: true,
    thinkingByDefault: true,
  },
  "claude-opus-4-8": {
    label: "Claude Opus 4.8 — poprzedni Opus",
    rejectsSamplingParams: true,
    thinkingByDefault: false,
  },
  "claude-opus-4-5": {
    label: "Claude Opus 4.5 — starszy, przyjmuje temperaturę",
    rejectsSamplingParams: false,
    thinkingByDefault: false,
  },
  "claude-sonnet-4-5": {
    label: "Claude Sonnet 4.5 — starszy, tańszy",
    rejectsSamplingParams: false,
    thinkingByDefault: false,
  },
  "claude-haiku-4-5": {
    label: "Claude Haiku 4.5 — najtańszy (używany też do destylacji pamięci)",
    rejectsSamplingParams: false,
    thinkingByDefault: false,
  },
};

/** Pozycje selecta modelu — kolejność jak w `AI_ADMIN_MODEL_IDS`. */
export const AI_ADMIN_MODELS: AiAdminModel[] = AI_ADMIN_MODEL_IDS.map((id) => ({
  id,
  ...MODEL_META[id],
}));

/**
 * Rodziny modeli, które odrzucają parametry próbkowania. Regex zamiast samej
 * mapy, bo w bazie może siedzieć model spoza listy (np. wpisany ręcznie SQL-em)
 * — wtedy lepiej pominąć `temperature` niż dostać 400 na całą rozmowę.
 */
const REJECTS_SAMPLING_RE = /^claude-(opus-5|opus-4-[78]|sonnet-5|fable-5|mythos-5)/i;

/** Czy dla tego modelu wolno wysłać `temperature`. */
export function modelRejectsSamplingParams(model: string): boolean {
  const known = MODEL_META[model as AiAdminModelId];
  if (known) return known.rejectsSamplingParams;
  return REJECTS_SAMPLING_RE.test(model);
}

/** Czy model myśli domyślnie (myślenie wchodzi w `max_tokens`). */
export function modelThinksByDefault(model: string): boolean {
  const known = MODEL_META[model as AiAdminModelId];
  if (known) return known.thinkingByDefault;
  return /^claude-(opus-5|sonnet-5|fable-5|mythos-5)/i.test(model);
}

/**
 * Zalecane minimum `max_tokens` dla modeli myślących domyślnie — myślenie i
 * odpowiedź dzielą ten sam budżet, więc ciasny limit ucina odpowiedź.
 */
export const THINKING_MODEL_MIN_MAX_TOKENS = 8000;
