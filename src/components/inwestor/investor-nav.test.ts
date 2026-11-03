import { describe, expect, it } from "vitest";
import { investorHomePath, investorNavGroups } from "./investor-nav";

const links = (flags: Parameters<typeof investorNavGroups>[0]) =>
  investorNavGroups(flags).flatMap((g) => g.items.map((i) => i.to));

describe("nawigacja inwestora", () => {
  it("ukrywa projekty przed inwestorem zewnętrznym i przed załadowaniem uprawnień", () => {
    for (const flags of [undefined, { canViewProjects: false, hasLiveOrder: true }]) {
      expect(links(flags)).not.toContain("/inwestor/umowy");
      expect(links(flags)).not.toContain("/inwestor/zlecenia");
      expect(links(flags)).not.toContain("/inwestor/oferty");
      expect(links(flags)).toContain("/inwestor/moje-umowy");
      expect(links(flags)).toContain("/inwestor/kreator-dokumentow");
      expect(investorHomePath(flags)).toBe("/inwestor/szkolenia");
    }
  });
  it("zachowuje nawigację projektów dla Finance You", () => {
    const before = { canViewProjects: true, hasLiveOrder: false };
    const after = { canViewProjects: true, hasLiveOrder: true };
    expect(links(before)).toContain("/inwestor/umowy");
    expect(links(after)).not.toContain("/inwestor/umowy");
    expect(links(after)).toContain("/inwestor/zlecenia");
    expect(links(after)).toContain("/inwestor/oferty");
    expect(investorHomePath(after)).toBe("/inwestor/zlecenia");
  });
  it("zachowuje prawo konsumenta do odstąpienia", () => {
    expect(links({ isConsumer: true, canViewProjects: false })).toContain("/inwestor/odstapienie");
  });
});
