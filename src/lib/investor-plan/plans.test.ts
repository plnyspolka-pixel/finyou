/**
 * Zakres dostępu inwestora (Umowa ramowa v7): usługa nieodpłatna, jeden
 * pakiet „Dostęp inwestora" 0 zł, brak PRO / opłaty sukcesu / wykupu okazji.
 */
import { describe, it, expect } from "vitest";
import {
  ACCESS_PRESENTATION,
  ALL_FEATURES,
  FEATURE_LABELS,
  SUCCESS_FEE_BPS,
  TIER_FEATURES,
  TIER_PRESENTATION,
  needsUnlockPayment,
  requiredTier,
  successFeeGrosz,
  successFeePln,
  tierHasFeature,
} from "./plans";

describe("dostęp inwestora — bez opłat", () => {
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

  it("prezentacja: 0 zł, bez PRO, bez cen jednostkowych, akceptacja umów online", () => {
    const p = ACCESS_PRESENTATION;
    expect(p.priceLabel).toBe("0 zł");
    const text = [p.name, p.tagline, p.note, ...p.bullets].join("\n");
    expect(text).not.toMatch(/\bPRO\b|Pakiet Podstawowy/);
    expect(text).not.toMatch(/1 500|3 000|5% od|Opłat[ay] Sukcesu|jednorazow/i);
    expect(p.bullets).toContain("Akceptacja pakietu umów online");
    expect(p.bullets.join(" ")).not.toMatch(/Automatyczne wypełnienie i podpisanie/);
  });
});
