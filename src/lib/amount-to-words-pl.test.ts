import { describe, it, expect } from "vitest";
import { amountToWordsPLN } from "./amount-to-words-pl";

describe("amountToWordsPLN — normalizacja groszy (gr zawsze 0–99)", () => {
  it("0,995 → przeniesienie do pełnego złotego (stary błąd: „zero złotych 100/100”)", () => {
    // 0.995 × 100 → 99.5 → 100 gr; zaokrąglenie CAŁOŚCI przenosi do złotych.
    expect(amountToWordsPLN(0.995)).toBe("jeden złoty 00/100");
  });

  it("1,005 → jeden złoty 00/100 (bez ujemnych/setnych artefaktów)", () => {
    // 1.005 w IEEE-754 to ~1.00499…, więc 100 gr + 0 gr.
    expect(amountToWordsPLN(1.005)).toBe("jeden złoty 00/100");
  });

  it("1,999 → przeniesienie do pełnych złotych (stary błąd: „jeden złoty 100/100”)", () => {
    expect(amountToWordsPLN(1.999)).toBe("dwa złote 00/100");
  });

  it("0,999 → jeden złoty 00/100", () => {
    expect(amountToWordsPLN(0.999)).toBe("jeden złoty 00/100");
  });

  it("właściwość: żadna kwota nie daje „100/100”", () => {
    for (let i = 0; i < 2000; i++) {
      const amount = i * 0.001 + 0.0005; // kwoty celujące w granice zaokrągleń
      const words = amountToWordsPLN(amount);
      expect(words).not.toContain("100/100");
      const gr = Number(words.match(/(\d{2,3})\/100$/)?.[1]);
      expect(gr).toBeGreaterThanOrEqual(0);
      expect(gr).toBeLessThanOrEqual(99);
    }
  });

  it("zwykłe kwoty 2dp pozostają bez zmian", () => {
    expect(amountToWordsPLN(1234.56)).toBe(
      "jeden tysiąc dwieście trzydzieści cztery złote 56/100",
    );
    expect(amountToWordsPLN(0)).toBe("zero złotych 00/100");
    expect(amountToWordsPLN(2)).toBe("dwa złote 00/100");
  });
});
