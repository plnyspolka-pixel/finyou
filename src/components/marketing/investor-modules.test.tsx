import { existsSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  INVESTOR_MODULES,
  LEGACY_MODULE_SLUGS,
  investorModuleBySlug,
  investorModulePath,
} from "./investor-modules";
import { WEIGHTS } from "@/lib/risk-assessment/risk-scoring";
import { SiteHeader } from "./shell";

// Nagłówek czyta bieżącą ścieżkę z routera (podświetlenie aria-current). W teście
// nie ma RouterProvider, więc podstawiamy sam hook — reszta pakietu bez zmian.
const routerState = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useRouterState: () => routerState.pathname,
}));

describe("szkolenie i moduły partnera — dane podstron", () => {
  it("ma sieć sprzedaży, szkolenie i cztery narzędzia z unikalnymi slugami w formacie URL", () => {
    expect(INVESTOR_MODULES).toHaveLength(6);
    // Decyzja właściciela 04.11.2026: sieć sprzedaży pierwsza, szkolenie zawsze drugie, bez BONUS.
    expect(INVESTOR_MODULES.map((m) => m.slug)).toEqual([
      "siec-sprzedazy",
      "szkolenie",
      "analityk-ai",
      "kancelaria-ai",
      "aml-compliance",
      "windykacja",
    ]);
    for (const m of INVESTOR_MODULES) expect(m.menuLabel).not.toMatch(/BONUS/);
    const slugs = INVESTOR_MODULES.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it.each(INVESTOR_MODULES.map((m) => [m.slug, m] as const))(
    "%s — komplet funkcji, kroki i grafika",
    (_, m) => {
      expect(m.fab.length).toBeGreaterThanOrEqual(5);
      expect(m.fab.length).toBeLessThanOrEqual(6);
      expect(m.featuresTitle.trim().length).toBeGreaterThan(0);
      for (const row of m.fab) {
        for (const part of [row.title, row.cecha, row.zaleta, row.korzysc]) {
          expect(part.trim().length).toBeGreaterThan(0);
        }
      }
      expect(new Set(m.fab.map((r) => r.title)).size).toBe(m.fab.length);
      if (m.steps) expect(m.steps).toHaveLength(4);
      expect(m.note.trim().length).toBeGreaterThan(0);
      expect(m.metaDescription.length).toBeLessThanOrEqual(170);
      expect(existsSync(join(process.cwd(), "public", m.image))).toBe(true);
    },
  );

  // Formuła cecha → zaleta → korzyść służy tylko do pisania — jej etykiety
  // nie mogą trafić do tekstu na stronie (\b nie działa z „ć”).
  it.each(INVESTOR_MODULES.map((m) => [m.slug, m] as const))(
    "%s — bez etykiet formuły w treści strony",
    (_, m) => {
      const visible = [
        m.tagline,
        m.lead,
        ...m.highlights,
        m.featuresTitle,
        ...m.fab.flatMap((r) => [r.title, r.cecha, r.zaleta, r.korzysc]),
        ...(m.steps ?? []).flatMap((st) => [st.t, st.d]),
        m.note,
      ];
      for (const t of visible) {
        expect(t).not.toMatch(/(?<![\p{L}])(cecha|zaleta|korzyść)(?![\p{L}])/iu);
      }
    },
  );

  it("skala A–E Analityka AI: wagi składowych zgodne z oceną ryzyka i sumują się do 100%", () => {
    const scale = investorModuleBySlug("analityk-ai")?.gradeScale;
    expect(scale).toBeDefined();
    const weights = scale!.components.map((c) => c.weight);
    expect(weights.reduce((a, b) => a + b, 0)).toBe(100);
    expect([...weights].sort((a, b) => b - a)).toEqual(
      Object.values(WEIGHTS)
        .map((w) => Math.round(w * 100))
        .sort((a, b) => b - a),
    );
  });

  // Sieć sprzedaży to usługa pośrednictwa Finance You, nie platforma z rezerwacjami
  // ani łącznik inwestor–pośrednik (decyzja właściciela 04.11.2026).
  it("sieć sprzedaży: bez rezerwacji, Karty Leada, pośrednika i opłat; kroki zdjęte", () => {
    const m = investorModuleBySlug("siec-sprzedazy")!;
    expect(m.steps).toBeUndefined();
    const text = [
      m.tagline,
      m.lead,
      ...m.highlights,
      ...m.fab.flatMap((r) => [r.title, r.cecha, r.zaleta, r.korzysc]),
    ].join("\n");
    expect(text).not.toMatch(/rezerw|Kart[aęy] Leada|pośrednik|bez opłat/i);
    expect(m.highlights).toEqual([
      "Wnioski z całej Polski i z wielu kanałów",
      "Profesjonalna obsługa na każdym etapie Projektu",
      "Najnowsze okazje inwestycyjne trafiają wprost do Ciebie — bez szukania klienta",
    ]);
    expect(m.quickLink?.href).toBe("/inwestor/umowy");
    expect(m.primaryCta?.href).toBe("/inwestor/umowy");
  });

  it("windykację sprzedajemy jako „Windykacja” (stary slug przekierowany), kancelaria ma pieczątkę e-podpis", () => {
    const w = investorModuleBySlug("windykacja")!;
    expect(w.name).toBe("Windykacja");
    expect([w.name, w.menuLabel, w.lead, w.note].join(" ")).not.toMatch(/Windykator/);
    expect(w.cardNote).toMatch(/wyłącznie dla naszych partnerów/);
    expect(investorModuleBySlug("windykator-ai")).toBeUndefined();
    expect(LEGACY_MODULE_SLUGS["windykator-ai"]).toBe("windykacja");
    const k = investorModuleBySlug("kancelaria-ai")!;
    expect(k.stamp?.src).toBe("/marketing/pieczatka-epodpis-gratis.webp");
    expect(existsSync(join(process.cwd(), "public", k.stamp!.src))).toBe(true);
    for (const m of INVESTOR_MODULES) expect(m.quickLink?.label).toBeTruthy();
  });

  it("wyszukuje moduł po slugu i zwraca undefined dla nieznanego", () => {
    expect(investorModuleBySlug("analityk-ai")?.name).toBe("Analityk AI");
    expect(investorModuleBySlug("nie-ma")).toBeUndefined();
  });
});

describe("nagłówek marketingowy — menu górne", () => {
  it("płaskie menu (decyzja 28.10.2026) bez pozycji „Sklep” — sklep jest w panelu /inwestor/sklep", () => {
    const { container, unmount } = render(<SiteHeader page="inwestorModul" />);
    const links = Array.from(container.querySelectorAll(".fy-sales-nav-desktop a"));
    expect(links.map((a) => a.textContent)).toEqual([
      "Inwestor",
      "Klient",
      "Pośrednik",
      "Cennik",
      "O nas",
      "Blog",
      "FAQ",
      "Zaloguj",
    ]);
    expect(links.map((a) => a.getAttribute("href"))).not.toContain("/sklep");
    // Dawne rozwijane sub-menu „Inwestor” zniknęło razem z płaskim menu (26.10.2026).
    expect(container.querySelector(".fy-nav-drop")).toBeNull();
    unmount();
  });

  it("na podstronie modułu CTA i FAQ prowadzą na landing inwestora (stronę główną)", () => {
    render(<SiteHeader page="inwestorModul" />);
    for (const a of screen.getAllByRole("link", { name: "Zostań partnerem" })) {
      expect(a).toHaveAttribute("href", "/#cennik");
    }
    expect(screen.getAllByRole("link", { name: "FAQ" })[0]).toHaveAttribute("href", "/#faq");
  });

  it("podświetla bieżącą ścieżkę z routera (aria-current)", () => {
    routerState.pathname = "/blog";
    render(<SiteHeader page="blog" />);
    expect(screen.getAllByRole("link", { name: "Blog" })[0]).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getAllByRole("link", { name: "Klient" })[0]).not.toHaveAttribute("aria-current");
  });
});
