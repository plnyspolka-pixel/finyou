import { describe, expect, it } from "vitest";
import { investorFirstMessage, isInternalRoutingNote, isTextFiller } from "./ania-text-policy";

describe("text channel policy", () => {
  it("drops only the soft timeout filler, not substantive answers", () => {
    expect(isTextFiller("Już sprawdzam.")).toBe(true);
    expect(isTextFiller("Już sprawdzam Twój wniosek.")).toBe(false);
  });
  it("does not personalize unknown sources", () => expect(investorFirstMessage({})).toBeUndefined());
  it("uses feminine form and yesterday in Warsaw", () => {
    const text = investorFirstMessage({ lead_source: "meta_ads", first_name: "Anna", forma: "Pani", lead_amount: "100 000 zł", lead_created_at: "2026-10-23T12:00:00Z" }, new Date("2026-10-24T15:37:00Z"));
    expect(text).toContain("Pani Anno");
    expect(text).toContain("wczorajsze zgłoszenie");
    expect(text).toContain("wpisała Pani kwotę 100 000 zł");
    expect(text).not.toContain("zł zł");
  });
  it("uses masculine form and omits absent amount", () => {
    const text = investorFirstMessage({ lead_source: "meta_ads", first_name: "Kuba", forma: "Pan", lead_amount: "" });
    expect(text).toContain("Panie Kubo");
    expect(text).toContain("inwestuje Pan");
    expect(text).not.toContain("kwotę");
  });
  it("uses neutral grammar when identity is absent", () => {
    const text = investorFirstMessage({ lead_source: "meta_ads", forma: "", lead_amount: "50000" });
    expect(text).toContain("podana kwota to 50000 zł");
    expect(text).not.toMatch(/Pan|Pani/);
  });
});
describe("isInternalRoutingNote", () => {
  it("łapie notatkę o przekazaniu rozmowy", () => {
    expect(isInternalRoutingNote("Paweł wypełnił formularz inwestorski — przekazuję go na ścieżkę inwestorów.")).toBe(true);
    expect(isInternalRoutingNote("[SYSTEM FOLLOW-UP nr 2] ...")).toBe(true);
  });

  it("przepuszcza zwykłe przypomnienie", () => {
    expect(isInternalRoutingNote("Panie Pawle, chciałam się upewnić, że moja wiadomość dotarła. Czy ma Pan pytania?")).toBe(false);
  });
});
