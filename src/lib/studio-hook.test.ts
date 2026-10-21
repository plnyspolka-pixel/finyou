import { describe, expect, it } from "vitest";
import {
  HOOK_MIN_TEXT_HEIGHT,
  HOOK_SECONDS,
  HOOK_VISUAL_SUFFIX,
  applyHookVariant,
  buildReelHook,
  chooseHookVariant,
  fallbackHookSpec,
  hookLineEm,
  hookVisualPrompt,
  layoutHookText,
  mergeHookPatch,
  sanitizeHook,
  sanitizeHookSpec,
  type StudioHook,
} from "./studio-hook";
import { buildReelPlan } from "./studio-reel-plan";

const ready = (over: Partial<StudioHook> = {}): StudioHook => ({
  visual_prompt: "vault door slams shut",
  text: "BANK MÓWI NIE?",
  highlight: "NIE?",
  sfx_prompt: "vault slam",
  source: "auto",
  assets: {
    status: "ready",
    kind: "image",
    url: "https://cdn.test/hook.png",
    source_used: "studio_image",
    sfx_url: "https://cdn.test/sfx.mp3",
    music_url: null,
    notes: [],
  },
  ...over,
});

describe("sanitizeHookSpec", () => {
  it("tekst najwyżej 4 słowa, akcent musi być słowem tekstu", () => {
    const h = sanitizeHookSpec({
      text: "Bank znowu powiedział Ci dziś nie",
      highlight: "dziś",
      visual_prompt: "x",
      sfx_prompt: "y",
      source: "kosmos",
    });
    expect(h?.text).toBe("Bank znowu powiedział Ci");
    expect(h?.highlight).toBeNull();
    expect(h?.source).toBe("auto");
  });
  it("bez tekstu — brak hooka", () => {
    expect(sanitizeHookSpec({ visual_prompt: "x" })).toBeNull();
    expect(sanitizeHook(null)).toBeNull();
  });
  it("akcent dopasowany bez względu na wielkość liter i znaki", () => {
    expect(sanitizeHookSpec({ text: "BANK MÓWI NIE?", highlight: "nie" })?.highlight).toBe("NIE?");
  });
});

describe("prompt obrazu", () => {
  it("zawsze z zakazem tekstu w kadrze i ruchem w pierwszych 0,3 s", () => {
    const p = hookVisualPrompt({ visual_prompt: "A red stamp slams onto a loan form" });
    expect(p).toContain("No recognizable faces");
    expect(p).toContain(HOOK_VISUAL_SUFFIX);
    expect(p).toMatch(/no text, letters/i);
    expect(p).toMatch(/first 0\.3 seconds/);
  });
});

describe("motyw zapasowy (bez AI)", () => {
  it("odmowa banku → pieczątka, bez tekstu na pieczątce", () => {
    const h = fallbackHookSpec("Bank powiedział nie? Twoja nieruchomość może powiedzieć tak.");
    expect(h.text).toBe("BANK MÓWI NIE?");
    expect(h.visual_prompt).toMatch(/stamp/);
    expect(h.visual_prompt).toMatch(/blank stamp face/);
  });
  it("ile pod nieruchomość → klucz w snopie światła", () => {
    expect(fallbackHookSpec("Ile dostaniesz pod nieruchomość wartą milion?").visual_prompt).toMatch(
      /key/,
    );
  });
  it("bez dopasowania → drzwi skarbca", () => {
    expect(fallbackHookSpec("Dzień dobry.").visual_prompt).toMatch(/vault door/);
  });
  it("hooki zapasowe toru pożyczkobiorcy nie akcentują firm", () => {
    for (const s of ["Bank odmówił?", "Ile dostaniesz pod dom?", "Dokumenty do wniosku", "x"]) {
      expect(fallbackHookSpec(s).text).not.toMatch(/firm|przedsiębior|działalno/i);
    }
  });
});

describe("układ tekstu hooka", () => {
  it.each(["BANK MÓWI NIE?", "ILE DOSTANIESZ?", "ODMOWA TO NIE KONIEC", "TEN BŁĄD KOSZTUJE"])(
    "%s — co najmniej 12% wysokości, najdłuższy wiersz na szerokość kadru",
    (text) => {
      const { lines, fontSize } = layoutHookText(text, null);
      expect((fontSize * lines.length) / 1280).toBeGreaterThanOrEqual(HOOK_MIN_TEXT_HEIGHT);
      const widest = Math.max(...lines.map((l) => hookLineEm(l.map((w) => w.text)))) * fontSize;
      expect(widest).toBeLessThanOrEqual(720 - 2 * 24 + 1);
      expect(widest).toBeGreaterThan(720 * 0.8);
      expect(lines.flat().filter((w) => w.accent)).toHaveLength(1);
    },
  );
  it("akcent na wskazanym słowie, domyślnie ostatnie", () => {
    expect(
      layoutHookText("BANK MÓWI NIE?", "bank")
        .lines.flat()
        .find((w) => w.accent)?.text,
    ).toBe("BANK");
    expect(
      layoutHookText("ILE DOSTANIESZ?", null)
        .lines.flat()
        .find((w) => w.accent)?.text,
    ).toBe("DOSTANIESZ?");
  });
});

describe("plan hooka dla Remotion", () => {
  it("tylko z gotowym klipem; dźwięk od uderzenia", () => {
    expect(buildReelHook(ready({ assets: null }))).toBeNull();
    const r = buildReelHook(ready());
    expect(r?.end).toBe(HOOK_SECONDS);
    expect(r?.impactAt).toBeLessThanOrEqual(0.3);
    expect(r?.media).toEqual({ type: "image", url: "https://cdn.test/hook.png" });
    expect(r?.sfx?.url).toBe("https://cdn.test/sfx.mp3");
  });

  const SRT = `1
00:00:00,100 --> 00:00:02,000
Bank powiedział nie?

2
00:00:02,000 --> 00:00:04,000
Twoja nieruchomość może powiedzieć tak.

3
00:00:04,100 --> 00:00:09,000
Złóż bezpłatny wniosek, link w bio.
`;

  it("napisy lektora i elementy dynamiczne czekają, aż hook się skończy; znaczek AI zostaje", () => {
    const plan = buildReelPlan({
      srt: SRT,
      styleId: "reels",
      aiBadge: true,
      overlays: {
        motion: [
          {
            component: "keyword",
            zone: "center",
            sync: "Bank powiedział nie?",
            endSync: null,
            itemSync: null,
            props: { text: "Bank powiedział NIE", highlight: "NIE" },
          },
          {
            component: "cta",
            zone: "top",
            sync: "Złóż bezpłatny wniosek",
            endSync: null,
            itemSync: null,
            props: { text: "Złóż bezpłatny wniosek", sub: "Link w bio" },
          },
        ],
      },
      hook: ready(),
    });
    expect(plan.hook?.end).toBe(HOOK_SECONDS);
    expect(plan.badge).not.toBeNull();
    for (const e of plan.captions!.events) expect(e.start).toBeGreaterThanOrEqual(HOOK_SECONDS);
    for (const m of plan.overlays!.motion!) expect(m.start).toBeGreaterThanOrEqual(HOOK_SECONDS);
    expect(plan.overlays!.motion!.map((m) => m.component)).toContain("cta");
  });

  it("bez hooka plan jak dotąd (napisy od początku)", () => {
    const plan = buildReelPlan({ srt: SRT, styleId: "reels", aiBadge: true, overlays: null });
    expect(plan.hook).toBeNull();
    expect(plan.captions!.events[0].start).toBeLessThan(0.5);
  });
});

describe("warianty A/B", () => {
  const A = {
    visual_prompt: "a",
    text: "BANK MÓWI NIE?",
    highlight: null,
    sfx_prompt: "a",
    source: "auto" as const,
  };
  const B = {
    visual_prompt: "b",
    text: "ODMOWA TO NIE KONIEC",
    highlight: null,
    sfx_prompt: "b",
    source: "auto" as const,
  };
  const hook: StudioHook = { ...A, variants: [A, B], variant: "A", assets: ready().assets };

  it("zapisany hook_variant wygrywa; bez niego przydział A/B po id", () => {
    expect(chooseHookVariant(hook, "x", "b")).toBe("B");
    const picks = new Set(
      ["a1", "b2", "c3", "d4", "e5", "f6"].map((id) => chooseHookVariant(hook, id, null)),
    );
    expect(picks).toEqual(new Set(["A", "B"]));
    expect(chooseHookVariant({ ...A }, "x", "B")).toBe("A");
  });

  it("przełączanie w obie strony; inny wariant kasuje zasoby", () => {
    const b = applyHookVariant(hook, "B");
    expect(b.text).toBe(B.text);
    expect(b.variant).toBe("B");
    expect(b.assets).toBeNull();
    const back = applyHookVariant(b, "A");
    expect(back.text).toBe(A.text);
    expect(back.variants).toHaveLength(2);
  });

  it("zmiana obrazu kasuje zasoby, zmiana samego tekstu nie", () => {
    expect(mergeHookPatch(hook, { text: "BANK ZAMKNĄŁ DRZWI?" })?.assets).not.toBeNull();
    expect(mergeHookPatch(hook, { visual_prompt: "new" })?.assets).toBeNull();
    expect(mergeHookPatch(null, { visual_prompt: "x" })).toBeNull();
  });
});
