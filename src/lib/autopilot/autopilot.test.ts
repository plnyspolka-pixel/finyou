import { describe, it, expect } from "vitest";
import {
  adjustCadenceSplit,
  allocateWeekly,
  defaultProfiles,
  parseSplit,
  resolveProfiles,
} from "./profiles";
import {
  DEFAULT_LIMITS,
  detectAnomalies,
  evaluateGuards,
  resolveLimits,
  type AutopilotUsage,
} from "./safety";
import { buildFunnelDescription, CAPTION_LIMITS, withUtm } from "./funnel-description";
import { checkRequiredElements, evaluateCompliance } from "./compliance-rules";
import { runGateLoop, type GateDeps } from "./compliance-gate";
import {
  decideAb,
  findOutliers,
  judgeLeadMagnet,
  median,
  buildReportSms,
  type PublicationMetric,
} from "./metrics";
import { pickHooks, scoreHook, scoreIdea } from "./idea-scoring";
import { runCalculator, verifyCalculator } from "./calculator-engine";
import { STARTER_CALCULATORS } from "./calculators";
import { SERIES, seriesHasRiskBeat } from "./series";
import { contrastRatio, BRAND } from "@/lib/brand/brand";

const NOW = new Date("2026-10-19T10:00:00Z");

describe("profile torów", () => {
  it("obecne ustawienia stają się profilem pożyczkobiorcy", () => {
    const p = defaultProfiles({
      target_audience: "Przedsiębiorcy potrzebujący szybkiego finansowania",
      primary_cta_url: "https://app.financeyou.pl/embed/wniosek",
      daily_ai_budget_pln: 50,
    });
    expect(p.pozyczkobiorca.targetGroup).toBe("Przedsiębiorcy potrzebujący szybkiego finansowania");
    expect(p.pozyczkobiorca.ctaUrl).toBe("https://app.financeyou.pl/embed/wniosek");
    expect(p.inwestor.ctaUrl).toBe("https://financeyou.pl/dla-inwestora");
    expect(p.pozyczkobiorca.dailyAiBudgetPln + p.inwestor.dailyAiBudgetPln).toBe(50);
    expect(p.inwestor.monthlyAdBudgetPln).toBe(0);
  });

  it("zapisany profil nadpisuje pola, błędny zapis zostawia domyślne", () => {
    const ok = resolveProfiles({ audience_profiles: { inwestor: { weeklyReels: 7 } } });
    expect(ok.profiles.inwestor.weeklyReels).toBe(7);
    expect(ok.errors).toEqual([]);
    const bad = resolveProfiles({ audience_profiles: { inwestor: { ctaUrl: "nie-url" } } });
    expect(bad.profiles.inwestor.ctaUrl).toBe("https://financeyou.pl/dla-inwestora");
    expect(bad.errors.length).toBe(1);
  });

  it("podział kadencji: maks. 10 p.p./tydz., granice 20–80, raz na 7 dni", () => {
    const econ = {
      pozyczkobiorca: { leads: 10, costPln: 100, leadValuePln: 1000 },
      inwestor: { leads: 0, costPln: 100, leadValuePln: 1000 },
    };
    const r = adjustCadenceSplit({ pozyczkobiorca: 50, inwestor: 50 }, econ, null, NOW);
    expect(r.split).toEqual({ pozyczkobiorca: 60, inwestor: 40 });
    const r2 = adjustCadenceSplit({ pozyczkobiorca: 75, inwestor: 25 }, econ, null, NOW);
    expect(r2.split.pozyczkobiorca).toBe(80);
    const recent = new Date(NOW.getTime() - 2 * 86_400_000);
    expect(
      adjustCadenceSplit({ pozyczkobiorca: 50, inwestor: 50 }, econ, recent, NOW).changed,
    ).toBe(false);
    expect(parseSplit({ pozyczkobiorca: 3, inwestor: 1 })).toEqual({
      pozyczkobiorca: 75,
      inwestor: 25,
    });
    expect(allocateWeekly({ pozyczkobiorca: 60, inwestor: 40 }, 12)).toEqual({
      pozyczkobiorca: 7,
      inwestor: 5,
    });
  });
});

const USAGE: AutopilotUsage = {
  aiSpentTodayPln: 10,
  aiSpentAvg7dPln: 10,
  postsToday: {},
  consecutivePublishFailures: 0,
  heygenRemainingCredits: 100,
  adSpentMonthPln: { pozyczkobiorca: 0, inwestor: 0 },
  platformWarnings24h: 0,
  qcChecks24h: 0,
  qcRejects24h: 0,
};

describe("bezpieczniki", () => {
  it("wyłącznik awaryjny blokuje wszystko", () => {
    const d = evaluateGuards(
      { mode: "full_autopilot", paused: true, pausedReason: "test" },
      DEFAULT_LIMITS,
      USAGE,
      { kind: "publish", platform: "youtube" },
    );
    expect(d.allowed).toBe(false);
  });

  it("tryby: manual_review → szkic, semi_auto → publikacja jako szkic, full → wprost", () => {
    const pub = { kind: "publish" as const, platform: "youtube" as const };
    expect(
      evaluateGuards({ mode: "manual_review", paused: false }, DEFAULT_LIMITS, USAGE, pub).asDraft,
    ).toBe(true);
    expect(
      evaluateGuards({ mode: "semi_auto", paused: false }, DEFAULT_LIMITS, USAGE, pub).asDraft,
    ).toBe(true);
    expect(
      evaluateGuards({ mode: "semi_auto", paused: false }, DEFAULT_LIMITS, USAGE, {
        kind: "produce_video",
      }).asDraft,
    ).toBe(false);
    expect(
      evaluateGuards({ mode: "full_autopilot", paused: false }, DEFAULT_LIMITS, USAGE, pub),
    ).toEqual({ allowed: true, asDraft: false, reasons: [] });
    expect(evaluateGuards({ mode: "off", paused: false }, DEFAULT_LIMITS, USAGE, pub).allowed).toBe(
      false,
    );
  });

  it("limity: budżet AI, HeyGen, publikacje na dobę, podbicia domyślnie wyłączone", () => {
    const s = { mode: "full_autopilot" as const, paused: false };
    expect(
      evaluateGuards(
        s,
        DEFAULT_LIMITS,
        { ...USAGE, aiSpentTodayPln: 49 },
        { kind: "llm", estCostPln: 2 },
      ).allowed,
    ).toBe(false);
    expect(
      evaluateGuards(
        s,
        DEFAULT_LIMITS,
        { ...USAGE, heygenRemainingCredits: 1 },
        { kind: "produce_video" },
      ).allowed,
    ).toBe(false);
    expect(
      evaluateGuards(
        s,
        DEFAULT_LIMITS,
        { ...USAGE, postsToday: { youtube: 3 } },
        { kind: "publish", platform: "youtube" },
      ).allowed,
    ).toBe(false);
    expect(
      evaluateGuards(s, DEFAULT_LIMITS, USAGE, { kind: "boost", track: "inwestor", estCostPln: 10 })
        .allowed,
    ).toBe(false);
  });

  it("anomalie wyzwalają pauzę", () => {
    expect(detectAnomalies(DEFAULT_LIMITS, USAGE)).toEqual([]);
    const a = detectAnomalies(DEFAULT_LIMITS, {
      ...USAGE,
      consecutivePublishFailures: 5,
      aiSpentTodayPln: 40,
      platformWarnings24h: 1,
      qcChecks24h: 4,
      qcRejects24h: 3,
    });
    expect(a.map((x) => x.code)).toEqual([
      "publish_failures",
      "cost_spike",
      "platform_warning",
      "qc_degradation",
    ]);
  });

  it("limity z ustawień: częściowe nadpisanie, budżet AI z ai_growth_settings", () => {
    const l = resolveLimits({ maxPostsPerDayPerPlatform: 2 }, 30);
    expect(l.maxPostsPerDayPerPlatform).toBe(2);
    expect(l.dailyAiBudgetPln).toBe(30);
    expect(resolveLimits("śmieci", null)).toEqual(DEFAULT_LIMITS);
  });
});

describe("opis-lejek", () => {
  it("IG: hasło w 1. linii, stopka zgodna z compliance", () => {
    const d = buildFunnelDescription({
      platform: "instagram_reels",
      track: "inwestor",
      thesis: "Bank zarabia na odsetkach od stuleci. Ty też możesz – ale z głową.",
      keyword: "umowa",
      leadMagnetName: "wzór umowy pożyczki pod hipotekę",
      hashtags: ["inwestowanie", "#hipoteka"],
    });
    expect(d.split("\n")[0]).toBe(
      "👉 Skomentuj UMOWA, a wyślę Ci wzór umowy pożyczki pod hipotekę.",
    );
    expect(checkRequiredElements(d, { kind: "description", track: "inwestor" })).toEqual([]);
    expect(evaluateCompliance(d, { kind: "description", track: "inwestor" }).ok).toBe(true);
  });

  it("długa teza jest skracana, a stopka zostaje", () => {
    const d = buildFunnelDescription({
      platform: "tiktok",
      track: "pozyczkobiorca",
      thesis: "a ".repeat(2000),
    });
    expect(d.length).toBeLessThanOrEqual(CAPTION_LIMITS.tiktok + 200);
    expect(d).toContain("KRS 0000635207");
  });

  it("X mieści się w 280 znakach z KRS i oznaczeniem AI", () => {
    const d = buildFunnelDescription({
      platform: "x",
      track: "pozyczkobiorca",
      thesis: "x".repeat(400),
      leadMagnetUrl: "https://financeyou.pl/pobierz/ile?utm_source=x",
    });
    expect(d.length).toBeLessThanOrEqual(280);
    expect(d).toContain("KRS 0000635207");
  });

  it("UTM per publikacja", () => {
    expect(
      withUtm("https://financeyou.pl/pobierz/ile", {
        platform: "youtube",
        campaign: "pozyczkobiorca-bank-odmowil",
        content: "abc",
      }),
    ).toBe(
      "https://financeyou.pl/pobierz/ile?utm_source=youtube&utm_medium=social&utm_campaign=pozyczkobiorca-bank-odmowil&utm_content=abc",
    );
  });
});

describe("pętla bramki compliance", () => {
  const okReview = async () => ({ verdict: "ok" as const, risk: 5, issues: [] });

  it("czysty tekst przechodzi bez przepisywania", async () => {
    const r = await runGateLoop(
      {
        text: "Czy bank Ci odmówił? Zobacz, co możesz zrobić.",
        ctx: { kind: "script", track: "pozyczkobiorca" },
      },
      { review: okReview, rewrite: async (t) => t },
    );
    expect(r.status).toBe("passed");
  });

  it("blokada reguł → przepisanie → przejście", async () => {
    let calls = 0;
    const deps: GateDeps = {
      review: okReview,
      rewrite: async () => {
        calls++;
        return "Czy wiesz, jak bank zarabia na odsetkach? Pamiętaj o ryzyku.";
      },
    };
    const r = await runGateLoop(
      { text: "Gwarantowany zysk 12% rocznie!", ctx: { kind: "script", track: "inwestor" } },
      deps,
    );
    expect(r.status).toBe("rewritten");
    expect(calls).toBe(1);
  });

  it("po 3 nieudanych poprawkach – odrzucenie", async () => {
    const deps: GateDeps = { review: okReview, rewrite: async () => "Bez ryzyka!" };
    const r = await runGateLoop({ text: "Bez ryzyka!", ctx: { kind: "script" } }, deps);
    expect(r.status).toBe("rejected");
    expect(r.iterations.length).toBe(4);
  });

  it("niedostępny recenzent = odrzucenie (bez publikacji na ślepo)", async () => {
    const r = await runGateLoop(
      { text: "Czy wiesz, czym jest LTV?", ctx: { kind: "script" } },
      {
        review: async () => {
          throw new Error("timeout");
        },
        rewrite: async (t) => t,
      },
    );
    expect(r.status).toBe("rejected");
  });

  it("wysokie ryzyko recenzenta wymusza poprawkę nawet przy „ok”", async () => {
    let n = 0;
    const deps: GateDeps = {
      review: async () =>
        n++ === 0
          ? { verdict: "ok", risk: 80, issues: [] }
          : { verdict: "ok", risk: 10, issues: [] },
      rewrite: async (t) => `${t} Pamiętaj o ryzyku.`,
    };
    const r = await runGateLoop(
      { text: "Czy wiesz, czym jest LTV?", ctx: { kind: "script" } },
      deps,
    );
    expect(r.status).toBe("rewritten");
  });

  it("wysokie ryzyko bez uwag: poprawka usuwa obietnice i nigdy nie dopisuje ryzyka", async () => {
    const seen: { problem: string; fix: string }[][] = [];
    let n = 0;
    const deps: GateDeps = {
      review: async () =>
        n++ === 0
          ? { verdict: "ok", risk: 60, issues: [] }
          : { verdict: "ok", risk: 10, issues: [] },
      rewrite: async (t, _ctx, issues) => {
        seen.push(issues);
        return t;
      },
    };
    await runGateLoop({ text: "Czy wiesz, czym jest LTV?", ctx: { kind: "script" } }, deps);
    expect(seen).toHaveLength(1);
    expect(seen[0][0].fix).toMatch(/Nie dopisuj zdań o ryzyku/);
    expect(seen[0][0].fix).not.toMatch(/dodaj/i);
  });
});

describe("metryki", () => {
  const rows: PublicationMetric[] = [5, 6, 7, 5, 4, 40].map((v, i) => ({
    platform: "instagram_reels",
    externalPostId: String(i),
    track: "inwestor",
    views: v,
  }));

  it("mediana i outliery względem własnej grupy", () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    const o = findOutliers(rows);
    expect(o.map((x) => x.externalPostId)).toEqual(["5"]);
    expect(findOutliers(rows.slice(0, 4))).toEqual([]);
  });

  it("A/B: decyzja po 72 h i 200 wyświetleniach", () => {
    expect(decideAb({ id: "a", views: 500 }, { id: "b", views: 900 }, 10).decided).toBe(false);
    expect(decideAb({ id: "a", views: 500 }, { id: "b", views: 900 }, 80)).toMatchObject({
      decided: true,
      winner: "b",
    });
    expect(decideAb({ id: "a", views: 500 }, { id: "b", views: 520 }, 80).winner).toBe("a");
  });

  it("ocena lead magnetu pod opt-in", () => {
    expect(
      judgeLeadMagnet(
        { slug: "x", track: "inwestor", pageViews: 50, signups: 10, linkedViews: 0 },
        0.2,
      ),
    ).toBe("za_malo_danych");
    expect(
      judgeLeadMagnet(
        { slug: "x", track: "inwestor", pageViews: 400, signups: 5, linkedViews: 0 },
        0.2,
      ),
    ).toBe("wycofaj");
    expect(
      judgeLeadMagnet(
        { slug: "x", track: "inwestor", pageViews: 200, signups: 70, linkedViews: 0 },
        0.2,
      ),
    ).toBe("promuj");
  });

  it("raport SMS jest krótki", () => {
    const sms = buildReportSms({
      periodLabel: "19.10",
      tracks: [
        { track: "inwestor", publications: 1, medianViews: 5, signups: 0, leads: 0, costPln: 3 },
      ],
      outliers: 0,
      changes: [],
      alarms: [],
      paused: false,
    });
    expect(sms.length).toBeLessThanOrEqual(300);
  });
});

describe("scoring pomysłów i hooków", () => {
  it("dobry pomysł ponad progiem, ryzykowny pod", () => {
    const good = scoreIdea({
      thesisClarity: 0.9,
      hasNumberOrContrast: true,
      hasStakes: true,
      hasContext: true,
      hasEnemy: true,
      sharePotential: 0.7,
      fitsTrackAndSeries: true,
      complianceBlocks: 0,
      recentDuplicates: 0,
    });
    expect(good).toBeGreaterThanOrEqual(80);
    const risky = scoreIdea({
      thesisClarity: 0.9,
      hasNumberOrContrast: true,
      hasStakes: true,
      hasContext: true,
      hasEnemy: true,
      sharePotential: 0.7,
      fitsTrackAndSeries: true,
      complianceBlocks: 3,
      recentDuplicates: 1,
    });
    expect(risky).toBeLessThan(60);
  });

  it("hook-teza z pytaniem i liczbą wygrywa z zagadką i z obietnicą", () => {
    const { best, ranked } = pickHooks(
      [
        { text: "Mam dla Ciebie coś ciekawego…" },
        { text: "Gwarantowany zysk dla każdego?" },
        { text: "Bank odmówił Ci 500 tys. zł? Masz jeszcze 3 opcje." },
      ],
      "pozyczkobiorca",
    );
    expect(best?.text).toContain("Bank odmówił");
    expect(ranked[ranked.length - 1].score).toBeLessThan(best!.score);
    expect(scoreHook({ text: "Gwarantowany zysk?" }, "inwestor").reasons.join()).toContain(
      "compliance",
    );
  });
});

describe("kalkulatory z konfiguracji", () => {
  it("wszystkie startowe narzędzia przechodzą kontrolę jakości", () => {
    for (const c of STARTER_CALCULATORS) expect(verifyCalculator(c)).toEqual([]);
  });

  it("wszystkie wyniki klienta bez zapisu na listę", () => {
    const ile = STARTER_CALCULATORS.find((c) => c.keyword === "ILE");
    if (!ile) throw new Error("Brak ILE");
    const r = runCalculator(ile, { property_value: 1000000, encumbrances: 0 });
    expect(r.visible.find((v) => v.key === "max_loan_pln")?.value).toMatch(/600\s000 zł/);
    expect(r.gated).toEqual([]);
    expect(r.visible.map((v) => v.key)).toEqual([
      "max_loan_pln",
      "limit_pct",
      "fy_fee_pln",
      "net_pln",
    ]);
    const unlocked = runCalculator(ile, { property_value: 1000000 }, { unlocked: true });
    expect(unlocked.gated).toEqual([]);
  });

  it("walidacja wejścia", () => {
    const ltv = STARTER_CALCULATORS.find((c) => c.keyword === "LTV")!;
    expect(runCalculator(ltv, { property_value: "abc", loan_amount: 1 }).errors).toMatchObject({
      property_value: "Podaj liczbę.",
      loan_amount: "Minimum 10000.",
    });
  });

  it("założenia i tytuły narzędzi przechodzą reguły twarde", () => {
    for (const c of STARTER_CALCULATORS) {
      const text = [c.title, c.promise, ...c.assumptions].join("\n");
      expect(evaluateCompliance(text, { kind: "lead_magnet", track: c.track }).blocks).toEqual([]);
    }
  });
});

describe("serie i marka", () => {
  it("żadna seria nie ma beatu o ryzyku ani karty alert (rolki sprzedażowe); slugi unikalne", () => {
    expect(SERIES.filter(seriesHasRiskBeat).map((s) => s.slug)).toEqual([]);
    expect(new Set(SERIES.map((s) => s.slug)).size).toBe(SERIES.length);
  });

  it("kolory marki mają czytelny kontrast", () => {
    expect(contrastRatio(BRAND.colors.primary, BRAND.colors.background)).toBeGreaterThan(7);
    expect(contrastRatio(BRAND.colors.primaryForeground, BRAND.colors.accent)).toBeGreaterThan(4.5);
  });
});

describe("narzędzia jako lead magnety", () => {
  it("rekord lead magnetu narzędzia przechodzi schemat lead magnetów", async () => {
    const { toolMagnetRow } = await import("./tools");
    const { leadMagnetSchema } = await import("@/lib/lead-magnets/schema");
    for (const c of STARTER_CALCULATORS) {
      const row = toolMagnetRow(c, "https://financeyou.pl", true);
      const parsed = leadMagnetSchema.safeParse(row);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      expect(row.file_url).toBe(`https://financeyou.pl/narzedzie/${c.slug}`);
      expect(row.trigger_keywords).toEqual([c.keyword]);
    }
  });

  it("mail z pełnym wynikiem ma stopkę i przechodzi reguły", async () => {
    const { toolResultEmail } = await import("./tools");
    const c = STARTER_CALCULATORS.find((x) => x.keyword === "LTV")!;
    const mail = toolResultEmail(
      c,
      runCalculator(c, { property_value: 1000000, loan_amount: 400000 }, { unlocked: true }),
      "Anna",
    );
    expect(mail.text).toContain("{link}");
    expect(mail.text).toContain("Bufor do limitu systemu: 20%");
    const r = evaluateCompliance(mail.text, { kind: "email", track: c.track });
    expect(r.blocks).toEqual([]);
    expect(r.requires.map((x) => x.code)).toEqual(["brak_oznaczenia_ai"]);
  });
});

describe("sekwencje powitalne", () => {
  it("treści przechodzą reguły compliance i mają stopkę", async () => {
    const { WELCOME_SEQUENCES, renderStep } = await import("./sequences");
    for (const track of ["pozyczkobiorca", "inwestor"] as const) {
      for (const s of WELCOME_SEQUENCES[track]) {
        const text = `${s.subject}\n${renderStep(track, s, "Jan")}`;
        const r = evaluateCompliance(text, { kind: "email", track });
        expect(r.blocks, `${track}#${s.step}`).toEqual([]);
        expect(text).toContain("KRS 0000635207");
      }
    }
  });

  it("kolejny krok: termin, odstęp, limit tygodniowy, jeden na przebieg", async () => {
    const { nextSequenceStep } = await import("./sequences");
    const base = {
      subscriberId: "s",
      tags: ["lead-magnet", "inwestor"],
      createdAt: "2026-10-10T10:00:00Z",
      sentSteps: [] as number[],
      sentLast7d: 0,
    };
    expect(nextSequenceStep(base, NOW, 3)?.step.step).toBe(1);
    expect(nextSequenceStep({ ...base, sentSteps: [1] }, NOW, 3)?.step.step).toBe(2);
    expect(
      nextSequenceStep({ ...base, sentSteps: [1], lastSentAt: "2026-10-19T08:00:00Z" }, NOW, 3),
    ).toBeNull();
    expect(nextSequenceStep({ ...base, sentLast7d: 3 }, NOW, 3)).toBeNull();
    expect(nextSequenceStep({ ...base, createdAt: "2026-10-18T10:00:00Z" }, NOW, 3)).toBeNull();
    expect(nextSequenceStep({ ...base, tags: ["lead-magnet"] }, NOW, 3)).toBeNull();
  });
});

describe("import metryk", () => {
  it("mapuje insights IG i statystyki YouTube", async () => {
    const { igMetricRow, insightsMap, ytMetricRow, isoDurationSeconds } =
      await import("./metrics-import");
    const ins = insightsMap([
      { name: "views", values: [{ value: 120 }] },
      { name: "reach", total_value: { value: 90 } },
      { name: "saved", values: [{ value: 3 }] },
    ]);
    const ig = igMetricRow(
      { id: "1", timestamp: "2026-10-01T10:00:00Z", like_count: 4, comments_count: 1 },
      ins,
    );
    expect(ig).toMatchObject({
      platform: "instagram_reels",
      views: 120,
      reach: 90,
      saves: 3,
      likes: 4,
      comments: 1,
    });
    const yt = ytMetricRow({
      id: "v",
      statistics: { viewCount: "55", likeCount: "2" },
      contentDetails: { duration: "PT45S" },
    });
    expect(yt).toMatchObject({ views: 55, likes: 2, comments: null, duration_s: 45 });
    expect(isoDurationSeconds("PT1M5S")).toBe(65);
    expect(isoDurationSeconds("bad")).toBeNull();
  });
});
