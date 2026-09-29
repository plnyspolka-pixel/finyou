import { describe, expect, it } from "vitest";
import { LTV_MAX } from "@/lib/contract-engine/fees";
import {
  EXAMPLE_PROJECTS_LABEL,
  EXAMPLE_PROJECTS_NOTE,
  dailySeed,
  generateExampleProjects,
} from "./example-projects";

const NOW = new Date("2026-09-29T10:00:00");

describe("przykładowe projekty (ilustracja)", () => {
  it("deterministyczne w obrębie dnia, inne następnego dnia", () => {
    const a = generateExampleProjects(NOW);
    const b = generateExampleProjects(new Date("2026-09-29T23:00:00"));
    const c = generateExampleProjects(new Date("2026-09-30T10:00:00"));
    // Te same karty (daty liczone względem chwili wywołania).
    const strip = (rows: typeof a) => rows.map(({ created_at: _c, ...rest }) => rest);
    expect(strip(a)).toEqual(strip(b));
    expect(a.map((p) => p.id)).not.toEqual(c.map((p) => p.id));
    expect(dailySeed(NOW)).toBe(20260929);
  });

  it("świeże daty (dziś − 0…6 dni), LTV ≤ 60%, zawsze oznaczone jako przykład", () => {
    const rows = generateExampleProjects(NOW, 6);
    expect(rows).toHaveLength(6);
    for (const r of rows) {
      const ageDays = (NOW.getTime() - new Date(r.created_at).getTime()) / 86_400_000;
      expect(ageDays).toBeGreaterThanOrEqual(0);
      expect(ageDays).toBeLessThanOrEqual(6);
      expect(r.ltv).toBeLessThanOrEqual(LTV_MAX);
      expect(r.is_example).toBe(true);
      expect(r.id.startsWith("przyklad-")).toBe(true);
      // Żadnych danych osobowych ani numerów KW.
      expect(r.first_name).toBeNull();
      expect(r.kw_masked).toBeNull();
    }
  });

  it("etykieta i nota mówią wprost, że to ilustracja", () => {
    expect(EXAMPLE_PROJECTS_LABEL).toMatch(/ilustracja, nie oferta/);
    expect(EXAMPLE_PROJECTS_NOTE).toMatch(/przyjętym Zleceniem/);
  });
});
