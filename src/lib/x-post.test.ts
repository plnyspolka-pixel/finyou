import { describe, it, expect } from "vitest";
import {
  X_CHUNK_BYTES,
  X_TEXT_LIMIT,
  X_URL_WEIGHT,
  pickXMedia,
  planXChunks,
  xMediaFromUrl,
  xPostText,
  xWeightedLength,
} from "./x-post";

const MB = 1024 * 1024;

describe("xWeightedLength", () => {
  it("liczy zwykły tekst znak po znaku", () => {
    expect(xWeightedLength("Pożyczka pod nieruchomość")).toBe(25);
  });

  it("liczy każdy link jako 23 znaki niezależnie od długości", () => {
    const short = xWeightedLength("Zobacz https://a.pl");
    const long = xWeightedLength(
      "Zobacz https://financeyou.pl/oferty/pozyczka-pod-nieruchomosc-warszawa",
    );
    expect(short).toBe(long);
    expect(short).toBe("Zobacz ".length + X_URL_WEIGHT);
  });

  it("liczy emoji podwójnie", () => {
    // Emoji jest spoza zakresów o wadze 1, więc waży 2 mimo jednego znaku.
    expect(xWeightedLength("🔥")).toBe(2);
    expect(xWeightedLength("ok🔥")).toBe(4);
  });
});

describe("xPostText", () => {
  it("scala spacje, zostawia akapity i przycina puste linie", () => {
    expect(xPostText("  Pożyczka   pod\t\tdom \n\n\n\n kontakt  ")).toBe(
      "Pożyczka pod dom\n\nkontakt",
    );
  });

  it("zwraca pusty string dla braku treści", () => {
    expect(xPostText(null)).toBe("");
    expect(xPostText("   ")).toBe("");
  });

  it("nie rusza treści mieszczącej się w limicie", () => {
    const text = "Finansujemy pod nieruchomość w 48 h.";
    expect(xPostText(text)).toBe(text);
  });

  it("przycina zbyt długi post do limitu", () => {
    const out = xPostText("a ".repeat(400));
    expect(xWeightedLength(out)).toBeLessThanOrEqual(X_TEXT_LIMIT);
    expect(out.endsWith("…")).toBe(true);
  });

  it("nie rozcina linku w połowie", () => {
    const url = "https://financeyou.pl/wniosek";
    // Tekst dobrany tak, że link nie mieści się w limicie w całości.
    const out = xPostText(`${"x".repeat(270)} ${url}`);
    expect(xWeightedLength(out)).toBeLessThanOrEqual(X_TEXT_LIMIT);
    // Skoro link nie wszedł, to nie ma go wcale — żadnego ogona typu "https://finan".
    expect(out).not.toContain("http");
  });

  it("zostawia link w całości, gdy się mieści", () => {
    const url = "https://financeyou.pl/wniosek-o-pozyczke-pod-nieruchomosc";
    const out = xPostText(`${"x".repeat(200)} ${url}`);
    expect(out).toContain(url);
    expect(xWeightedLength(out)).toBeLessThanOrEqual(X_TEXT_LIMIT);
  });

  it("respektuje podniesiony limit (X Premium)", () => {
    const text = "a ".repeat(400).trim();
    expect(xPostText(text, 25_000)).toBe(text);
  });

  it("nie przekracza limitu przy tekście bez spacji (wielokropek waży 2)", () => {
    const out = xPostText("y".repeat(400));
    expect(xWeightedLength(out)).toBeLessThanOrEqual(X_TEXT_LIMIT);
    expect(out.endsWith("…")).toBe(true);
  });

  it("nie przekracza limitu przy tekście z emoji", () => {
    const out = xPostText("🔥".repeat(300));
    expect(xWeightedLength(out)).toBeLessThanOrEqual(X_TEXT_LIMIT);
  });
});

describe("xMediaFromUrl", () => {
  it("rozpoznaje wideo po rozszerzeniu", () => {
    const m = xMediaFromUrl("https://cdn.pl/a/b/rolka.mp4?token=1", "image");
    expect(m.kind).toBe("video");
    expect(m.category).toBe("tweet_video");
    expect(m.contentType).toBe("video/mp4");
  });

  it("rozpoznaje grafikę i GIF-a", () => {
    expect(xMediaFromUrl("https://cdn.pl/x.png", "video").category).toBe("tweet_image");
    expect(xMediaFromUrl("https://cdn.pl/x.gif", "image").category).toBe("tweet_gif");
  });

  it("dla pliku bez rozszerzenia używa podpowiedzi z kolumny kolejki", () => {
    const m = xMediaFromUrl("https://cdn.pl/storage/object/sign/abc", "image");
    expect(m.kind).toBe("image");
    expect(m.contentType).toBe("image/jpeg");
  });

  it("daje grafikom ostrzejszy limit niż wideo", () => {
    expect(xMediaFromUrl("https://cdn.pl/x.png", "image").maxBytes).toBe(5 * MB);
    expect(xMediaFromUrl("https://cdn.pl/x.mp4", "video").maxBytes).toBeGreaterThan(5 * MB);
  });
});

describe("pickXMedia", () => {
  it("woli wideo od grafiki (X nie łączy ich w jednym poście)", () => {
    const m = pickXMedia({ video_url: "https://cdn.pl/a.mp4", image_url: "https://cdn.pl/a.png" });
    expect(m?.kind).toBe("video");
  });

  it("bierze grafikę, gdy nie ma wideo", () => {
    expect(pickXMedia({ image_url: "https://cdn.pl/a.png" })?.kind).toBe("image");
  });

  it("zwraca null dla posta czysto tekstowego", () => {
    expect(pickXMedia({ video_url: null, image_url: null })).toBeNull();
  });
});

describe("planXChunks", () => {
  function assertCovers(total: number) {
    const chunks = planXChunks(total);
    expect(chunks[0].start).toBe(0);
    expect(chunks[chunks.length - 1].end).toBe(total - 1);
    chunks.forEach((c, i) => {
      expect(c.index).toBe(i);
      expect(c.end - c.start + 1).toBeLessThanOrEqual(X_CHUNK_BYTES);
      if (i > 0) expect(c.start).toBe(chunks[i - 1].end + 1);
    });
    const covered = chunks.reduce((n, c) => n + (c.end - c.start + 1), 0);
    expect(covered).toBe(total);
    return chunks;
  }

  it("mieści mały plik w jednym segmencie", () => {
    expect(assertCovers(1024)).toHaveLength(1);
  });

  it("tnie plik niepodzielny bez reszty, zostawiając krótszy ogon", () => {
    const chunks = assertCovers(10 * MB);
    expect(chunks).toHaveLength(3);
    expect(chunks[2].end - chunks[2].start + 1).toBe(2 * MB);
  });

  it("tnie plik podzielny bez reszty na równe segmenty", () => {
    expect(assertCovers(8 * MB)).toHaveLength(2);
  });

  it("nigdy nie przekracza sufitu 5 MB na segment", () => {
    const chunks = planXChunks(50 * MB, 99 * MB);
    expect(chunks.every((c) => c.end - c.start + 1 <= 5 * MB)).toBe(true);
  });

  it("odrzuca pusty plik", () => {
    expect(() => planXChunks(0)).toThrow();
  });
});
