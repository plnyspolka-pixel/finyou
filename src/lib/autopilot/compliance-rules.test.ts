import { describe, expect, it } from "vitest";
import {
  AI_LABEL_VIDEO,
  RISK_LINE,
  SENDER_LINE,
  applyMandatoryElements,
  checkHardRules,
  inferTrack,
} from "./compliance-rules";

const ids = (text: string, ctx: Parameters<typeof checkHardRules>[1]) =>
  checkHardRules(text, ctx).map((v) => v.ruleId);

describe("checkHardRules — prawdziwe podpisy z kolejki (29.09.2026)", () => {
  it("blokuje „bezpieczny zwrot” i „atrakcyjny zysk”", () => {
    const t =
      "Zastanawiasz się nad stabilną inwestycją? Pożyczki pod hipotekę to szansa na atrakcyjny i bezpieczny zwrot.";
    expect(ids(t, { track: "inwestor", kind: "video_caption" })).toContain("sure_profit");
  });
  it("blokuje „stabilne zyski i minimalne ryzyko”", () => {
    const t =
      "Szukasz bezpiecznego sposobu na pomnażanie kapitału? Odkryj stabilne zyski i minimalne ryzyko.";
    const v = ids(t, { track: "inwestor", kind: "video_caption" });
    expect(v).toContain("sure_profit");
    expect(v).toContain("minimal_risk");
  });
  it("przepuszcza rzeczowy podpis o LTV z linią ryzyka", () => {
    const t =
      "Pożyczasz 1,1 mln zł pod nieruchomość wartą 1 mln zł? Nawet sprzedaż za pełną wycenę nie pokryje długu. Dlatego przed wpłatą patrz na LTV.\n\nMateriał edukacyjny, nie stanowi oferty ani rekomendacji inwestycyjnej. Inwestowanie wiąże się z ryzykiem utraty kapitału.";
    expect(ids(t, { track: "inwestor", kind: "video_caption" })).toEqual([]);
  });
});

describe("checkHardRules — reguły wspólne", () => {
  const ctx = { track: "oba", kind: "post_caption" } as const;
  it.each([
    ["Gwarantowany zysk co miesiąc", "guarantee"],
    ["Inwestycja bez żadnego ryzyka", "no_risk"],
    ["Nawet 14% rocznie", "percent_return"],
    ["zwrot do 12 % w skali roku", "percent_return"],
    ["od kilkunastu do kilkudziesięciu procent rocznie", "verbal_return_range"],
    ["Podwój swój kapitał", "double_money"],
    ["Najlepsza inwestycja na rynku", "unbacked_superlative"],
    ["Tylko dziś specjalne warunki", "time_pressure"],
    ["Polecane przez KNF rozwiązanie", "institution_endorsement"],
    ["Klient PESEL 85010112345 dostał środki", "personal_data"],
    ["Napisz do jan.kowalski@gmail.com", "personal_data"],
  ])("%s → %s", (text, rule) => {
    expect(ids(text, ctx)).toContain(rule);
  });

  it("nie łapie Bankowego Funduszu Gwarancyjnego ani naszego maila", () => {
    const t =
      "Lokaty chroni Bankowy Fundusz Gwarancyjny, a pożyczki prywatne nie — to ryzyko. Pytania: kontakt@financeyou.pl";
    expect(ids(t, ctx)).toEqual([]);
  });
  it("blog może przytoczyć oprocentowanie lokat ze źródła", () => {
    const t = "Lokaty 12M oferują średnio 4,5% rocznie (dane NBP).";
    expect(ids(t, { track: "inwestor", kind: "blog_article" })).not.toContain("percent_return");
    expect(ids(t, { track: "inwestor", kind: "post_caption" })).toContain("percent_return");
  });
  it("„to nie jest porada” bez informacji o ryzyku nie wystarcza", () => {
    expect(ids("To nie jest porada inwestycyjna.", ctx)).toContain("not_advice_only");
    expect(
      ids("To nie jest porada. Inwestowanie wiąże się z ryzykiem utraty kapitału.", ctx),
    ).not.toContain("not_advice_only");
  });
  it("ceny tylko poza wideo", () => {
    const t = "Pakiet PRO kosztuje 3 000 zł za 6 miesięcy.";
    expect(ids(t, { track: "inwestor", kind: "video_script" })).toContain("price_in_video");
    expect(ids(t, { track: "inwestor", kind: "landing" })).not.toContain("price_in_video");
  });
  it("zaproszenie do zamkniętego klubu — tylko w treściach awatara", () => {
    const t = "Dołącz do naszego klubu inwestorów.";
    expect(ids(t, { track: "inwestor", kind: "video_script" })).toContain("closed_group_invite");
    expect(ids(t, { track: "inwestor", kind: "email" })).not.toContain("closed_group_invite");
  });
});

describe("checkHardRules — tory", () => {
  it("pożyczkobiorca: konsumenci i obietnice bez weryfikacji", () => {
    const ctx = { track: "pozyczkobiorca", kind: "video_script" } as const;
    expect(ids("Pożyczka na dowolny cel, także na wakacje", ctx)).toContain("consumer_targeting");
    expect(ids("Finansowanie bez BIK i bez zaświadczeń", ctx)).toContain("no_verification");
    expect(ids("Niskie oprocentowanie dla firm", ctx)).toContain("cost_as_slogan");
  });
  it("reguły toru inwestora nie dotyczą pożyczkobiorcy i odwrotnie", () => {
    expect(
      ids("Sam też inwestuję w takie pożyczki.", { track: "pozyczkobiorca", kind: "post_caption" }),
    ).not.toContain("i_invest_too_lure");
    expect(
      ids("Sam też inwestuję w takie pożyczki.", { track: "inwestor", kind: "post_caption" }),
    ).toContain("i_invest_too_lure");
    expect(ids("Pożyczka dla każdego", { track: "inwestor", kind: "post_caption" })).not.toContain(
      "consumer_targeting",
    );
  });
  it("tor „oba” sprawdza reguły obu torów", () => {
    const v = ids("Pożyczka dla każdego. Gwarancja odkupu udziałów.", {
      track: "oba",
      kind: "post_caption",
    });
    expect(v).toContain("consumer_targeting");
    expect(v).toContain("buyback_guarantee");
  });
  it("drukarka do pieniędzy przechodzi tylko ze zdaniem o ryzyku", () => {
    const ctx = { track: "inwestor", kind: "video_script" } as const;
    expect(ids("Bank to drukarka do pieniędzy.", ctx)).toContain("money_printer");
    expect(
      ids("Bank to drukarka do pieniędzy, ale każda pożyczka niesie ryzyko niespłaty.", ctx),
    ).not.toContain("money_printer");
  });
  it("scenariusz o pieniądzach wymaga beatu ryzyka", () => {
    const ctx = { track: "inwestor", kind: "video_script" } as const;
    expect(ids("Czy wiesz, jak bank zarabia na odsetkach?", ctx)).toContain("missing_risk_beat");
    expect(
      ids("Czy wiesz, jak bank zarabia na odsetkach? Ale pamiętaj o ryzyku niespłaty.", ctx),
    ).not.toContain("missing_risk_beat");
  });
});

describe("applyMandatoryElements", () => {
  it("dokleja ryzyko, nadawcę i etykietę AI do opisu wideo", () => {
    const r = applyMandatoryElements("Jak bank zarabia na odsetkach?", {
      track: "inwestor",
      kind: "video_caption",
    });
    expect(r.added).toEqual(["risk_line", "sender", "ai_label"]);
    expect(r.text).toContain(RISK_LINE.inwestor);
    expect(r.text).toContain(SENDER_LINE);
    expect(r.text).toContain(AI_LABEL_VIDEO);
    // Idempotencja: drugi przebieg nic nie dodaje.
    expect(
      applyMandatoryElements(r.text, { track: "inwestor", kind: "video_caption" }).added,
    ).toEqual([]);
  });
  it("tytułów nie rusza", () => {
    expect(
      applyMandatoryElements("Bank vs Ty", { track: "inwestor", kind: "title" }).added,
    ).toEqual([]);
  });
  it("wynik przechodzi reguły twarde", () => {
    const r = applyMandatoryElements("Pożyczka pod zastaw nieruchomości dla firmy", {
      track: "oba",
      kind: "post_caption",
    });
    expect(checkHardRules(r.text, { track: "oba", kind: "post_caption" })).toEqual([]);
  });
  it("tryb kompaktowy (X) — tylko etykieta AI", () => {
    const r = applyMandatoryElements("Pożyczki pod zastaw", {
      track: "oba",
      kind: "post_caption",
      compact: true,
    });
    expect(r.added).toEqual(["ai_label"]);
  });
});

describe("inferTrack", () => {
  it("rozpoznaje tory i remis", () => {
    expect(inferTrack("Inwestor lokuje kapitał w pożyczki — dla-inwestora")).toBe("inwestor");
    expect(inferTrack("Bank odmówił Twojej firmie? Złóż wniosek")).toBe("pozyczkobiorca");
    expect(inferTrack("Pożyczki pod zastaw nieruchomości")).toBe("oba");
  });
});

describe("checkHardRules — fakty w newsach nie są obietnicą", () => {
  it("stała stopa procentowa i gwarancje BGK to fakt rynkowy", () => {
    const ctx = { track: "pozyczkobiorca", kind: "post_caption" } as const;
    expect(ids("Banki wracają do kredytów ze stałą stopą procentową.", ctx)).toEqual([]);
    expect(ids("Firmy mogą skorzystać z gwarancji BGK de minimis.", ctx)).toEqual([]);
  });
  it("blog: KNF, terminy i prawo konsumenckie jako fakt", () => {
    const ctx = { track: "pozyczkobiorca", kind: "blog_article" } as const;
    const t =
      "KNF nadzoruje rynek pożyczek. Ostatni dzień na złożenie wniosku mija w piątek. UOKiK o kredytach konsumenckich.";
    expect(ids(t, ctx)).toEqual([]);
    expect(ids(t, { ...ctx, kind: "video_script" })).toEqual(
      expect.arrayContaining(["institution_endorsement", "time_pressure", "consumer_targeting"]),
    );
  });
});
