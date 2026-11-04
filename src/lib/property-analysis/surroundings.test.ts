import { describe, expect, it } from "vitest";
import { natura2000Type, nearestNuisances, nuisanceKey } from "./surroundings";
import { parseUldkBuilding } from "./uldk";

describe("uciążliwości (OSM)", () => {
  it("kategorie z tagów", () => {
    expect(nuisanceKey({ highway: "motorway" })).toBe("motorway");
    expect(nuisanceKey({ highway: "primary" })).toBe("mainRoad");
    expect(nuisanceKey({ railway: "rail" })).toBe("railway");
    expect(nuisanceKey({ railway: "rail", service: "siding" })).toBeNull();
    expect(nuisanceKey({ power: "generator", "generator:source": "wind" })).toBe("windTurbine");
    expect(nuisanceKey({ landuse: "residential" })).toBeNull();
  });

  it("najbliższy obiekt kategorii, linie WN tylko ≥ 110 kV, alarm wg progu", () => {
    const lat = 52.2;
    const lng = 21.0;
    const hits = nearestNuisances(lat, lng, [
      // autostrada ~111 m na północ (geometria linii)
      {
        tags: { highway: "motorway", ref: "A2" },
        geometry: [
          { lat: 52.201, lon: 20.99 },
          { lat: 52.201, lon: 21.01 },
        ],
      },
      { tags: { highway: "motorway" }, geometry: [{ lat: 52.21, lon: 21.0 }] },
      { tags: { power: "line", voltage: "15000" }, geometry: [{ lat: 52.2001, lon: 21.0 }] },
      { tags: { power: "line", voltage: "220000;110000" }, geometry: [{ lat: 52.205, lon: 21.0 }] },
      { tags: { landuse: "cemetery", name: "Cmentarz" }, center: { lat: 52.195, lon: 21.0 } },
    ]);
    const motorway = hits.find((h) => h.key === "motorway")!;
    expect(motorway.name).toBe("A2");
    expect(motorway.distanceM).toBeGreaterThan(100);
    expect(motorway.distanceM).toBeLessThan(125);
    expect(motorway.alert).toBe(true);
    const power = hits.find((h) => h.key === "powerLine")!;
    expect(power.distanceM).toBeGreaterThan(500);
    expect(power.alert).toBe(false);
    expect(hits[0].key).toBe("motorway");
  });
});

describe("Natura 2000", () => {
  it("typ obszaru", () => {
    expect(natura2000Type("A", "Birds Directive Sites (SPA)")).toMatch(/OSO/);
    expect(natura2000Type("B", "Habitats Directive Sites")).toMatch(/SOO/);
    expect(natura2000Type("C", "Habitats and Birds Directive Sites")).toMatch(
      /ptasi i siedliskowy/,
    );
  });
});

describe("ULDK budynek", () => {
  it("parsuje GetBuildingByXY i liczy powierzchnię zabudowy", () => {
    const b = parseUldkBuilding(
      "0\n126105_9.0001.311.1_BUD|SRID=4326;POLYGON((21 52,21.0003 52,21.0003 52.0002,21 52.0002,21 52))\n",
    );
    expect(b?.id).toBe("126105_9.0001.311.1_BUD");
    // ~20,6 m × 22,2 m ≈ 457 m²
    expect(b?.footprintM2).toBeGreaterThan(430);
    expect(b?.footprintM2).toBeLessThan(480);
  });
});
