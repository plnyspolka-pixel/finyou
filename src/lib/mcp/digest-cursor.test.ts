import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "@lovable.dev/mcp-js";
import {
  DEFAULT_FIRST_LOOKBACK_HOURS,
  MAX_LOOKBACK_DAYS,
  describeSince,
  resolveDigestWindow,
  type DigestWindow,
} from "./digest-cursor";

const NOW = new Date("2026-10-20T09:00:00Z");

function win(args: Parameters<typeof resolveDigestWindow>[0]): DigestWindow {
  const w = resolveDigestWindow({ now: NOW, ...args });
  if ("error" in w) throw new Error(w.error);
  return w;
}

describe("resolveDigestWindow", () => {
  it("bez `since` zaczyna od ostatniego odpytania i przesuwa kursor", () => {
    const w = win({ cursor: "2026-10-20T08:58:00Z" });
    expect(w.since.toISOString()).toBe("2026-10-20T08:58:00.000Z");
    expect(w.until).toEqual(NOW);
    expect(w.since_source).toBe("last_query");
    expect(w.advance_cursor).toBe(true);
    expect(w.clamped).toBe(false);
  });

  it(`pierwsze odpytanie (brak kursora) bierze ${DEFAULT_FIRST_LOOKBACK_HOURS} h`, () => {
    const w = win({ cursor: null });
    expect(w.since_source).toBe("default");
    expect(NOW.getTime() - w.since.getTime()).toBe(DEFAULT_FIRST_LOOKBACK_HOURS * 3_600_000);
    expect(w.advance_cursor).toBe(true);
    expect(describeSince(w)).toContain("pierwsze odpytanie");
  });

  it("jawne `since` ma pierwszeństwo przed kursorem i nie przesuwa kursora", () => {
    const w = win({ since: "2026-10-13T00:00:00Z", cursor: "2026-10-20T08:58:00Z" });
    expect(w.since.toISOString()).toBe("2026-10-13T00:00:00.000Z");
    expect(w.since_source).toBe("explicit");
    expect(w.advance_cursor).toBe(false);
  });

  it("samo jawne `until` też nie przesuwa kursora", () => {
    const w = win({ until: "2026-10-19T12:00:00Z", cursor: "2026-10-19T08:00:00Z" });
    expect(w.since_source).toBe("last_query");
    expect(w.advance_cursor).toBe(false);
  });

  it("`advance_cursor: true` pozwala przesunąć kursor przy jawnym oknie", () => {
    const w = win({ since: "2026-10-19T00:00:00Z", advanceCursor: true, cursor: null });
    expect(w.advance_cursor).toBe(true);
  });

  it("`advance_cursor: false` blokuje przesunięcie przy zwykłym pytaniu", () => {
    const w = win({ advanceCursor: false, cursor: "2026-10-20T08:00:00Z" });
    expect(w.advance_cursor).toBe(false);
  });

  it(`kursor starszy niż ${MAX_LOOKBACK_DAYS} dni przycina okno zamiast błędu`, () => {
    const w = win({ cursor: "2026-01-01T00:00:00Z" });
    expect(w.clamped).toBe(true);
    expect(NOW.getTime() - w.since.getTime()).toBe(MAX_LOOKBACK_DAYS * 86_400_000);
  });

  it("kursor równy `until` daje puste okno, nie błąd", () => {
    const w = win({ cursor: NOW.toISOString() });
    expect(w.since.getTime()).toBeLessThan(w.until.getTime());
  });

  it("odrzuca niepoprawne jawne okno", () => {
    expect(resolveDigestWindow({ since: "2026-10-21T00:00:00Z", cursor: null, now: NOW })).toEqual({
      error: "`since` musi być wcześniejsze niż `until`.",
    });
    expect(
      resolveDigestWindow({ since: "2026-01-01T00:00:00Z", cursor: null, now: NOW }),
    ).toHaveProperty("error");
  });

  it("etykieta podaje moment ostatniego pytania w czasie polskim", () => {
    const w = win({ cursor: "2026-10-20T08:58:00Z" });
    expect(describeSince(w)).toBe("Od Twojego ostatniego pytania (wt. 20.10 10:58).");
  });
});

// --- Narzędzie MCP: kursor czytany/zapisywany tylko wtedy, kiedy trzeba ---

const cursorDb = vi.hoisted(() => ({
  lastUntil: null as string | null,
  upserts: [] as Array<Record<string, unknown>>,
}));

vi.mock("./_helpers", async (orig) => {
  const actual = await orig<typeof import("./_helpers")>();
  return {
    ...actual,
    isAdmin: async () => true,
    userClient: () => ({
      from: (table: string) => {
        expect(table).toBe("mcp_digest_cursors");
        const q: any = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () => ({
            data: cursorDb.lastUntil ? { last_until: cursorDb.lastUntil } : null,
            error: null,
          }),
          upsert: async (row: Record<string, unknown>) => {
            cursorDb.upserts.push(row);
            cursorDb.lastUntil = row.last_until as string;
            return { error: null };
          },
        };
        return q;
      },
    }),
  };
});

vi.mock("@/lib/activity-digest.server", () => ({
  collectActivitySince: async (a: { since: Date; until: Date }) => ({
    since: a.since.toISOString(),
    until: a.until.toISOString(),
    total: 0,
    counts: {},
    truncated: [],
    errors: [],
    leads: [],
    applications: [],
    inbound_messages: [],
    investor_offers: [],
    institution_replies: [],
    payments: [],
  }),
  summarizeActivity: () => "Brak nowości.",
}));

const USER = "00000000-0000-0000-0000-000000000001";
const ctx = {
  isAuthenticated: () => true,
  getToken: () => "test-token",
  getUserId: () => USER,
} as unknown as ToolContext;

async function callTool(args: Record<string, unknown>) {
  const { default: tool } = await import("./tools/get-updates-since");
  const r = (await (tool as any).handler(args, ctx)) as {
    isError?: boolean;
    structuredContent: Record<string, any>;
  };
  expect(r.isError).toBeFalsy();
  return r.structuredContent;
}

describe("get_updates_since — kursor", () => {
  beforeEach(() => {
    cursorDb.lastUntil = null;
    cursorDb.upserts = [];
  });

  it("pierwsze wywołanie: okno domyślne, zapisuje `until` jako kursor", async () => {
    const out = await callTool({});
    expect(out.since_source).toBe("default");
    expect(out.first_query).toBe(true);
    expect(out.cursor_advanced).toBe(true);
    expect(cursorDb.upserts).toHaveLength(1);
    expect(cursorDb.upserts[0]).toMatchObject({ user_id: USER, last_until: out.until });
  });

  it("kolejne wywołanie zaczyna od zapisanego kursora", async () => {
    cursorDb.lastUntil = "2026-10-19T08:58:00.000Z";
    const out = await callTool({});
    expect(out.since).toBe("2026-10-19T08:58:00.000Z");
    expect(out.since_source).toBe("last_query");
    expect(out.previous_query_at).toBe("2026-10-19T08:58:00.000Z");
    expect(cursorDb.lastUntil).toBe(out.until);
  });

  it("zapytanie z jawnym `since` nie przesuwa kursora", async () => {
    cursorDb.lastUntil = "2026-10-19T08:58:00.000Z";
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const out = await callTool({ since });
    expect(out.since_source).toBe("explicit");
    expect(out.cursor_advanced).toBe(false);
    expect(cursorDb.upserts).toHaveLength(0);
    expect(cursorDb.lastUntil).toBe("2026-10-19T08:58:00.000Z");
  });

  it("jawne `since` z `advance_cursor: true` przesuwa kursor", async () => {
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const out = await callTool({ since, advance_cursor: true });
    expect(out.cursor_advanced).toBe(true);
    expect(cursorDb.upserts).toHaveLength(1);
  });
});
