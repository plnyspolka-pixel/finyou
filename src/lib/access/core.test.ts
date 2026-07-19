import { describe, expect, it } from "vitest";
import {
  computeGrantWindow,
  daysLeft,
  formatGroszPln,
  groszToPln,
  isLegacyPlanId,
  isValidNip,
  isValidPostalCode,
  plnToGrosz,
  validateBuyer,
  yearlySavingsGrosz,
} from "./core";

describe("cennik (grosze ↔ prezentacja)", () => {
  it("formatuje ceny katalogowe brutto", () => {
    expect(formatGroszPln(99900)).toBe("999 zł");
    expect(formatGroszPln(599900)).toBe("5 999 zł");
    expect(formatGroszPln(49900)).toBe("499 zł");
    expect(formatGroszPln(299900)).toBe("2 999 zł");
  });

  it("konwertuje grosze na PLN dla Tpay i z powrotem bez błędów FP", () => {
    expect(groszToPln(99900)).toBe(999);
    expect(groszToPln(599900)).toBe(5999);
    expect(plnToGrosz(999)).toBe(99900);
    expect(plnToGrosz(999.0)).toBe(99900);
    expect(plnToGrosz(499.0)).toBe(49900);
    // klasyczna pułapka zmiennoprzecinkowa
    expect(plnToGrosz(0.1 + 0.2)).toBe(30);
  });

  it("liczy oszczędność pakietu rocznego względem 12 zakupów miesięcznych", () => {
    expect(yearlySavingsGrosz(99900, 599900)).toBe(99900 * 12 - 599900);
    expect(yearlySavingsGrosz(49900, 299900)).toBe(49900 * 12 - 299900);
  });
});

describe("stare plany", () => {
  it("identyfikuje stare identyfikatory (zablokowane dla nowych płatności)", () => {
    expect(isLegacyPlanId("investor_access_1d")).toBe(true);
    expect(isLegacyPlanId("investor_access_1m")).toBe(true);
    expect(isLegacyPlanId("investor_access_1y")).toBe(true);
    expect(isLegacyPlanId("investor_access_30d")).toBe(false);
    expect(isLegacyPlanId("broker_access_365d")).toBe(false);
  });
});

describe("okno przyznanego dostępu (UTC)", () => {
  const now = new Date("2026-08-01T10:00:00.000Z");

  it("przedłużenie aktywnego dostępu liczy dni od dotychczasowego active_until", () => {
    const activeUntil = new Date("2026-08-15T10:00:00.000Z");
    const { grantedFrom, grantedUntil } = computeGrantWindow(now, activeUntil, 30);
    expect(grantedFrom.toISOString()).toBe("2026-08-15T10:00:00.000Z");
    expect(grantedUntil.toISOString()).toBe("2026-09-14T10:00:00.000Z");
  });

  it("zakup po wygaśnięciu liczy dni od chwili płatności", () => {
    const expired = new Date("2026-07-01T00:00:00.000Z");
    const { grantedFrom, grantedUntil } = computeGrantWindow(now, expired, 30);
    expect(grantedFrom.toISOString()).toBe(now.toISOString());
    expect(grantedUntil.getTime() - grantedFrom.getTime()).toBe(30 * 24 * 3600 * 1000);
  });

  it("pierwszy zakup: dokładnie 30 / 365 dni od teraz", () => {
    const w30 = computeGrantWindow(now, null, 30);
    const w365 = computeGrantWindow(now, null, 365);
    expect(w30.grantedUntil.getTime() - now.getTime()).toBe(30 * 24 * 3600 * 1000);
    expect(w365.grantedUntil.getTime() - now.getTime()).toBe(365 * 24 * 3600 * 1000);
  });

  it("daysLeft zaokrągla w górę i nie schodzi poniżej zera", () => {
    expect(daysLeft(now, new Date(now.getTime() + 36 * 3600 * 1000))).toBe(2);
    expect(daysLeft(now, new Date(now.getTime() - 1000))).toBe(0);
    expect(daysLeft(now, null)).toBe(0);
  });
});

describe("walidacja NIP", () => {
  it("akceptuje poprawne NIP-y (suma kontrolna)", () => {
    expect(isValidNip("5260250274")).toBe(true); // przykładowy poprawny NIP
    expect(isValidNip("526-025-02-74")).toBe(true);
    expect(isValidNip("PL5260250274")).toBe(true);
  });
  it("odrzuca błędne NIP-y", () => {
    expect(isValidNip("5260250275")).toBe(false);
    expect(isValidNip("1234567890")).toBe(false);
    expect(isValidNip("123")).toBe(false);
    expect(isValidNip("")).toBe(false);
  });
});

describe("walidacja danych nabywcy", () => {
  const base = {
    buyerName: "Jan Kowalski",
    buyerEmail: "jan@example.com",
    buyerStreet: "ul. Prosta 1",
    buyerPostalCode: "00-001",
    buyerCity: "Warszawa",
    buyerCountry: "PL",
  };

  it("osoba prywatna: wymaga pełnego adresu, nie wymaga NIP", () => {
    expect(validateBuyer({ ...base, buyerType: "person" })).toEqual([]);
    expect(validateBuyer({ ...base, buyerType: "person", buyerStreet: "" })).not.toEqual([]);
    expect(validateBuyer({ ...base, buyerType: "person", buyerCity: "" })).not.toEqual([]);
    expect(validateBuyer({ ...base, buyerType: "person", buyerPostalCode: "00000" })).not.toEqual(
      [],
    );
  });

  it("firma: wymaga poprawnego NIP", () => {
    expect(
      validateBuyer({ ...base, buyerType: "company", buyerName: "Firma Sp. z o.o." }),
    ).not.toEqual([]);
    expect(
      validateBuyer({
        ...base,
        buyerType: "company",
        buyerName: "Firma Sp. z o.o.",
        buyerNip: "5260250274",
      }),
    ).toEqual([]);
    expect(
      validateBuyer({
        ...base,
        buyerType: "company",
        buyerName: "Firma Sp. z o.o.",
        buyerNip: "1234567890",
      }),
    ).not.toEqual([]);
  });

  it("kod pocztowy w formacie 00-000", () => {
    expect(isValidPostalCode("00-950")).toBe(true);
    expect(isValidPostalCode("00950")).toBe(false);
  });
});
