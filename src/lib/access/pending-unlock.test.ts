import { describe, expect, it } from "vitest";
import {
  CREATED_UNLOCK_STALE_MINUTES,
  decideInFlightUnlockPayment,
  PENDING_UNLOCK_STALE_MINUTES,
} from "./pending-unlock";

const now = new Date("2026-09-25T12:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

describe("decideInFlightUnlockPayment", () => {
  it("opłacona w Tpay zawsze blokuje (ochrona przed podwójną płatnością)", () => {
    expect(
      decideInFlightUnlockPayment({
        status: "pending",
        createdAt: minutesAgo(600),
        hasProviderTransaction: true,
        tpayStatus: "correct",
        now,
      }),
    ).toEqual({ action: "block_paid" });
  });

  it("świeża, nieopłacona płatność blokuje z czasem do wygaśnięcia", () => {
    const d = decideInFlightUnlockPayment({
      status: "pending",
      createdAt: minutesAgo(5),
      hasProviderTransaction: true,
      tpayStatus: "pending",
      now,
    });
    expect(d).toEqual({ action: "block_fresh", minutesLeft: PENDING_UNLOCK_STALE_MINUTES - 5 });
  });

  it("porzucona po oknie ważności jest anulowana", () => {
    const d = decideInFlightUnlockPayment({
      status: "pending",
      createdAt: minutesAgo(PENDING_UNLOCK_STALE_MINUTES + 1),
      hasProviderTransaction: true,
      tpayStatus: "pending",
      now,
    });
    expect(d.action).toBe("cancel");
  });

  it("odrzucona/anulowana w Tpay jest anulowana od razu", () => {
    for (const s of ["error", "declined", "cancelled", "expired"]) {
      expect(
        decideInFlightUnlockPayment({
          status: "pending",
          createdAt: minutesAgo(1),
          hasProviderTransaction: true,
          tpayStatus: s,
          now,
        }),
      ).toEqual({ action: "cancel", reason: `tpay_status:${s}` });
    }
  });

  it("brak odpowiedzi Tpay — decyzja po wieku", () => {
    expect(
      decideInFlightUnlockPayment({
        status: "pending",
        createdAt: minutesAgo(3),
        hasProviderTransaction: true,
        tpayStatus: null,
        now,
      }).action,
    ).toBe("block_fresh");
    expect(
      decideInFlightUnlockPayment({
        status: "pending",
        createdAt: minutesAgo(120),
        hasProviderTransaction: true,
        tpayStatus: null,
        now,
      }).action,
    ).toBe("cancel");
  });

  it("rekord 'created' bez transakcji Tpay wygasa po krótkim oknie", () => {
    expect(
      decideInFlightUnlockPayment({
        status: "created",
        createdAt: minutesAgo(CREATED_UNLOCK_STALE_MINUTES + 1),
        hasProviderTransaction: false,
        now,
      }).action,
    ).toBe("cancel");
    expect(
      decideInFlightUnlockPayment({
        status: "created",
        createdAt: minutesAgo(0.5),
        hasProviderTransaction: false,
        now,
      }).action,
    ).toBe("block_fresh");
  });
});
