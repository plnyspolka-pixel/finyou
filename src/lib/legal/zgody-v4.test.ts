/**
 * Regulamin klienta v4 i Polityka prywatności v3: jedyna zmiana względem
 * regulaminu v3 i polityki v2 to „Serwis” zamiast „Platformy” oraz numer
 * i data wersji. Pliki .md i migracja 20261019120000 (drizzle 0034) są tym,
 * co generuje kod.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  bezPlatformy,
  migracjaZgodV4,
  transformPolitykaV3,
  transformRegulaminV4,
} from "./zgody-v4";

const DIR = join(process.cwd(), "docs", "legal", "klient");
const regV3 = readFileSync(join(DIR, "regulamin-klienta-v3.md"), "utf8");
const polV2 = readFileSync(join(DIR, "polityka-prywatnosci-v2.md"), "utf8");
const regV4 = transformRegulaminV4(regV3);
const polV3 = transformPolitykaV3(polV2);

describe("regulamin klienta v4 i polityka prywatności v3 — Serwis zamiast Platformy", () => {
  it("bez „Platformy” jako pojęcia; zostaje pojęcie ustawowe i Meta Platforms", () => {
    for (const doc of [regV4, polV3]) {
      expect(doc).not.toMatch(/Platform(a|y|ie|ą|ę)\b|PLATFORMY/);
    }
    expect(regV4).toContain("platformą finansowania społecznościowego");
    expect(polV3).toContain("Meta Platforms Ireland Limited");
  });

  it("definicja i uzgodnienia rodzaju", () => {
    expect(regV4).toContain("**Serwis** albo **Serwis Finance You** – strona internetowa,");
    expect(regV4).toContain("aby Serwis działał prawidłowo i był dostępny");
    expect(regV4).toContain("Jego celem jest zebranie");
    expect(regV4).toContain("Prawa do Serwisu, jego układu");
    expect(polV3).toContain("Serwisu Finance You prowadzonego przez");
    expect(polV3).toContain("Serwis Finance You nie jest kierowany do dzieci");
    for (const doc of [regV4, polV3]) expect(doc).not.toMatch(/na Serwisie/);
  });

  it("numery i daty wersji; liczba linii bez zmian", () => {
    expect(regV4).toContain("**wersja 4 — obowiązuje od dnia 19 października 2026 r.**");
    expect(regV4).toContain(
      "Regulamin w wersji 4 obowiązuje od dnia 19 października 2026 r. Do spraw",
    );
    expect(polV3).toContain("**wersja 3 — obowiązuje od dnia 19 października 2026 r.**");
    expect(polV3).toContain(
      "Polityka prywatności w wersji 3 obowiązuje od dnia 19 października 2026 r.",
    );
    expect(regV4.split("\n").length).toBe(regV3.split("\n").length);
    expect(polV3.split("\n").length).toBe(polV2.split("\n").length);
  });

  it("poza słowem „Platforma” treść się nie zmienia", () => {
    const linieRegV3 = regV3.split("\n");
    const rozne = regV4.split("\n").filter((l, i) => l !== bezPlatformy(linieRegV3[i]));
    // Tylko dwie linie z numerem i datą wersji różnią się od samej zamiany słów.
    expect(rozne).toHaveLength(2);
  });

  it("pliki .md i migracje są aktualne", () => {
    expect(readFileSync(join(DIR, "regulamin-klienta-v4.md"), "utf8")).toBe(regV4);
    expect(readFileSync(join(DIR, "polityka-prywatnosci-v3.md"), "utf8")).toBe(polV3);
    const sql = migracjaZgodV4(regV4, polV3);
    for (const p of [
      ["supabase", "migrations", "20261019120000_regulamin_v4_polityka_v3_serwis.sql"],
      ["drizzle", "migrations", "0034_regulamin_v4_polityka_v3_serwis.sql"],
    ]) {
      expect(readFileSync(join(process.cwd(), ...p), "utf8")).toBe(sql);
    }
    expect(sql).toMatch(/'terms'::public\.consent_kind and version < 4 and is_active/);
    expect(sql).toMatch(/'privacy'::public\.consent_kind and version < 3 and is_active/);
  });
});
