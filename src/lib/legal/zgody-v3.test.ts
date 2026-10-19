/**
 * Regulamin klienta v3: jedyna zmiana względem v2 to nazwa prowizji od
 * pożyczkobiorcy i numer/data wersji. Plik .md i sekcja migracji
 * 20260930190000 (drizzle 0024) są tym, co generuje kod.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { migracjaRegulaminV3, transformRegulaminV3 } from "./zgody-v3";

const DIR = join(process.cwd(), "docs", "legal", "klient");
const v2 = readFileSync(join(DIR, "regulamin-klienta-v2.md"), "utf8");
const v3 = transformRegulaminV3(v2);

describe("regulamin klienta v3", () => {
  it("nowa nazwa prowizji, bez starej", () => {
    expect(v3).not.toMatch(/klientowsk/i);
    expect(v3).toContain("**Prowizja Finance You** (prowizja od pożyczkobiorcy)");
  });

  it("numer i data wersji; poza tym treść v2 bez zmian", () => {
    expect(v3).toContain("**wersja 3 — obowiązuje od dnia 30 września 2026 r.**");
    expect(v3).toContain("Regulamin w wersji 3 obowiązuje od dnia 30 września 2026 r. Do spraw");
    expect(v3.split("\n").length).toBe(v2.split("\n").length);
    const rozne = v2.split("\n").filter((l, i) => l !== v3.split("\n")[i]);
    expect(rozne).toHaveLength(3);
  });

  it("docs/legal/klient/regulamin-klienta-v3.md i migracja 20260930190000 są aktualne", () => {
    expect(readFileSync(join(DIR, "regulamin-klienta-v3.md"), "utf8")).toBe(v3);
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase",
        "migrations",
        "20260930190000_prowizja_od_pozyczkobiorcy.sql",
      ),
      "utf8",
    );
    expect(sql).toContain(migracjaRegulaminV3(v3));
    expect(sql).toMatch(/version < 3 and is_active/);
  });
});
