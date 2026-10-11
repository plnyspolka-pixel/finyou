import { describe, expect, it } from "vitest";
import {
  ADVANCE_ON_READ_AFTER_MS,
  canClaimRiskStep,
  claimedRiskStep,
  lastStepActivityAt,
  MAX_KW_WAIT_MS,
  nextKwWait,
  orderForTick,
  pastDeadline,
  preRiskStepsResolved,
  RISK_CLAIM_STALE_MS,
  riskStepPhase,
  riskStepRequestStatus,
  shouldAdvanceOnRead,
  shouldRequestRiskStep,
  shouldSyncPipelineThisTick,
  withRiskClaimConditions,
  withRiskSaveGuard,
  type JsonFilterBuilder,
  type StepsLike,
  type StepTiming,
} from "./step-timing";
import {
  analyticsStepStatus,
  kwCheckStepStatus,
  type KwCheckItem,
} from "../investor-analytics/types";

const NOW = Date.parse("2026-10-11T10:00:00Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

function steps(
  risk?: StepTiming,
  pre: Partial<Record<"kw" | "coowners" | "kw_analysis", StepTiming>> = {},
) {
  return {
    kw: { status: "done" },
    coowners: { status: "done" },
    kw_analysis: { status: "error" },
    ...pre,
    ...(risk ? { risk } : {}),
  } satisfies StepsLike;
}

// ── Mini-baza: warunki PostgREST (eq / is) na ścieżkach jsonb `steps->…` ─────
type Steps = Partial<Record<"kw" | "coowners" | "kw_analysis" | "risk", StepTiming>>;
type Row = { steps: Steps };

function readPath(row: Row, path: string): unknown {
  // "steps->risk->>status" → row.steps.risk.status (->> jako tekst, -> jako json)
  const [col, ...rest] = path.split(/->>|->/);
  let v: unknown = (row as unknown as Record<string, unknown>)[col];
  for (const k of rest) v = v == null ? undefined : (v as Record<string, unknown>)[k];
  return v ?? null;
}

class FakeUpdate implements JsonFilterBuilder<FakeUpdate> {
  private conds: ((r: Row) => boolean)[] = [];
  eq(column: string, value: string): FakeUpdate {
    this.conds.push((r) => readPath(r, column) === value);
    return this;
  }
  is(column: string, _value: null): FakeUpdate {
    this.conds.push((r) => readPath(r, column) === null);
    return this;
  }
  /** UPDATE … WHERE warunki — zwraca liczbę trafionych wierszy (0 albo 1). */
  apply(row: Row, nextSteps: Steps): number {
    if (!this.conds.every((c) => c(row))) return 0;
    row.steps = nextSteps;
    return 1;
  }
}

/** Zajęcie jak w engine.server / kw-checks.server: CAS na stanie, który widzieliśmy. */
function claim(row: Row, seen: Steps, now: number): string | null {
  const claimed = claimedRiskStep(now);
  const hit = withRiskClaimConditions(new FakeUpdate(), seen.risk).apply(row, {
    ...seen,
    risk: claimed,
  });
  return hit ? claimed.claimed_at : null;
}

describe("krok 4 — faza i zajęcie (claim)", () => {
  it("czeka, dopóki kroki 1–3 nie są rozstrzygnięte (gotowe albo z błędem)", () => {
    expect(preRiskStepsResolved(steps({ status: "pending" }))).toBe(true);
    const waiting = steps({ status: "pending" }, { kw: { status: "running", waits: 2 } });
    expect(preRiskStepsResolved(waiting)).toBe(false);
    expect(riskStepPhase(waiting, NOW)).toBe("waiting_for_steps");
    expect(canClaimRiskStep(waiting, NOW)).toBe(false);
    expect(riskStepPhase(null, NOW)).toBe("waiting_for_steps");
  });

  it("wolna ocena po krokach 1–3 jest gotowa do zajęcia", () => {
    expect(riskStepPhase(steps({ status: "pending" }), NOW)).toBe("ready");
    expect(riskStepPhase(steps(), NOW)).toBe("ready");
    expect(canClaimRiskStep(steps({ status: "pending" }), NOW)).toBe(true);
  });

  it("świeże zajęcie blokuje, porzucone (≥ 10 min) wolno przejąć", () => {
    const fresh = steps({ status: "running", claimed_at: iso(RISK_CLAIM_STALE_MS - 1000) });
    expect(riskStepPhase(fresh, NOW)).toBe("running");
    expect(canClaimRiskStep(fresh, NOW)).toBe(false);

    const stale = steps({ status: "running", claimed_at: iso(RISK_CLAIM_STALE_MS) });
    expect(riskStepPhase(stale, NOW)).toBe("stale");
    expect(canClaimRiskStep(stale, NOW)).toBe(true);

    // `running` bez znacznika zajęcia nie ma właściciela — do przejęcia.
    expect(riskStepPhase(steps({ status: "running" }), NOW)).toBe("stale");
  });

  it("rozstrzygnięta ocena nie jest zajmowana ponownie", () => {
    expect(riskStepPhase(steps({ status: "done" }), NOW)).toBe("resolved");
    expect(riskStepPhase(steps({ status: "error", error: "x" }), NOW)).toBe("resolved");
    expect(canClaimRiskStep(steps({ status: "done" }), NOW)).toBe(false);
  });

  it("dwa wywołania z tym samym odczytem — zajmuje tylko pierwsze", () => {
    const row: Row = { steps: steps({ status: "pending" }) };
    const seenA = structuredClone(row.steps);
    const seenB = structuredClone(row.steps);
    const a = claim(row, seenA, NOW);
    const b = claim(row, seenB, NOW + 5);
    expect(a).toBe(new Date(NOW).toISOString());
    expect(b).toBeNull();
    expect(row.steps.risk).toEqual({ status: "running", claimed_at: a });
  });

  it("porzucone zajęcie przejmuje jeden wołający; pozostali (ten sam odczyt) — nie", () => {
    const old = iso(RISK_CLAIM_STALE_MS + 60_000);
    const row: Row = { steps: steps({ status: "running", claimed_at: old }) };
    const seen = structuredClone(row.steps);
    const first = claim(row, seen, NOW);
    expect(first).not.toBeNull();
    expect(claim(row, seen, NOW + 1)).toBeNull();
    // Odczyt sprzed zajęcia („pending") też już nie trafia.
    expect(claim(row, steps({ status: "pending" }), NOW + 2)).toBeNull();
  });

  it("brak klucza `risk` w jsonb — warunek `is null`", () => {
    const row: Row = { steps: steps() };
    expect(claim(row, structuredClone(row.steps), NOW)).not.toBeNull();
    expect(claim(row, steps(), NOW)).toBeNull();
  });

  it("strażnik zapisu: kroki 1–3 tylko przy wolnej ocenie, wynik tylko z własnym zajęciem", () => {
    const row: Row = { steps: steps({ status: "pending" }) };
    const pendingSave = () =>
      withRiskSaveGuard(new FakeUpdate(), "risk_pending").apply(row, row.steps);
    expect(pendingSave()).toBe(1);

    const mine = claim(row, structuredClone(row.steps), NOW)!;
    // Spóźniony zapis kroków 1–3 nie nadpisze zajęcia.
    expect(pendingSave()).toBe(0);
    expect(
      withRiskSaveGuard(new FakeUpdate(), { claimedAt: mine }).apply(row, {
        ...row.steps,
        risk: { status: "done" },
      }),
    ).toBe(1);
    expect(row.steps.risk).toEqual({ status: "done" });

    // Zajęcie przejęte przez kogoś innego — stary właściciel nie zapisze wyniku.
    const row2: Row = { steps: steps({ status: "running", claimed_at: iso(RISK_CLAIM_STALE_MS) }) };
    const oldClaim = row2.steps.risk?.claimed_at as string;
    claim(row2, structuredClone(row2.steps), NOW);
    expect(
      withRiskSaveGuard(new FakeUpdate(), { claimedAt: oldClaim }).apply(row2, {
        ...row2.steps,
        risk: { status: "done" },
      }),
    ).toBe(0);
  });
});

describe("advance-on-read", () => {
  it("ostatni ruch: najpóźniejszy z startu, zakończeń, prób KW i zajęcia", () => {
    const s = steps(
      { status: "running", claimed_at: iso(10_000) },
      { kw: { status: "done", finished_at: iso(60_000) } },
    );
    expect(lastStepActivityAt(iso(120_000), s)).toBe(NOW - 10_000);
    expect(lastStepActivityAt(iso(5_000), null)).toBe(NOW - 5_000);
    expect(lastStepActivityAt(null, { kw: { status: "running", checked_at: iso(30_000) } })).toBe(
      NOW - 30_000,
    );
  });

  it("popycha tylko trwający przebieg z otwartymi krokami 1–3, po ≥ 45 s bez ruchu", () => {
    const waiting = steps({ status: "pending" }, { kw: { status: "running", waits: 1 } });
    const old = NOW - ADVANCE_ON_READ_AFTER_MS;
    expect(shouldAdvanceOnRead("running", waiting, old, NOW)).toBe(true);
    expect(shouldAdvanceOnRead("running", waiting, old + 1, NOW)).toBe(false);
    expect(shouldAdvanceOnRead("done", waiting, old, NOW)).toBe(false);
    // Zostaje tylko krok 4 — ten zleca panel osobno.
    expect(shouldAdvanceOnRead("running", steps({ status: "pending" }), old, NOW)).toBe(false);
    expect(shouldAdvanceOnRead("running", waiting, NaN, NOW)).toBe(true);
  });
});

describe("czekanie na KW z EKW — limit czasem, nie liczbą prób", () => {
  it("pierwsza próba zapamiętuje początek, kolejne go zachowują", () => {
    const first = nextKwWait({ status: "pending" }, NOW);
    expect(first.expired).toBe(false);
    expect(first.state).toEqual({
      status: "running",
      waits: 1,
      waiting_since: new Date(NOW).toISOString(),
      checked_at: new Date(NOW).toISOString(),
    });
    const later = nextKwWait(first.state, NOW + 60_000);
    expect(later.state.waits).toBe(2);
    expect(later.state.waiting_since).toBe(first.state.waiting_since);
  });

  it("częste próby (odczyt co minutę) nie kończą czekania błędem przed limitem", () => {
    let kw: StepTiming = { status: "pending" };
    for (let i = 0; i < 60; i++) {
      const w = nextKwWait(kw, NOW + i * 60_000);
      expect(w.expired).toBe(false);
      kw = w.state;
    }
    expect(kw.waits).toBe(60);
  });

  it("błąd dopiero po MAX_KW_WAIT_MS od pierwszej próby", () => {
    const kw = { status: "running", waits: 3, waiting_since: iso(MAX_KW_WAIT_MS - 1) };
    expect(nextKwWait(kw, NOW).expired).toBe(false);
    expect(nextKwWait({ ...kw, waiting_since: iso(MAX_KW_WAIT_MS) }, NOW).expired).toBe(true);
  });
});

describe("cron tick — kolejność, budżet, kwalifikacja", () => {
  it("najpierw czekające tylko na ocenę ryzyka, potem z księgą, na końcu czekające na EKW", () => {
    const rows = [
      { id: "a", steps: steps({ status: "pending" }, { kw: { status: "running" } }) },
      { id: "b", steps: steps({ status: "pending" }, { coowners: { status: "pending" } }) },
      { id: "c", steps: steps({ status: "pending" }) },
      { id: "d", steps: steps({ status: "running", claimed_at: iso(1000) }) },
      { id: "e", steps: steps({ status: "pending" }) },
    ];
    expect(orderForTick(rows, NOW).map((r) => r.id)).toEqual(["c", "e", "b", "d", "a"]);
  });

  it("termin budżetu", () => {
    expect(pastDeadline(undefined, NOW)).toBe(false);
    expect(pastDeadline(NOW + 1, NOW)).toBe(false);
    expect(pastDeadline(NOW, NOW)).toBe(true);
  });

  it("kwalifikacja nowych wniosków co 15 minut przy ticku co 5", () => {
    const at = (m: number, s = 0) => new Date(Date.UTC(2026, 9, 11, 10, m, s));
    expect([0, 15, 30, 45].map((m) => shouldSyncPipelineThisTick(at(m)))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect([5, 10, 20, 50, 55].some((m) => shouldSyncPipelineThisTick(at(m)))).toBe(false);
    // Spóźnione uruchomienie crona w tym samym oknie nadal kwalifikuje.
    expect(shouldSyncPipelineThisTick(at(1, 30))).toBe(true);
  });
});

describe("zlecenie oceny z panelu", () => {
  it("panel zleca tylko przy trwającym przebiegu i wolnym kroku 4", () => {
    expect(shouldRequestRiskStep("running", steps({ status: "pending" }), NOW)).toBe(true);
    expect(shouldRequestRiskStep("done", steps({ status: "pending" }), NOW)).toBe(false);
    expect(
      shouldRequestRiskStep("running", steps({ status: "running", claimed_at: iso(1000) }), NOW),
    ).toBe(false);
    expect(
      shouldRequestRiskStep(
        "running",
        steps({ status: "pending" }, { kw: { status: "pending" } }),
        NOW,
      ),
    ).toBe(false);
  });

  it("stan zwracany przez serwer", () => {
    expect(riskStepRequestStatus("done", steps({ status: "done" }), NOW)).toBe("done");
    expect(riskStepRequestStatus("running", steps({ status: "error" }), NOW)).toBe("error");
    expect(riskStepRequestStatus(null, null, NOW)).toBe("not_running");
    expect(riskStepRequestStatus("error", steps({ status: "pending" }), NOW)).toBe("not_running");
    expect(
      riskStepRequestStatus(
        "running",
        steps({ status: "pending" }, { kw: { status: "running" } }),
        NOW,
      ),
    ).toBe("not_ready");
    expect(
      riskStepRequestStatus("running", steps({ status: "running", claimed_at: iso(1000) }), NOW),
    ).toBe("running");
  });

  it("zajęta ocena wyświetla się w panelu jako „w toku”", () => {
    const claimed = { status: "running" as const, claimed_at: iso(1000) };
    const run = {
      status: "running" as const,
      steps: {
        kw: { status: "done" as const },
        coowners: { status: "done" as const },
        kw_analysis: { status: "done" as const },
        risk: claimed,
      },
    };
    const results = {
      kwFetched: true,
      kwAnalysisStatus: null,
      coowners: true,
      risk: false,
      collateral: false,
    };
    expect(analyticsStepStatus({ results, run }, "risk")).toBe("running");

    const item: KwCheckItem = {
      id: "c1",
      kwNumber: "WA1M/00012345/6",
      label: null,
      propertyType: "mieszkanie",
      loanAmount: null,
      propertyValue: null,
      periodMonths: null,
      status: "running",
      steps: run.steps,
      error: null,
      kwAnalysisStatus: null,
      createdAt: "2026-10-11T09:50:00Z",
      finishedAt: null,
    };
    expect(kwCheckStepStatus(item, "risk")).toBe("running");
  });
});
