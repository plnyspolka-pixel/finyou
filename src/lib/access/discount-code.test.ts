import { describe, expect, it } from "vitest";
import {
  applyDiscountGrosz,
  generateDiscountCode,
  normalizeDiscountCode,
  parseDiscountCode,
  verifyDiscountCode,
} from "./discount-code";

const SECRET = "test-secret";

describe("kody rabatowe", () => {
  it("wygenerowany kod przechodzi weryfikację i niesie procent z treści", async () => {
    const code = await generateDiscountCode(20, SECRET);
    expect(code).toMatch(/^RABAT20-[0-9A-Z]{4}-[0-9A-Z]{8}$/);
    const v = await verifyDiscountCode(code, SECRET);
    expect(v?.pct).toBe(20);
    expect(v?.code).toBe(code);
  });

  it("zmiana procentu w treści kodu unieważnia podpis", async () => {
    const code = await generateDiscountCode(10, SECRET);
    const forged = code.replace(/^RABAT10/, "RABAT90");
    expect(await verifyDiscountCode(forged, SECRET)).toBeNull();
  });

  it("inny sekret → kod nieważny", async () => {
    const code = await generateDiscountCode(15, SECRET);
    expect(await verifyDiscountCode(code, "inny")).toBeNull();
  });

  it("kod wpisany małymi literami, ze spacjami i bez myślników jest akceptowany", async () => {
    const code = await generateDiscountCode(5, SECRET);
    const sloppy = ` ${code.toLowerCase().replace(/-/g, " ")} `;
    expect((await verifyDiscountCode(sloppy, SECRET))?.code).toBe(code);
    expect(normalizeDiscountCode(code.replace(/-/g, ""))).toBe(code);
  });

  it("odrzuca procent spoza 1–90 i zera wiodące", () => {
    expect(parseDiscountCode("RABAT0-AAAA-AAAAAAAA")).toBeNull();
    expect(parseDiscountCode("RABAT95-AAAA-AAAAAAAA")).toBeNull();
    expect(parseDiscountCode("RABAT05-AAAA-AAAAAAAA")).toBeNull();
    expect(parseDiscountCode("RABAT50-AAAA-AAAAAAAA")?.pct).toBe(50);
  });

  it("cena po rabacie zaokrąglona w górę do grosza, minimum 1 zł", () => {
    expect(applyDiscountGrosz(700_000, 20)).toBe(560_000);
    expect(applyDiscountGrosz(9_999, 10)).toBe(9_000); // 8999,1 gr → 9000 gr
    expect(applyDiscountGrosz(150, 90)).toBe(100);
  });
});
