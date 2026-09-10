// Testy runMetaAdsSync (cron tick kampanii Meta): tick ma dowieźć tyle, ile
// się da. Błąd jednego konta (albo samej listy kont) nie może przerwać
// synchronizacji pozostałych — inaczej jedno zepsute konto zamraża budżety
// i statusy wszystkich kampanii w panelu.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;

const db: {
  accounts: Row[];
  campaigns: Row[];
  syncLog: Row[];
} = { accounts: [], campaigns: [], syncLog: [] };

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: (_cols?: string) => ({
        eq: (_col: string, val: string) => ({
          single: async () => ({
            data: db.accounts.find((a) => a.id === val) ?? null,
            error: null,
          }),
        }),
        neq: async () => ({ data: db.accounts.filter((a) => a.is_active !== false), error: null }),
      }),
      insert: (values: Row) => ({
        select: () => ({
          single: async () => {
            const row = { id: `log-${db.syncLog.length + 1}`, ...values };
            db.syncLog.push(row);
            return { data: row, error: null };
          },
        }),
      }),
      update: (patch: Row) => ({
        eq: async (_col: string, val: string) => {
          const row = db.syncLog.find((l) => l.id === val);
          if (row) Object.assign(row, patch);
          return { error: null };
        },
      }),
      upsert: async (values: Row) => {
        if (table === "meta_campaigns") db.campaigns.push(values);
        if (table === "meta_ad_accounts") db.accounts.push(values);
        return { error: null };
      },
    }),
  },
}));

import { runMetaAdsSync } from "./meta-ads.server";

function graphResponse(url: string): Response {
  // Konto 111 odpowiada poprawnie, konto 222 zwraca błąd uprawnień.
  if (url.includes("/act_222/campaigns")) {
    return new Response(JSON.stringify({ error: { code: 200, message: "Brak uprawnień" } }), {
      status: 403,
    });
  }
  if (url.includes("/act_111/campaigns")) {
    return Response.json({
      data: [
        {
          id: "120251302544100023",
          name: "FY — kwalifikacja 09.2026",
          objective: "OUTCOME_LEADS",
          status: "ACTIVE",
          daily_budget: "5000",
          insights: {
            data: [
              {
                spend: "123.45",
                impressions: "1000",
                clicks: "50",
                ctr: "5",
                cpc: "2.47",
                actions: [{ action_type: "lead", value: "7" }],
                cost_per_action_type: [{ action_type: "lead", value: "17.63" }],
              },
            ],
          },
        },
      ],
    });
  }
  // /me/adaccounts
  return Response.json({ data: [] });
}

beforeEach(() => {
  db.accounts = [
    { id: "acc-1", meta_account_id: "111", name: "Konto OK", is_active: true },
    { id: "acc-2", meta_account_id: "222", name: "Konto bez uprawnień", is_active: true },
  ];
  db.campaigns = [];
  db.syncLog = [];
  process.env.META_ACCESS_TOKEN = "test-token";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => graphResponse(String(url))),
  );
});

describe("runMetaAdsSync", () => {
  it("zapisuje kampanie konta, które odpowiada, i raportuje błąd drugiego konta", async () => {
    const out = await runMetaAdsSync();

    expect(out.campaigns).toBe(1);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0]).toContain("Konto bez uprawnień");

    const saved = db.campaigns.find((c) => c.meta_campaign_id === "120251302544100023");
    expect(saved).toBeTruthy();
    // Budżet z Meta przychodzi w groszach — zapisujemy w złotówkach.
    expect(saved?.daily_budget).toBe(50);
    expect(saved?.status).toBe("ACTIVE");
    expect(saved?.leads_count).toBe(7);
    expect(saved?.cost_per_lead).toBe(17.63);
    expect(saved?.last_synced_at).toBeTruthy();
  });

  it("nieudane konto zostawia w meta_sync_log wpis 'error', udane — 'success'", async () => {
    await runMetaAdsSync();

    const campaignLogs = db.syncLog.filter((l) => l.sync_type === "campaigns");
    expect(campaignLogs.map((l) => l.status).sort()).toEqual(["error", "success"]);
    expect(campaignLogs.every((l) => Boolean(l.finished_at))).toBe(true);
  });

  it("brak tokenu nie rzuca wyjątkiem — tick raportuje błędy w podsumowaniu", async () => {
    delete process.env.META_ACCESS_TOKEN;

    const out = await runMetaAdsSync();

    expect(out.accounts).toBe(0);
    expect(out.campaigns).toBe(0);
    // Lista kont + oba konta reklamowe.
    expect(out.errors).toHaveLength(3);
    expect(out.errors.join(" ")).toContain("META_ACCESS_TOKEN");
  });
});
