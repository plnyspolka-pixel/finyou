/**
 * Zakres dostępu inwestora: jeden abonament — wyłącznie roczny (365 dni),
 * brak PRO / opłaty sukcesu / wykupu okazji.
 */
import { describe, it, expect } from "vitest";
import {
  ACCESS_PRESENTATION,
  ALL_FEATURES,
  FEATURE_LABELS,
  SUBSCRIPTION_OPTION,
  SUBSCRIPTION_OPTIONS,
  SUBSCRIPTION_PAYMENT_SENTENCE,
  SUBSCRIPTION_PRICE_SENTENCE,
  SUBSCRIPTION_YEARLY_PLN,
  SUCCESS_FEE_BPS,
  TIER_FEATURES,
  TIER_PRESENTATION,
  needsUnlockPayment,
  requiredTier,
  successFeeGrosz,
  successFeePln,
  plnLabel,
  tierHasFeature,
} from "./plans";

describe("dostęp inwestora — bez opłat jednostkowych", () => {
  it("opłata sukcesu jest zniesiona (0 bps, 0 zł od dowolnej kwoty)", () => {
    expect(SUCCESS_FEE_BPS).toBe(0);
    expect(successFeeGrosz(200_000)).toBe(0);
    expect(successFeeGrosz(200_000, 500)).toBe(0);
    expect(successFeePln(1_000_000)).toBe(0);
  });

  it("okazji nie trzeba wykupywać", () => {
    expect(needsUnlockPayment("podstawowy")).toBe(false);
  });

  it("każda funkcja jest dostępna w jedynym pakiecie", () => {
    for (const f of ALL_FEATURES) {
      expect(tierHasFeature("podstawowy", f)).toBe(true);
      expect(requiredTier(f)).toBe("podstawowy");
      expect(FEATURE_LABELS[f]).toBeTruthy();
    }
    expect(TIER_FEATURES.podstawowy).toEqual(ALL_FEATURES);
    expect(Object.keys(TIER_PRESENTATION)).toEqual(["podstawowy"]);
  });

  it("prezentacja: abonament, bez PRO, bez cen jednostkowych, cecha → zaleta → korzyść", () => {
    const p = ACCESS_PRESENTATION;
    expect(p.name).toBe("Abonament inwestora");
    expect(p.priceLabel).toBe("7\u00a0000\u00a0zł / rok");
    const text = [
      p.name,
      p.tagline,
      p.note,
      ...p.bullets.flatMap((b) => [b.cecha, b.zaleta, b.korzysc]),
    ].join("\n");
    expect(text).not.toMatch(/\bPRO\b|Pakiet Podstawowy|0 zł|nieodpłatn/);
    expect(text).not.toMatch(/3 000|5% od|Opłat[ay] Sukcesu/i);
    expect(p.bullets.map((b) => b.cecha)).toEqual([
      "Akademia inwestora",
      "Wewnętrzna sieć sprzedaży",
      "Zaawansowany moduł analizy nieruchomości",
      "Kancelaria AI",
      "Kalkulator compliance",
      "Moduł AML",
      "Windykator AI",
    ]);
    for (const b of p.bullets) expect(b.cecha && b.zaleta && b.korzysc).toBeTruthy();
    expect(text).not.toMatch(/Automatyczne wypełnienie i podpisanie/);
  });
});

describe("abonament inwestora — cennik", () => {
  it("wyłącznie 7 000 zł za rok — bez opcji miesięcznej", () => {
    expect(SUBSCRIPTION_YEARLY_PLN).toBe(7_000);
    expect(Object.keys(SUBSCRIPTION_OPTIONS)).toEqual(["rocznie"]);
    expect(SUBSCRIPTION_OPTION).toMatchObject({
      pricePln: 7_000,
      days: 365,
      productCode: "investor_access_365d",
    });
    const text = [
      SUBSCRIPTION_PRICE_SENTENCE,
      SUBSCRIPTION_PAYMENT_SENTENCE,
      SUBSCRIPTION_OPTION.hint,
      ACCESS_PRESENTATION.priceLabel,
      ACCESS_PRESENTATION.periodLabel,
      ACCESS_PRESENTATION.note,
    ].join("\n");
    expect(text).not.toMatch(/1\s?500|30 dni|miesięcznie|\/ ?mies|rabat|taniej/);
  });

  it("płatność bez karty kredytowej i bez automatycznego odnawiania", () => {
    expect(SUBSCRIPTION_PAYMENT_SENTENCE).toMatch(/bez konieczności podpinania karty kredytowej/);
    expect(SUBSCRIPTION_PAYMENT_SENTENCE).toMatch(/bez automatycznego odnawiania/);
  });

  it("plnLabel grupuje tysiące spacją nierozdzielającą", () => {
    expect(plnLabel(7000)).toBe("7\u00a0000\u00a0zł");
    expect(plnLabel(18000)).toBe("18\u00a0000\u00a0zł");
    expect(plnLabel(583)).toBe("583\u00a0zł");
  });
});
