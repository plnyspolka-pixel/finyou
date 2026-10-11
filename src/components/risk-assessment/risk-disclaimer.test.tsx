import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RISK_DISCLAIMER_TEXT } from "@/lib/investor-analytics/report-pdf";
import { RiskDisclaimer } from "./risk-disclaimer";

describe("RiskDisclaimer", () => {
  it("ma tę samą treść co zastrzeżenie w raporcie PDF", () => {
    const { container } = render(<RiskDisclaimer />);
    const text = (container.textContent ?? "").replace(/\s+/g, " ").trim();
    expect(text).toBe(RISK_DISCLAIMER_TEXT);
  });
});
