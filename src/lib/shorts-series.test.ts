import { describe, it, expect } from "vitest";
import {
  SHORTS_SERIES,
  buildEpisodeOverlays,
  buildEpisodeScript,
  episodePromptFor,
  findShortsEpisode,
  parseEpisodePromptTag,
} from "./shorts-series";
import { overlaysWithCueTiming } from "./caption-style";
import { parseShortsPromptTag } from "./shorts-question-bank";

describe("seria inwestorska", () => {
  it("10 odcinków z unikalnymi id, każdy z kartami ekranowymi", () => {
    expect(SHORTS_SERIES).toHaveLength(10);
    expect(new Set(SHORTS_SERIES.map((e) => e.id)).size).toBe(10);
    for (const ep of SHORTS_SERIES) {
      expect(ep.cards.length).toBeGreaterThan(0);
      for (const card of ep.cards) expect(card.rows.length).toBeGreaterThan(0);
    }
  });

  it("tag promptu #SN nie koliduje z tagiem paczki #N", () => {
    const ep = findShortsEpisode(1)!;
    const prompt = episodePromptFor(ep);
    expect(prompt).toBe("#S1 · Drukarka do pieniędzy");
    expect(parseEpisodePromptTag(prompt)).toBe(1);
    expect(parseShortsPromptTag(prompt)).toBeNull();
    expect(parseEpisodePromptTag("#12 · Czym jest pożyczka?")).toBeNull();
  });

  it("scenariusz 1:1: hook → treść → wyjątek → praktyka → CTA", () => {
    const ep = findShortsEpisode(1)!;
    const parts = buildEpisodeScript(ep);
    expect(parts.hook).toBe(ep.hook);
    expect(parts.content).toBe(`${ep.content} ${ep.exception} ${ep.practice}`);
    expect(parts.cta).toBe(ep.cta);
    expect(parts.script).toBe(`${ep.hook} ${parts.content} ${ep.cta}`);
    expect(parts.title.length).toBeLessThanOrEqual(92);
    expect(parts.description).toContain("Materiał edukacyjny");
  });

  it("odcinek 9: wejście od 50 tysięcy, bez sprzeczności z progiem", () => {
    const ep = findShortsEpisode(9)!;
    expect(ep.content).toContain("od 50 tysięcy");
    expect(ep.exception).toContain("Poniżej 50 tysięcy");
    expect(ep.exception).not.toContain("100 tys");
  });

  // Najważniejszy test: każdy fragment synchronizacji (karty, wiersze, koniec
  // karty, hook tytułu) musi dosłownie padać w scenariuszu — inaczej przy
  // wypalaniu karta wypadnie albo wiersz wejdzie nie w rytm lektora.
  it("każdy syncText każdego odcinka pada w tekście lektora", () => {
    for (const ep of SHORTS_SERIES) {
      const script = buildEpisodeScript(ep).script;
      const synced = overlaysWithCueTiming(buildEpisodeOverlays(ep), [
        { start: 0, end: 60, text: script },
      ]);
      expect(synced.cards, `odcinek #S${ep.id}: karta wypadła`).toHaveLength(ep.cards.length);
      // Tytuł odcinka synchronizowany z hookiem → koniec z kwestii.
      expect(synced.headlineEndSeconds, `odcinek #S${ep.id}: hook`).toBeCloseTo(60.25, 5);
      for (const card of synced.cards!) {
        for (const row of card.rows) {
          if (row.syncText) {
            expect(row.startSeconds, `odcinek #S${ep.id}: wiersz „${row.text}"`).toBe(0);
          }
        }
        if (card.endSyncText) {
          expect(card.endSeconds, `odcinek #S${ep.id}: koniec karty ${card.title}`).toBeCloseTo(
            60.3,
            5,
          );
        }
      }
    }
  });

  it("nakładki odcinka: znacznik inwestora, tytuł jako nagłówek, karty w kolejności", () => {
    const ov = buildEpisodeOverlays(findShortsEpisode(8)!);
    expect(ov.tag).toContain("INWESTOWANIE");
    expect(ov.headline).toBe("3 pytania w 60 sekund");
    expect(ov.headlineSyncText).toContain("Jak odrzucić złą pożyczkę");
    expect(ov.cards!.map((c) => c.title)).toEqual(["3 PYTANIA", "NAJWAŻNIEJSZE"]);
    expect(ov.cards![1].startSeconds).toBeGreaterThan(ov.cards![0].startSeconds);
  });
});
