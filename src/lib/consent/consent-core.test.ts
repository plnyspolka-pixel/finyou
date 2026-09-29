import { describe, expect, it } from "vitest";
import { pendingConsents } from "./consent-core";

const docs = [
  { id: "t2", kind: "terms", version: 2, title: "Regulamin" },
  { id: "p2", kind: "privacy", version: 2, title: "Polityka" },
  { id: "m1", kind: "marketing", version: 1, title: "Marketing" },
];

describe("pendingConsents", () => {
  it("klient bez akceptacji v2 musi zaakceptować regulamin i politykę", () => {
    const p = pendingConsents("klient", docs, [
      { kind: "terms", version: 1 },
      { kind: "privacy", version: 1 },
    ]);
    expect(p.map((x) => `${x.kind}:${x.version}`)).toEqual(["terms:2", "privacy:2"]);
  });

  it("po akceptacji v2 nic nie zostaje", () => {
    expect(
      pendingConsents("klient", docs, [
        { kind: "terms", version: 2 },
        { kind: "privacy", version: 2 },
      ]),
    ).toEqual([]);
  });

  it("inwestor akceptuje tylko politykę prywatności; marketing nigdy nie jest wymagany", () => {
    expect(pendingConsents("inwestor", docs, []).map((x) => x.kind)).toEqual(["privacy"]);
  });

  it("bierze najnowszą aktywną wersję", () => {
    const p = pendingConsents(
      "inwestor",
      [...docs, { id: "p3", kind: "privacy", version: 3, title: "Polityka v3" }],
      [{ kind: "privacy", version: 2 }],
    );
    expect(p).toEqual([{ id: "p3", kind: "privacy", version: 3, title: "Polityka v3" }]);
  });
});
