import { describe, it, expect } from "vitest";
import {
  INVESTMENT_DISCLAIMER,
  checkPublicationContent,
  checkPublicationForPlatforms,
  deriveYoutubeTags,
  extractHashtags,
  smartTrim,
} from "./publication-guardrails";

describe("smartTrim", () => {
  it("nie zmienia tekstu w limicie", () => {
    expect(smartTrim("Krótki opis.", 100)).toBe("Krótki opis.");
  });

  it("tnie na granicy zdania, gdy to nie kosztuje większości tekstu", () => {
    const text = "Pierwsze zdanie jest dość długie. Drugie zdanie też coś niesie. Trzecie już nie wejdzie w limit.";
    const out = smartTrim(text, 70);
    expect(out).toBe("Pierwsze zdanie jest dość długie. Drugie zdanie też coś niesie.");
  });

  it("nigdy nie tnie w pół słowa — cofa do granicy słowa z wielokropkiem", () => {
    const out = smartTrim("jedno bardzo długie słowotwórstwo bez kropek w ogóle nigdzie", 30);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(30);
    // Fragment przed wielokropkiem to pełne słowa z oryginału.
    expect("jedno bardzo długie słowotwórstwo bez kropek w ogóle nigdzie".startsWith(out.slice(0, -1))).toBe(true);
    expect(out.slice(0, -1).endsWith(" ")).toBe(false);
  });
});

describe("extractHashtags / deriveYoutubeTags", () => {
  it("wyciąga polskie hashtagi bez duplikatów", () => {
    expect(extractHashtags("tekst #hipoteka #Pożyczki #hipoteka koniec")).toEqual([
      "hipoteka",
      "Pożyczki",
    ]);
  });

  it("buduje tagi YouTube z hashtagów treści plus domyślnych kanału", () => {
    const tags = deriveYoutubeTags("Tytuł #hipoteka", "opis #inwestowanie");
    expect(tags[0]).toBe("hipoteka");
    expect(tags).toContain("finance you");
    // Bez duplikatu „inwestowanie" (jest w domyślnych).
    expect(tags.filter((t) => t.toLowerCase() === "inwestowanie")).toHaveLength(1);
    expect(tags.length).toBeLessThanOrEqual(15);
  });
});

describe("checkPublicationContent — twarde blokady", () => {
  it("blokuje pusty opis rolki", () => {
    const r = checkPublicationContent({ platform: "instagram_reels", message: "  " });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/pusta/i);
  });

  it("blokuje pusty opis Shorta na YouTube", () => {
    const r = checkPublicationContent({ platform: "youtube", title: "Tytuł", message: "" });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/opis filmu/i);
  });

  it("przepuszcza X z samym tytułem (tytuł zastępuje treść)", () => {
    const r = checkPublicationContent({ platform: "x", title: "Tytuł posta", message: "" });
    expect(r.ok).toBe(true);
  });

  it("blokuje obietnice zysku bez ryzyka", () => {
    for (const msg of [
      "Inwestuj — gwarantowany zysk co miesiąc!",
      "Pewny zwrot z kapitału",
      "Zarabiaj bez ryzyka",
      "Stabilne zyski i minimalne ryzyko",
      "Szukasz bezpiecznej lokaty kapitału z atrakcyjnym zwrotem?",
    ]) {
      const r = checkPublicationContent({ platform: "facebook_post", message: msg });
      expect(r.ok, msg).toBe(false);
      expect(r.errors[0]).toMatch(/Niedozwolona fraza/);
    }
  });

  it("nie blokuje neutralnej treści o zabezpieczeniu hipoteką", () => {
    const r = checkPublicationContent({
      platform: "facebook_post",
      message:
        "Pożyczkodawca ma wpis w księdze wieczystej, a Ty zostajesz właścicielem. " +
        "Sprawdź dział IV przed wypłatą. Materiał edukacyjny — nie stanowi oferty. " +
        "Inwestowanie wiąże się z ryzykiem utraty kapitału.",
    });
    expect(r.ok).toBe(true);
  });
});

describe("checkPublicationContent — automatyczne poprawki", () => {
  it("dopisuje disclaimer do treści inwestycyjnej bez disclaimera", () => {
    const r = checkPublicationContent({
      platform: "instagram_reels",
      message: "Jak inwestować w pożyczki pod hipotekę? Zobacz nasz przewodnik.",
    });
    expect(r.ok).toBe(true);
    expect(r.message.endsWith(INVESTMENT_DISCLAIMER)).toBe(true);
    expect(r.notes.join(" ")).toMatch(/disclaimer/i);
  });

  it("nie dubluje disclaimera, gdy już jest", () => {
    const msg = `Jak inwestować? ${INVESTMENT_DISCLAIMER}`;
    const r = checkPublicationContent({ platform: "instagram_reels", message: msg });
    expect(r.message.match(/ryzykiem utraty kapitału/g)).toHaveLength(1);
  });

  it("nie dotyka treści pożyczkowej (nieinwestycyjnej)", () => {
    const r = checkPublicationContent({
      platform: "facebook_post",
      message: "Potrzebujesz finansowania pod nieruchomość? Decyzja nawet w 24 h.",
    });
    expect(r.ok).toBe(true);
    expect(r.message).not.toContain("ryzykiem utraty kapitału");
  });

  it("zamienia „link w bio” na financeyou.pl na platformach bez bio", () => {
    const r = checkPublicationContent({
      platform: "facebook_post",
      message: "Szczegóły — Link w bio/komentarzu. Zapraszamy!",
    });
    expect(r.message).toContain("financeyou.pl");
    expect(r.message.toLowerCase()).not.toContain("link w bio");
  });

  it("zostawia „link w bio” na Instagramie i TikToku", () => {
    const r = checkPublicationContent({
      platform: "instagram_reels",
      message: "Szczegóły — link w bio.",
    });
    expect(r.message).toContain("link w bio");
  });

  it("tnie długi caption IG na granicy zdania i mieści disclaimer w limicie", () => {
    const sentence = "To jest pełne zdanie o inwestowaniu w wierzytelności hipoteczne. ";
    const r = checkPublicationContent({
      platform: "instagram_reels",
      message: sentence.repeat(60), // ~3900 znaków
    });
    expect(r.ok).toBe(true);
    expect(r.message.length).toBeLessThanOrEqual(2200);
    expect(r.message.endsWith(INVESTMENT_DISCLAIMER)).toBe(true);
    // Treść przed disclaimerem kończy się pełnym zdaniem, nie urwanym słowem.
    const body = r.message.slice(0, -INVESTMENT_DISCLAIMER.length).trimEnd();
    expect(/[.!?…]$/.test(body)).toBe(true);
  });

  it("ogranicza hashtagi IG do 30", () => {
    const tags = Array.from({ length: 40 }, (_, i) => `#tag${i}`).join(" ");
    const r = checkPublicationContent({
      platform: "instagram_reels",
      message: `Opis rolki. ${tags}`,
    });
    expect([...r.message.matchAll(/#[\p{L}\p{N}_]+/gu)]).toHaveLength(30);
    expect(r.notes.join(" ")).toMatch(/hashtag/i);
  });

  it("daje tagi dla YouTube", () => {
    const r = checkPublicationContent({
      platform: "youtube",
      title: "Czy wiesz, że kolejność hipotek ma znaczenie?",
      message: "Opis odcinka. #hipoteka #księgawieczysta",
    });
    expect(r.ok).toBe(true);
    expect(r.tags).toContain("hipoteka");
    expect(r.tags.length).toBeGreaterThan(2);
  });
});

describe("checkPublicationForPlatforms", () => {
  it("zbiera błędy per platforma i daje osobne treści", () => {
    const { ok, errors, byPlatform } = checkPublicationForPlatforms(
      ["youtube", "instagram_reels"],
      "Tytuł",
      "",
    );
    expect(ok).toBe(false);
    expect(errors.some((e) => e.startsWith("[youtube]"))).toBe(true);
    expect(errors.some((e) => e.startsWith("[instagram_reels]"))).toBe(true);
    expect(byPlatform.size).toBe(2);
  });

  it("per platforma różnicuje poprawki (bio na FB vs IG)", () => {
    const { ok, byPlatform } = checkPublicationForPlatforms(
      ["facebook_post", "instagram_reels"],
      "",
      "Zapraszamy — link w bio.",
    );
    expect(ok).toBe(true);
    expect(byPlatform.get("facebook_post")!.message).toContain("financeyou.pl");
    expect(byPlatform.get("instagram_reels")!.message).toContain("link w bio");
  });
});
