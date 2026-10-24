import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FreeMaterialsSection } from "./free-materials";
import type { FreeMaterials } from "@/lib/lead-magnets/free-materials";

const DATA: FreeMaterials = {
  audience: "inwestor",
  materials: [
    {
      slug: "start-inwestora",
      title: "Przewodnik startowy inwestora",
      headline: "Jak zarabiać na nieruchomościach jak bank",
      subheadline: null,
      benefits: ["Mechanizm krok po kroku", "Na co patrzeć w księdze wieczystej"],
      cta_text: "Pobierz przewodnik",
      catalog: "start-inwestora",
    },
    {
      slug: "wlasny",
      title: "Materiał zespołu",
      headline: "Własny PDF",
      subheadline: null,
      benefits: [],
      cta_text: "Pobierz bezpłatnie",
      catalog: null,
    },
  ],
  tools: [
    {
      slug: "kalkulator-ltv",
      title: "Kalkulator LTV i bufora bezpieczeństwa",
      promise: "Policz, ile zabezpieczenia zostaje ponad kwotę pożyczki.",
      keyword: "LTV",
      url: "/narzedzie/kalkulator-ltv",
    },
  ],
};

describe("FreeMaterialsSection", () => {
  it("renderuje materiały z linkiem na stronę zapisu (z UTM) i kalkulatory", () => {
    const html = renderToStaticMarkup(<FreeMaterialsSection data={DATA} />);
    expect(html).toContain('id="materialy"');
    expect(html).toContain("Zacznij od bezpłatnych materiałów dla inwestora");
    expect(html).toContain("Przewodnik startowy inwestora");
    expect(html).toContain(
      "/pobierz/start-inwestora?utm_source=financeyou&amp;utm_medium=landing&amp;utm_campaign=darmowe-materialy-inwestor",
    );
    expect(html).toContain("Pobierz przewodnik");
    expect(html).toContain("Na co patrzeć w księdze wieczystej");
    expect(html).toContain("Materiał zespołu");
    expect(html).toContain('href="/narzedzie/kalkulator-ltv"');
    expect(html).toContain("Policz teraz");
    expect(html).toContain("Nie stanowią porady prawnej");
  });

  it("bez materiałów i narzędzi nie renderuje niczego", () => {
    const html = renderToStaticMarkup(
      <FreeMaterialsSection data={{ audience: "klient", materials: [], tools: [] }} />,
    );
    expect(html).toBe("");
  });
});
