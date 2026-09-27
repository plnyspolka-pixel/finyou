import { describe, it, expect } from "vitest";
import { normalizeWindFeeTable, windFeeForAction, WIND_FEE_DEFAULTS } from "./windykacja-fees";

describe("opłaty windykacyjne zgodnie z umową", () => {
  it("bierze kwotę z tabeli umowy, gdy umowa ją określa", () => {
    const t = normalizeWindFeeTable({ sms: 15, telefon: "35,50", zrodlo: "umowa" });
    expect(windFeeForAction(t, "sms")).toEqual({ fee: 15, source: "umowa" });
    expect(windFeeForAction(t, "telefon")).toEqual({ fee: 35.5, source: "umowa" });
  });

  it("podpowiada kwotę domyślną, gdy umowa milczy o danej czynności", () => {
    const t = normalizeWindFeeTable({ sms: 15 });
    expect(windFeeForAction(t, "pismo")).toEqual({
      fee: WIND_FEE_DEFAULTS.pismo,
      source: "domyslna",
    });
    expect(windFeeForAction(null, "sms")).toEqual({
      fee: WIND_FEE_DEFAULTS.sms,
      source: "domyslna",
    });
  });

  it("umowa bez opłat windykacyjnych → 0 zł za każdą czynność", () => {
    const t = normalizeWindFeeTable({ brak_oplat: true });
    expect(windFeeForAction(t, "sms")).toEqual({ fee: 0, source: "brak" });
    expect(windFeeForAction(t, "telefon").fee).toBe(0);
  });

  it("normalizacja odrzuca śmieci i puste tabele", () => {
    expect(normalizeWindFeeTable(null)).toBeNull();
    expect(normalizeWindFeeTable({})).toBeNull();
    expect(normalizeWindFeeTable({ sms: "abc", telefon: -5 })).toBeNull();
    expect(normalizeWindFeeTable({ sms: 0 })?.sms).toBe(0);
  });
});
