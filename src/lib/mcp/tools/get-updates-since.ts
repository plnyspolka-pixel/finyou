import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, ok, fail, isAdmin } from "../_helpers";

const DEFAULT_LOOKBACK_MINUTES = 60;
const MAX_LOOKBACK_DAYS = 30;

export default defineTool({
  name: "get_updates_since",
  title: "What's new since",
  description:
    "Raport „co nowego” na Finance You od wskazanego momentu: nowe leady, nowe wnioski pożyczkowe, wiadomości przychodzące od klientów i inwestorów (e-mail, Messenger, czat, SMS, telefon), nowe oferty inwestorów, odpowiedzi instytucji finansujących i opłacone dostępy. Zwraca liczniki, listy z linkami do panelu oraz `next_since` do użycia przy kolejnym wywołaniu. Bez `since` bierze ostatnią godzinę. Tylko administrator/operator.",
  inputSchema: {
    since: z
      .string()
      .datetime({ offset: true })
      .optional()
      .describe("Początek okna (ISO 8601, np. 2026-09-21T10:00:00Z). Domyślnie 60 minut wstecz."),
    until: z
      .string()
      .datetime({ offset: true })
      .optional()
      .describe("Koniec okna (ISO 8601). Domyślnie teraz."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Maksymalna liczba pozycji na sekcję (domyślnie 20). Liczniki są zawsze pełne."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ since, until, limit }, ctx: ToolContext) => {
    try {
      requireAuth(ctx);
    } catch (e) {
      return fail((e as Error).message);
    }
    if (!(await isAdmin(ctx))) return fail("Wymagane uprawnienia administrator/operator");

    const untilDate = until ? new Date(until) : new Date();
    const sinceDate = since
      ? new Date(since)
      : new Date(untilDate.getTime() - DEFAULT_LOOKBACK_MINUTES * 60_000);
    const spanMs = untilDate.getTime() - sinceDate.getTime();
    if (spanMs <= 0) return fail("`since` musi być wcześniejsze niż `until`.");
    if (spanMs > MAX_LOOKBACK_DAYS * 86_400_000) {
      return fail(`Okno nie może być dłuższe niż ${MAX_LOOKBACK_DAYS} dni.`);
    }

    try {
      const { collectActivitySince, summarizeActivity } =
        await import("@/lib/activity-digest.server");
      const updates = await collectActivitySince({
        since: sinceDate,
        until: untilDate,
        limitPerSection: limit,
      });
      return ok({
        summary: summarizeActivity(updates),
        next_since: updates.until,
        ...updates,
      });
    } catch (e) {
      return fail((e as Error).message);
    }
  },
});
