import { describe, expect, it } from "vitest";
import { isCmdQuotaError, normalizeKwNumber } from "./kw-fetch.server";

describe("isCmdQuotaError", () => {
  it("rozpoznaje 403 z wyczerpanym limitem TECH_IN_ORDER", () => {
    expect(
      isCmdQuotaError(
        "HTTP 403: Usage type: TECH_IN_ORDER limit exceeded, limit: 500, usageAfterRequest: 73, limitGroup: 500, usageAfterRequestGroup: 501",
      ),
    ).toBe(true);
  });

  it("rozpoznaje własny komunikat zapisany w last_error (backoff po quota)", () => {
    expect(isCmdQuotaError("Wyczerpany limit zapytań CMD KW Engine (limit grupowy konta).")).toBe(
      true,
    );
  });

  it("nie łapie zwykłych błędów", () => {
    expect(isCmdQuotaError("Księga nie znaleziona w bazie EKW")).toBe(false);
    expect(isCmdQuotaError("HTTP 500: Internal Server Error")).toBe(false);
    expect(isCmdQuotaError(null)).toBe(false);
    expect(isCmdQuotaError("")).toBe(false);
  });
});

describe("normalizeKwNumber", () => {
  it("normalizuje zapis z ukośnikami do 13 znaków", () => {
    expect(normalizeKwNumber("KA1L/00008967/5")).toBe("KA1L000089675");
    expect(normalizeKwNumber("ka1l 00008967 5")).toBe("KA1L000089675");
  });

  it("odrzuca śmieci", () => {
    expect(normalizeKwNumber("nie mam numeru")).toBeNull();
  });
});
