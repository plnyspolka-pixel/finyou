import { describe, it, expect } from "vitest";
import { OPT_OUT_HINT, hasOptOutHint, withOptOutHint } from "./messenger-opt-out.server";
import { detectOptOut } from "./opt-out";

describe("withOptOutHint — odpowiednik stopki na Messengerze", () => {
  it("dopisuje informację o wypisie do wiadomości proaktywnej", () => {
    expect(withOptOutHint("Cześć, dokończysz wniosek?")).toBe(
      `Cześć, dokończysz wniosek?\n\n${OPT_OUT_HINT}`,
    );
  });

  it("nie dubluje dopisku", () => {
    const once = withOptOutHint("Przypominamy o wniosku.");
    expect(withOptOutHint(once)).toBe(once);
  });

  it("nie dopisuje nic do pustej treści", () => {
    expect(withOptOutHint("   ")).toBe("");
  });

  it("rozpoznaje własny dopisek niezależnie od wielkości liter", () => {
    expect(hasOptOutHint("Napisz STOP, jeśli nie chcesz więcej wiadomości.")).toBe(true);
    expect(hasOptOutHint("napisz stop")).toBe(true);
    expect(hasOptOutHint("Zadzwonimy jutro.")).toBe(false);
  });
});

describe("STOP z dopisku faktycznie uruchamia strażnika", () => {
  for (const text of ["STOP", "stop", "Stop!"]) {
    it(`„${text}" to rezygnacja`, () => {
      expect(detectOptOut({ text })).not.toBeNull();
    });
  }
});
