import { describe, it, expect } from "vitest";
import { buildYtDescription, parseVideoScript, sanitizeTags } from "./core";

const SOURCE = "https://financeyou.pl/blog/przykladowy-artykul";

const LONG_SCRIPT = Array.from(
  { length: 80 },
  (_, i) => `Zdanie numer ${i} o pożyczkach pod zastaw nieruchomości i rynku.`,
).join(" ");

describe("sanitizeTags", () => {
  it("czyści #, duplikaty (case-insensitive) i limituje do 15", () => {
    const tags = sanitizeTags([
      "#pożyczki",
      "Pożyczki",
      "  nieruchomości ",
      "",
      null,
      ...Array(30)
        .fill("x")
        .map((_, i) => `tag${i}`),
    ]);
    expect(tags[0]).toBe("pożyczki");
    expect(tags).toContain("nieruchomości");
    expect(tags.filter((t) => t.toLowerCase() === "pożyczki")).toHaveLength(1);
    expect(tags.length).toBeLessThanOrEqual(15);
  });
});

describe("buildYtDescription", () => {
  it("dokłada link do źródła, gdy AI go pominęło", () => {
    const d = buildYtDescription("Opis filmu.", SOURCE);
    expect(d).toContain(SOURCE);
    expect(d).toContain("financeyou.pl");
    expect(d).toContain("art. 66 KC");
  });

  it("nie dubluje linku, gdy już jest w opisie", () => {
    const d = buildYtDescription(`Opis. Artykuł: ${SOURCE}`, SOURCE);
    expect(d.split(SOURCE)).toHaveLength(2); // dokładnie jedno wystąpienie
  });
});

describe("parseVideoScript", () => {
  const valid = {
    title_options: ["Tytuł pierwszy", "Tytuł drugi", "Tytuł trzeci"],
    script_md: LONG_SCRIPT,
    description: "Opis odcinka.",
    tags: ["pożyczki", "nieruchomości"],
  };

  it("akceptuje kompletny scenariusz i dokleja link źródłowy", () => {
    const s = parseVideoScript(valid, SOURCE);
    expect(s).not.toBeNull();
    expect(s!.titleOptions).toHaveLength(3);
    expect(s!.description).toContain(SOURCE);
    expect(s!.tags).toEqual(["pożyczki", "nieruchomości"]);
  });

  it("odrzuca scenariusz zbyt krótki (poniżej progu 5 min)", () => {
    expect(parseVideoScript({ ...valid, script_md: "Za krótki skrypt." }, SOURCE)).toBeNull();
  });

  it("odrzuca niekompletne odpowiedzi (mniej niż 3 tytuły / brak opisu)", () => {
    expect(parseVideoScript({ ...valid, title_options: ["jeden"] }, SOURCE)).toBeNull();
    expect(parseVideoScript({ ...valid, description: "" }, SOURCE)).toBeNull();
  });
});
