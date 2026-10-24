import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrustpilotBox } from "./trustpilot-box";
import {
  TRUSTBOX_SCRIPT_URL,
  TRUSTBOX_TEMPLATES,
  TRUSTPILOT_BUSINESS_UNIT_ID,
  TRUSTPILOT_PROFILE_URL,
} from "@/lib/trustpilot";

afterEach(() => {
  document.head.querySelectorAll("script").forEach((s) => s.remove());
  delete window.Trustpilot;
});

describe("TrustpilotBox", () => {
  it("renders the TrustBox container for the Finance You profile with a fallback link", () => {
    const { container } = render(<TrustpilotBox />);
    const box = container.querySelector(".trustpilot-widget")!;
    expect(box).toHaveAttribute("data-businessunit-id", TRUSTPILOT_BUSINESS_UNIT_ID);
    expect(box).toHaveAttribute("data-template-id", TRUSTBOX_TEMPLATES.reviewCollector.id);
    expect(box).toHaveAttribute("data-locale", "pl-PL");
    expect(box).toHaveAttribute("data-theme", "light");
    expect(box).toHaveAttribute("data-style-height", TRUSTBOX_TEMPLATES.reviewCollector.height);

    const link = screen.getByRole("link", { name: "Opinie o Finance You na Trustpilot" });
    expect(link).toHaveAttribute("href", TRUSTPILOT_PROFILE_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("loads the Trustpilot script once for several widgets and uses the chosen template", () => {
    const { container } = render(
      <>
        <TrustpilotBox template="carousel" theme="dark" height="200px" />
        <TrustpilotBox template="microCombo" />
      </>,
    );
    const scripts = document.head.querySelectorAll(`script[src="${TRUSTBOX_SCRIPT_URL}"]`);
    expect(scripts).toHaveLength(1);
    expect((scripts[0] as HTMLScriptElement).async).toBe(true);

    const [carousel, combo] = container.querySelectorAll(".trustpilot-widget");
    expect(carousel).toHaveAttribute("data-template-id", TRUSTBOX_TEMPLATES.carousel.id);
    expect(carousel).toHaveAttribute("data-theme", "dark");
    expect(carousel).toHaveAttribute("data-style-height", "200px");
    expect(combo).toHaveAttribute("data-template-id", TRUSTBOX_TEMPLATES.microCombo.id);
  });

  it("asks an already loaded Trustpilot script to render the element", () => {
    const loadFromElement = vi.fn();
    window.Trustpilot = { loadFromElement };
    const { container } = render(<TrustpilotBox />);
    expect(loadFromElement).toHaveBeenCalledTimes(1);
    expect(loadFromElement).toHaveBeenCalledWith(
      container.querySelector(".trustpilot-widget"),
      true,
    );
    expect(document.head.querySelector(`script[src="${TRUSTBOX_SCRIPT_URL}"]`)).toBeNull();
  });
});
