import { describe, expect, it } from "vitest";
import {
  ACTIVE_MATCH_STATUSES,
  amountMatchesOrder,
  buildKartaLeada,
  canTransition,
  clientProvisionPln,
  consumerKaraStatement,
  extendedReservationDeadline,
  isWithinWithdrawalWindow,
  reservationDeadline,
  withdrawalDeadline,
  teasersForAcceptedOrders,
  TEASER_VISIBLE_MATCH_STATUSES,
  DEFAULT_ORDER_LIMITS,
  orderLimitsFromSettings,
} from "./order-cycle-core";
import { fyCommission } from "@/lib/contract-engine/fees";

describe("clientProvisionPln (Zał. 6: 5% / min 5000 zł)", () => {
  it("liczy 5% dla dużych kwot", () => {
    expect(clientProvisionPln(200_000)).toBe(10_000);
    expect(clientProvisionPln(1_000_000)).toBe(50_000);
  });
  it("stosuje minimum 5000 zł", () => {
    expect(clientProvisionPln(50_000)).toBe(5000); // 5% = 2500 < 5000
    expect(clientProvisionPln(99_999)).toBe(5000); // 5% = 4999.95
    expect(clientProvisionPln(100_001)).toBe(5000.05);
  });
  it("wartości niepoprawne → minimum", () => {
    expect(clientProvisionPln(0)).toBe(5000);
    expect(clientProvisionPln(NaN)).toBe(5000);
  });
});

describe("amountMatchesOrder (Zlecenie: kwota maksymalna)", () => {
  it("Projekt do kwoty maksymalnej pasuje, powyżej — nie", () => {
    expect(amountMatchesOrder(200_000, 200_000)).toBe(true);
    expect(amountMatchesOrder(200_000, 50_000)).toBe(true);
    expect(amountMatchesOrder(200_000, 200_001)).toBe(false);
  });
  it("nieprawidłowe kwoty nie pasują", () => {
    expect(amountMatchesOrder(0, 100)).toBe(false);
    expect(amountMatchesOrder(100, 0)).toBe(false);
  });
});

describe("rezerwacja 24 h + 12 h", () => {
  it("liczy termin podstawowy i przedłużenie", () => {
    const t0 = new Date("2026-09-07T10:00:00Z");
    const d = reservationDeadline(t0);
    expect(d.toISOString()).toBe("2026-09-08T10:00:00.000Z");
    expect(extendedReservationDeadline(d).toISOString()).toBe("2026-09-08T22:00:00.000Z");
  });
});

describe("odstąpienie Konsumenta (14 dni)", () => {
  const accepted = new Date("2026-09-01T12:00:00Z");
  it("termin = akceptacja + 14 dni", () => {
    expect(withdrawalDeadline(accepted).toISOString()).toBe("2026-09-15T12:00:00.000Z");
  });
  it("w oknie / po oknie", () => {
    expect(isWithinWithdrawalWindow(accepted, new Date("2026-09-15T12:00:00Z"))).toBe(true);
    expect(isWithinWithdrawalWindow(accepted, new Date("2026-09-15T12:00:01Z"))).toBe(false);
  });
});

describe("canTransition — cykl § 5", () => {
  it("ścieżka szczęśliwa", () => {
    expect(canTransition("dopasowane", "teaser")).toBe(true);
    expect(canTransition("teaser", "karta_leada")).toBe(true);
    expect(canTransition("karta_leada", "rezerwacja")).toBe(true);
    expect(canTransition("rezerwacja", "transakcja")).toBe(true);
  });
  it("blokuje skróty i cofanie", () => {
    expect(canTransition("teaser", "rezerwacja")).toBe(false); // bez Karty Leada
    expect(canTransition("dopasowane", "transakcja")).toBe(false);
    expect(canTransition("rezerwacja", "teaser")).toBe(false);
    expect(canTransition("transakcja", "odrzucone")).toBe(false);
  });
  it("każdy aktywny stan może wygasnąć / zostać przekazany", () => {
    for (const s of ACTIVE_MATCH_STATUSES) {
      expect(canTransition(s, "wygasle")).toBe(true);
      expect(canTransition(s, "przekazane")).toBe(true);
    }
  });
});

describe("consumerKaraStatement — indywidualne uzgodnienie", () => {
  it("zawiera stawkę, sposób obliczenia i przykład kwotowy", () => {
    const s = consumerKaraStatement(300_000);
    expect(s.stawka).toContain("5%");
    expect(s.sposob_obliczenia).toContain("Sumy Hipotecznej");
    expect(s.przyklad_kwotowy).toContain("15");
  });
});

describe("buildKartaLeada (Zał. 1 v5)", () => {
  it("ma Nr Zlecenia, parametry i wersje dokumentów", () => {
    const k = buildKartaLeada({
      projectRef: "FY-P-7",
      orderSeq: 12,
      matchedAt: new Date("2026-09-07T10:00:00Z"),
      teaser: {
        loan_amount: 250_000,
        period_months: 24,
        annual_rate: 14,
        ltv: 0.45,
        property_type: "mieszkanie",
        city: "Warszawa",
        voivodeship: "mazowieckie",
      },
      documents: [{ code: "umowa_ramowa", version: "v5", sha256: "abc" }],
    });
    expect(k.nr_zlecenia).toBe("FY-Z-12");
    expect(k.projekt_ref).toBe("FY-P-7");
    expect(k.parametry.kwota_pln).toBe(250_000);
    expect(k.parametry.lokalizacja).toBe("Warszawa, mazowieckie");
    expect(k.wersje_dokumentow[0]).toEqual({ code: "umowa_ramowa", version: "v5", sha256: "abc" });
    expect(k.kara_obejsciowa).toContain("5%");
  });
});

describe("teasery wyłącznie z przyjętych Zleceń (decyzja nr 7)", () => {
  const m = (id: string, status: string, created_at = "2026-09-20T10:00:00Z") => ({
    id,
    application_id: `app-${id}`,
    project_ref: `FY-${id}`,
    status,
    created_at,
  });

  it("Zlecenie złożone, wygasłe albo cofnięte nie daje teaserów", () => {
    for (const status of ["zlozone", "wygasle", "cofniete", "odmowa", "wykonane"]) {
      expect(
        teasersForAcceptedOrders([
          { id: "o1", status, investor_order_matches: [m("a", "teaser")] },
        ]),
      ).toEqual([]);
    }
    expect(teasersForAcceptedOrders([])).toEqual([]);
  });

  it("z przyjętego Zlecenia — tylko dopasowania w statusach widocznych", () => {
    const refs = teasersForAcceptedOrders([
      {
        id: "o1",
        status: "przyjete",
        investor_order_matches: [
          m("a", "teaser"),
          m("b", "odrzucone"),
          m("c", "rezerwacja", "2026-09-25T10:00:00Z"),
        ],
      },
    ]);
    expect(refs.map((r) => r.matchId).sort()).toEqual(["a", "c"]);
    for (const r of refs) expect(TEASER_VISIBLE_MATCH_STATUSES).toContain(r.matchStatus);
    expect(refs.every((r) => r.orderId === "o1")).toBe(true);
  });
});

describe("limity cyklu z project_module_settings", () => {
  it("domyślnie 24 h + 12 h, 5 Zleceń, 2 przedłużone, 5 odrzuceń, 120 mies.", () => {
    expect(DEFAULT_ORDER_LIMITS).toEqual({
      assignmentHours: 24,
      extensionHours: 12,
      maxActive: 5,
      maxExtended: 2,
      rejectionThreshold: 5,
      maxPeriodMonths: 120,
    });
    expect(orderLimitsFromSettings(null)).toEqual(DEFAULT_ORDER_LIMITS);
  });

  it("wartości z ustawień wygrywają; puste i niepoprawne → domyślne", () => {
    const l = orderLimitsFromSettings({
      assignment_hours: 48,
      extension_hours: null,
      max_active_assignments: 3,
      max_extended_assignments: 0,
      rejection_review_threshold: 7,
      max_period_months: 60,
    });
    expect(l.assignmentHours).toBe(48);
    expect(l.extensionHours).toBe(12);
    expect(l.maxActive).toBe(3);
    expect(l.maxExtended).toBe(2);
    expect(l.rejectionThreshold).toBe(7);
    expect(l.maxPeriodMonths).toBe(60);
  });

  it("prowizja od pożyczkobiorcy z jednego źródła (fees.ts)", () => {
    expect(clientProvisionPln(100_000)).toBe(fyCommission(100_000));
  });
});
