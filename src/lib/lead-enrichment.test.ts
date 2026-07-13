import { describe, expect, it } from "vitest";
import { extractInboundFacts } from "./lead-enrichment.server";

describe("extractInboundFacts — imię i nazwisko", () => {
  it("wyciąga imię i nazwisko po 'pozdrawiam'", () => {
    const f = extractInboundFacts(
      "Witam proszę o kontakt jestem zainteresowany ofertą pozdrawiam Waldek Trojanowski",
    );
    expect(f.firstName).toBe("Waldek");
    expect(f.lastName).toBe("Trojanowski");
  });

  it("wyciąga imię i nazwisko po 'nazywam się'", () => {
    const f = extractInboundFacts("Dzień dobry, nazywam się Anna Kowalska-Nowak i szukam pożyczki");
    expect(f.firstName).toBe("Anna");
    expect(f.lastName).toBe("Kowalska-Nowak");
  });

  it("wyciąga samo imię po 'mam na imię'", () => {
    const f = extractInboundFacts("Cześć, mam na imię Jan i mam pytanie");
    expect(f.firstName).toBe("Jan");
    expect(f.lastName).toBeNull();
  });

  it("nie łapie 'jestem zainteresowany' jako nazwiska", () => {
    const f = extractInboundFacts("Witam, jestem zainteresowany ofertą pożyczki");
    expect(f.firstName).toBeNull();
    expect(f.lastName).toBeNull();
  });

  it("nie łapie 'Pozdrawiam Serdecznie'", () => {
    const f = extractInboundFacts("Dziękuję za informacje. Pozdrawiam Serdecznie");
    expect(f.firstName).toBeNull();
  });

  it("nadal wyciąga kwotę i KW razem z nazwiskiem", () => {
    const f = extractInboundFacts(
      "Potrzebuję 360000 złotych, KW WR1E/00097423/1, pozdrawiam Waldek Trojanowski",
    );
    expect(f.loanAmount).toBe(360000);
    expect(f.kwNumbers).toContain("WR1E/00097423/1");
    expect(f.firstName).toBe("Waldek");
    expect(f.lastName).toBe("Trojanowski");
  });
});
