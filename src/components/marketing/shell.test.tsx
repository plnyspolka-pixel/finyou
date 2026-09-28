import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "./shell";
import { ACTIVE_SOCIAL_LINKS, SOCIAL_LINKS } from "./social-links";

/** Pełny `aria-label` odnośnika — dokładne dopasowanie, bez regexów (etykieta X ma nawiasy). */
const label = (name: string) => `Finance You na ${name} (otwiera się w nowej karcie)`;

describe("SiteFooter — social media", () => {
  it("renders one external link per social profile that has an address", () => {
    render(<SiteFooter />);
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
    render(<SiteFooter />);
    const pending = SOCIAL_LINKS.filter((s) => !s.href);
    for (const s of pending) {
      expect(screen.queryByRole("link", { name: label(s.label) })).toBeNull();
    }
    expect(SOCIAL_LINKS.filter((s) => s.href).every((s) => /^https:\/\//.test(s.href))).toBe(true);
  });
});
