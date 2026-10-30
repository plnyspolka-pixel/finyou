import { describe, expect, it } from "vitest";
import { messengerFollowUpDecision, type FollowUpInput } from "./messenger-follow-up-policy";

const t = (iso: string) => new Date(iso).getTime();
const base = (over: Partial<FollowUpInput>): FollowUpInput => ({
  now: t("2026-10-30T10:00:00+01:00"),
  lastOutboundAt: t("2026-10-29T09:00:00+01:00"),
  lastInboundAt: t("2026-10-29T08:55:00+01:00"),
  outboundSinceInbound: 1,
  callRequested: false,
  ...over,
});

describe("messengerFollowUpDecision — przebiegi z prawdziwych rozmów", () => {
  it("Bogusław: prosił o telefon → żadnego przypomnienia, także w dzień i po „Ok.”", () => {
    expect(messengerFollowUpDecision(base({ callRequested: true }))).toEqual({
      send: false,
      reason: "klient prosił o telefon",
    });
  });

  it("Bogusław: przypomnienie o 2:45 w nocy jest zablokowane", () => {
    const d = messengerFollowUpDecision(base({ now: t("2026-10-30T02:45:00+01:00") }));
    expect(d).toEqual({ send: false, reason: "cisza nocna (20–8)" });
  });

  it("Kaniecki: po jednym przypomnieniu bez odpowiedzi — koniec (było 07:15 i 02:45)", () => {
    const d = messengerFollowUpDecision(base({ outboundSinceInbound: 2 }));
    expect(d).toEqual({ send: false, reason: "limit przypomnień" });
  });

  it("Paweł: przypomnienie najwcześniej po 24 h ciszy", () => {
    const early = messengerFollowUpDecision(
      base({
        lastOutboundAt: t("2026-10-30T07:00:00+01:00"),
        lastInboundAt: t("2026-10-30T06:59:00+01:00"),
      }),
    );
    expect(early.send).toBe(false);
    expect(messengerFollowUpDecision(base({}))).toEqual({ send: true, step: 1 });
  });

  it("klient odpisał ostatni → cisza", () => {
    const d = messengerFollowUpDecision(base({ lastInboundAt: t("2026-10-29T09:30:00+01:00") }));
    expect(d.send).toBe(false);
  });

  it("status wymaga_kontaktu, wstrzymanie, wniosek, rozmowa testowa → cisza", () => {
    for (const over of [
      { leadStatus: "wymaga_kontaktu" },
      { leadStatus: "do_not_contact" },
      { paused: true },
      { hasApplication: true },
      { isTest: true },
    ]) {
      expect(messengerFollowUpDecision(base(over)).send).toBe(false);
    }
  });
});
