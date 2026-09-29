import { describe, expect, it } from "vitest";
import type { HeygenCatalogItem } from "./heygen-catalog.server";
import { markDefaultAvatars, type StudioDefaultAvatar } from "./studio-avatars.server";

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
