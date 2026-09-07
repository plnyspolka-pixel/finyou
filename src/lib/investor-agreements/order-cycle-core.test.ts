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
} from "./order-cycle-core";

describe("clientProvisionPln (Zał. 6: 7% / min 5000 zł)", () => {
  it("liczy 7% dla dużych kwot", () => {
    expect(clientProvisionPln(200_000)).toBe(14_000);
    expect(clientProvisionPln(1_000_000)).toBe(70_000);
  });
  it("stosuje minimum 5000 zł", () => {
    expect(clientProvisionPln(50_000)).toBe(5000); // 7% = 3500 < 5000
    expect(clientProvisionPln(71_428)).toBe(5000); // 7% = 4999.96
    expect(clientProvisionPln(71_429)).toBe(5000.03);
  });
  it("wartości niepoprawne → minimum", () => {
    expect(clientProvisionPln(0)).toBe(5000);
    expect(clientProvisionPln(NaN)).toBe(5000);
  });
});

describe("amountMatchesOrder (Zlecenie ± 15%)", () => {
  it("akceptuje granice tolerancji", () => {
    expect(amountMatchesOrder(200_000, 170_000)).toBe(true); // -15%
    expect(amountMatchesOrder(200_000, 230_000)).toBe(true); // +15%
    expect(amountMatchesOrder(200_000, 169_999)).toBe(false);
    expect(amountMatchesOrder(200_000, 230_001)).toBe(false);
  });
  it("odrzuca kwoty niepoprawne", () => {
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
