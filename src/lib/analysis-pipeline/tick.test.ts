import { describe, expect, it } from "vitest";
import { TICK_BUDGET_MS } from "./step-timing";
import { runAnalysisPipelineTick } from "./tick";

const at = (m: number) => () => Date.UTC(2026, 9, 11, 10, m, 0);

function recorder(fail: Partial<Record<"kw" | "sync" | "proc", boolean>> = {}) {
  const calls: string[] = [];
  const deadlines: number[] = [];
  return {
    calls,
    deadlines,
    steps: {
      processInvestorKwChecks: async ({ deadline }: { deadline: number }) => {
        calls.push("kwChecks");
        deadlines.push(deadline);
        if (fail.kw) throw new Error("kw boom");
        return { processed: 2 };
      },
      syncAnalysisPipelineRuns: async () => {
        calls.push("sync");
        if (fail.sync) throw new Error("sync boom");
        return { scanned: 1, started: 1, skipped_existing: 0 };
      },
      processAnalysisPipelineRuns: async ({ deadline }: { deadline: number }) => {
        calls.push("processing");
        deadlines.push(deadline);
        if (fail.proc) throw new Error("proc boom");
        return { processed: 1, finished: 1, waiting: 0, errors: 0 };
      },
    },
  };
}

describe("cron tick analysis-pipeline-tick", () => {
  it("najpierw analizy KW inwestorów, potem kwalifikacja i przebiegi — wspólny budżet", async () => {
    const r = recorder();
    const res = await runAnalysisPipelineTick(r.steps, at(15));
    expect(r.calls).toEqual(["kwChecks", "sync", "processing"]);
    expect(r.deadlines).toEqual([at(15)() + TICK_BUDGET_MS, at(15)() + TICK_BUDGET_MS]);
    expect(res.ok).toBe(true);
    expect(res.kwChecks).toEqual({ processed: 2 });
    expect(res.sync?.started).toBe(1);
  });

  it("kwalifikacja w każdym ticku — niezależnie od minuty harmonogramu", async () => {
    for (const m of [5, 7, 22, 52]) {
      const r = recorder();
      const res = await runAnalysisPipelineTick(r.steps, at(m));
      expect(r.calls).toEqual(["kwChecks", "sync", "processing"]);
      expect(res.sync?.started).toBe(1);
      expect(res.ok).toBe(true);
    }
  });

  it("błąd analiz KW inwestorów nie zatrzymuje pipeline'u wniosków", async () => {
    const r = recorder({ kw: true });
    const res = await runAnalysisPipelineTick(r.steps, at(30));
    expect(r.calls).toEqual(["kwChecks", "sync", "processing"]);
    expect(res.kwChecks).toEqual({ processed: 0, error: "kw boom" });
    expect(res.ok).toBe(true);
  });

  it("błąd kwalifikacji nie blokuje przesuwania przebiegów, ale tick zgłasza błąd", async () => {
    const r = recorder({ sync: true });
    const res = await runAnalysisPipelineTick(r.steps, at(45));
    expect(r.calls).toEqual(["kwChecks", "sync", "processing"]);
    expect(res.ok).toBe(false);
    expect(res.errors).toEqual(["sync: sync boom"]);
    expect(res.processing?.processed).toBe(1);
  });

  it("błąd przesuwania przebiegów — analizy KW inwestorów już dokończone", async () => {
    const r = recorder({ proc: true });
    const res = await runAnalysisPipelineTick(r.steps, at(10));
    expect(res.ok).toBe(false);
    expect(res.errors).toEqual(["processing: proc boom"]);
    expect(res.kwChecks.processed).toBe(2);
  });
});
