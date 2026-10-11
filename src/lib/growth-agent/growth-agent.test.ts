import { describe, expect, it } from "vitest";
import {
  describeBlocking,
  guardContent,
  INVESTOR_DISCLAIMER,
  xWeightedLength,
} from "./truth-guard";
import {
  armKey,
  classifyContent,
  mulberry32,
  planNextPost,
  slotForDate,
  summarizeArms,
  updateArms,
  warsawToUtcIso,
  type HistoryItem,
} from "./strategy";
import { engagementScore, median, rewardFromScore } from "./scoring";
import { buildCreateUserPrompt, normalizeDraft, openingOf } from "./brief";
import { expectedMaxFromRef, parseNbpRefRate } from "./nbp";
import { buildLiveFactsBlock } from "@/lib/agent-toolkit/live-facts";
import { maxCapitalRate } from "@/lib/contract-engine/fees";

const DATE = "2026-10-11";
const g = (
  text: string,
  audience: "inwestor" | "klient" | "ogolny" = "ogolny",
  platform: any = "facebook_post",
) => guardContent({ text, audience, platform, date: DATE });
const codes = (r: ReturnType<typeof guardContent>, sev = "block") =>
  r.violations.filter((v) => v.severity === sev).map((v) => v.code);

describe("strażnik prawdy", () => {
  it("blokuje obietnice zysku, bezpieczeństwa i finansowania", () => {
    expect(codes(g("Gwarantowany zysk 12% rocznie!"))).toContain("gwarancja_zysku");
    expect(codes(g("Inwestycja bez ryzyka, zabezpieczona hipoteką."))).toContain("bez_ryzyka");
    expect(codes(g("U nas każdy dostanie pożyczkę."))).toContain("gwarancja_finansowania");
    expect(codes(g("Zarobisz nawet 20 tysięcy w miesiąc."))).toContain("pewny_zysk");
  });

  it("blokuje liczby sprzeczne z umowami i cennikiem", () => {
    expect(codes(g("Prowizja Finance You to tylko 3% kwoty."))).toContain("prowizja_niezgodna");
    expect(codes(g("Finansujemy do 80% wartości nieruchomości."))).toContain("ltv_ponad_limit");
    expect(codes(g("Oprocentowanie nawet 18% rocznie."))).toContain("odsetki_ponad_maksymalne");
    expect(codes(g("Abonament kosztuje 999 zł."))).toContain("abonament_niezgodny");
    expect(codes(g("Odsetki 1,2% miesięcznie."))).toContain("stawka_miesieczna");
  });

  it("przepuszcza prawdziwe liczby z faktów", () => {
    const r = g(
      "Prowizja Finance You to 5% (min. 5 000 zł). Finansujemy do 60% wartości nieruchomości, oprocentowanie nie wyżej niż 14,5% rocznie. Masz pytanie? Napisz w komentarzu.",
      "klient",
    );
    expect(codes(r)).toEqual([]);
  });

  it("nie blokuje zdania, które mówi, czego NIE finansujemy", () => {
    expect(
      codes(g("Nie udzielamy pożyczek na wakacje — tylko na firmę. Pytania?", "klient")),
    ).not.toContain("rama_konsumencka");
    expect(codes(g("Szybka pożyczka na wakacje!", "klient"))).toContain("rama_konsumencka");
  });

  it("dokleja zastrzeżenie do treści inwestycyjnej i poprawia „link w bio” poza IG", () => {
    const r = g("Jak inwestor zarabia na pożyczkach pod hipotekę? Napisz, co myślisz.", "inwestor");
    expect(r.ok).toBe(true);
    expect(r.text).toContain(INVESTOR_DISCLAIMER);
    const fb = g("Szczegóły — link w bio. Pytania?", "klient");
    expect(fb.text).toContain("financeyou.pl");
    const ig = g("Szczegóły — link w bio. Pytania?", "klient", "instagram");
    expect(ig.text).toContain("link w bio");
  });

  it("blokuje cudze dane kontaktowe, przepuszcza oficjalne", () => {
    expect(codes(g("Zadzwoń: 600 123 456"))).toContain("obce_dane_kontaktowe");
    expect(codes(g("Zadzwoń: +48 732 059 898 albo napisz: kontakt@financeyou.pl"))).not.toContain(
      "obce_dane_kontaktowe",
    );
  });

  it("limit X liczy link jako 23 znaki i opis naruszeń nadaje się do naprawy", () => {
    expect(xWeightedLength("a https://financeyou.pl/bardzo/dlugi/adres/strony")).toBe(25);
    const r = g("x".repeat(300), "ogolny", "x");
    expect(codes(r)).toContain("za_dlugie");
    expect(describeBlocking(r)).toContain("Za długie");
  });
});

describe("strategia — bandyta i ograniczenia", () => {
  const bank = [
    { id: 1, category: "klient" as const, question: "Q1", thesis: "T1", section: "S" },
    { id: 2, category: "inwestor" as const, question: "Q2", thesis: "T2", section: "S" },
    { id: 3, category: "klient" as const, question: "Q3", thesis: "T3", section: "S" },
  ];
  const now = new Date("2026-10-11T08:00:00Z");

  it("po trzech postach do jednej grupy zmienia odbiorcę", () => {
    const history: HistoryItem[] = [0, 1, 2].map((i) => ({
      audience: "inwestor",
      pillar: (["edukacja", "informacja", "dowod"] as const)[i],
      createdAt: new Date(now.getTime() - (i + 1) * 86_400_000).toISOString(),
    }));
    for (let seed = 1; seed < 20; seed++) {
      const p = planNextPost({ arms: {}, history, now, rng: mulberry32(seed), questionBank: bank });
      expect(p.audience).toBe("pozyczkobiorca");
    }
  });

  it("rozrywka najwyżej raz na pięć postów, ten sam filar nie dwa razy z rzędu", () => {
    const history: HistoryItem[] = [
      { audience: "inwestor", pillar: "edukacja", createdAt: "2026-10-10T08:00:00Z" },
      { audience: "pozyczkobiorca", pillar: "rozrywka", createdAt: "2026-10-09T08:00:00Z" },
    ];
    for (let seed = 1; seed < 40; seed++) {
      const p = planNextPost({ arms: {}, history, now, rng: mulberry32(seed), questionBank: bank });
      expect(p.pillar).not.toBe("rozrywka");
      expect(p.pillar).not.toBe("edukacja");
    }
  });

  it("pytanie z bazy nie wraca w ciągu 60 dni", () => {
    const history: HistoryItem[] = [
      {
        audience: "inwestor",
        pillar: "edukacja",
        questionId: 1,
        createdAt: "2026-10-01T08:00:00Z",
      },
    ];
    for (let seed = 1; seed < 30; seed++) {
      const p = planNextPost({ arms: {}, history, now, rng: mulberry32(seed), questionBank: bank });
      if (p.question) expect(p.question.id).not.toBe(1);
    }
  });

  it("bandyta uczy się: nagradzana wartość wygrywa częściej", () => {
    let arms = {};
    for (let i = 0; i < 30; i++) {
      arms = updateArms(
        arms,
        { audience: "inwestor", pillar: "edukacja", hook: "liczba", slot: "07:40" },
        1,
      );
      arms = updateArms(
        arms,
        { audience: "pozyczkobiorca", pillar: "informacja", hook: "pytanie", slot: "19:05" },
        0,
      );
    }
    let inv = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const p = planNextPost({ arms, history: [], now, rng: mulberry32(seed), questionBank: bank });
      if (p.audience === "inwestor") inv++;
    }
    expect(inv).toBeGreaterThan(170);
    expect(summarizeArms(arms)[0].key).toMatch(/inwestor|edukacja|liczba|07:40/);
    expect(armKey("hook", "liczba")).toBe("hook:liczba");
  });

  it("pora w czasie Warszawy z uwzględnieniem czasu letniego", () => {
    expect(warsawToUtcIso(new Date("2026-10-11T00:00:00Z"), 0, 7, 40)).toBe(
      "2026-10-11T05:40:00.000Z",
    );
    expect(warsawToUtcIso(new Date("2026-12-11T00:00:00Z"), 0, 7, 40)).toBe(
      "2026-12-11T06:40:00.000Z",
    );
    expect(slotForDate("2026-10-11T17:30:00Z")).toBe("19:05");
  });

  it("klasyfikacja dawnych postów do ciepłego startu", () => {
    const c = classifyContent("Czy wiesz, że inwestor zarabia na odsetkach? Napisz w komentarzu.");
    expect(c.audience).toBe("inwestor");
    expect(c.hook).toBe("czy_wiesz");
    expect(c.pillar).toBe("zaangazowanie");
  });
});

describe("pomiar wyników", () => {
  it("komentarze i udostępnienia ważą więcej niż polubienia; zasięg min. 30", () => {
    expect(engagementScore({ likes: 3, reach: 3 })).toBe(0.1);
    expect(engagementScore({ comments: 1, reach: 100 })).toBeGreaterThan(
      engagementScore({ likes: 2, reach: 100 }),
    );
  });

  it("nagroda względem mediany konta", () => {
    expect(median([0.1, 0.3, 0.2])).toBe(0.2);
    expect(rewardFromScore(0.2, 0.2)).toBe(0.5);
    expect(rewardFromScore(1, 0.2)).toBe(1);
    expect(rewardFromScore(0, 0)).toBe(0.25);
  });
});

describe("brief i NBP", () => {
  it("brief zawiera fakty, kotwicę i listę otwarć do uniknięcia", () => {
    const prompt = buildCreateUserPrompt({
      plan: {
        audience: "pozyczkobiorca",
        pillar: "edukacja",
        hook: "mit_fakt",
        slot: "12:10",
        slotIso: "2026-10-11T10:10:00Z",
        question: {
          id: 7,
          question: "Czy zły BIK przekreśla?",
          thesis: "Nie automatycznie.",
          section: "BIK",
        },
      },
      factsBlock: buildLiveFactsBlock("klient", DATE),
      playbook: ["Zaczynaj od liczby."],
      recentOpenings: ["Czy wiesz, że…"],
    });
    expect(prompt).toContain("PRZEDSIĘBIORCY");
    expect(prompt).toContain("Czy zły BIK przekreśla?");
    expect(prompt).toContain("Zaczynaj od liczby.");
    expect(prompt).toContain("FAKTY Z SYSTEMU");
  });

  it("normalizacja szkicu i pierwsze zdanie", () => {
    const d = normalizeDraft({ facebook: " FB ", image_prompt: "office" });
    expect(d.instagram).toBe("FB");
    expect(d.imagePrompt).toBe("office");
    expect(openingOf("Mit: BIK zamyka drogę. Fakt: nie.")).toBe("Mit: BIK zamyka drogę.");
  });

  it("odsetki maksymalne z XML NBP zgadzają się z tabelą w kodzie", () => {
    const xml =
      '<stopy_procentowe><tabela><pozycja id="ref" nazwa="Stopa referencyjna" oprocentowanie="3,75" obowiazuje_od="2026-03-05"/></tabela></stopy_procentowe>';
    const p = parseNbpRefRate(xml);
    expect(p).toEqual({ ref: 3.75, from: "2026-03-05" });
    expect(expectedMaxFromRef(p!.ref)).toBe(maxCapitalRate(DATE));
    expect(parseNbpRefRate("<html/>")).toBeNull();
  });
});
