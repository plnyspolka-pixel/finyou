import { readFileSync } from "node:fs";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebinarWidget } from "./webinar-widget";
import { WEBINAR_DISMISS_KEY } from "@/lib/webinar";

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe("widżet webinaru", () => {
  it("wyłączony flagą — nic nie renderuje", () => {
    const { container } = render(<WebinarWidget />);
    expect(container.innerHTML).toBe("");
  });

  it("włączony: licznik do najbliższego kwadransa i zapis; zamknięcie na 24 h", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-10-27T11:17:18Z"));
    render(<WebinarWidget enabled />);
    await act(async () => {});
    expect(screen.getByText("Webinar dla inwestorów")).toBeTruthy();
    expect(screen.getByText("12:42")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Zapisz się" }).getAttribute("href")).toBe("/webinar");
    fireEvent.click(screen.getByRole("button", { name: "Zamknij" }));
    expect(screen.queryByText("Webinar dla inwestorów")).toBeNull();
    const until = Number(localStorage.getItem(WEBINAR_DISMISS_KEY));
    expect(until - Date.now()).toBeGreaterThan(23 * 3_600_000);
  });

  it("nigdzie „na żywo” ani „live”", () => {
    for (const f of [
      "src/components/marketing/webinar-widget.tsx",
      "src/routes/webinar.index.tsx",
      "src/routes/webinar.pokoj.tsx",
      "src/lib/webinar.ts",
      "drizzle/migrations/0051_webinar_lead_magnet.sql",
    ]) {
      const txt = readFileSync(f, "utf8")
        .replace(/\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");
      expect(txt).not.toMatch(/na żywo|\blive\b/i);
    }
  });
});
