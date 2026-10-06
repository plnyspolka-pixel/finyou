import { describe, it, expect } from "vitest";
import {
  consentTextFor,
  downloadUrl,
  firstNameOf,
  hasKeyword,
  isFreshComment,
  isValidDownloadToken,
  leadMagnetUrl,
  matchLeadMagnetForComment,
  newDownloadToken,
  normalizeForMatch,
  parseKeywords,
  postIdsEqual,
  renderTemplate,
  subscriberTagsFor,
  suggestedCaption,
  type LinkedPost,
  type MatchableMagnet,
} from "./core";

const przewodnik: MatchableMagnet = {
  id: "m1",
  slug: "przewodnik-klienta",
  title: "Przewodnik klienta",
  published: true,
  trigger_keywords: ["PRZEWODNIK", "pdf"],
  match_any_post: false,
};
const inwestor: MatchableMagnet = {
  id: "m2",
  slug: "checklista-inwestora",
  title: "Checklista inwestora",
  published: true,
  trigger_keywords: ["CHECKLISTA"],
  match_any_post: true,
};
const szkic: MatchableMagnet = {
  id: "m3",
  slug: "szkic",
  title: "Szkic",
  published: false,
  trigger_keywords: ["SZKIC"],
  match_any_post: true,
};
const posts: LinkedPost[] = [
  { lead_magnet_id: "m1", platform: "facebook", external_post_id: "111_222" },
  { lead_magnet_id: "m1", platform: "youtube", external_post_id: "abcDEF12345" },
];

describe("normalizacja i hasła", () => {
  it("ignoruje wielkość liter, polskie znaki i interpunkcję", () => {
    expect(normalizeForMatch("  CHCĘ! #Przewodnik, Łódź ")).toBe("chce przewodnik lodz");
  });

  it("parseKeywords dzieli po przecinkach i nowych liniach, bez duplikatów i hashy", () => {
    expect(parseKeywords("PRZEWODNIK, pdf\n#przewodnik; ;PDF ")).toEqual(["PRZEWODNIK", "pdf"]);
  });

  it("hasKeyword dopasowuje całe słowo, nie fragment", () => {
    expect(hasKeyword("Chcę przewodnik!", ["przewodnik"])).toBe(true);
    expect(hasKeyword("#PRZEWODNIK proszę", ["przewodnik"])).toBe(true);
    expect(hasKeyword("przewodnikiem się nie interesuję", ["przewodnik"])).toBe(false);
    expect(hasKeyword("", ["przewodnik"])).toBe(false);
    expect(hasKeyword("poproszę pdf", [])).toBe(false);
  });

  it("hasKeyword obsługuje hasła wielowyrazowe", () => {
    expect(hasKeyword("Poproszę darmowy przewodnik dziś", ["darmowy przewodnik"])).toBe(true);
  });
});

describe("dopasowanie komentarza do lead magnetu", () => {
  it("post powiązany + hasło → lead magnet z posta", () => {
    const r = matchLeadMagnetForComment({
      platform: "facebook",
      postId: "111_222",
      text: "Chcę PDF",
      magnets: [przewodnik, inwestor],
      posts,
    });
    expect(r.via).toBe("linked_post");
    expect(r.magnet?.id).toBe("m1");
  });

  it("id posta bez prefiksu strony też pasuje", () => {
    expect(postIdsEqual("111_222", "222")).toBe(true);
    expect(postIdsEqual("111_222", "333")).toBe(false);
    const r = matchLeadMagnetForComment({
      platform: "facebook",
      postId: "222",
      text: "przewodnik",
      magnets: [przewodnik],
      posts,
    });
    expect(r.magnet?.id).toBe("m1");
  });

  it("post powiązany bez hasła → brak dopasowania, ale wiadomo o który lead magnet chodzi", () => {
    const r = matchLeadMagnetForComment({
      platform: "facebook",
      postId: "111_222",
      text: "Super post!",
      magnets: [przewodnik, inwestor],
      posts,
    });
    expect(r.via).toBe("linked_post_no_keyword");
    expect(r.magnet).toBeNull();
    if (r.via === "linked_post_no_keyword") expect(r.linkedMagnet.id).toBe("m1");
  });

  it("post powiązany bez haseł → każdy komentarz pasuje", () => {
    const r = matchLeadMagnetForComment({
      platform: "youtube",
      postId: "abcDEF12345",
      text: "Super!",
      magnets: [{ ...przewodnik, trigger_keywords: [] }],
      posts,
    });
    expect(r.magnet?.id).toBe("m1");
  });

  it("post niepowiązany: tylko lead magnety z match_any_post i hasłem", () => {
    const r1 = matchLeadMagnetForComment({
      platform: "instagram",
      postId: "999",
      text: "checklista poproszę",
      magnets: [przewodnik, inwestor],
      posts,
    });
    expect(r1.via).toBe("keyword");
    expect(r1.magnet?.id).toBe("m2");

    const r2 = matchLeadMagnetForComment({
      platform: "instagram",
      postId: "999",
      text: "przewodnik poproszę",
      magnets: [przewodnik, inwestor],
      posts,
    });
    expect(r2.via).toBe("none");
  });

  it("nieopublikowany lead magnet nigdy nie odpowiada", () => {
    const r = matchLeadMagnetForComment({
      platform: "facebook",
      postId: null,
      text: "SZKIC",
      magnets: [szkic],
      posts: [],
    });
    expect(r.via).toBe("none");
    const r2 = matchLeadMagnetForComment({
      platform: "facebook",
      postId: "111_222",
      text: "PRZEWODNIK",
      magnets: [{ ...przewodnik, published: false }],
      posts,
    });
    expect(r2.via).toBe("none");
  });
});

describe("szablony i adresy", () => {
  it("renderTemplate podstawia zmienne i radzi sobie bez imienia", () => {
    const tpl = "Cześć {imie}! Link do „{tytul}”: {link}";
    expect(renderTemplate(tpl, { imie: "Anna", tytul: "Przewodnik", link: "https://x" })).toBe(
      "Cześć Anna! Link do „Przewodnik”: https://x",
    );
    expect(renderTemplate(tpl, { imie: null, tytul: "Przewodnik", link: "https://x" })).toBe(
      "Cześć! Link do „Przewodnik”: https://x",
    );
    expect(renderTemplate("Strona: {strona}", { tytul: "t", link: "l" })).toBe(
      "Strona: https://financeyou.pl",
    );
  });

  it("firstNameOf bierze pierwsze słowo, loginy @ zostawia", () => {
    expect(firstNameOf("jan kowalski")).toBe("Jan");
    expect(firstNameOf("@jan.kowalski")).toBe("@jan.kowalski");
    expect(firstNameOf("  ")).toBeNull();
    expect(firstNameOf(null)).toBeNull();
  });

  it("leadMagnetUrl niesie UTM-y i id komentarza", () => {
    expect(leadMagnetUrl("przewodnik-klienta")).toBe(
      "https://financeyou.pl/pobierz/przewodnik-klienta",
    );
    const u = new URL(leadMagnetUrl("przewodnik-klienta", { platform: "facebook", ref: "c_1" }));
    expect(u.pathname).toBe("/pobierz/przewodnik-klienta");
    expect(u.searchParams.get("utm_source")).toBe("facebook");
    expect(u.searchParams.get("utm_medium")).toBe("comment");
    expect(u.searchParams.get("utm_campaign")).toBe("lm-przewodnik-klienta");
    expect(u.searchParams.get("ref")).toBe("c_1");
  });

  it("token pobrania jest losowy, długi i poprawny", () => {
    const a = newDownloadToken();
    const b = newDownloadToken();
    expect(a).not.toBe(b);
    expect(isValidDownloadToken(a)).toBe(true);
    expect(isValidDownloadToken("za-krotki")).toBe(false);
    expect(downloadUrl(a)).toBe(`https://financeyou.pl/pobierz-plik/${a}`);
  });

  it("tagi subskrybenta: stałe + grupa + slug + własne, bez duplikatów", () => {
    expect(
      subscriberTagsFor({
        slug: "x",
        audience: "inwestor",
        extra: ["vip", " inwestor "],
        existing: ["landing", "lead-magnet"],
      }),
    ).toEqual(["landing", "lead-magnet", "inwestor", "lead-magnet:x", "vip"]);
  });

  it("treść posta i zgody zależą od grupy i platformy", () => {
    const fb = suggestedCaption({
      title: "Przewodnik",
      keyword: "PDF",
      audience: "klient",
      platform: "facebook",
    });
    expect(fb).toContain("„PDF”");
    expect(fb).toContain("wiadomości prywatnej");
    const yt = suggestedCaption({
      title: "Przewodnik",
      keyword: null,
      audience: "inwestor",
      platform: "youtube",
    });
    expect(yt).toContain("„CHCĘ”");
    expect(yt).toContain("pod komentarzem");
    expect(consentTextFor("inwestor")).toContain("dla inwestorów");
    expect(consentTextFor("klient")).toContain("pod nieruchomość");
  });
});

describe("tick YouTube — świeżość komentarzy", () => {
  it("komentarz sprzed powiązania filmu (ponad godzinę) jest pomijany", () => {
    expect(isFreshComment("2026-10-06T10:00:00Z", "2026-10-06T12:00:00Z")).toBe(false);
    expect(isFreshComment("2026-10-06T11:30:00Z", "2026-10-06T12:00:00Z")).toBe(true);
    expect(isFreshComment("2026-10-06T13:00:00Z", "2026-10-06T12:00:00Z")).toBe(true);
    expect(isFreshComment(null, "2026-10-06T12:00:00Z")).toBe(false);
    expect(isFreshComment("2026-10-06T13:00:00Z", null)).toBe(true);
  });
});
