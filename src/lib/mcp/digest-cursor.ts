/**
 * Kursor „co nowego” dla narzędzia MCP `get_updates_since`: znacznik końca
 * okna ostatniego raportu per użytkownik (`mcp_digest_cursors`). Bez `since`
 * kolejny raport zaczyna się od tego znacznika; jawne `since` / `until`
 * (zapytania historyczne) kursora nie przesuwają, chyba że wołający poda
 * `advance_cursor: true`.
 */

export const DEFAULT_FIRST_LOOKBACK_HOURS = 24;
export const MAX_LOOKBACK_DAYS = 30;

/** Skąd wziął się początek okna. */
export type SinceSource = "last_query" | "default" | "explicit";

export type DigestWindow = {
  since: Date;
  until: Date;
  since_source: SinceSource;
  /** Czy po udanym raporcie zapisać `until` jako nowy kursor. */
  advance_cursor: boolean;
  /** Kursor był starszy niż MAX_LOOKBACK_DAYS — okno przycięte. */
  clamped: boolean;
};

/**
 * Wybór okna raportu. Zwraca `{ error }`, gdy jawnie podane granice są
 * niepoprawne (puste okno albo dłuższe niż MAX_LOOKBACK_DAYS).
 */
export function resolveDigestWindow(args: {
  since?: string;
  until?: string;
  advanceCursor?: boolean;
  /** `last_until` z `mcp_digest_cursors` albo null, gdy to pierwsze odpytanie. */
  cursor: Date | string | null;
  now?: Date;
}): DigestWindow | { error: string } {
  const until = args.until ? new Date(args.until) : (args.now ?? new Date());
  const explicit = Boolean(args.since || args.until);
  const advance = args.advanceCursor ?? !explicit;
  const maxSpanMs = MAX_LOOKBACK_DAYS * 86_400_000;

  if (args.since) {
    const since = new Date(args.since);
    const spanMs = until.getTime() - since.getTime();
    if (spanMs <= 0) return { error: "`since` musi być wcześniejsze niż `until`." };
    if (spanMs > maxSpanMs)
      return { error: `Okno nie może być dłuższe niż ${MAX_LOOKBACK_DAYS} dni.` };
    return { since, until, since_source: "explicit", advance_cursor: advance, clamped: false };
  }

  const cursor = args.cursor ? new Date(args.cursor) : null;
  if (cursor && !Number.isNaN(cursor.getTime())) {
    let since = cursor;
    let clamped = false;
    if (until.getTime() - since.getTime() > maxSpanMs) {
      since = new Date(until.getTime() - maxSpanMs);
      clamped = true;
    }
    // Kursor równy końcowi okna (albo późniejszy — np. przy jawnym `until`
    // z przeszłości): puste okno zamiast błędu.
    if (since.getTime() >= until.getTime()) since = new Date(until.getTime() - 1);
    return { since, until, since_source: "last_query", advance_cursor: advance, clamped };
  }

  return {
    since: new Date(until.getTime() - DEFAULT_FIRST_LOOKBACK_HOURS * 3_600_000),
    until,
    since_source: "default",
    advance_cursor: advance,
    clamped: false,
  };
}

/** Czytelna etykieta chwili w strefie Polski, np. „wt. 20.10 10:58”. */
export function formatWarsaw(d: Date): string {
  const parts = new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("weekday")} ${get("day")}.${get("month")} ${get("hour")}:${get("minute")}`;
}

/** Jedno zdanie dla asystenta: od kiedy liczony jest raport. */
export function describeSince(w: DigestWindow, cursorUnavailable = false): string {
  const at = formatWarsaw(w.since);
  if (w.since_source === "default" && cursorUnavailable) {
    return `Nie udało się odczytać Twojego ostatniego odpytania — raport z ostatnich ${DEFAULT_FIRST_LOOKBACK_HOURS} h (od ${at}).`;
  }
  switch (w.since_source) {
    case "last_query":
      return w.clamped
        ? `Od Twojego ostatniego pytania minęło ponad ${MAX_LOOKBACK_DAYS} dni — raport obejmuje ostatnie ${MAX_LOOKBACK_DAYS} dni (od ${at}).`
        : `Od Twojego ostatniego pytania (${at}).`;
    case "default":
      return `To Twoje pierwsze odpytanie przez MCP — raport z ostatnich ${DEFAULT_FIRST_LOOKBACK_HOURS} h (od ${at}).`;
    case "explicit":
      return `Od wskazanego momentu (${at}).`;
  }
}

/** Minimalny podzbiór klienta Supabase — łatwy do podstawienia w testach. */
export type CursorDb = { from: (table: string) => any };

export async function readDigestCursor(db: CursorDb, userId: string): Promise<string | null> {
  const { data, error } = await db
    .from("mcp_digest_cursors")
    .select("last_until")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`mcp_digest_cursors: ${error.message}`);
  return (data?.last_until as string | undefined) ?? null;
}

export async function writeDigestCursor(
  db: CursorDb,
  userId: string,
  until: string,
): Promise<void> {
  const { error } = await db
    .from("mcp_digest_cursors")
    .upsert(
      { user_id: userId, last_until: until, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) throw new Error(`mcp_digest_cursors: ${error.message}`);
}
