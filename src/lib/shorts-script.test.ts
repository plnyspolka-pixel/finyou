import { describe, it, expect } from "vitest";
import { buildShortsOverlays, SHORTS_OVERLAY_TAGS } from "./shorts-script";
import type { ShortsQuestion } from "./shorts-question-bank";

const QUESTION: ShortsQuestion = {
  id: 1,
  category: "klient",
  section: "A. Podstawy i kwalifikacja pożyczki",
  question: "Czym jest pożyczka prywatna?",
  thesis: "To pożyczka udzielana poza typowym kredytem bankowym.",
};

describe("buildShortsOverlays", () => {
  it("czasy ze specyfikacji paczki: klient 0,8/1,2 s, inwestor 1,0/1,5 s", () => {
    const klient = buildShortsOverlays(QUESTION);
    expect(klient).toMatchObject({
      tag: SHORTS_OVERLAY_TAGS.klient,
      tagHoldSeconds: 1.2,
      headline: QUESTION.question,
      headlineStartSeconds: 0.8,
    });
    const inwestor = buildShortsOverlays({ ...QUESTION, category: "inwestor" });
    expect(inwestor).toMatchObject({
      tag: SHORTS_OVERLAY_TAGS.inwestor,
      tagHoldSeconds: 1.5,
      headlineStartSeconds: 1.0,
    });
  });

  it("dokłada kartę-checklistę CTA zsynchronizowaną z mówionym zakończeniem", () => {
    const { cards } = buildShortsOverlays(QUESTION);
    expect(cards).toHaveLength(1);
    const card = cards![0];
    expect(card.title).toBe("ZANIM ZDECYDUJESZ");
    expect(card.rows.map((r) => r.text)).toEqual([
      "Umowa pożyczki",
      "Księga wieczysta (KW)",
      "Aktualne saldo",
    ]);
    expect(card.rows.every((r) => r.icon === "check")).toBe(true);
    // syncText = fragment stałego CTA — przy wypalaniu start bierze się z SRT.
    expect(card.syncText).toBe("Najpierw sprawdź umowę, KW i aktualne saldo.");
    expect(card.endSeconds).toBeNull();
    expect(card.startSeconds).toBeGreaterThanOrEqual(8);
  });

  it("szacowany koniec pytania rośnie z długością tekstu i trzyma się widełek 4–10 s", () => {
    const short = buildShortsOverlays(QUESTION).headlineEndSeconds;
    const long = buildShortsOverlays({
      ...QUESTION,
      question:
        "Czy prywatnej pożyczki pod zastaw nieruchomości może udzielić zwykła osoba fizyczna bez działalności?",
    }).headlineEndSeconds;
    expect(short).toBeGreaterThanOrEqual(4);
    expect(long).toBeGreaterThan(short);
    expect(long).toBeLessThanOrEqual(10);
  });
});
