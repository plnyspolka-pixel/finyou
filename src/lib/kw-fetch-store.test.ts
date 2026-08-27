// Testy fetchAndStoreKw: nieudane odświeżenie NIE MOŻE zasłaniać wcześniej
// pobranej treści KW (regresja: rekord z treścią dostawał status "error"
// po 403 z limitu CMD i cały system przestawał pokazywać działy).
import { beforeEach, describe, expect, it, vi } from "vitest";

const db: { row: Record<string, any> | null; updates: Record<string, any>[] } = {
  row: null,
  updates: [],
};

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: db.row, error: null }) }),
      }),
      update: (patch: Record<string, any>) => ({
        eq: async () => {
          db.updates.push(patch);
          if (db.row) Object.assign(db.row, patch);
          return { error: null };
        },
      }),
      upsert: async (values: Record<string, any>) => {
        if (db.row) Object.assign(db.row, values);
        else db.row = { ...values };
        return { error: null };
      },
    }),
  },
}));

import { fetchAndStoreKw } from "./kw-fetch.server";

const QUOTA_403 =
  "Usage type: TECH_IN_ORDER limit exceeded, limit: 500, usageAfterRequest: 73, limitGroup: 500, usageAfterRequestGroup: 501";

beforeEach(() => {
  db.row = null;
  db.updates = [];
  process.env.CMD_KW_USER = "user";
  process.env.CMD_KW_PASSWORD = "pass";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(QUOTA_403, { status: 403 })),
  );
});

describe("fetchAndStoreKw — limit CMD a wcześniej pobrana treść", () => {
  it("rekord bez treści: błąd limitu zostawia status 'error'", async () => {
    const out = await fetchAndStoreKw("WA1W000409027");
    expect(out.ok).toBe(false);
    expect(out.status).toBe("error");
    expect(db.row?.status).toBe("error");
    expect(db.row?.last_error).toMatch(/limit/i);
  });

  it("wymuszone odświeżenie rekordu z treścią: po błędzie limitu status wraca do 'ready'", async () => {
    db.row = {
      kw_number: "WA1W000409027",
      status: "ready",
      fetched_at: "2026-08-27T00:48:00.000Z",
      ordered_at: "2026-08-27T00:47:00.000Z",
      last_error: null,
    };
    const out = await fetchAndStoreKw("WA1W000409027", { force: true });
    expect(out.ok).toBe(false); // odświeżenie się nie powiodło…
    expect(db.row.status).toBe("ready"); // …ale treść pozostaje widoczna
    expect(db.row.last_error).toMatch(/limit/i);
  });

  it("samonaprawa: rekord z treścią uwięziony w 'error' wraca do 'ready' bez pytania CMD", async () => {
    db.row = {
      kw_number: "WA1W000409027",
      status: "error",
      fetched_at: "2026-08-27T00:48:00.000Z",
      ordered_at: "2026-08-27T15:00:00.000Z",
      last_error: "Wyczerpany limit zapytań CMD KW Engine (limit grupowy konta).",
    };
    const out = await fetchAndStoreKw("WA1W000409027");
    expect(out).toMatchObject({ ok: true, status: "ready", cached: true });
    expect(db.row.status).toBe("ready");
    // Samonaprawa nie odpytuje CMD (nie zużywa limitu).
    expect(vi.mocked(fetch).mock.calls).toHaveLength(0);
  });
});
