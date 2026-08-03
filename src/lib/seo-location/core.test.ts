import { describe, it, expect } from "vitest";
import {
  buildLocationPage,
  buildMetaTitle,
  contentHashOf,
  formatPl,
  slugifyCity,
  type GeoMetricsInput,
  type GeoUnitInput,
} from "./core";

function unit(over: Partial<GeoUnitInput> = {}): GeoUnitInput {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    teryt: "1261011",
    name: "Kraków",
    unit_type: "municipality",
    parent_teryt: "1261",
    population: 800653,
    area_km2: 326.85,
    degurba: 1,
    is_city_above_30k: true,
    is_city_above_100k: true,
    is_city_above_250k: true,
    data_version: "gus-2021-1",
    ...over,
  };
}

function metrics(over: Partial<GeoMetricsInput> = {}): GeoMetricsInput {
  return {
    teryt: "1261011",
    population_within_10km: 900000,
    population_within_25km: 1300000,
    population_within_45km: 2100000,
    density_per_km2: 2449.5,
    is_urban_cluster: true,
    fua_role: "core",
    base_location_attractiveness: 92,
    data_version: "gus-2021-1",
    ...over,
  };
}

describe("slugifyCity", () => {
  it("zamienia polskie znaki i spacje", () => {
    expect(slugifyCity("Łódź")).toBe("lodz");
    expect(slugifyCity("Bielsko-Biała")).toBe("bielsko-biala");
    expect(slugifyCity("Gorzów Wielkopolski")).toBe("gorzow-wielkopolski");
    expect(slugifyCity("Ostrów Mazowiecka")).toBe("ostrow-mazowiecka");
  });
});

describe("formatPl", () => {
  it("formatuje liczby ze spacją tysięcy", () => {
    expect(formatPl(800653)).toBe("800 653");
    expect(formatPl(1300000)).toBe("1 300 000");
    expect(formatPl(999)).toBe("999");
  });
});

describe("buildMetaTitle", () => {
  it("mieści się w 60 znakach dla krótkiej nazwy", () => {
    const t = buildMetaTitle("Kraków");
    expect(t.length).toBeLessThanOrEqual(60);
    expect(t).toContain("Kraków");
    expect(t).toContain("Finance You");
  });

  it("mieści się w 60 znakach dla długich nazw miast", () => {
    for (const city of [
      "Gorzów Wielkopolski",
      "Bielsko-Biała",
      "Piotrków Trybunalski",
      "Kędzierzyn-Koźle",
    ]) {
      const t = buildMetaTitle(city);
      expect(t.length).toBeLessThanOrEqual(60);
      expect(t).toContain(city);
    }
  });
});

describe("buildLocationPage", () => {
  it("buduje kompletną stronę z danymi liczbowymi z metryk", () => {
    const page = buildLocationPage(unit(), metrics(), [{ slug: "wieliczka", name: "Wieliczka" }]);
    expect(page).not.toBeNull();
    expect(page!.slug).toBe("krakow");
    expect(page!.metaTitle.length).toBeLessThanOrEqual(60);
    expect(page!.metaDescription).toContain("1 300 000");
    expect(page!.content.intro.length).toBeGreaterThan(0);
    expect(page!.content.market.stats.length).toBeGreaterThanOrEqual(4);
    expect(page!.content.faq.length).toBe(6);
    expect(page!.content.how.steps.length).toBe(4);
    expect(page!.content.nearby).toEqual([{ slug: "wieliczka", name: "Wieliczka" }]);
    // Liczby z metryk faktycznie trafiają do treści.
    const allText = JSON.stringify(page!.content);
    expect(allText).toContain("1 300 000");
    expect(allText).toContain("Kraków");
  });

  it("NIE generuje strony bez metryk (zasada: brak danych = brak strony)", () => {
    expect(buildLocationPage(unit(), null, [])).toBeNull();
    expect(buildLocationPage(unit(), undefined, [])).toBeNull();
  });

  it("NIE generuje strony przy zerowych/pustych metrykach", () => {
    expect(buildLocationPage(unit(), metrics({ population_within_25km: 0 }), [])).toBeNull();
    expect(buildLocationPage(unit(), metrics({ density_per_km2: 0 }), [])).toBeNull();
  });

  it("jest deterministyczny — ten sam TERYT daje identyczną treść i hash", () => {
    const a = buildLocationPage(unit(), metrics(), []);
    const b = buildLocationPage(unit(), metrics(), []);
    expect(a!.contentHash).toBe(b!.contentHash);
    expect(a!.content).toEqual(b!.content);
  });

  it("różne miasta dostają różne warianty treści (anty near-duplicate)", () => {
    const cities: Array<[string, string]> = [
      ["0201011", "Bolesławiec"],
      ["1261011", "Kraków"],
      ["1465011", "Warszawa"],
      ["2261011", "Gdańsk"],
      ["3064011", "Poznań"],
      ["0264011", "Wrocław"],
      ["2469011", "Katowice"],
      ["0663011", "Lublin"],
    ];
    const intros = new Set<string>();
    const faqFirst = new Set<string>();
    for (const [teryt, name] of cities) {
      const p = buildLocationPage(unit({ teryt, name }), metrics({ teryt }), []);
      expect(p).not.toBeNull();
      // Wytnij nazwę miasta, żeby porównywać sam szablon wariantu.
      intros.add(p!.content.intro[0].split(name).join("X"));
      faqFirst.add(p!.content.faq[0].question.split(name).join("X"));
    }
    // Przy 8 miastach musi wystąpić więcej niż jeden wariant intro i FAQ.
    expect(intros.size).toBeGreaterThan(1);
    expect(faqFirst.size).toBeGreaterThan(1);
  });

  it("FAQ nie zawiera duplikatów pytań", () => {
    const p = buildLocationPage(unit(), metrics(), []);
    const questions = p!.content.faq.map((f) => f.question);
    expect(new Set(questions).size).toBe(questions.length);
  });

  it("treść nie zawiera zakazanych obietnic", () => {
    const p = buildLocationPage(unit(), metrics(), []);
    const text = JSON.stringify(p!.content).toLowerCase();
    expect(text).not.toContain("gwarantowana pożyczka");
    expect(text).not.toContain("gwarancja udzielenia");
    expect(text).not.toContain("bez weryfikacji");
    expect(text).not.toContain("bez sprawdzania");
  });

  it("hash zmienia się przy zmianie danych wejściowych", () => {
    const a = buildLocationPage(unit(), metrics(), []);
    const b = buildLocationPage(unit(), metrics({ population_within_25km: 1300001 }), []);
    expect(a!.contentHash).not.toBe(b!.contentHash);
  });
});

describe("contentHashOf", () => {
  it("jest stabilny dla identycznych obiektów i różny dla różnych", () => {
    expect(contentHashOf({ a: 1 })).toBe(contentHashOf({ a: 1 }));
    expect(contentHashOf({ a: 1 })).not.toBe(contentHashOf({ a: 2 }));
  });
});
