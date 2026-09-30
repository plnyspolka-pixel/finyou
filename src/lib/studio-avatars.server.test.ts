import { describe, expect, it } from "vitest";
import type { HeygenCatalogItem } from "./heygen-catalog.server";
import {
  markDefaultAvatars,
  pickReelRotation,
  pickReelRotations,
  type StudioDefaultAvatar,
} from "./studio-avatars.server";

const item = (id: string, mine = false): HeygenCatalogItem => ({
  id,
  name: `Awatar ${id}`,
  preview: null,
  kind: "avatar",
  mine,
});
const def = (avatar_id: string, position: number, name = ""): StudioDefaultAvatar => ({
  avatar_id,
  name,
  preview: null,
  kind: "avatar",
  position,
});

describe("markDefaultAvatars", () => {
  it("oznacza zestaw z panelu i wystawia go na początek w kolejności rotacji", () => {
    const out = markDefaultAvatars(
      [item("A"), item("B", true), item("C")],
      [def("C", 0), def("A", 1)],
    );
    expect(out.map((i) => i.id)).toEqual(["C", "A", "B"]);
    expect(out[0]).toMatchObject({ is_default: true, default_position: 1 });
    expect(out[1]).toMatchObject({ is_default: true, default_position: 2 });
    expect(out[2]).toMatchObject({ is_default: false, default_position: null, mine: true });
  });

  it("awatar z zestawu, którego katalog nie zwrócił, wchodzi z danych panelu", () => {
    const out = markDefaultAvatars([item("A")], [def("X", 0, "Marta")]);
    expect(out.map((i) => i.id)).toEqual(["X", "A"]);
    expect(out[0]).toMatchObject({
      name: "Marta",
      is_default: true,
      default_position: 1,
      mine: true,
    });
  });

  it("bez zestawu zostawia katalog bez zmian", () => {
    const out = markDefaultAvatars([item("A"), item("B")], []);
    expect(out.map((i) => i.id)).toEqual(["A", "B"]);
    expect(out.every((i) => !i.is_default && i.default_position === null)).toBe(true);
  });

  it("pozycja w rotacji idzie po kolejności zestawu, nie po surowym position", () => {
    const out = markDefaultAvatars([], [def("A", 10), def("B", 20)]);
    expect(out.map((i) => [i.id, i.default_position])).toEqual([
      ["A", 1],
      ["B", 2],
    ]);
  });
});

describe("pickReelRotation", () => {
  const defaults = ["A", "B", "C", "D"];

  it("partnerem zostaje twarz najdawniej użyta w ostatnich rolkach", () => {
    const recent = [
      ["A", "B"],
      ["A", "C"],
      ["A", "D"],
    ];
    expect(pickReelRotation({ lead: "A", defaults, count: 2, recent })).toEqual(["A", "D"]);
  });

  it("twarz jeszcze nieużyta wyprzedza każdą użytą", () => {
    const recent = [
      ["A", "B"],
      ["A", "C"],
    ];
    expect(pickReelRotation({ lead: "A", defaults, count: 2, recent })).toEqual(["A", "D"]);
  });

  it("bez historii partnerzy idą po kolejności zestawu, prowadzący spoza zestawu też prowadzi", () => {
    expect(pickReelRotation({ lead: "X", defaults, count: 3, recent: [] })).toEqual([
      "X",
      "A",
      "B",
    ]);
  });

  it("liczba twarzy obejmująca cały zestaw zachowuje kolejność panelu", () => {
    const recent = [["A", "C"]];
    expect(pickReelRotation({ lead: "A", defaults, count: 6, recent })).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
  });

  it("jedna twarz albo pusty zestaw = sam prowadzący", () => {
    expect(pickReelRotation({ lead: "A", defaults, count: 1, recent: [] })).toEqual(["A"]);
    expect(pickReelRotation({ lead: "A", defaults: [], count: 2, recent: [] })).toEqual(["A"]);
    expect(pickReelRotation({ lead: "A", defaults: ["A"], count: 2, recent: [] })).toEqual(["A"]);
  });

  it("kolejne rolki obchodzą cały zestaw po kolei", () => {
    const history: string[][] = [];
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      const rotation = pickReelRotation({ lead: "A", defaults, count: 2, recent: history });
      seen.push(rotation[1]);
      history.unshift(rotation);
    }
    expect(seen).toEqual(["B", "C", "D", "B"]);
  });
});

describe("pickReelRotations", () => {
  it("seria wsadowa obchodzi pulę, zaczynając od twarzy najdawniej użytej", () => {
    const out = pickReelRotations({
      lead: "A",
      defaults: ["A", "B", "C", "D"],
      count: 2,
      recent: [["A", "B"]],
      n: 4,
    });
    expect(out.map((r) => r.join(""))).toEqual(["AC", "AD", "AB", "AC"]);
  });

  it("zawsze zwraca co najmniej jedną rotację z prowadzącym", () => {
    const out = pickReelRotations({ lead: "A", defaults: [], count: 2, recent: [], n: 3 });
    expect(out).toEqual([["A"], ["A"], ["A"]]);
  });
});
