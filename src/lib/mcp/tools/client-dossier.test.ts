import { describe, expect, it } from "vitest";
import { cleanClient, maskPesel } from "./client-dossier";

const client = {
  id: "c1",
  first_name: "Jan",
  pesel: "85010112345",
  bank_account: "PL61109010140000071219812874",
  bik_report_path: "bik/c1.pdf",
  phone_otp_hash: "abc",
  phone_otp_attempts: 2,
};

describe("cleanClient", () => {
  it("administrator widzi dane wrażliwe, nigdy hashy OTP", () => {
    const out = cleanClient(client, true);
    expect(out.pesel).toBe("85010112345");
    expect(out.bank_account).toBe(client.bank_account);
    expect(out).not.toHaveProperty("phone_otp_hash");
    expect(out).not.toHaveProperty("phone_otp_attempts");
  });

  it("operator dostaje zamaskowany PESEL i ukryty rachunek", () => {
    const out = cleanClient(client, false);
    expect(out.pesel).toBe("850101*****");
    expect(out.bank_account).toBe("(ukryte)");
    expect(out.bik_report_path).toBe("(ukryte)");
    expect(out.first_name).toBe("Jan");
  });
});

describe("maskPesel", () => {
  it("maskuje tylko poprawny format, pusty zostaje null", () => {
    expect(maskPesel("85010112345")).toBe("850101*****");
    expect(maskPesel("")).toBeNull();
    expect(maskPesel("123")).toBe("***");
  });
});
