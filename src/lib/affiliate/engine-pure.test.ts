import { describe, it, expect } from "vitest";
import {
  ancestorChain,
  calculateAmount,
  decideCommissionStatus,
  getBasisAmount,
  getNetworkRecipients,
  getTaxPeriod,
  groupPayouts,
  isEligiblePartner,
  isPayableEvent,
  roundMoney,
  unregisteredLimitState,
  wouldCreateCycle,
  PAYOUT_THRESHOLD_PLN,
  type PartnerLike,
} from "./engine-pure";

// p1 (direct) -> p2 (sponsor) -> p3 (sponsor of p2)
const partners: Record<string, PartnerLike> = {
  p1: {
    id: "p1",
    sponsor_partner_id: "p2",
    status: "active",
    settlement_type: "b2b",
    bank_account_encrypted: "x",
  },
  p2: {
    id: "p2",
    sponsor_partner_id: "p3",
    status: "active",
    settlement_type: "unregistered_activity",
    bank_account_encrypted: "x",
  },
  p3: {
    id: "p3",
    sponsor_partner_id: null,
    status: "active",
    settlement_type: "b2b",
    bank_account_encrypted: "x",
  },
  p4: { id: "p4", sponsor_partner_id: "p3", status: "suspended", settlement_type: "b2b" },
};

describe("getNetworkRecipients (3 poziomy, nigdy więcej)", () => {
  it("zwraca 3 odbiorców z poprawnymi poziomami", () => {
    const r = getNetworkRecipients(partners, "p1");
    expect(r).toEqual([
      { partnerId: "p1", level: 1 },
      { partnerId: "p2", level: 2 },
      { partnerId: "p3", level: 3 },
    ]);
  });

  it("nie nalicza powyżej 3 poziomów (p3 nie ma sponsora)", () => {
    const deep: Record<string, PartnerLike> = {
      a: { id: "a", sponsor_partner_id: "b" },
      b: { id: "b", sponsor_partner_id: "c" },
      c: { id: "c", sponsor_partner_id: "d" },
      d: { id: "d", sponsor_partner_id: null },
    };
    const r = getNetworkRecipients(deep, "a");
    expect(r.length).toBe(3);
    expect(r.map((x) => x.level)).toEqual([1, 2, 3]);
    expect(r.find((x) => x.partnerId === "d")).toBeUndefined();
  });

  it("partner bez sponsora → tylko poziom 1", () => {
    expect(getNetworkRecipients(partners, "p3")).toEqual([{ partnerId: "p3", level: 1 }]);
  });
});

describe("getBasisAmount", () => {
  const ev = {
    gross_payment_amount: 1000,
    net_revenue_amount: 800,
    finance_you_fee_amount: 500,
    loan_amount: 200000,
  };
  it("fixed_amount → 1", () => expect(getBasisAmount(ev, "fixed_amount")).toBe(1));
  it("percent_of_gross_payment", () =>
    expect(getBasisAmount(ev, "percent_of_gross_payment")).toBe(1000));
  it("percent_of_net_revenue", () =>
    expect(getBasisAmount(ev, "percent_of_net_revenue")).toBe(800));
  it("percent_of_finance_you_fee", () =>
    expect(getBasisAmount(ev, "percent_of_finance_you_fee")).toBe(500));
  it("percent_of_loan_amount", () =>
    expect(getBasisAmount(ev, "percent_of_loan_amount")).toBe(200000));
  it("brak wartości → 0", () => expect(getBasisAmount({}, "percent_of_finance_you_fee")).toBe(0));
});

describe("calculateAmount", () => {
  it("fixed_amount zwraca kwotę stałą", () => {
    expect(calculateAmount({ basis_type: "fixed_amount", fixed_amount: 100 }, 1)).toBe(100);
  });
  it("procent od bazy", () => {
    expect(
      calculateAmount({ basis_type: "percent_of_finance_you_fee", percent_rate: 20 }, 500),
    ).toBe(100);
  });
  it("min_commission podnosi kwotę", () => {
    expect(
      calculateAmount(
        { basis_type: "percent_of_finance_you_fee", percent_rate: 1, min_commission: 50 },
        500,
      ),
    ).toBe(50);
  });
  it("max_commission ogranicza kwotę", () => {
    expect(
      calculateAmount(
        { basis_type: "percent_of_finance_you_fee", percent_rate: 50, max_commission: 100 },
        500,
      ),
    ).toBe(100);
  });
  it("manual → 0 (kwota ustalana ręcznie)", () => {
    expect(calculateAmount({ basis_type: "manual" }, 500)).toBe(0);
  });
});

describe("decideCommissionStatus (forma rozliczenia + limit)", () => {
  it("B2B → requires_invoice", () => {
    const d = decideCommissionStatus({
      settlementType: "b2b",
      grossAmount: 100,
      quarterApprovedSum: 0,
      limitAmount: 10000,
    });
    expect(d.status).toBe("requires_invoice");
    expect(d.requiresInvoice).toBe(true);
  });
  it("działalność nierejestrowana w limicie → pending_admin_approval + flaga oświadczenia", () => {
    const d = decideCommissionStatus({
      settlementType: "unregistered_activity",
      grossAmount: 100,
      quarterApprovedSum: 0,
      limitAmount: 10813.5,
    });
    expect(d.status).toBe("pending_admin_approval");
    expect(d.requiresUnregisteredActivityStatement).toBe(true);
    expect(d.requiresBusinessRegistration).toBe(false);
  });
  it("działalność nierejestrowana przekraczająca limit → requires_business_registration", () => {
    const d = decideCommissionStatus({
      settlementType: "unregistered_activity",
      grossAmount: 1000,
      quarterApprovedSum: 10500,
      limitAmount: 10813.5,
    });
    expect(d.status).toBe("requires_business_registration");
    expect(d.requiresBusinessRegistration).toBe(true);
  });
  it("brak skonfigurowanego limitu → wymaga rejestracji działalności (bezpiecznie)", () => {
    const d = decideCommissionStatus({
      settlementType: "unregistered_activity",
      grossAmount: 100,
      quarterApprovedSum: 0,
      limitAmount: null,
    });
    expect(d.requiresBusinessRegistration).toBe(true);
  });
});

describe("unregisteredLimitState", () => {
  it("oznacza zbliżanie się do limitu od 80%", () => {
    const s = unregisteredLimitState({
      quarterApprovedSum: 8700,
      newAmount: 0,
      limitAmount: 10813.5,
    });
    expect(s.nearLimit).toBe(true);
    expect(s.withinLimit).toBe(true);
  });
  it("oblicza pozostałą kwotę", () => {
    const s = unregisteredLimitState({ quarterApprovedSum: 813.5, limitAmount: 10813.5 });
    expect(s.remaining).toBe(10000);
  });
});

describe("wouldCreateCycle (zakaz pętli w strukturze)", () => {
  it("wykrywa cykl bezpośredni (sponsor = sam partner)", () => {
    expect(wouldCreateCycle(partners, "p1", "p1")).toBe(true);
  });
  it("wykrywa cykl pośredni (p3 ustawiony pod p1, który jest w jego dół-linii)", () => {
    // p1 -> p2 -> p3; ustawienie sponsora p3 na p1 utworzyłoby pętlę
    expect(wouldCreateCycle(partners, "p3", "p1")).toBe(true);
  });
  it("dopuszcza prawidłową zmianę", () => {
    const flat: Record<string, PartnerLike> = {
      a: { id: "a", sponsor_partner_id: null },
      b: { id: "b", sponsor_partner_id: null },
    };
    expect(wouldCreateCycle(flat, "a", "b")).toBe(false);
  });
});

describe("groupPayouts (próg 500 zł + dane bankowe)", () => {
  it("pomija partnera poniżej progu 500 zł", () => {
    const res = groupPayouts([{ id: "c1", partner_id: "p1", gross_amount: 300 }], partners);
    expect(res.items).toHaveLength(0);
    expect(res.skipped[0]).toMatchObject({ partner_id: "p1", reason: "below_threshold" });
  });
  it("pomija partnera bez rachunku bankowego", () => {
    const res = groupPayouts([{ id: "c1", partner_id: "p4", gross_amount: 800 }], partners);
    expect(res.items).toHaveLength(0);
    expect(res.skipped[0]).toMatchObject({ partner_id: "p4", reason: "missing_bank_account" });
  });
  it("grupuje prowizje powyżej progu z poprawnym tytułem", () => {
    const res = groupPayouts(
      [
        { id: "c1", partner_id: "p1", gross_amount: 300 },
        { id: "c2", partner_id: "p1", gross_amount: 250 },
      ],
      partners,
    );
    expect(res.items).toHaveLength(2);
    expect(res.items.every((i) => i.partner_id === "p1")).toBe(true);
    expect(res.items[0].transfer_title).toContain("faktura"); // p1 = b2b
  });
  it("próg wynosi 500 zł", () => expect(PAYOUT_THRESHOLD_PLN).toBe(500));
});

describe("kwalifikacja partnera i zdarzenia", () => {
  it("tylko aktywny partner kwalifikuje się do prowizji", () => {
    expect(isEligiblePartner(partners.p1)).toBe(true);
    expect(isEligiblePartner(partners.p4)).toBe(false); // suspended
    expect(isEligiblePartner(null)).toBe(false);
  });
  it("nie nalicza prowizji od zwróconych / fraudowych zdarzeń", () => {
    expect(isPayableEvent("confirmed")).toBe(true);
    expect(isPayableEvent("eligible")).toBe(true);
    expect(isPayableEvent("refunded")).toBe(false);
    expect(isPayableEvent("chargeback")).toBe(false);
    expect(isPayableEvent("fraud")).toBe(false);
    expect(isPayableEvent("manually_blocked")).toBe(false);
  });
});

describe("getTaxPeriod / ancestorChain / roundMoney", () => {
  it("kwartały", () => {
    expect(getTaxPeriod(new Date("2026-01-15"))).toEqual({ year: 2026, quarter: 1 });
    expect(getTaxPeriod(new Date("2026-04-01"))).toEqual({ year: 2026, quarter: 2 });
    expect(getTaxPeriod(new Date("2026-09-30"))).toEqual({ year: 2026, quarter: 3 });
    expect(getTaxPeriod(new Date("2026-12-31"))).toEqual({ year: 2026, quarter: 4 });
  });
  it("ancestorChain do 3 poziomów", () => {
    const chain = ancestorChain(partners, "p1", 3);
    expect(chain).toEqual([
      { ancestorId: "p2", depth: 1 },
      { ancestorId: "p3", depth: 2 },
    ]);
  });
  it("roundMoney zaokrągla do groszy", () => {
    expect(roundMoney(100.005)).toBe(100.01);
    expect(roundMoney(33.333333)).toBe(33.33);
  });
});
