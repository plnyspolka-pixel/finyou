import { describe, expect, it } from "vitest";
import { buildInvestorSalesScript } from "./investor-sales-script";
import { SUBSCRIPTION_MONTHLY_PLN, SUBSCRIPTION_YEARLY_PLN } from "./investor-plan/plans";

describe("scenariusz rozmowy z inwestorem", () => {
  const s = buildInvestorSalesScript();
  it("cena pochodzi z cennika w kodzie (tego samego co strona)", () => {
    const fmt = (v: number) => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " zł";
    expect(s).toContain(fmt(SUBSCRIPTION_MONTHLY_PLN));
    expect(s).toContain(fmt(SUBSCRIPTION_YEARLY_PLN));
  });
  it("potwierdza kwotę z formularza i bada oczekiwania, horyzont i doświadczenie", () => {
    expect(s).toContain("{{lead_amount}}");
    expect(s).toMatch(/skali roku/);
    expect(s).toMatch(/horyzont/);
    expect(s).toMatch(/inwestował/);
  });
  it("ma progi 30% i 50%", () => {
    expect(s).toContain("do 30% rocznie");
    expect(s).toContain("powyżej 50% rocznie");
  });
  it("opisuje proces: zlecenie, tematy, pełny kontakt, umowa w 2 kliknięcia, notariusz, wypłata, windykacja", () => {
    expect(s).toContain("składa {{forma}} zlecenie");
    expect(s).toContain("pełny kontakt do klienta od razu");
    expect(s).toContain("dwa kliknięcia");
    expect(s).toContain("wysyła dokumenty na adres wskazany");
    expect(s).toContain("nigdy nie dotykamy pieniędzy inwestora");
    expect(s).toContain("moduł windykacyjny");
    expect(s).toContain("Filip");
  });
});
