import { describe, it, expect } from "vitest";
import { assessFloor } from "./floor-factor";

describe("assessFloor — czynnik kondygnacji mieszkań", () => {
  it("1. piętro (kondygnacja 2 w KW) = optymalne", () => {
    const r = assessFloor({ kondygnacja: 2 });
    expect(r.available).toBe(true);
    expect(r.floorPietro).toBe(1);
    expect(r.score).toBe(100);
    expect(r.label).toBe("optymalna kondygnacja");
  });

  it("4. piętro w 4-piętrowym budynku bez windy = najgorsze", () => {
    const r = assessFloor({ floorPietro: 4, totalFloors: 4 });
    // baza 64 - walkup(3*10=30) - top-low-rise(8) = 26
    expect(r.score).toBeLessThanOrEqual(30);
    expect(r.hasElevatorAssumed).toBe(false);
  });

  it("1. piętro jest lepsze niż 4. piętro walk-up", () => {
    const best = assessFloor({ kondygnacja: 2 }).score;
    const worst = assessFloor({ floorPietro: 4, totalFloors: 4 }).score;
    expect(best).toBeGreaterThan(worst);
  });

  it("parter — przeciętna sprzedawalność", () => {
    const r = assessFloor({ kondygnacja: 1 });
    expect(r.floorPietro).toBe(0);
    expect(r.score).toBeLessThan(assessFloor({ kondygnacja: 2 }).score);
  });

  it("wysokie piętro w wieżowcu z windą nie jest karane jak walk-up", () => {
    const withLift = assessFloor({ floorPietro: 4, totalFloors: 10 });
    const walkup = assessFloor({ floorPietro: 4, totalFloors: 4 });
    expect(withLift.hasElevatorAssumed).toBe(true);
    expect(withLift.score).toBeGreaterThan(walkup.score);
  });

  it("brak danych o kondygnacji → czynnik pominięty", () => {
    const r = assessFloor({});
    expect(r.available).toBe(false);
    expect(r.score).toBe(60);
  });
});
