// Treść SMS-a windykacyjnego: podpis wierzyciela (profil właściciela sprawy),
// nigdy „Finance You".
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => {
  const chain = {
    middleware: () => chain,
    inputValidator: () => chain,
    handler: () => async () => undefined,
  };
  return { createServerFn: () => chain, useServerFn: (fn: unknown) => fn };
});
vi.mock("@/lib/investor-plan/pro-middleware", () => ({ requireInvestorPro: {} }));

import { buildWindSmsText } from "./wind-quick-actions";

describe("buildWindSmsText — podpis wierzyciela", () => {
  const loan = { numer_umowy: "FY/2026/0042", pozyczkodawca: "Jan Inwestor" };

  it("podpis = krótka nazwa wierzyciela z profilu", () => {
    const t = buildWindSmsText(loan, 4000, { nadawca: "Kapitał Plus sp. z o.o." });
    expect(t).toMatch(/ i koszty\. Kapitał Plus sp\. z o\.o\.$/);
    expect(t).not.toContain("Finance You");
  });

  it("bez wierzyciela — pożyczkodawca z umowy; bez obu — bez podpisu", () => {
    expect(buildWindSmsText(loan, 4000, { wypowiedziana: true })).toMatch(/Jan Inwestor$/);
    const bez = buildWindSmsText({ numer_umowy: "FY/1" }, 4000);
    expect(bez).toMatch(/windykacyjne i koszty\.$/);
    expect(bez).not.toContain("Finance You");
  });
});
