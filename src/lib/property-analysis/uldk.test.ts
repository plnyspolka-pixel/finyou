import { describe, expect, it } from "vitest";
import { parseUldkResponse, polygonAreaM2 } from "./uldk";

describe("ULDK", () => {
  it("parsuje odpowiedź GetParcelByXY", () => {
    const r = parseUldkResponse(
      "0\n146510_8.0502.1/3|mazowieckie|powiat Warszawa|Warszawa (miasto)|5-05-02|1/3|SRID=4326;POLYGON((21 52,21.001 52,21.001 52.001,21 52.001,21 52))\n",
    );
    expect(r?.id).toBe("146510_8.0502.1/3");
    expect(r?.number).toBe("1/3");
    expect(r?.commune).toBe("Warszawa (miasto)");
    expect(r?.polygon).toHaveLength(5);
    // ~68,5 m × 111,2 m ≈ 7 600 m²
    expect(r?.areaM2).toBeGreaterThan(7400);
    expect(r?.areaM2).toBeLessThan(7800);
  });

  it("brak działki → null", () => {
    expect(parseUldkResponse("-1 brak wyników\n")).toBeNull();
    expect(parseUldkResponse("")).toBeNull();
  });

  it("pole zdegenerowanego wielokąta → null", () => {
    expect(
      polygonAreaM2([
        [21, 52],
        [21.1, 52],
      ]),
    ).toBeNull();
  });
});
