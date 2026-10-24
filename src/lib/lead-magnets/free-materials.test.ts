import { describe, it, expect } from "vitest";
import { checkHardRules } from "@/lib/autopilot/compliance-rules";
import { CATALOG_SLUGS } from "./catalog-slugs";
import {
  FREE_MATERIALS_COPY,
  FREE_MATERIALS_NOTE,
  freeMaterialHref,
  orderFreeMaterials,
  freeMaterialSearch,
  type FreeMaterialRow,
} from "./free-materials";

const row = (over: Partial<FreeMaterialRow> & { slug: string }): FreeMaterialRow => ({
  title: over.slug,
  headline: "Nagłówek",
  subheadline: null,
  benefits: ["Punkt 1", "Punkt 2", "Punkt 3"],
  cta_text: "Pobierz",
  file_name: "plik.pdf",
  audience: "inwestor",
  signup_count: 0,
  ...over,
});

const TOOLS = ["ile-pod-nieruchomosc", "kalkulator-raty", "kalkulator-ltv"];

describe("orderFreeMaterials", () => {
  it("katalog w kolejności lejka, potem materiały własne wg zapisów; bez kalkulatorów i obcej grupy", () => {
    const rows = [
      row({ slug: "wlasny-b", signup_count: 5 }),
      row({ slug: "bledy-inwestora" }),
      row({ slug: "kalkulator-ltv", signup_count: 99 }),
      row({ slug: "wlasny-a", signup_count: 20 }),
      row({ slug: "start-inwestora" }),
      row({ slug: "bank-odmowil-co-dalej", audience: "klient" }),
      row({ slug: "checklista-ksiegi-wieczystej" }),
    ];
    const out = orderFreeMaterials(rows, { audience: "inwestor", toolSlugs: TOOLS });
    expect(out.map((m) => m.slug)).toEqual([
      "start-inwestora",
      "checklista-ksiegi-wieczystej",
      "bledy-inwestora",
      "wlasny-a",
      "wlasny-b",
    ]);
    expect(out[0].catalog).toBe("start-inwestora");
    expect(out[3].catalog).toBeNull();
  });

  it("zajawka to maks. dwa punkty, pusty CTA dostaje domyślny tekst", () => {
    const [m] = orderFreeMaterials(
      [row({ slug: "x", benefits: ["a", " ", "b", "c"], cta_text: " " })],
      { audience: "inwestor", toolSlugs: TOOLS },
    );
    expect(m.benefits).toEqual(["a", "b"]);
    expect(m.cta_text).toBe("Pobierz bezpłatnie");
  });

  it("tnie do limitu", () => {
    const rows = CATALOG_SLUGS.map((slug) => row({ slug, audience: "klient" }));
    expect(orderFreeMaterials(rows, { audience: "klient", toolSlugs: TOOLS, max: 2 })).toHaveLength(
      2,
    );
  });

  it("link z działu niesie UTM strony", () => {
    expect(freeMaterialSearch("klient")).toEqual({
      utm_source: "financeyou",
      utm_medium: "landing",
      utm_campaign: "darmowe-materialy-klient",
    });
    expect(freeMaterialHref("inwestor", "start-inwestora")).toBe(
      "/pobierz/start-inwestora?utm_source=financeyou&utm_medium=landing&utm_campaign=darmowe-materialy-inwestor",
    );
  });
});

describe("copy działu przechodzi twarde reguły compliance", () => {
  for (const audience of ["klient", "inwestor"] as const) {
    it(audience, () => {
      const c = FREE_MATERIALS_COPY[audience];
      const text = [c.eyebrow, c.title, c.sub, c.toolsLabel, FREE_MATERIALS_NOTE].join("\n");
      const hits = checkHardRules(text, {
        kind: "lead_magnet",
        track: audience === "klient" ? "pozyczkobiorca" : "inwestor",
      });
      expect(hits.map((h) => `${h.code}: ${h.match ?? ""}`)).toEqual([]);
    });
  }
});
