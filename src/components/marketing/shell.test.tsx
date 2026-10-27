import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { SiteFooter } from "./shell";

vi.mock("@/lib/lead-magnets/free-materials.functions", () => ({
  getFreeMaterialsFn: async ({ data }: { data: { audience: string } }) => ({
    audience: data.audience,
    materials:
      data.audience === "inwestor"
        ? [
            {
              slug: "darmowa-lekcja",
              title: "Lekcja",
              headline: "",
              subheadline: null,
              benefits: [],
              cta_text: "",
              catalog: null,
            },
          ]
        : [
            {
              slug: "bank-odmowil-co-dalej",
              title: "Bank odmówił — co dalej",
              headline: "",
              subheadline: null,
              benefits: [],
              cta_text: "",
              catalog: null,
            },
          ],
    tools: [
      {
        slug: "kalkulator-raty",
        title: "Kalkulator raty",
        promise: "",
        keyword: "",
        url: "/narzedzie/kalkulator-raty",
      },
    ],
  }),
}));

function renderFooter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SiteFooter />
    </QueryClientProvider>,
  );
}
import { ACTIVE_SOCIAL_LINKS, SOCIAL_LINKS } from "./social-links";

/** Pełny `aria-label` odnośnika — dokładne dopasowanie, bez regexów (etykieta X ma nawiasy). */
const label = (name: string) => `Finance You na ${name} (otwiera się w nowej karcie)`;

describe("SiteFooter — social media", () => {
  it("renders one external link per social profile that has an address", () => {
    renderFooter();
    const section = screen.getByRole("heading", { name: "Obserwuj nas" }).parentElement!;
    const links = within(section).getAllByRole("link");
    expect(links).toHaveLength(ACTIVE_SOCIAL_LINKS.length);
    for (const s of ACTIVE_SOCIAL_LINKS) {
      const link = within(section).getByRole("link", { name: label(s.label) });
      expect(link).toHaveAttribute("href", s.href);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
    }
  });

  it("skips profiles without a confirmed address instead of rendering an empty link", () => {
    renderFooter();
    const pending = SOCIAL_LINKS.filter((s) => !s.href);
    for (const s of pending) {
      expect(screen.queryByRole("link", { name: label(s.label) })).toBeNull();
    }
    expect(SOCIAL_LINKS.filter((s) => s.href).every((s) => /^https:\/\//.test(s.href))).toBe(true);
  });
});

describe("SiteFooter — darmowe materiały", () => {
  it("osobna kolumna ze wszystkimi materiałami obu ścieżek i kalkulatorami (bez duplikatów)", async () => {
    renderFooter();
    const heading = await screen.findByRole("heading", { name: "Darmowe materiały" });
    const links = within(heading.parentElement!).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual([
      "Darmowa lekcja 1 — ok.\u00a035 minut",
      "Kalkulator raty",
      "Bank odmówił — co dalej",
    ]);
  });
});
