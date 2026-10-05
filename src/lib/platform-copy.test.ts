import { describe, it, expect } from "vitest";
import {
  PLATFORM_COPY_RULES,
  compactCopyMap,
  composeCopyForPlatform,
  copyLength,
  copyOverridesFrom,
  effectiveCopyMap,
  countHashtags,
  explicitCopyMap,
  fitCopyToPlatform,
  hashtagsOf,
  limitHashtags,
  parsePlatformCopyMap,
  platformCopyError,
  platformCopyIssues,
  platformCopyRule,
  resolvePlatformCopy,
  tiktokCaption,
} from "./platform-copy";
import { STUDIO_PLATFORMS } from "./studio-platforms";

const BASE = {
  title: "Jak działa pożyczka pod zastaw nieruchomości?",
  message:
    "Pożyczka pod zastaw to finansowanie zabezpieczone hipoteką — decyzja w kilka dni.\n\nMateriał edukacyjny — to nie jest indywidualna porada prawna.\n\n#pozyczka #nieruchomosci #finanse",
};

describe("reguły platform", () => {
  it("każda platforma ma regułę z co najmniej jednym polem i podpowiedzią", () => {
    for (const p of STUDIO_PLATFORMS) {
      const r = PLATFORM_COPY_RULES[p];
      expect(r.title || r.message).toBeTruthy();
      expect(r.hint.length).toBeGreaterThan(10);
    }
  });

  it("X Premium podnosi limit posta, inne platformy ignorują limity konta", () => {
    expect(platformCopyRule("x", { xTextMax: 25_000 }).message?.max).toBe(25_000);
    expect(platformCopyRule("x", { xTextMax: null }).message?.max).toBe(280);
    expect(platformCopyRule("youtube", { xTextMax: 25_000 }).title?.max).toBe(92);
  });
});

describe("liczenie", () => {
  it("liczy hashtagi tylko na granicy słowa", () => {
    expect(countHashtags("#a #b tekst#c\n#d")).toBe(3);
    expect(hashtagsOf("#Finanse tekst #finanse #inne")).toEqual(["#Finanse", "#inne"]);
  });

  it("YouTube liczy bajty UTF-8, X wagi, reszta znaki", () => {
    expect(copyLength("zażółć", "chars")).toBe(6);
    expect(copyLength("zażółć", "bytes")).toBe(10);
    expect(copyLength("https://financeyou.pl/bardzo/dlugi/adres", "x")).toBe(23);
    expect(copyLength("🔥", "chars")).toBe(1);
    expect(copyLength("🔥", "bytes")).toBe(4);
  });
});

describe("platformCopyIssues", () => {
  it("YouTube: wymaga tytułu, pilnuje 92 znaków i znaków < >", () => {
    expect(platformCopyError("youtube", { title: "", message: "x" })).toMatch(/wymagane/);
    expect(platformCopyError("youtube", { title: "a".repeat(93), message: "" })).toMatch(
      /93 \/ 92 znaków/,
    );
    expect(platformCopyError("youtube", { title: "Tytuł <b>", message: "" })).toMatch(/< i >/);
    expect(platformCopyError("youtube", { title: "OK", message: "opis" })).toBeNull();
  });

  it("Instagram: 2200 znaków, 30 hashtagów, 20 wzmianek", () => {
    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
    expect(platformCopyIssues("instagram_reels", { message: tags })).toEqual([
      "Podpis (caption): 31 hashtagów (limit 30).",
    ]);
    const mentions = Array.from({ length: 21 }, (_, i) => `@u${i}`).join(" ");
    expect(platformCopyError("instagram_reels", { message: mentions })).toMatch(/21 @wzmianek/);
    expect(platformCopyError("instagram_reels", { message: "a".repeat(2201) })).toMatch(
      /2201 \/ 2200/,
    );
    // Pusty podpis rolki nie jest błędem (podpis nie jest wymagany).
    expect(platformCopyError("instagram_reels", { message: "" })).toBeNull();
  });

  it("X: limit ważony (link = 23) i wymagana treść; TikTok: podpis do 150", () => {
    const link = "https://financeyou.pl/" + "a".repeat(200);
    expect(platformCopyError("x", { message: `${"x".repeat(250)} ${link}` })).toBeNull();
    expect(platformCopyError("x", { message: "x".repeat(281) })).toMatch(/281 \/ 280/);
    expect(platformCopyError("x", { message: "x".repeat(281) }, { xTextMax: 25_000 })).toBeNull();
    expect(platformCopyError("x", { message: "  " })).toMatch(/wymagane/);
    expect(platformCopyError("tiktok", { title: "a".repeat(151) })).toMatch(/151 \/ 150/);
  });

  it("allowEmpty: puste pola wymagane przechodzą (auto-publikacja uzupełni je AI)", () => {
    expect(platformCopyIssues("youtube", { title: "" }, undefined, { allowEmpty: true })).toEqual(
      [],
    );
    expect(platformCopyIssues("x", undefined, undefined, { allowEmpty: true })).toEqual([]);
  });
});

describe("fitCopyToPlatform", () => {
  it("przycina na granicy słowa z wielokropkiem i jest idempotentne", () => {
    const long = Array.from({ length: 40 }, (_, i) => `slowo${i}`).join(" ");
    const fitted = fitCopyToPlatform("youtube", { title: long, message: "" });
    expect(copyLength(fitted.title, "chars")).toBeLessThanOrEqual(92);
    expect(fitted.title.endsWith("…")).toBe(true);
    // Cięcie na granicy słowa — przed wielokropkiem stoi całe słowo.
    expect(fitted.title).toMatch(/slowo\d+…$/);
    expect(fitCopyToPlatform("youtube", fitted)).toEqual(fitted);
  });

  it("YouTube: liczy opis w bajtach i usuwa < >", () => {
    const fitted = fitCopyToPlatform("youtube", { title: "a <b> c", message: "ż".repeat(3000) });
    expect(fitted.title).toBe("a b c");
    expect(copyLength(fitted.message, "bytes")).toBeLessThanOrEqual(5000);
  });

  it("Instagram: zostawia 30 pierwszych hashtagów", () => {
    const tags = Array.from({ length: 35 }, (_, i) => `#t${i}`).join(" ");
    const fitted = fitCopyToPlatform("instagram_reels", { message: `Treść\n\n${tags}` });
    expect(countHashtags(fitted.message)).toBe(30);
    expect(fitted.message.startsWith("Treść\n\n#t0 ")).toBe(true);
    expect(fitted.message).not.toContain("#t30");
  });

  it("X: tnie jak xPostText (linki w całości), TikTok: podpis do 150", () => {
    const fitted = fitCopyToPlatform("x", { message: "a ".repeat(400) });
    expect(copyLength(fitted.message, "x")).toBeLessThanOrEqual(280);
    expect(fitCopyToPlatform("tiktok", { title: "b".repeat(200) }).title.length).toBe(150);
  });

  it("pola, których platforma nie publikuje, zostają bez zmian", () => {
    expect(fitCopyToPlatform("x", { title: "t".repeat(400), message: "ok" }).title).toBe(
      "t".repeat(400),
    );
  });
});

describe("limitHashtags", () => {
  it("usuwa nadmiarowe hashtagi bez podwójnych spacji", () => {
    expect(limitHashtags("Tekst #a #b #c koniec", 2)).toBe("Tekst #a #b koniec");
    expect(limitHashtags("#a\n#b\n#c", 1)).toBe("#a");
  });
});

describe("composeCopyForPlatform", () => {
  it("YouTube i post FB biorą tytuł + treść", () => {
    expect(composeCopyForPlatform("youtube", BASE)).toEqual({
      title: BASE.title,
      message: BASE.message,
    });
    expect(composeCopyForPlatform("facebook_post", BASE)).toEqual({
      title: BASE.title,
      message: BASE.message,
    });
  });

  it("rolki: podpis = treść (bez tytułu); gdy treści brak — tytuł", () => {
    expect(composeCopyForPlatform("instagram_reels", BASE)).toEqual({
      title: "",
      message: BASE.message,
    });
    expect(composeCopyForPlatform("facebook_reels", { title: "Tylko tytuł" })).toEqual({
      title: "",
      message: "Tylko tytuł",
    });
  });

  it("TikTok: jedno pole — tytuł + hashtagi z treści w limicie 150", () => {
    const c = composeCopyForPlatform("tiktok", BASE);
    expect(c.message).toBe("");
    expect(c.title).toBe(`${BASE.title} #pozyczka #nieruchomosci #finanse`);
    expect(c.title.length).toBeLessThanOrEqual(150);
  });

  it("TikTok bez tytułu: pierwszy akapit treści; hashtagi nie dublują się", () => {
    expect(tiktokCaption("", "Teza rolki.\n\n#a #b")).toBe("Teza rolki. #a #b");
    expect(tiktokCaption("Tytuł #a", "treść #a #b")).toBe("Tytuł #a #b");
    const longTitle = "t".repeat(140);
    expect(tiktokCaption(longTitle, "#aaaaaaaaaa #bb")).toBe(`${longTitle} #bb`);
  });

  it("X: treść albo tytuł, przycięte do limitu", () => {
    expect(composeCopyForPlatform("x", BASE).message.length).toBeLessThanOrEqual(280);
    expect(composeCopyForPlatform("x", { title: "Sam tytuł" })).toEqual({
      title: "",
      message: "Sam tytuł",
    });
  });

  it("szkic zawsze przechodzi walidację platformy", () => {
    const huge = { title: "x".repeat(500), message: `${"y".repeat(9000)} ${"#t ".repeat(80)}` };
    for (const p of STUDIO_PLATFORMS) {
      expect(platformCopyError(p, composeCopyForPlatform(p, huge))).toBeNull();
    }
  });
});

describe("resolvePlatformCopy", () => {
  it("pole podane wprost wygrywa, brakujące bierze ze szkicu", () => {
    expect(resolvePlatformCopy("youtube", BASE, { title: "Własny tytuł" })).toEqual({
      title: "Własny tytuł",
      message: BASE.message,
    });
    expect(resolvePlatformCopy("x", BASE, { message: "Krótki post" })).toEqual({
      title: "",
      message: "Krótki post",
    });
    expect(resolvePlatformCopy("instagram_reels", BASE)).toEqual(
      composeCopyForPlatform("instagram_reels", BASE),
    );
  });

  it("pusty string podany wprost zostaje pusty (nie wraca do szkicu) i NIE jest przycinany", () => {
    expect(resolvePlatformCopy("facebook_post", BASE, { title: "" }).title).toBe("");
    expect(resolvePlatformCopy("x", BASE, { message: "x".repeat(300) }).message.length).toBe(300);
  });
});

describe("mapy opisów", () => {
  it("compactCopyMap zostawia tylko niepuste pola wskazanych platform", () => {
    expect(
      compactCopyMap(
        { youtube: { title: " T ", message: "" }, x: { message: "  " }, tiktok: undefined },
        ["youtube", "x", "tiktok"],
      ),
    ).toEqual({ youtube: { title: "T" } });
  });

  it("explicitCopyMap daje oba pola dla każdej platformy, bez wpisu — szkic", () => {
    const m = explicitCopyMap({ x: { message: "Post" } }, ["x", "tiktok"], BASE);
    expect(m.x).toEqual({ title: "", message: "Post" });
    expect(m.tiktok).toEqual(composeCopyForPlatform("tiktok", BASE));
  });

  it("effectiveCopyMap: karta bez edycji odbija szkic, z edycją — własny tekst", () => {
    const m = effectiveCopyMap(["youtube", "x"], { x: { message: "Własny" } }, BASE);
    expect(m.youtube).toEqual(composeCopyForPlatform("youtube", BASE));
    expect(m.x).toEqual({ title: "", message: "Własny" });
  });

  it("copyOverridesFrom: karta równa szkicowi wraca do odbijania, reszta zostaje 1:1", () => {
    const next = {
      youtube: composeCopyForPlatform("youtube", BASE),
      x: { title: "", message: "Własny post" },
    };
    const prev = { tiktok: { title: "Stary podpis" } };
    expect(copyOverridesFrom(next, ["youtube", "x"], prev, BASE)).toEqual({
      x: { title: "", message: "Własny post" },
      // Odznaczona platforma nie traci swojego tekstu.
      tiktok: { title: "Stary podpis" },
    });
  });

  it("parsePlatformCopyMap przyjmuje tylko znane platformy i stringi", () => {
    expect(
      parsePlatformCopyMap({
        youtube: { title: "T", message: 5 },
        linkedin: { message: "x" },
        x: "nie-obiekt",
        tiktok: {},
      }),
    ).toEqual({ youtube: { title: "T" } });
    expect(parsePlatformCopyMap(null)).toEqual({});
    expect(parsePlatformCopyMap([1])).toEqual({});
  });
});
