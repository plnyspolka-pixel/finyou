import { describe, expect, it } from "vitest";
import { decideFinalGate } from "./publish-gate";

const V = "test";

describe("kontrola końcowa przed publikacją", () => {
  it("blokuje podpisy z kolejki z 29.09 (bezpieczny zwrot, stabilne zyski)", () => {
    for (const message of [
      "Zastanawiasz się nad stabilną inwestycją? Pożyczki pod hipotekę to szansa na atrakcyjny i bezpieczny zwrot.",
      "Szukasz bezpiecznego sposobu na pomnażanie kapitału? Odkryj stabilne zyski i minimalne ryzyko.",
    ]) {
      const d = decideFinalGate(
        { platform: "facebook_reels", title: "KreacjaWideo", message, track: null },
        V,
      );
      expect(d.action).toBe("block");
    }
  });

  it("dokleja stopkę (AI, nadawca, ryzyko) idempotentnie", () => {
    const item = {
      platform: "instagram_reels",
      title: "LTV powyżej 100%",
      message: "Przed wpłatą zawsze patrz na LTV: im niższe, tym większy zapas.",
      track: "inwestor",
    };
    const d = decideFinalGate(item, V);
    expect(d.action).toBe("publish");
    if (d.action !== "publish") return;
    expect(d.changed).toBe(true);
    expect(d.message).toContain("KRS");
    const again = decideFinalGate({ ...item, message: d.message }, V);
    expect(again).toMatchObject({ action: "publish", changed: false });
  });

  it("X bez stopki (limit znaków), ale z regułami", () => {
    expect(
      decideFinalGate({ platform: "x", title: "", message: "Krótki post", track: null }, V),
    ).toEqual({
      action: "publish",
      message: "Krótki post",
      changed: false,
    });
    expect(
      decideFinalGate({ platform: "x", title: "", message: "Gwarantowany zysk!", track: null }, V)
        .action,
    ).toBe("block");
  });

  it("tytuł też przechodzi reguły", () => {
    const d = decideFinalGate(
      {
        platform: "youtube",
        title: "Gwarantowany zysk co miesiąc",
        message: "Opis",
        track: "inwestor",
      },
      V,
    );
    expect(d.action).toBe("block");
  });
});
