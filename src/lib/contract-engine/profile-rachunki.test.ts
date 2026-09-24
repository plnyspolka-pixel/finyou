/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Rachunki w umowie z profilu klienta: wypłata na rachunek Pożyczkobiorcy,
 * spłata na rachunek Pożyczkodawcy (Finance You — domyślny, gdy pusty).
 */
import { describe, expect, it } from "vitest";
import { emptyProfile, type ClientProfile } from "@/lib/client-profile-types";
import { buildUmowaData, profileToCalcPayload } from "./profile-to-umowa";
import { przetworzSzkic } from "./umowa-agent-core";

function profil(): ClientProfile {
  const p = emptyProfile();
  p.borrowerData = {
    firstName: "Jan",
    lastName: "Kowalski",
    pesel: "80010112345",
    bankAccount: "25 8011 0008 0010 0150 5299 0002",
  };
  p.investorData = { companyName: "FINANCE YOU sp. z o.o.", nip: "7010611803" };
  p.offerData = {
    netAmountToClient: 25000,
    creditedCommission: 5000,
    loanTermMonths: 12,
    maxMonthlyPaymentByClient: 900,
    annualInterestPercent: 14.5,
    payoutDate: "2026-09-24",
  };
  return p;
}

describe("rachunki z profilu klienta", () => {
  it("wypłata = rachunek Pożyczkobiorcy, nie inwestora", () => {
    const p = profil();
    p.investorData.bankAccount = "11 2222 3333 4444 5555 6666 7777";
    const u: any = buildUmowaData(p, profileToCalcPayload(p)!);
    expect(u.warunki.rachunki.wyplata).toBe("25 8011 0008 0010 0150 5299 0002");
    expect(u.warunki.rachunki.splata).toBe("11 2222 3333 4444 5555 6666 7777");
  });

  it("Finance You bez rachunku w profilu → rachunek spłaty Finance You", () => {
    const p = profil();
    const { umowa } = przetworzSzkic(buildUmowaData(p, profileToCalcPayload(p)!));
    expect(umowa.warunki.rachunki.splata).toBe("56 1090 2590 0000 0001 5708 1371");
  });

  it("brak rachunku Pożyczkobiorcy → BLAD (R30)", () => {
    const p = profil();
    delete p.borrowerData.bankAccount;
    const { problemy } = przetworzSzkic(buildUmowaData(p, profileToCalcPayload(p)!));
    expect(
      problemy.some((x) => x.poziom === "BLAD" && x.sciezka === "warunki.rachunki.wyplata"),
    ).toBe(true);
  });
});
