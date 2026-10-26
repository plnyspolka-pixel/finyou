import { describe, it, expect } from "vitest";
import {
  A0_TEXT_AGENT_ID,
  A2P_TEXT_AGENT_ID,
  honorificFor,
  investorWelcomeSmsBody,
  leadDynamicVariables,
  messengerAgentFor,
  resolveLeadRole,
} from "./ania-lead-context";
import { resolveCallbackTime, zeroOffersReason } from "./ania-investor-tools.server";

describe("rola leada z formularza Meta", () => {
  it("jawne ustawienie w panelu wygrywa z nazwą", () => {
    expect(resolveLeadRole({ lead_role: "klient", form_name: "Inwestorzy 2026" })).toBe("klient");
    expect(resolveLeadRole({ lead_role: "inwestor", form_name: "Pożyczka" })).toBe("inwestor");
  });
  it("bez ustawienia: nazwa z „inwest” → inwestor, inaczej klient", () => {
    expect(resolveLeadRole({ form_name: "Formularz INWESTOR hipoteka" })).toBe("inwestor");
    expect(resolveLeadRole({ form_name: "Pożyczka pod zastaw" })).toBe("klient");
    expect(resolveLeadRole(null)).toBe("klient");
  });
});

describe("forma Pan/Pani", () => {
  it("końcówka -a → Pani, wyjątki → Pan, puste → pusty", () => {
    expect(honorificFor("Anna")).toBe("Pani");
    expect(honorificFor("Marek")).toBe("Pan");
    for (const n of ["Kuba", "Barnaba", "Bonawentura", "Kosma", "Jarema"]) expect(honorificFor(n)).toBe("Pan");
    expect(honorificFor("")).toBe("");
    expect(honorificFor("Lead")).toBe("");
  });
});

describe("zmienne kontekstu leada", () => {
  it("brakujące wartości to puste stringi", () => {
    expect(leadDynamicVariables({})).toEqual({
      first_name: "",
      forma: "",
      lead_source: "",
      lead_role: "",
      lead_amount: "",
      lead_created_at: "",
      call_direction: "",
      investor_id: "",
    });
  });
  it("przekazuje imię, formę, źródło, rolę i kwotę", () => {
    const v = leadDynamicVariables({ firstName: "Ewa", source: "meta_ads", role: "inwestor", amount: "100 000 zł" });
    expect(v).toMatchObject({ first_name: "Ewa", forma: "Pani", lead_source: "meta_ads", lead_role: "inwestor", lead_amount: "100 000 zł" });
  });
});

describe("SMS inwestora", () => {
  it("treść z imieniem i bez imienia", () => {
    expect(investorWelcomeSmsBody("Jan")).toBe(
      "Dzień dobry, Jan, tu Ania z Finance You — dziękuję za zostawienie danych w sprawie inwestowania w pożyczki pod hipotekę. Zadzwonię wkrótce; wcześniej więcej tu: https://financeyou.pl/dla-inwestora",
    );
    expect(investorWelcomeSmsBody(null).startsWith("Dzień dobry, tu Ania")).toBe(true);
  });
});

describe("Messenger", () => {
  it("inwestor → A2P, nierozpoznany → A0, pożyczkobiorca → dotychczasowy", () => {
    expect(messengerAgentFor({ type: "inwestorski" })).toBe(A2P_TEXT_AGENT_ID);
    expect(messengerAgentFor({ type: "pozyczkowy" })).toBe(A0_TEXT_AGENT_ID);
    expect(messengerAgentFor({ type: "pozyczkowy", loan_application_id: "x" })).toBeNull();
  });
});

describe("oddzwonienie i stan konta", () => {
  const always = (d: Date) => ({ allowed: true, nextAllowedAt: d });
  it("nie wcześniej niż 24 h po ostatnim telefonie", () => {
    const now = new Date("2026-10-26T08:00:00Z");
    const t = resolveCallbackTime({ requested: new Date("2026-10-26T10:00:00Z"), now, lastCallAt: now, windowAt: always });
    expect(t?.toISOString()).toBe("2026-10-27T08:00:00.000Z");
  });
  it("poza oknem → najbliższe dozwolone, za daleko → odmowa", () => {
    const next = new Date("2026-10-27T06:00:00Z");
    const now = new Date("2026-10-26T08:00:00Z");
    expect(resolveCallbackTime({ requested: new Date("2026-10-26T21:30:00Z"), now, lastCallAt: null, windowAt: () => ({ allowed: false, nextAllowedAt: next }) })).toEqual(next);
    expect(resolveCallbackTime({ requested: new Date("2027-01-01T10:00:00Z"), now, lastCallAt: null, windowAt: always })).toBeNull();
  });
  it("powód zera ofert", () => {
    expect(zeroOffersReason({ ordersTotal: 0, activeAccepted: 0, visible: 0 })).toMatch(/Nie złożono/);
    expect(zeroOffersReason({ ordersTotal: 1, activeAccepted: 0, visible: 0 })).toMatch(/Brak aktywnego/);
    expect(zeroOffersReason({ ordersTotal: 1, activeAccepted: 1, visible: 9 })).toBeNull();
  });
});
