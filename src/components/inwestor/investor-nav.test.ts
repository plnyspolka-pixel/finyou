/**
 * Menu panelu inwestora: „Złóż zlecenie" prowadzi przez pipeline do Zlecenia
 * i znika, gdy inwestor ma żywe Zlecenie; Konsument ma dodatkowo link do
 * odstąpienia. Strona startowa podąża za tą samą regułą.
 */
import { describe, expect, it } from "vitest";
import { ORDER_PIPELINE_ITEM, investorHomePath, investorNavGroups } from "./investor-nav";

const labels = (flags: Parameters<typeof investorNavGroups>[0]) =>
  investorNavGroups(flags).flatMap((g) => g.items.map((i) => i.label));

describe("investorNavGroups", () => {
  it("before the flags load the full menu is shown, starting with „Złóż zlecenie”", () => {
    expect(ORDER_PIPELINE_ITEM.label).toBe("Złóż zlecenie");
    expect(ORDER_PIPELINE_ITEM.to).toBe("/inwestor/umowy");
    expect(labels(undefined)[0]).toBe("Złóż zlecenie");
    expect(labels(undefined)).toContain("Moje zlecenia");
    expect(labels(undefined)).not.toContain("Odstąpienie od umowy");
  });

  it("a live order removes „Złóż zlecenie” and keeps everything else", () => {
    const before = labels({ isConsumer: false, hasLiveOrder: false });
    const after = labels({ isConsumer: false, hasLiveOrder: true });
    expect(after).not.toContain("Złóż zlecenie");
    expect(after).toEqual(before.filter((l) => l !== "Złóż zlecenie"));
    expect(after[0]).toBe("Moje zlecenia");
  });

  it("consumers get the withdrawal group as a separate group", () => {
    const groups = investorNavGroups({ isConsumer: true, hasLiveOrder: true });
    expect(groups).toHaveLength(2);
    expect(groups[1].items.map((i) => i.to)).toEqual(["/inwestor/odstapienie"]);
    expect(labels({ isConsumer: true, hasLiveOrder: false })).toContain("Złóż zlecenie");
  });

  it("home path follows the same rule", () => {
    expect(investorHomePath(undefined)).toBe("/inwestor/umowy");
    expect(investorHomePath({ hasLiveOrder: false })).toBe("/inwestor/umowy");
    expect(investorHomePath({ hasLiveOrder: true })).toBe("/inwestor/zlecenia");
  });
});
