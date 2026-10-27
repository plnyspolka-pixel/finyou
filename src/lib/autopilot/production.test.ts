// Etap 1 produkcji — czysta logika: bufor, rotacja serii i tematów, brief,
// hasło rolki, tytuł z hasłem, spójność serii z katalogiem lead magnetów.
import { describe, expect, it } from "vitest";
import {
  MAX_PRODUCED_PER_TRACK_PER_DAY,
  PRODUCTION_PROMPT_TAG,
  REEL_BUFFER_PER_TRACK,
  SCHEDULED_HORIZON_DAYS,
  buildReelBrief,
  decideProduction,
  keywordOfReel,
  magnetOfReel,
  pickSeries,
  pickTopic,
  productionSeries,
  publishTitleWithKeyword,
  splitThesisAndTags,
} from "./production";
import { resolveKeywordTarget } from "@/lib/lead-magnets/catalog";
import { checkHardRules } from "./compliance-rules";
import { defaultProfiles } from "./profiles";
import { seriesBySlug } from "./series";
import { TRACKS } from "./types";

describe("produkcja — decyzja o buforze", () => {
  it("produkuje, gdy zapas (gotowe + w produkcji) jest poniżej bufora", () => {
    expect(
      decideProduction({ track: "inwestor", ready: 0, inProgress: 0, producedToday: 0 }).produce,
    ).toBe(true);
    expect(
      decideProduction({ track: "inwestor", ready: 1, inProgress: 0, producedToday: 1 }).produce,
    ).toBe(true);
    expect(
      decideProduction({ track: "inwestor", ready: 1, inProgress: 1, producedToday: 0 }).produce,
    ).toBe(false);
    expect(
      decideProduction({
        track: "inwestor",
        ready: REEL_BUFFER_PER_TRACK,
        inProgress: 0,
        producedToday: 0,
      }).produce,
    ).toBe(false);
  });

  it("rolki zaplanowane w kolejkach na najbliższe dni liczą się do zapasu (kolejka nie rośnie)", () => {
    expect(SCHEDULED_HORIZON_DAYS).toBe(REEL_BUFFER_PER_TRACK);
    // Jutro i pojutrze mają już rolki w kolejce — nic nie dorabiamy.
    const full = decideProduction({
      track: "inwestor",
      ready: 0,
      inProgress: 0,
      scheduledSoon: 2,
      producedToday: 0,
    });
    expect(full.produce).toBe(false);
    expect(full.reason).toMatch(/2 zaplanowanych/);
    // Jedna rolka zaplanowana, jedna w produkcji — zapas pełny.
    expect(
      decideProduction({
        track: "inwestor",
        ready: 0,
        inProgress: 1,
        scheduledSoon: 1,
        producedToday: 1,
      }).produce,
    ).toBe(false);
    // Dziura w kolejce (rolka zdjęta) — produkcja ją wypełnia.
    expect(
      decideProduction({
        track: "pozyczkobiorca",
        ready: 0,
        inProgress: 0,
        scheduledSoon: 1,
        producedToday: 0,
      }).produce,
    ).toBe(true);
  });

  it("limit dzienny ma pierwszeństwo przed pustym zapasem", () => {
    const d = decideProduction({
      track: "pozyczkobiorca",
      ready: 0,
      inProgress: 0,
      producedToday: MAX_PRODUCED_PER_TRACK_PER_DAY,
    });
    expect(d.produce).toBe(false);
    expect(d.reason).toMatch(/limit/);
  });
});

describe("produkcja — serie i lead magnety", () => {
  it("każda seria produkcyjna ma hasło prowadzące do opublikowanego materiału z katalogu albo kalkulatora", () => {
    for (const track of TRACKS) {
      const pool = productionSeries(track);
      expect(pool.length).toBeGreaterThanOrEqual(3);
      for (const s of pool) {
        expect(s.weekly, s.slug).toBeFalsy();
        const t = resolveKeywordTarget(s.defaultKeyword);
        expect(t, `${s.slug} → ${s.defaultKeyword}`).not.toBeNull();
        expect(t!.track).toBe(track);
      }
    }
  });

  it("rotacja: najdawniej użyta seria idzie pierwsza, nieużyta wygrywa", () => {
    const pool = productionSeries("inwestor").map((s) => s.slug);
    expect(pickSeries("inwestor", [])!.slug).toBe(pool[0]);
    // Ostatnio użyta pierwsza w puli → wybór pada na inną.
    const next = pickSeries("inwestor", [pool[0]])!;
    expect(next.slug).not.toBe(pool[0]);
    // Wszystkie użyte: najstarsza (ostatnia w historii) wraca.
    const history = [...pool].reverse(); // najnowsza = ostatnia z puli
    expect(pickSeries("inwestor", history)!.slug).toBe(pool[0]);
    expect(pickSeries("pozyczkobiorca", [])).not.toBeNull();
  });

  it("temat: najdawniej użyty w promptach, nieużyty pierwszy", () => {
    const topics = ["odmowa banku i alternatywy", "LTV i ile można uzyskać", "dokumenty i proces"];
    expect(pickTopic(topics, [])).toBe(topics[0]);
    expect(
      pickTopic(topics, [`${PRODUCTION_PROMPT_TAG} Temat rolki: odmowa banku i alternatywy.`]),
    ).toBe(topics[1]);
    expect(pickTopic([], ["x"])).toBeNull();
  });
});

describe("produkcja — brief dla scenarzysty", () => {
  const profiles = defaultProfiles();

  it("niesie serię, szkielet, hasło w CTA, ton toru i ostatnie tytuły; bez fraz blokowanych", () => {
    for (const track of TRACKS) {
      const series = productionSeries(track)[0];
      const magnet = resolveKeywordTarget(series.defaultKeyword)!;
      const brief = buildReelBrief({
        track,
        series,
        profile: profiles[track],
        magnet,
        recentTitles: ["Stary tytuł rolki"],
        topic: profiles[track].allowedTopics[0] ?? null,
      });
      expect(brief.startsWith(PRODUCTION_PROMPT_TAG)).toBe(true);
      expect(brief).toContain(series.badge);
      for (const beat of series.beats) expect(brief).toContain(beat);
      expect(brief).toContain(`Skomentuj ${series.defaultKeyword}`);
      expect(brief).toContain(magnet.name);
      expect(brief).toContain("Stary tytuł rolki");
      // Rolka sprzedażowa bez zdań o ryzyku i koszcie (decyzja właściciela 27.10.2026).
      expect(brief).toMatch(/ŻADNYCH zdań o ryzyku, koszcie/);
      expect(brief).not.toMatch(/jedno (?:krótkie |uczciwe )?zdanie o ryzyku/);
      // Sam brief (instrukcja) nie zawiera fraz z reguł twardych toru.
      const blocks = checkHardRules(brief, { kind: "script", track }).filter(
        (h) => h.severity === "block",
      );
      expect(blocks.map((b) => b.code)).toEqual([]);
    }
  });

  it("bez opublikowanego lead magnetu CTA to obserwowanie, bez hasła", () => {
    const series = seriesBySlug("czy-wiesz-ze")!;
    const brief = buildReelBrief({
      track: "inwestor",
      series,
      profile: profiles.inwestor,
      magnet: null,
      recentTitles: [],
      topic: null,
    });
    expect(brief).not.toContain("Skomentuj START");
    expect(brief).toContain("obserwowania");
  });
});

describe("produkcja — hasło i tytuł rolki", () => {
  it("hasło z serii, a bez serii z CTA w opisie; nieznane hasło = brak", () => {
    expect(keywordOfReel({ series: "bank-odmowil" })).toBe("ODMOWA");
    expect(
      keywordOfReel({ series: null, publish_description: "Napisz w komentarzu START, a wyślemy…" }),
    ).toBe("START");
    expect(keywordOfReel({ series: null, script: "Skomentuj UMOWA, a wyślę Ci wzór." })).toBe(
      "UMOWA",
    );
    expect(keywordOfReel({ series: null, publish_description: "Skomentuj XYZQ" })).toBeNull();
    expect(keywordOfReel({ series: null, publish_description: "Obserwuj profil." })).toBeNull();
    const m = magnetOfReel({ series: "3-bledy-finansowanie" });
    expect(m?.keyword).toBe("DOKUMENTY");
    expect(m?.target.slug).toBe("checklista-dokumentow");
  });

  it("opis joba dzieli się na tezę i hashtagi", () => {
    const r = splitThesisAndTags(
      "Teza w dwóch zdaniach. Druga.\n\n#hipoteka #inwestowanie #hipoteka",
    );
    expect(r.thesis).toBe("Teza w dwóch zdaniach. Druga.");
    expect(r.hashtags).toEqual(["#hipoteka", "#inwestowanie"]);
  });

  it("tytuł dostaje „Napisz HASŁO”, mieści się w 100 znakach i nie dubluje hasła", () => {
    expect(publishTitleWithKeyword("Bank powiedział nie?", "ODMOWA")).toBe(
      "Bank powiedział nie? Napisz ODMOWA",
    );
    expect(publishTitleWithKeyword("Pieniądze nudzą się? Napisz START", "START")).toBe(
      "Pieniądze nudzą się? Napisz START",
    );
    const long = publishTitleWithKeyword("a".repeat(120), "KSIĘGA");
    expect(long.length).toBeLessThanOrEqual(100);
    expect(long.endsWith("Napisz KSIĘGA")).toBe(true);
    expect(publishTitleWithKeyword("Tytuł", null)).toBe("Tytuł");
    expect(publishTitleWithKeyword("Zobacz alternatywne rozwiązania", "ODMOWA")).toBe(
      "Zobacz alternatywne rozwiązania. Napisz ODMOWA",
    );
  });
});
