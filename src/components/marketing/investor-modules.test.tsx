import { existsSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { INVESTOR_MODULES, investorModuleBySlug, investorModulePath } from "./investor-modules";
import { SiteHeader } from "./shell";

describe("moduły Klubu Inwestorów — dane podstron", () => {
  it("ma pięć modułów z unikalnymi slugami w formacie URL", () => {
    expect(INVESTOR_MODULES).toHaveLength(5);
    const slugs = INVESTOR_MODULES.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it.each(INVESTOR_MODULES.map((m) => [m.slug, m] as const))(
    "%s — komplet cecha → zaleta → korzyść, kroki i grafika",
    (_, m) => {
      expect(m.fab.length).toBeGreaterThanOrEqual(5);
      for (const row of m.fab) {
        for (const part of [row.title, row.cecha, row.zaleta, row.korzysc]) {
          expect(part.trim().length).toBeGreaterThan(0);
        }
      }
      expect(new Set(m.fab.map((r) => r.title)).size).toBe(m.fab.length);
      expect(m.steps).toHaveLength(4);
      expect(m.note.trim().length).toBeGreaterThan(0);
      expect(m.metaDescription.length).toBeLessThanOrEqual(170);
      expect(existsSync(join(process.cwd(), "public", m.image))).toBe(true);
    },
  );

  it("wyszukuje moduł po slugu i zwraca undefined dla nieznanego", () => {
    expect(investorModuleBySlug("analityk-ai")?.name).toBe("Analityk AI");
    expect(investorModuleBySlug("nie-ma")).toBeUndefined();
  });
});

/** Odnośniki z rozwijanego panelu "Inwestor" (desktop) w kolejności z DOM. */
function dropdownHrefs(page: "inwestor" | "inwestorModul") {
  const { container, unmount } = render(<SiteHeader page={page} />);
  const hrefs = Array.from(container.querySelectorAll(".fy-nav-drop-panel a")).map((a) =>
    a.getAttribute("href"),
  );
  unmount();
  return hrefs;
}

describe("sub-menu „Inwestor” — podstrony modułów", () => {
  it("zaczyna się od podstron modułów, potem kotwice landingu", () => {
    const modules = INVESTOR_MODULES.map((m) => investorModulePath(m.slug));
    expect(dropdownHrefs("inwestor")).toEqual([...modules, "#korzysci", "#cennik"]);
  });

  it("poza landingiem kotwice prowadzą pełną ścieżką na /dla-inwestora", () => {
    const hrefs = dropdownHrefs("inwestorModul");
    expect(hrefs).toContain("/dla-inwestora#korzysci");
    expect(hrefs).toContain("/dla-inwestora#cennik");
    expect(hrefs.some((h) => h?.startsWith("#"))).toBe(false);
  });

  it("na podstronie modułu CTA i FAQ prowadzą na landing inwestora", () => {
    render(<SiteHeader page="inwestorModul" />);
    for (const a of screen.getAllByRole("link", { name: "Dołącz do klubu" })) {
      expect(a).toHaveAttribute("href", "/dla-inwestora#cennik");
    }
    expect(screen.getAllByRole("link", { name: "FAQ" })[0]).toHaveAttribute(
      "href",
      "/dla-inwestora#faq",
    );
  });
});
