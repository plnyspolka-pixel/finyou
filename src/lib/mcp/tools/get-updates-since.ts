import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, ok, fail, isAdmin, userClient, actorId } from "../_helpers";
import {
  DEFAULT_FIRST_LOOKBACK_HOURS,
  describeSince,
  readDigestCursor,
  resolveDigestWindow,
  writeDigestCursor,
} from "../digest-cursor";

export default defineTool({
  name: "get_updates_since",
  title: "What's new since",
  description: `Raport „co nowego” na Finance You: nowe leady, nowe wnioski pożyczkowe, wiadomości przychodzące od klientów i inwestorów (e-mail, Messenger, czat, SMS, telefon), nowe oferty inwestorów, odpowiedzi instytucji finansujących i opłacone dostępy. Bez \`since\` raport liczy się od ostatniego odpytania tego użytkownika przez MCP (serwer pamięta znacznik; przy pierwszym odpytaniu bierze ostatnie ${DEFAULT_FIRST_LOOKBACK_HOURS} h) i przesuwa znacznik na koniec okna. Jawne \`since\` / \`until\` to zapytanie historyczne — nie przesuwa znacznika (chyba że \`advance_cursor: true\`). Zwraca liczniki, listy z linkami do panelu, \`since\`, \`since_source\` (\`last_query\` / \`default\` / \`explicit\`) i \`since_label\` — powiedz użytkownikowi, od kiedy liczony jest raport (np. „od Twojego ostatniego pytania, wt. 10:58”). Tylko administrator/operator.`,
  inputSchema: {
    since: z
      .string()
      .datetime({ offset: true })
      .optional()
      .describe(
        "Początek okna (ISO 8601, np. 2026-09-21T10:00:00Z) — tylko dla pytań o konkretny okres („od tygodnia”, „od 9:00”). Pomiń, by dostać nowości od ostatniego odpytania.",
      ),
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
    advance_cursor: z
      .boolean()
      .optional()
      .describe(
        "Czy po raporcie zapamiętać `until` jako moment ostatniego odpytania. Domyślnie true bez `since`/`until`, false przy jawnym oknie.",
      ),
  },
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: false },
  handler: async ({ since, until, limit, advance_cursor }, ctx: ToolContext) => {
    try {
      requireAuth(ctx);
    } catch (e) {
      return fail((e as Error).message);
    }
    if (!(await isAdmin(ctx))) return fail("Wymagane uprawnienia administrator/operator");

    let userId: string;
    try {
      userId = actorId(ctx);
    } catch (e) {
      return fail((e as Error).message);
    }
    const db = userClient(ctx);

    // Kursor jest potrzebny tylko bez jawnego `since`. Błąd odczytu nie blokuje
    // raportu — wtedy okno domyślne i informacja w `cursor_error`.
    let cursor: string | null = null;
    let cursorError: string | undefined;
    if (!since) {
      try {
        cursor = await readDigestCursor(db, userId);
      } catch (e) {
        cursorError = (e as Error).message;
      }
    }

    const window = resolveDigestWindow({ since, until, advanceCursor: advance_cursor, cursor });
    if ("error" in window) return fail(window.error);

    try {
      const { collectActivitySince, summarizeActivity } =
        await import("@/lib/activity-digest.server");
      const updates = await collectActivitySince({
        since: window.since,
        until: window.until,
        limitPerSection: limit,
      });

      let cursorAdvanced = false;
      if (window.advance_cursor && !cursorError) {
        try {
          await writeDigestCursor(db, userId, updates.until);
          cursorAdvanced = true;
        } catch (e) {
          cursorError = (e as Error).message;
        }
      }

      return ok({
        summary: summarizeActivity(updates),
        since_source: window.since_source,
        since_label: describeSince(window, Boolean(cursorError)),
        first_query: window.since_source === "default" && !cursorError,
        previous_query_at: cursor,
        cursor_advanced: cursorAdvanced,
        ...(cursorError ? { cursor_error: cursorError } : {}),
        next_since: updates.until,
        ...updates,
      });
    } catch (e) {
      return fail((e as Error).message);
    }
  },
});
