import { describe, it, expect } from "vitest";
import {
  MAX_SHIFT_STEPS,
  describeShift,
  neighbourWindow,
  publicationChannel,
  spreadScheduledAt,
  titleSimilarity,
  topicText,
  topicTokens,
} from "./publication-schedule";

const H = 3_600_000;
const T0 = "2026-10-10T12:00:00.000Z";
const at = (hours: number) => new Date(new Date(T0).getTime() + hours * H).toISOString();

describe("topicTokens", () => {
  it("normalizuje: małe litery, bez emoji, hashtagów, interpunkcji i słów funkcyjnych", () => {
    const t = topicTokens("🔥 Jak działa POŻYCZKA pod hipotekę?! #shorts #finanse");
    expect([...t].sort()).toEqual(["dziala", "hipote", "pozycz"]);
  });

  it("sprowadza odmiany i pisownię bez ogonków do tego samego tokenu", () => {
    expect(topicTokens("pożyczki")).toEqual(topicTokens("pozyczke"));
    expect(topicTokens("Nieruchomości")).toEqual(topicTokens("nieruchomosc"));
  });

  it("pomija URL-e i pojedyncze znaki", () => {
    expect([...topicTokens("5 błędów https://financeyou.pl/r/abc")]).toEqual(["bledow"]);
  });
});

describe("titleSimilarity", () => {
  it("ten sam temat w innym szyku i odmianie ≈ 1", () => {
    expect(
      titleSimilarity("Jak działa pożyczka pod hipotekę?", "Pożyczki pod hipotekę — jak to działa"),
    ).toBe(1);
  });

  it("różne tematy — niskie podobieństwo", () => {
    expect(
      titleSimilarity(
        "Jak działa pożyczka pod hipotekę?",
        "Inwestowanie w wierzytelności od podstaw",
      ),
    ).toBeLessThan(0.2);
  });

  it("puste teksty dają 0, a nie NaN", () => {
    expect(titleSimilarity("", "")).toBe(0);
    expect(titleSimilarity("#shorts 🔥", "Coś")).toBe(0);
  });

  it("częściowe pokrycie liczone Jaccardem", () => {
    // {pozycz, hipote, szybka} vs {pozycz, hipote, warsza} → 2 / 4
    expect(titleSimilarity("Szybka pożyczka hipoteczna", "Pożyczka hipoteczna Warszawa")).toBe(0.5);
  });
});

describe("topicText / publicationChannel", () => {
  it("tytuł ma pierwszeństwo, bez niego pierwsza niepusta linia treści", () => {
    expect(topicText("Tytuł", "Treść")).toBe("Tytuł");
    expect(topicText("", "\n  Pierwsza linia\nDruga")).toBe("Pierwsza linia");
    expect(topicText(null, "x".repeat(300)).length).toBe(140);
  });

  it("post i rolka FB to jeden kanał", () => {
    expect(publicationChannel("facebook_post")).toBe("facebook");
    expect(publicationChannel("facebook_reels")).toBe("facebook");
    expect(publicationChannel("instagram_reels")).toBe("instagram_reels");
  });
});

describe("spreadScheduledAt", () => {
  const topic = "Jak działa pożyczka pod hipotekę?";

  it("bez konfliktu zostawia termin", () => {
    const r = spreadScheduledAt(T0, topic, [{ title: "Inwestowanie krok po kroku", at: at(1) }]);
    expect(r.shiftedDays).toBe(0);
    expect(r.scheduledAt.toISOString()).toBe(T0);
    expect(r.conflict).toBeNull();
    expect(describeShift("youtube", r)).toBeNull();
  });

  it("podobny temat w oknie ±20 h przesuwa o +24 h", () => {
    const r = spreadScheduledAt(T0, topic, [
      { id: "a", title: "Pożyczka pod hipotekę — jak działa", at: at(-5) },
    ]);
    expect(r.shiftedDays).toBe(1);
    expect(r.scheduledAt.toISOString()).toBe(at(24));
    expect(r.conflict?.id).toBe("a");
    expect(describeShift("youtube", r)).toContain("przesunięty o 1 d.");
  });

  it("podobny temat poza oknem (21 h wcześniej) nie przeszkadza", () => {
    const r = spreadScheduledAt(T0, topic, [{ title: topic, at: at(-21) }]);
    expect(r.shiftedDays).toBe(0);
  });

  it("granica okna (dokładnie 20 h) jeszcze jest konfliktem", () => {
    const r = spreadScheduledAt(T0, topic, [{ title: topic, at: at(20) }]);
    // +24 h jest 4 h od sąsiada → nadal konflikt; +48 h jest 28 h od niego → wolne.
    expect(r.shiftedDays).toBe(2);
  });

  it("przeskakuje kolejne zajęte doby", () => {
    const r = spreadScheduledAt(T0, topic, [
      { title: topic, at: at(0) },
      { title: topic, at: at(24) },
      { title: topic, at: at(48) },
    ]);
    expect(r.shiftedDays).toBe(3);
    expect(r.scheduledAt.toISOString()).toBe(at(72));
  });

  it("maksymalnie 7 dób — potem zwraca +7 d z flagą exhausted", () => {
    const busy = Array.from({ length: 10 }, (_, i) => ({ title: topic, at: at(i * 24) }));
    const r = spreadScheduledAt(T0, topic, busy);
    expect(r.shiftedDays).toBe(MAX_SHIFT_STEPS);
    expect(r.exhausted).toBe(true);
    expect(r.scheduledAt.toISOString()).toBe(at(7 * 24));
    expect(describeShift("facebook_post", r)).toContain("Limit 7 dób");
  });

  it("podobieństwo poniżej 0,5 nie wywołuje przesunięcia", () => {
    const r = spreadScheduledAt(T0, "Szybka pożyczka hipoteczna Kraków", [
      { title: "Pożyczka dla firm Gdańsk", at: at(1) },
    ]);
    expect(r.shiftedDays).toBe(0);
  });

  it("okno sąsiadów obejmuje wszystkie kroki z marginesem", () => {
    const w = neighbourWindow(T0);
    expect(w.from.toISOString()).toBe(at(-20));
    expect(w.to.toISOString()).toBe(at(7 * 24 + 20));
  });
});
