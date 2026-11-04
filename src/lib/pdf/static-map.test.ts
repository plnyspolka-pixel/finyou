import { describe, expect, it } from "vitest";
import { lngLatToWorldPx, tilesForMap, zoomToFit } from "./static-map";

describe("statyczna mapa", () => {
  it("Web Mercator: (0,0) w środku świata", () => {
    expect(lngLatToWorldPx(0, 0, 0)).toEqual([128, 128]);
  });

  it("kafelki pokrywają cały obszar mapy", () => {
    const { tiles } = tilesForMap({
      lat: 52.2297,
      lng: 21.0122,
      zoom: 15,
      width: 520,
      height: 300,
    });
    expect(tiles.length).toBeGreaterThanOrEqual(6);
    expect(tiles.length).toBeLessThanOrEqual(12);
    expect(tiles.some((t) => t.dx <= 0 && t.dy <= 0)).toBe(true);
  });

  it("zoom dopasowany do działki", () => {
    const small: Array<[number, number]> = [
      [21, 52],
      [21.0005, 52],
      [21.0005, 52.0005],
      [21, 52.0005],
    ];
    expect(zoomToFit(small, 520, 300)).toBeGreaterThanOrEqual(17);
    const big: Array<[number, number]> = [
      [21, 52],
      [21.05, 52],
      [21.05, 52.05],
      [21, 52.05],
    ];
    expect(zoomToFit(big, 520, 300)).toBeLessThan(15);
  });
});
