import { describe, expect, it } from "vitest";
import { getStoreLegal, storeLegalSha, STORE_DPA, STORE_TERMS } from "./legal";
import { validateKwNumber } from "@/lib/kw";

describe("standalone investor shop legal / input invariants", () => {
  it("keeps shop terms and document processor agreement separate", () => {
    expect(getStoreLegal("store_terms").code).toBe("store_terms");
    expect(getStoreLegal("store_dpa").code).toBe("store_dpa");
    expect(STORE_TERMS).toContain("REGULAMIN");
    expect(STORE_DPA).toContain("ART. 28 RODO");
    expect(STORE_DPA).toContain("podprocesorów");
  });
  it("creates deterministic hashes for immutable contract snapshots", async () => {
    const terms1 = await storeLegalSha("store_terms");
    const terms2 = await storeLegalSha("store_terms");
    const dpa = await storeLegalSha("store_dpa");
    expect(terms1).toMatch(/^[0-9a-f]{64}$/);
    expect(terms2).toBe(terms1);
    expect(dpa).not.toBe(terms1);
  });
  it("uses the platform KW checksum, never just a regex", () => {
    expect(validateKwNumber("KR1P/00610770/2").ok).toBe(true);
    expect(validateKwNumber("KR1P/00610770/3").ok).toBe(false);
    expect(validateKwNumber("niewazny").ok).toBe(false);
  });
});
