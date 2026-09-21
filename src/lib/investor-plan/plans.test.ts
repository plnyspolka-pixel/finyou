import { describe, it, expect } from "vitest";
import {
  PRO_PRICE_GROSZ,
  PRO_DURATION_DAYS,
  SUCCESS_FEE_BPS,
  UNLOCK_PRICE_GROSZ,
  successFeeGrosz,
  successFeePln,
  tierHasFeature,
  requiredTier,
  needsUnlockPayment,
  TIER_FEATURES,
  PRO_ONLY_FEATURES,
} from "./plans";
import {
  computeInvestorPipeline,
  assertPipelineReadyForOrder,
  type PipelineInput,
} from "./pipeline";

describe("cennik inwestora", () => {
  it("PRO to 3 000 zł za 180 dni i 5% od udzielonej pożyczki", () => {
    expect(PRO_PRICE_GROSZ).toBe(300_000);
    expect(PRO_DURATION_DAYS).toBe(180);
    expect(SUCCESS_FEE_BPS).toBe(500);
  });

  it("Podstawowy ma zerową opłatę stałą, płatna jest pojedyncza okazja", () => {
    expect(UNLOCK_PRICE_GROSZ).toBeGreaterThan(0);
    expect(needsUnlockPayment("podstawowy")).toBe(true);
    expect(needsUnlockPayment("pro")).toBe(false);
  });

  it("liczy 5% od kwoty pożyczki bez błędów zmiennoprzecinkowych", () => {
    expect(successFeeGrosz(200_000)).toBe(1_000_000); // 10 000 zł
    expect(successFeePln(200_000)).toBe(10_000);
    expect(successFeePln(123_456.78)).toBe(6172.84);
    expect(successFeeGrosz(0)).toBe(0);
    expect(successFeeGrosz(-1)).toBe(0);
    expect(successFeeGrosz(Number.NaN)).toBe(0);
  });

  it("moduły PRO są niedostępne w pakiecie Podstawowym", () => {
    for (const f of PRO_ONLY_FEATURES) {
      expect(tierHasFeature("podstawowy", f)).toBe(false);
      expect(tierHasFeature("pro", f)).toBe(true);
      expect(requiredTier(f)).toBe("pro");
    }
  });

  it("PRO zawiera cały zakres Podstawowego", () => {
    for (const f of TIER_FEATURES.podstawowy) {
      expect(TIER_FEATURES.pro).toContain(f);
    }
    expect(requiredTier("zlecenia")).toBe("podstawowy");
  });
});

const base: PipelineInput = {
  lenderDataCompleted: false,
  repaymentAccountConfirmed: false,
  kycStatus: "not_started",
  screeningResult: null,
  delivered: false,
  isConsumer: false,
  documents: [
    { code: "umowa_ramowa", accepted: false },
    { code: "nda", accepted: false },
    { code: "rodo", accepted: false },
  ],
  packActive: true,
  ordersCount: 0,
};

const complete: PipelineInput = {
  ...base,
  lenderDataCompleted: true,
  repaymentAccountConfirmed: true,
  kycStatus: "approved",
  screeningResult: "clear",
  delivered: true,
  documents: [
    { code: "umowa_ramowa", accepted: true },
    { code: "nda", accepted: true },
    { code: "rodo", accepted: true },
  ],
};

describe("pipeline inwestora", () => {
  it("startuje od danych pożyczkodawcy i blokuje resztę", () => {
    const v = computeInvestorPipeline(base);
    expect(v.currentStep).toBe("dane_pozyczkodawcy");
    expect(v.steps[0].state).toBe("biezacy");
    expect(v.steps[1].state).toBe("zablokowany");
    expect(v.canSubmitOrder).toBe(false);
    expect(v.progress).toBe(0);
  });

  it("wymusza rachunek spłaty przed KYC", () => {
    const v = computeInvestorPipeline({ ...base, lenderDataCompleted: true });
    expect(v.currentStep).toBe("rachunek_splaty");
    expect(v.steps.find((s) => s.key === "kyc")?.state).toBe("zablokowany");
  });

  it("screening jest osobnym krokiem po KYC", () => {
    const v = computeInvestorPipeline({
      ...base,
      lenderDataCompleted: true,
      repaymentAccountConfirmed: true,
      kycStatus: "approved",
    });
    expect(v.currentStep).toBe("screening");
  });

  it("trafienie sankcyjne oznacza krok jako wymagający uwagi", () => {
    const v = computeInvestorPipeline({
      ...complete,
      screeningResult: "confirmed_sanctions_match",
      documents: base.documents,
      delivered: false,
    });
    expect(v.attention).toContain("screening");
    expect(v.steps.find((s) => s.key === "screening")?.state).toBe("uwaga");
    expect(v.canSubmitOrder).toBe(false);
  });

  it("odrzucone KYC wymaga reakcji i nie przepuszcza dalej", () => {
    const v = computeInvestorPipeline({
      ...base,
      lenderDataCompleted: true,
      repaymentAccountConfirmed: true,
      kycStatus: "rejected",
    });
    expect(v.attention).toContain("kyc");
    expect(v.canSubmitOrder).toBe(false);
  });

  it("Konsument nie zaakceptuje umowy ramowej przed doręczeniem", () => {
    const v = computeInvestorPipeline({
      ...complete,
      isConsumer: true,
      delivered: false,
      documents: base.documents,
    });
    const ramowa = v.steps.find((s) => s.key === "umowa_ramowa");
    expect(ramowa?.state).toBe("zablokowany");
    expect(ramowa?.hint).toMatch(/trwałym nośniku/);
  });

  it("uśpiony pakiet blokuje kroki dokumentowe i Zlecenie", () => {
    const v = computeInvestorPipeline({ ...complete, packActive: false, delivered: false });
    expect(v.steps.find((s) => s.key === "doreczenie")?.state).toBe("zablokowany");
    expect(v.steps.find((s) => s.key === "zlecenie")?.state).toBe("zablokowany");
    expect(v.canSubmitOrder).toBe(false);
  });

  it("komplet kroków otwiera Zlecenie", () => {
    const v = computeInvestorPipeline(complete);
    expect(v.currentStep).toBe("zlecenie");
    expect(v.canSubmitOrder).toBe(true);
    expect(v.progress).toBe(89);
    expect(() => assertPipelineReadyForOrder(complete)).not.toThrow();
  });

  it("złożone Zlecenie domyka pipeline", () => {
    const v = computeInvestorPipeline({ ...complete, ordersCount: 2 });
    expect(v.progress).toBe(100);
    expect(v.currentStep).toBeNull();
  });

  it("bramka serwerowa nazywa blokujący krok", () => {
    expect(() => assertPipelineReadyForOrder(base)).toThrow(/Dane pożyczkodawcy/);
  });
});
