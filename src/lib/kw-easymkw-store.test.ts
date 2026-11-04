// Regresja (Ornontowice, KA1M/00064553/1): pipeline złożył DRUGIE zamówienie
// tej samej księgi, gdy pierwsze zadanie EasyMKW jeszcze trwało. EasyMKW
// odrzucił duplikat („Brak unikalności - nie udało się zapisać danych"),
// rekord trafił w „error", a limit zamówień księgi się wyczerpał.
import { beforeEach, describe, expect, it, vi } from "vitest";

const db: { row: Record<string, any> | null; rpcCalls: number } = { row: null, rpcCalls: 0 };

function chain(patch: Record<string, any>) {
  const apply = () => {
    if (db.row) Object.assign(db.row, patch);
    return { error: null };
  };
  const c: any = {
    eq: () => c,
    neq: (col: string, val: unknown) => {
      if (db.row && db.row[col] === val) return { then: (r: any) => r({ error: null }) };
      return { then: (r: any) => r(apply()) };
    },
    then: (r: any) => r(apply()),
  };
  return c;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: db.row, error: null }) }),
      }),
      update: (patch: Record<string, any>) => chain(patch),
    }),
    rpc: async () => {
      db.rpcCalls += 1;
      return { data: { granted: true }, error: null };
    },
  },
}));

const easy = vi.hoisted(() => ({
  jobs: [] as any[],
  orderResult: { ok: true, status: 200, data: { id: "order-2" } } as any,
  orders: 0,
}));

vi.mock("@/lib/easymkw.server", () => ({
  hasEasyMkwConfig: () => true,
  easyMkwJobsForKw: async () => ({ ok: true, status: 200, data: { jobs: easy.jobs } }),
  easyMkwJobJson: async () => ({ ok: true, status: 200, data: {} }),
  easyMkwOrderContent: async () => {
    easy.orders += 1;
    return easy.orderResult;
  },
}));

vi.mock("@/lib/kw-render", () => ({
  renderKwSections: () => ({
    dzial_1o: "<p>1o</p>",
    dzial_1s: null,
    dzial_2: "<p>2</p>",
    dzial_3: null,
    dzial_4: null,
  }),
}));
vi.mock("@/lib/kw-easymkw-map", () => ({
  easyMkwJsonToExtraction: () => ({}),
  easyMkwStanZDnia: () => null,
}));

import { fetchAndStoreKwEasyMkw, isEasyMkwDuplicateError } from "./kw-easymkw.server";

const KW = "KA1M000645531";

beforeEach(() => {
  db.row = null;
  db.rpcCalls = 0;
  easy.jobs = [];
  easy.orders = 0;
  easy.orderResult = { ok: true, status: 200, data: { id: "order-2" } };
});

describe("fetchAndStoreKwEasyMkw — bez podwójnych zamówień", () => {
  it("zadanie w toku → processing, bez nowego zamówienia", async () => {
    db.row = { kw_number: KW, status: "processing", easymkw_job_id: "job-1" };
    easy.jobs = [{ id: "job-1", orderId: "order-1", stepNumber: 0, status: "STARTED", kw: KW }];
    const out = await fetchAndStoreKwEasyMkw(KW, { pollMaxMs: 0 });
    expect(out.status).toBe("processing");
    expect(easy.orders).toBe(0);
    expect(db.rpcCalls).toBe(0);
  });

  it("rekord w 'error' z zadaniem w toku wraca do 'processing' (cron go dopyta)", async () => {
    db.row = { kw_number: KW, status: "error", easymkw_job_id: "job-1", last_error: "x" };
    easy.jobs = [{ id: "job-1", orderId: "order-1", stepNumber: 0, status: "PLANNED", kw: KW }];
    const out = await fetchAndStoreKwEasyMkw(KW, { pollMaxMs: 0 });
    expect(out.status).toBe("processing");
    expect(db.row.status).toBe("processing");
    expect(easy.orders).toBe(0);
  });

  it("zakończone zadanie → treść zapisana, bez nowego zamówienia", async () => {
    db.row = { kw_number: KW, status: "error", easymkw_job_id: "job-1" };
    easy.jobs = [{ id: "job-1", orderId: "order-1", stepNumber: 0, status: "FINISHED", kw: KW }];
    const out = await fetchAndStoreKwEasyMkw(KW, { pollMaxMs: 0 });
    expect(out.ok).toBe(true);
    expect(db.row.status).toBe("ready");
    expect(easy.orders).toBe(0);
  });

  it("„Brak unikalności” przy zamówieniu nie jest błędem pobrania", async () => {
    db.row = { kw_number: KW, status: "processing", easymkw_job_id: null };
    easy.orderResult = {
      ok: false,
      status: 400,
      error: "Brak unikalności - nie udało się zapisać danych",
    };
    easy.jobs = [{ id: "job-1", orderId: "order-1", stepNumber: 0, status: "STARTED", kw: KW }];
    const out = await fetchAndStoreKwEasyMkw(KW, { pollMaxMs: 0 });
    expect(out.status).toBe("processing");
    expect(out.error).toBeUndefined();
    expect(db.row.status).toBe("processing");
    expect(db.row.last_error).toBeNull();
  });

  it("rozpoznaje komunikat duplikatu EasyMKW", () => {
    expect(isEasyMkwDuplicateError("Brak unikalności - nie udało się zapisać danych")).toBe(true);
    expect(isEasyMkwDuplicateError("HTTP 500")).toBe(false);
  });
});
