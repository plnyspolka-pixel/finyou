import { describe, expect, it } from "vitest";
import { signMarkToken, verifyMarkToken } from "./token";

const ID = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const SECRET = "sekret-testowy";
const NOW = new Date("2026-10-06T05:30:00Z");

describe("token „Zrobione / Pomiń”", () => {
  it("podpis i weryfikacja w obie strony, ważny 14 dni", async () => {
    const t = await signMarkToken(ID, "done", SECRET, NOW);
    const v = await verifyMarkToken(t, SECRET, new Date(NOW.getTime() + 13 * 86_400_000));
    expect(v).toMatchObject({ ok: true, id: ID, action: "done" });
    const s = await verifyMarkToken(await signMarkToken(ID, "skip", SECRET, NOW), SECRET, NOW);
    expect(s).toMatchObject({ ok: true, action: "skip" });
  });

  it("po terminie — expired", async () => {
    const t = await signMarkToken(ID, "done", SECRET, NOW);
    const v = await verifyMarkToken(t, SECRET, new Date(NOW.getTime() + 15 * 86_400_000));
    expect(v).toEqual({ ok: false, reason: "expired" });
  });

  it("podmiana akcji, id, terminu albo podpisu — odrzucone", async () => {
    const t = await signMarkToken(ID, "skip", SECRET, NOW);
    const [id, , exp, sig] = t.split(".");
    expect((await verifyMarkToken(`${id}.d.${exp}.${sig}`, SECRET, NOW)).ok).toBe(false);
    const otherId = "00000000-0000-4000-8000-000000000000";
    expect((await verifyMarkToken(`${otherId}.s.${exp}.${sig}`, SECRET, NOW)).ok).toBe(false);
    expect((await verifyMarkToken(`${id}.s.${Number(exp) + 86_400}.${sig}`, SECRET, NOW)).ok).toBe(
      false,
    );
    const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    expect(await verifyMarkToken(`${id}.s.${exp}.${flipped}`, SECRET, NOW)).toEqual({
      ok: false,
      reason: "signature",
    });
    expect((await verifyMarkToken(t, "inny-sekret", NOW)).ok).toBe(false);
  });

  it("śmieci i brak sekretu — malformed", async () => {
    for (const bad of ["", "abc", `${ID}.x.123456789.sig`, `nie-uuid.d.1791286686.sig`, null]) {
      expect(await verifyMarkToken(bad, SECRET, NOW)).toEqual({ ok: false, reason: "malformed" });
    }
    const t = await signMarkToken(ID, "done", SECRET, NOW);
    expect(await verifyMarkToken(t, "", NOW)).toEqual({ ok: false, reason: "malformed" });
    await expect(signMarkToken(ID, "done", "", NOW)).rejects.toThrow();
    await expect(signMarkToken("nie-uuid", "done", SECRET, NOW)).rejects.toThrow();
  });
});
