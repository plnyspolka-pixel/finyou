import { describe, expect, it } from "vitest";
import {
  applyDiscountGrosz,
  generateDiscountCode,
  isDiscountCodeActive,
  normalizeDiscountCode,
  parseDiscountCode,
  verifyDiscountCode,
  warsawToday,
} from "./discount-code";

const SECRET = "test-secret";
const TODAY = "2026-10-01";
const gen = (pct: number, until = "2026-12-31") => generateDiscountCode(pct, until, SECRET, TODAY);

describe("kody rabatowe", () => {
  it("procent i data ważności są czytelne w treści kodu", async () => {
    const code = await gen(20);
    expect(code).toMatch(/^RABAT20-311226-[0-9A-Z]{4}-[0-9A-Z]{8}$/);
    const v = await verifyDiscountCode(code, SECRET);
    expect(v?.pct).toBe(20);
    expect(v?.validUntil).toBe("2026-12-31");
    expect(v?.code).toBe(code);
  });

  it("zmiana procentu w treści kodu unieważnia podpis", async () => {
    const code = await gen(10);
    expect(await verifyDiscountCode(code.replace(/^RABAT10/, "RABAT90"), SECRET)).toBeNull();
  });

  it("przesunięcie daty ważności w treści kodu unieważnia podpis", async () => {
    const code = await gen(10, "2026-10-31");
    expect(await verifyDiscountCode(code.replace("-311026-", "-311227-"), SECRET)).toBeNull();
  });

  it("inny sekret → kod nieważny", async () => {
    expect(await verifyDiscountCode(await gen(15), "inny")).toBeNull();
  });

  it("ważny do końca dnia ważności włącznie, dzień później już nie", async () => {
    const v = (await verifyDiscountCode(await gen(10, "2026-10-31"), SECRET))!;
    expect(isDiscountCodeActive(v, "2026-10-31")).toBe(true);
    expect(isDiscountCodeActive(v, "2026-11-01")).toBe(false);
  });

  it("dzień według czasu polskiego (23:30 UTC 31.10 to już 1.11 w Polsce)", () => {
    expect(warsawToday(new Date("2026-10-31T21:30:00Z"))).toBe("2026-10-31");
    expect(warsawToday(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11-01");
  });

  it("generator odrzuca datę z przeszłości, nieistniejącą i zbyt odległą", async () => {
    await expect(gen(10, "2026-09-30")).rejects.toThrow();
    await expect(gen(10, "2026-02-31")).rejects.toThrow();
    await expect(gen(10, "2029-01-01")).rejects.toThrow();
    await expect(gen(10, TODAY)).resolves.toMatch(/^RABAT10-011026-/);
  });

  it("kod wpisany małymi literami, ze spacjami i bez myślników jest akceptowany", async () => {
    const code = await gen(5);
    const sloppy = ` ${code.toLowerCase().replace(/-/g, " ")} `;
    expect((await verifyDiscountCode(sloppy, SECRET))?.code).toBe(code);
    expect(normalizeDiscountCode(code.replace(/-/g, ""))).toBe(code);
  });

  it("odrzuca procent spoza 1–90, zera wiodące i nieistniejące daty", () => {
    expect(parseDiscountCode("RABAT0-311226-AAAA-AAAAAAAA")).toBeNull();
    expect(parseDiscountCode("RABAT95-311226-AAAA-AAAAAAAA")).toBeNull();
    expect(parseDiscountCode("RABAT05-311226-AAAA-AAAAAAAA")).toBeNull();
    expect(parseDiscountCode("RABAT50-310226-AAAA-AAAAAAAA")).toBeNull();
    expect(parseDiscountCode("RABAT50-AAAA-AAAAAAAA")).toBeNull();
    expect(parseDiscountCode("RABAT50-311226-AAAA-AAAAAAAA")?.pct).toBe(50);
  });

  it("cena po rabacie zaokrąglona w górę do grosza, minimum 1 zł", () => {
    expect(applyDiscountGrosz(700_000, 20)).toBe(560_000);
    expect(applyDiscountGrosz(9_999, 10)).toBe(9_000); // 8999,1 gr → 9000 gr
    expect(applyDiscountGrosz(150, 90)).toBe(100);
  });
});
