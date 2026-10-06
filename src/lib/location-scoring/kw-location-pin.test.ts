import { describe, expect, it } from "vitest";
import { pinCandidatesToKwLocation } from "./kw-location-pin";
import type { AreaMetrics, LocationCandidate } from "./types";

function cand(
  geoUnitId: string,
  name: string,
  densityPerKm2: number,
  weight = 1,
): LocationCandidate {
  const area = { geoUnitId, name, densityPerKm2 } as AreaMetrics;
  return { area, weight };
}

// Okręg SL1S (Słupsk) — dwie gminy „Słupsk" i dwie „Ustka" (miejska i wiejska).
const SL1S = [
  cand("226301", "Słupsk", 2100, 90681),
  cand("221201", "Ustka", 1500, 15367),
  cand("221208", "Słupsk", 60, 910),
  cand("221206", "Kobylnica", 45, 642),
  cand("221210", "Ustka", 40, 417),
];

describe("pinCandidatesToKwLocation", () => {
  it("dział I-O z gminą miejską (SŁUPSK M., powiat M. SŁUPSK) → miasto Słupsk", () => {
    const r = pinCandidatesToKwLocation(SL1S, {
      gmina: "Słupsk M.",
      city: "Słupsk",
      powiat: "M. Słupsk",
    });
    expect(r.candidates.map((c) => c.area.geoUnitId)).toEqual(["226301"]);
    expect(r.pinnedTo).toEqual(["Słupsk"]);
  });

  it("gmina wiejska → mniej gęsta jednostka o tej samej nazwie", () => {
    const r = pinCandidatesToKwLocation(SL1S, {
      gmina: "Ustka (gmina wiejska)",
      city: "Przewłoka",
      powiat: "Słupski",
    });
    expect(r.candidates.map((c) => c.area.geoUnitId)).toEqual(["221210"]);
  });

  it("jednoznaczna nazwa gminy", () => {
    const r = pinCandidatesToKwLocation(SL1S, { gmina: "KOBYLNICA", city: "Kobylnica" });
    expect(r.candidates.map((c) => c.area.geoUnitId)).toEqual(["221206"]);
  });

  it("niejednoznaczna nazwa bez oznaczenia → obie jednostki o tej nazwie", () => {
    const r = pinCandidatesToKwLocation(SL1S, { gmina: "Słupsk", powiat: "Słupski" });
    expect(r.candidates.map((c) => c.area.geoUnitId).sort()).toEqual(["221208", "226301"]);
  });

  it("brak gminy z KW w okręgu → bez zawężenia", () => {
    const r = pinCandidatesToKwLocation(SL1S, { gmina: "Gdańsk", city: "Gdańsk" });
    expect(r.pinnedTo).toBeNull();
    expect(r.candidates).toHaveLength(SL1S.length);
  });

  it("brak treści KW → bez zawężenia", () => {
    expect(pinCandidatesToKwLocation(SL1S, null).pinnedTo).toBeNull();
  });

  it("„m.st.” nie obcina nazwy gminy Mstów", () => {
    const r = pinCandidatesToKwLocation([cand("240410", "Mstów", 50)], { gmina: "MSTÓW" });
    expect(r.pinnedTo).toEqual(["Mstów"]);
  });
});
