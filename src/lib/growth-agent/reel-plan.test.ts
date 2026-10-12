import { describe, expect, it } from "vitest";
import {
  REEL_LEAD_MIN,
  blockedPlatforms,
  chooseReelPlatforms,
  normalizeReelDraft,
  pickReelSlotToday,
  reelScore,
  reelSlotForDate,
  scriptWords,
  warsawDay,
} from "./reel-plan";
import { guardContent } from "./truth-guard";
import type { StudioPlatform } from "@/lib/studio-platforms";

// 11 października 2026 — czas letni, Warszawa = UTC+2.
const at = (utc: string) => new Date(`2026-10-11T${utc}:00Z`);

const ALL: Record<StudioPlatform, boolean> = {
  youtube: true,
  instagram_reels: true,
  facebook_reels: true,
  facebook_post: true,
  tiktok: true,
  x: true,
};

describe("pora codziennej rolki", () => {
  it("przed 6:00 w Warszawie nie planuje (rolka na dziś powstaje rano)", () => {
    expect(pickReelSlotToday({ now: at("03:30"), preferred: "17:00" })).toBeNull();
  });

  it("rano bierze porę wybraną przez bandytę — 17:00 Warszawy to 15:00 UTC", () => {
    const r = pickReelSlotToday({ now: at("08:00"), preferred: "17:00" });
    expect(r).toEqual({ slot: "17:00", slotIso: "2026-10-11T15:00:00.000Z" });
  });

  it("gdy wybrana pora jest za blisko na render, bierze następną wolną", () => {
    // 16:00 Warszawy + 150 min zapasu = 18:30 → 17:00 odpada, zostaje 20:30.
    const r = pickReelSlotToday({ now: at("14:00"), preferred: "17:00" });
    expect(r?.slot).toBe("20:30");
    expect(REEL_LEAD_MIN).toBeGreaterThanOrEqual(120);
  });

  it("wieczorem nie ma już pory z zapasem — czekamy do jutra", () => {
    expect(pickReelSlotToday({ now: at("17:30"), preferred: "20:30" })).toBeNull();
  });

  it("nie planuje drugiej rolki na tę samą porę (ręczna rolka o 17:00)", () => {
    const r = pickReelSlotToday({
      now: at("08:00"),
      preferred: "17:00",
      takenIso: ["2026-10-11T15:00:00Z"],
    });
    expect(r?.slot).not.toBe("17:00");
  });

  it("dzień i pora w czasie Warszawy", () => {
    expect(warsawDay("2026-10-11T22:30:00Z")).toBe("2026-10-12");
    expect(reelSlotForDate("2026-10-10T15:10:05Z")).toBe("17:00");
    expect(reelSlotForDate("2026-10-05T08:20:03Z")).toBe("12:30");
  });
});

describe("platformy — wszystkie dostępne, bez tych, które trwale odrzucają", () => {
  const now = at("08:00");
  const tiktokErr =
    "TikTok odrzucił post: aplikacja nie przeszła audytu [TikTok: unaudited_client_can_only_post_to_private_accounts]";

  it("TikTok po błędzie audytu i X po braku kredytów są wstrzymane na tydzień", () => {
    const blocked = blockedPlatforms(
      [
        {
          platform: "tiktok",
          status: "failed",
          last_error: tiktokErr,
          updated_at: "2026-10-09T10:00:00Z",
        },
        {
          platform: "x",
          status: "failed",
          last_error: "X API: Payment Required — credits depleted (HTTP 402)",
          updated_at: "2026-10-08T10:00:00Z",
        },
        {
          platform: "instagram_reels",
          status: "failed",
          last_error: "Wideo w przygotowaniu",
          updated_at: "2026-10-10T10:00:00Z",
        },
      ],
      now,
    );
    expect([...blocked.keys()].sort()).toEqual(["tiktok", "x"]);
  });

  it("po tygodniu agent próbuje znowu, a sukces po błędzie odblokowuje od razu", () => {
    const old = blockedPlatforms(
      [
        {
          platform: "tiktok",
          status: "failed",
          last_error: tiktokErr,
          updated_at: "2026-09-29T07:00:00Z",
        },
      ],
      now,
    );
    expect(old.size).toBe(0);
    const fixed = blockedPlatforms(
      [
        {
          platform: "x",
          status: "failed",
          last_error: "HTTP 402",
          updated_at: "2026-10-08T10:00:00Z",
        },
        {
          platform: "x",
          status: "published",
          last_error: null,
          updated_at: "2026-10-10T10:00:00Z",
        },
      ],
      now,
    );
    expect(fixed.has("x")).toBe(false);
  });

  it("TikTok bez ustawień posta wybranych przez właściciela jest pomijany", () => {
    const c = chooseReelPlatforms({
      availability: ALL,
      blocked: new Map(),
      preference: "auto",
      tiktokOptionsSet: false,
    });
    expect(c.platforms).toEqual(["instagram_reels", "facebook_reels", "youtube", "x"]);
    expect(c.skipped.map((s) => s.platform)).toEqual(["tiktok"]);
    // Post tekstowy na FB nie jest platformą rolek.
    expect(c.platforms).not.toContain("facebook_post");
  });

  it("niepołączone konto i jawna lista platform", () => {
    const c = chooseReelPlatforms({
      availability: { ...ALL, youtube: false },
      blocked: new Map([["x", "HTTP 402"]]),
      preference: ["youtube", "instagram_reels", "x"],
      tiktokOptionsSet: true,
    });
    expect(c.platforms).toEqual(["instagram_reels"]);
    expect(c.skipped.find((s) => s.platform === "youtube")?.reason).toMatch(/niepołączone/);
    expect(c.skipped.find((s) => s.platform === "x")?.reason).toMatch(/wstrzymane/);
  });
});

describe("scenariusz i opisy rolki", () => {
  it("scenariusz bez hashtagów, tytuł z pierwszego zdania, gdy model go nie dał", () => {
    const d = normalizeReelDraft({
      script: "Czy wiesz, że hipoteka to nie zastaw? #hipoteka Zostajesz właścicielem.",
      caption: "Opis",
    });
    expect(d.script).not.toMatch(/#/);
    expect(d.title).toBe("Czy wiesz, że hipoteka to nie zastaw?");
    expect(d.short).toBe(d.title);
    expect(scriptWords("raz dwa  trzy")).toBe(3);
  });

  it("lektor nie czyta zastrzeżenia — trafia ono do opisu", () => {
    const script = guardContent({
      text: "Inwestor zarabia na odsetkach, a zabezpieczeniem jest hipoteka. Obserwuj Finance You.",
      audience: "inwestor",
      platform: "reel_script",
    });
    expect(script.text).not.toMatch(/nie stanowi oferty/);
    const caption = guardContent({
      text: "Inwestor zarabia na odsetkach, a zabezpieczeniem jest hipoteka. Obserwuj!",
      audience: "inwestor",
      platform: "instagram",
    });
    expect(caption.text).toMatch(/nie stanowi oferty/);
  });

  it("strażnik blokuje obietnice także w scenariuszu", () => {
    const g = guardContent({
      text: "To bezpieczna inwestycja bez ryzyka i ze stabilnym zwrotem.",
      audience: "inwestor",
      platform: "reel_script",
    });
    expect(g.ok).toBe(false);
  });
});

describe("ocena rolki", () => {
  it("przy zerowych interakcjach więcej wyświetleń = lepszy wynik", () => {
    expect(reelScore({ views: 500 })).toBeGreaterThan(reelScore({ views: 50 }));
    expect(reelScore({})).toBe(0);
  });

  it("interakcje nadal liczą się mocniej niż same wyświetlenia", () => {
    expect(reelScore({ views: 100, comments: 3 })).toBeGreaterThan(reelScore({ views: 1000 }));
  });
});

describe("statystyki bez źródła", () => {
  it("blokuje „większość spraw…” i „X% inwestorów…”, przepuszcza fakty z cennika", () => {
    const bad = guardContent({
      text: "Większość spraw na rynku to sto do trzystu tysięcy złotych.",
      audience: "inwestor",
      platform: "reel_script",
    });
    expect(bad.violations.map((v) => v.code)).toContain("statystyka_bez_zrodla");
    const pct = guardContent({
      text: "80% inwestorów wybiera hipotekę.",
      audience: "inwestor",
      platform: "reel_script",
    });
    expect(pct.ok).toBe(false);
    const ok = guardContent({
      text: "Pożyczka może wynieść do 60% wartości nieruchomości, a prowizja to 5% kwoty. Obserwuj Finance You.",
      audience: "klient",
      platform: "reel_script",
    });
    expect(ok.violations.map((v) => v.code)).not.toContain("statystyka_bez_zrodla");
  });
});
