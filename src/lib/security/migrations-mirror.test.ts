/**
 * Migracje sprzątania spójności (2026-09-29) mają lustro w drizzle/migrations
 * (ta ścieżka idzie na produkcję) — bajt w bajt, wpis w _journal.json — oraz
 * nie nadają rolom anonimowym dostępu do nowych danych.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SUPA = join(process.cwd(), "supabase", "migrations");
const DRIZZLE = join(process.cwd(), "drizzle", "migrations");

const PAIRS: Array<[string, string]> = [
  ["20260929120000_etap0_bezpieczenstwo_teaserow.sql", "0009_etap0_bezpieczenstwo_teaserow.sql"],
  ["20260929121000_etap1_inwestor_bez_oplat.sql", "0010_etap1_inwestor_bez_oplat.sql"],
  ["20260929122000_etap2_ltv_60.sql", "0011_etap2_ltv_60.sql"],
  ["20260929123000_etap3_zlecenia_limity.sql", "0012_etap3_zlecenia_limity.sql"],
  ["20260929124000_etap4_statusy_wniosku.sql", "0013_etap4_statusy_wniosku.sql"],
  ["20260929125000_etap5_pakiet_inwestor_v7.sql", "0014_etap5_pakiet_inwestor_v7.sql"],
  ["20260929126000_etap5_zgody_v2.sql", "0015_etap5_zgody_v2.sql"],
  ["20260929127000_etap5_akceptacje_zgod_i_boty.sql", "0016_etap5_akceptacje_zgod_i_boty.sql"],
];

describe("migracje 2026-09-29", () => {
  it.each(PAIRS)("%s ma identyczne lustro drizzle", (supa, drz) => {
    expect(readFileSync(join(DRIZZLE, drz), "utf8")).toBe(readFileSync(join(SUPA, supa), "utf8"));
  });

  it("każde lustro ma wpis w _journal.json i snapshot", () => {
    const journal = JSON.parse(readFileSync(join(DRIZZLE, "meta", "_journal.json"), "utf8"));
    const tags = new Set(journal.entries.map((e: { tag: string }) => e.tag));
    const snaps = new Set(readdirSync(join(DRIZZLE, "meta")));
    for (const [, drz] of PAIRS) {
      const tag = drz.replace(/\.sql$/, "");
      expect(tags.has(tag)).toBe(true);
      expect(snaps.has(`${tag.slice(0, 4)}_snapshot.json`)).toBe(true);
    }
  });

  it("consent_acceptances: RLS włączone, brak dostępu anon, zapisy tylko serwisowo", () => {
    const sql = readFileSync(join(SUPA, "20260929127000_etap5_akceptacje_zgod_i_boty.sql"), "utf8");
    expect(sql).toMatch(/alter table public\.consent_acceptances enable row level security/);
    expect(sql).toMatch(/revoke all on public\.consent_acceptances from public, anon/);
    expect(sql).not.toMatch(/grant [^;]*on public\.consent_acceptances to [^;]*anon/);
    expect(sql).not.toMatch(
      /grant [^;]*insert[^;]*on public\.consent_acceptances to authenticated/,
    );
  });

  it("dopisanie bloku zasad do promptów jest idempotentne", () => {
    const sql = readFileSync(join(SUPA, "20260929127000_etap5_akceptacje_zgod_i_boty.sql"), "utf8");
    const appends = sql.match(/system_prompt = system_prompt \|\|/g) ?? [];
    const guards = sql.match(/position\('ZASADY OPŁAT I B2B' in system_prompt\) = 0/g) ?? [];
    expect(appends.length).toBe(2);
    expect(guards.length).toBe(appends.length);
  });
});
