import { describe, expect, it } from "vitest";
import { decidePublishGate } from "./publish-gate";

const settings = { killSwitch: false, disabledPlatforms: ["x"] };

describe("decidePublishGate", () => {
  it("blokuje podpis z obietnicą zysku (prawdziwy wpis z 29.09)", () => {
    const d = decidePublishGate(
      {
        platform: "facebook_reels",
        title: "KreacjaShort_1",
        message:
          "Szukasz bezpiecznego sposobu na pomnażanie kapitału? Inwestuj w pożyczki pod hipotekę! Odkryj stabilne zyski i minimalne ryzyko.",
        track: null,
        autopilot: false,
      },
      settings,
    );
    expect(d.action).toBe("block");
    if (d.action === "block") expect(d.reason).toContain("sure_profit");
  });

  it("dokleja elementy obowiązkowe i przepuszcza rzeczową treść", () => {
    const d = decidePublishGate(
      {
        platform: "instagram_reels",
        title: "LTV powyżej 100%",
        message: "Przed wpłatą zawsze patrz na LTV inwestycji: im niższe, tym większy zapas.",
        track: "inwestor",
        autopilot: true,
      },
      settings,
    );
    expect(d.action).toBe("publish");
    if (d.action === "publish") {
      expect(d.changed).toBe(true);
      expect(d.added).toContain("ai_label");
      expect(d.message).toContain("KRS 0000635207");
    }
  });

  it("wyłączony kanał X", () => {
    const d = decidePublishGate(
      { platform: "x", title: "", message: "Post", track: null, autopilot: false },
      settings,
    );
    expect(d.action).toBe("disabled");
  });

  it("kill switch wstrzymuje tylko wpisy autopilota", () => {
    const item = {
      platform: "youtube",
      title: "Bank vs Ty",
      message: "Jak działa hipoteka?",
      track: "inwestor",
    };
    expect(
      decidePublishGate({ ...item, autopilot: true }, { ...settings, killSwitch: true }).action,
    ).toBe("defer");
    expect(
      decidePublishGate({ ...item, autopilot: false }, { ...settings, killSwitch: true }).action,
    ).toBe("publish");
  });

  it("tytuł też przechodzi reguły", () => {
    const d = decidePublishGate(
      {
        platform: "youtube",
        title: "Gwarantowany zysk 12% rocznie",
        message: "Opis",
        track: "inwestor",
        autopilot: false,
      },
      settings,
    );
    expect(d.action).toBe("block");
  });
});
