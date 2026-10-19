import { describe, expect, it } from "vitest";
import {
  applyMandatoryElements,
  checkHardRules,
  COMPLIANCE_RULES_VERSION,
  findStaleYears,
  inferTrack,
  missingMandatoryElements,
  RISK_LINES,
} from "./compliance-rules";

const ids = (text: string, ctx: Parameters<typeof checkHardRules>[1]) =>
  checkHardRules(text, ctx).map((v) => v.ruleId);

describe("checkHardRules — wspólne", () => {
  it("ma wersję reguł", () => {
    expect(COMPLIANCE_RULES_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it("blokuje gwarancje, brak ryzyka i pewny zysk", () => {
    expect(ids("Gwarantowany zysk co miesiąc!", { kind: "caption" })).toContain("guarantee");
    expect(ids("Inwestycja bez ryzyka", { kind: "caption" })).toContain("no_risk");
    expect(ids("Pewny zysk z nieruchomości", { kind: "caption" })).toContain("sure_profit");
    expect(ids("Stabilne zyski i minimalne ryzyko", { kind: "caption" })).toEqual(
      expect.arrayContaining(["sure_profit", "minimal_risk"]),
    );
    expect(ids("Podwój swoje oszczędności", { kind: "video_script" })).toContain("double_money");
  });

  it("przepuszcza zaprzeczenia w tym samym zdaniu", () => {
    expect(ids("Nie ma inwestycji bez ryzyka.", { kind: "caption" })).not.toContain("no_risk");
    expect(ids("Nie gwarantujemy zysku. Pokażemy ryzyko.", { kind: "caption" })).toEqual([]);
    expect(ids(RISK_LINES.inwestor, { kind: "caption", track: "inwestor" })).toEqual([]);
    expect(ids(RISK_LINES.pozyczkobiorca, { kind: "caption", track: "pozyczkobiorca" })).toEqual([]);
  });

  it("pytanie z odpowiedzią „Nie” nie jest obietnicą", () => {
    expect(ids("Czy notariusz gwarantuje bezpieczeństwo? Nie. Pilnuje formy.", { kind: "caption" })).toEqual([]);
    expect(ids("Czy wiesz, że gwarantujemy zysk?", { kind: "caption" })).toContain("guarantee");
  });

  it("zaprzeczenie z poprzedniego zdania nie znosi reguły", () => {
    expect(ids("To nie żart. Gwarantowany zwrot.", { kind: "caption" })).toContain("guarantee");
  });

  it("blokuje stopy zwrotu jako obietnicę, ale nie LTV ani inflację", () => {
    expect(ids("Zarabiaj 12% rocznie na hipotece", { kind: "caption" })).toContain("percent_return");
    expect(ids("od kilkunastu procent rocznie zwrotu", { kind: "article" })).toContain("percent_return");
    expect(ids("LTV 60% oznacza zapas bezpieczeństwa", { kind: "caption" })).not.toContain(
      "percent_return",
    );
    expect(ids("Inflacja 4,5% zjada lokatę", { kind: "caption" })).not.toContain("percent_return");
  });

  it("blokuje zamknięty klub tylko w treściach wideo", () => {
    expect(ids("Dołącz do Klubu Inwestorów", { kind: "video_script" })).toContain("closed_group");
    expect(ids("Dołącz do Klubu Inwestorów", { kind: "email" })).not.toContain("closed_group");
  });

  it("blokuje ceny w wideo, nie kwoty edukacyjne", () => {
    expect(ids("Abonament 1500 zł / mies.", { kind: "caption" })).toContain("price_in_video");
    expect(ids("Pakiet PRO", { kind: "title" })).toContain("price_in_video");
    expect(ids("Pożyczasz 1,1 mln zł pod nieruchomość wartą 1 mln zł?", { kind: "caption" })).toEqual(
      [],
    );
  });

  it("formułka „to nie jest porada” wymaga zdania o ryzyku", () => {
    expect(ids("To nie jest porada inwestycyjna.", { kind: "caption" })).toContain("not_advice_only");
    expect(
      ids("Materiał nie stanowi porady. Inwestowanie wiąże się z ryzykiem.", { kind: "caption" }),
    ).not.toContain("not_advice_only");
  });

  it("blokuje dane identyfikujące", () => {
    expect(ids("KW WA1M/00012345/6", { kind: "caption" })).toContain("personal_data");
    expect(ids("PESEL 85010112345", { kind: "caption" })).toContain("personal_data");
    expect(ids("KRS 0000635207", { kind: "caption" })).not.toContain("personal_data");
  });

  it("blokuje instytucje jako rekomendację", () => {
    expect(ids("Oferta nadzorowana przez KNF", { kind: "caption" })).toContain(
      "regulator_endorsement",
    );
  });
});

describe("checkHardRules — tory", () => {
  it("pożyczkobiorca: konsument, brak weryfikacji, presja, koszt", () => {
    const ctx = { kind: "caption" as const, track: "pozyczkobiorca" as const };
    expect(ids("Pożyczka na dowolny cel", ctx)).toContain("consumer_targeting");
    expect(ids("Bez BIK i bez zdolności", ctx)).toContain("no_checks_promise");
    expect(ids("Tylko dziś! Nie czekaj", ctx)).toContain("time_pressure");
    expect(ids("Najniższe oprocentowanie na rynku", ctx)).toContain("cost_as_slogan");
    expect(ids("Nie finansujemy celów konsumpcyjnych.", ctx)).not.toContain("consumer_targeting");
  });

  it("reguły toru pożyczkobiorcy nie dotyczą toru inwestora", () => {
    expect(ids("Nie czekaj", { kind: "caption", track: "inwestor" })).not.toContain("time_pressure");
  });

  it("inwestor: odkup, drukarka bez ryzyka, „sam inwestuję”", () => {
    const ctx = { kind: "video_script" as const, track: "inwestor" as const };
    expect(ids("Dajemy gwarancję odkupu", ctx)).toContain("buyback_guarantee");
    expect(ids("To drukarka pieniędzy", ctx)).toContain("money_printer");
    expect(
      ids("Czy to drukarka pieniędzy? Nie. Pokażę ryzyko, które ją zatrzymuje.", ctx),
    ).not.toContain("money_printer");
    expect(ids("Sam też w to inwestuję", ctx)).toContain("insider_lure");
  });

  it("bez toru stosuje obie listy", () => {
    expect(ids("Nie czekaj, gwarancja odkupu", { kind: "caption" })).toEqual(
      expect.arrayContaining(["time_pressure", "buyback_guarantee"]),
    );
  });
});

describe("elementy obowiązkowe", () => {
  it("wykrywa braki i dopisuje je deterministycznie", () => {
    const ctx = { kind: "caption" as const, track: "inwestor" as const, aiGenerated: true };
    expect(missingMandatoryElements("Czy wiesz, czym jest LTV?", ctx)).toEqual([
      "ai_disclosure",
      "sender_identification",
      "risk_line",
    ]);
    const res = applyMandatoryElements("Czy wiesz, czym jest LTV?", ctx);
    expect(res).not.toBeNull();
    expect(res!.text).toContain("KRS 0000635207");
    expect(res!.text).toContain("AI");
    expect(missingMandatoryElements(res!.text, ctx)).toEqual([]);
    // dopisany tekst sam przechodzi reguły twarde
    expect(checkHardRules(res!.text, ctx)).toEqual([]);
  });

  it("nie dopisuje niczego do kompletnego opisu", () => {
    const text = `LTV. ${RISK_LINES.pozyczkobiorca}\nTreść AI. Finance You sp. z o.o., KRS 0000635207`;
    const res = applyMandatoryElements(text, {
      kind: "caption",
      track: "pozyczkobiorca",
      aiGenerated: true,
    });
    expect(res).toEqual({ text, added: [] });
  });

  it("przy limicie znaków używa wersji skróconej albo zwraca null", () => {
    const ctx = { kind: "caption" as const, aiGenerated: true };
    const res = applyMandatoryElements("Krótko o LTV.", ctx, { maxLength: 280 });
    expect(res!.text.length).toBeLessThanOrEqual(280);
    expect(applyMandatoryElements("x".repeat(279), ctx, { maxLength: 280 })).toBeNull();
  });
});

describe("pomocnicze", () => {
  it("rozpoznaje tor", () => {
    expect(inferTrack("Inwestorze, zobacz jak działa kapitał")).toBe("inwestor");
    expect(inferTrack("Bank odmówił firmie finansowania?")).toBe("pozyczkobiorca");
    expect(inferTrack("Dzień dobry")).toBeNull();
  });

  it("wykrywa przestarzały rok w tytułach", () => {
    const now = new Date("2026-10-19T00:00:00Z");
    expect(findStaleYears("W co inwestować pieniądze w 2024?", now)).toEqual([2024]);
    expect(findStaleYears("Przegląd tygodnia 13-19.05.2024", now)).toEqual([2024]);
    expect(findStaleYears("Ranking 2026 i plan na 2027", now)).toEqual([]);
    expect(findStaleYears("Na rynku od 2011 roku", now)).toEqual([]);
    expect(findStaleYears("Ceny 2019–2026", now)).toEqual([]);
  });
});
