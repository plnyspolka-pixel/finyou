import { describe, it, expect } from "vitest";
import {
  BLOG_MERGED,
  BLOG_NOINDEX,
  isIndexable,
  isNoDataTitle,
  isNoindex,
  mergedInto,
  mostSimilarTitle,
  titleSimilarity,
} from "./article-index";

describe("flagi widoczności artykułu", () => {
  it("czyta merged_into i noindex z raw_ai_output", () => {
    expect(mergedInto({ merged_into: "docelowy" })).toBe("docelowy");
    expect(mergedInto({ merged_into: "  " })).toBeNull();
    expect(mergedInto(null)).toBeNull();
    expect(mergedInto(["x"])).toBeNull();
    expect(isNoindex({ noindex: true })).toBe(true);
    expect(isNoindex({ noindex: "true" })).toBe(false);
    expect(isIndexable({ post_kind: "investor_news" })).toBe(true);
    expect(isIndexable({ merged_into: "a" })).toBe(false);
    expect(isIndexable({ noindex: true })).toBe(false);
  });
});

describe("podobieństwo tytułów", () => {
  const dupA =
    "Pożyczki pod zastaw nieruchomości vs obligacje COI/EDO vs lokaty 12M – co się bardziej opłaca inwestorowi HNW?";
  const dupB =
    "Pożyczka pod zastaw nieruchomości vs obligacje COI/EDO vs lokata 12M – porównanie dla inwestora";

  it("wykrywa niemal identyczne porównania", () => {
    expect(titleSimilarity(dupA, dupB)).toBeGreaterThan(0.55);
  });

  it("nie łączy różnych tematów", () => {
    expect(
      titleSimilarity(dupA, "Pożyczka pod zastaw działki budowlanej – przewodnik dla właścicieli"),
    ).toBeLessThan(0.35);
  });

  it("zwraca najbardziej podobny tytuł", () => {
    const best = mostSimilarTitle(dupB, [
      { slug: "dzialka", title: "Pożyczka pod zastaw działki budowlanej" },
      { slug: "dup", title: dupA },
    ]);
    expect(best?.slug).toBe("dup");
  });
});

describe("wpisy o braku danych", () => {
  it("rozpoznaje tytuły bez treści", () => {
    expect(isNoDataTitle("Brak świeżych danych z rynku a pożyczka pod zastaw")).toBe(true);
    expect(isNoDataTitle("Dzień bez danych rynkowych: jak dziś myśleć o pożyczkach")).toBe(true);
    expect(isNoDataTitle("Brak danych z rynku – co oznacza dla inwestora")).toBe(true);
    expect(isNoDataTitle("Stopy NBP bez zmian – co to oznacza dla inwestora")).toBe(false);
  });
});

describe("mapa scaleń bloga", () => {
  it("nie tworzy łańcuchów ani pętli przekierowań", () => {
    for (const [from, to] of Object.entries(BLOG_MERGED)) {
      expect(from).not.toBe(to);
      expect(BLOG_MERGED[to]).toBeUndefined();
      expect(BLOG_NOINDEX.has(to)).toBe(false);
    }
  });

  it("slug ze stałej mapy wygrywa nad pustym raw_ai_output", () => {
    const [from, to] = Object.entries(BLOG_MERGED)[0];
    expect(mergedInto(null, from)).toBe(to);
    expect(isIndexable(null, from)).toBe(false);
    expect(isIndexable(null, to)).toBe(true);
    expect(isNoindex(null, [...BLOG_NOINDEX][0])).toBe(true);
  });
});
