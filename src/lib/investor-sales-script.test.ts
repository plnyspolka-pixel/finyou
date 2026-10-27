import { describe, expect, it } from "vitest";
import { buildInvestorSalesScript } from "./investor-sales-script";
import { SUBSCRIPTION_YEARLY_PLN } from "./investor-plan/plans";

describe("scenariusz rozmowy z inwestorem", () => {
  const s = buildInvestorSalesScript({ fromLeadForm: true });
  const site = buildInvestorSalesScript();
  it("cena pochodzi z cennika w kodzie (tego samego co strona)", () => {
    const fmt = (v: number) => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " zł";
    expect(s).toContain(fmt(SUBSCRIPTION_YEARLY_PLN));
  });
  it("potwierdza kwotę z formularza i bada oczekiwania, horyzont i doświadczenie", () => {
    expect(s).toContain("{{lead_amount}}");
    expect(s).toMatch(/skali roku/);
    expect(s).toMatch(/[Hh]oryzont/);
    expect(s).toMatch(/inwestował/);
  });
  it("ocenia oczekiwania słownie, nie wylicza zysku, kalkulator", () => {
    expect(s).toContain("oceniasz go SŁOWNIE");
    expect(s).toContain("Nie wyliczasz zysku");
    expect(s).toContain("/#kalkulator");
    expect(s).toContain("to nie gwarancja");
    expect(s).toContain("/pobierz/darmowa-lekcja");
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
  it("pytania KROKU 2 brzmią naturalnie: osobno, bez bezosobowych konstrukcji", () => {
    expect(s).toContain("KAŻDE W OSOBNEJ WYPOWIEDZI");
    expect(s).toContain("Jaki zwrot w skali roku byłby dla Pana satysfakcjonujący?");
    expect(s).toContain("ZAKAZANE konstrukcje");
  });
  it("na stronie (A2) bez formularza i bez kwot zysku", () => {
    expect(site).not.toContain("Widzę w formularzu");
    expect(site).not.toContain("{{lead_amount}}");
    expect(site).toContain("Nie wyliczasz zysku");
    expect(site).toContain("Nie kończysz formułkami");
  });
});
