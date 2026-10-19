import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/lead-magnets/lead-magnets.functions", () => ({ submitLeadMagnetSignup: vi.fn() }));

import { CalculatorTool } from "./calculator-tool";
import { CALCULATOR_CONFIGS } from "@/lib/lead-magnet-tools/calculator-configs";

describe("CalculatorTool", () => {
  const cfg = CALCULATOR_CONFIGS.find((c) => c.slug === "ile-pod-nieruchomosc")!;

  it("pokazuje teaser przed zapisem i formularz e-mail", () => {
    render(<CalculatorTool config={cfg} gate={{ slug: cfg.slug, consentText: "Zgoda" }} />);
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "1000000" } });
    expect(screen.getByText("Orientacyjna maksymalna kwota")).toBeTruthy();
    expect(screen.queryByText("Wolna wartość nieruchomości")).toBeNull();
    expect(screen.getByText("Pokaż pełny wynik")).toBeTruthy();
  });

  it("bez lead magnetu pokazuje pełny wynik", () => {
    render(<CalculatorTool config={cfg} gate={null} />);
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "1000000" } });
    expect(screen.getByText("Wolna wartość nieruchomości")).toBeTruthy();
  });
});
