/**
 * Modele Anthropica dopuszczone dla asystenta panelu. Osobny, „czysty" moduł
 * (bez `createServerFn`), żeby lista dała się bezpiecznie importować zarówno
 * w walidacji serwerowej, jak i w selekcie ustawień po stronie klienta.
 */
export const AI_ADMIN_MODEL_IDS = [
  "claude-opus-4-5",
  "claude-sonnet-4-5",
  "claude-haiku-4-5",
  "claude-3-7-sonnet-latest",
  "claude-3-5-sonnet-latest",
  "claude-3-5-haiku-latest",
] as const;

export type AiAdminModelId = (typeof AI_ADMIN_MODEL_IDS)[number];

const MODEL_LABELS: Record<AiAdminModelId, string> = {
  "claude-opus-4-5": "Claude Opus 4.5 — najmocniejszy",
  "claude-sonnet-4-5": "Claude Sonnet 4.5 — szybki, do pracy dziennej",
  "claude-haiku-4-5": "Claude Haiku 4.5 — najtańszy",
  "claude-3-7-sonnet-latest": "Claude 3.7 Sonnet",
  "claude-3-5-sonnet-latest": "Claude 3.5 Sonnet",
  "claude-3-5-haiku-latest": "Claude 3.5 Haiku",
};

/** Pozycje selecta modelu — kolejność jak w `AI_ADMIN_MODEL_IDS`. */
export const AI_ADMIN_MODELS: Array<{ id: AiAdminModelId; label: string }> =
  AI_ADMIN_MODEL_IDS.map((id) => ({ id, label: MODEL_LABELS[id] }));
