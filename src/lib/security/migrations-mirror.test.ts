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
  ["20260929150000_etap0_bezpieczenstwo_teaserow.sql", "0011_etap0_bezpieczenstwo_teaserow.sql"],
  ["20260929151000_etap1_inwestor_bez_oplat.sql", "0012_etap1_inwestor_bez_oplat.sql"],
  ["20260929152000_etap2_ltv_60.sql", "0013_etap2_ltv_60.sql"],
  ["20260929153000_etap3_zlecenia_limity.sql", "0014_etap3_zlecenia_limity.sql"],
  ["20260929154000_etap4_statusy_wniosku.sql", "0015_etap4_statusy_wniosku.sql"],
  ["20260929155000_etap5_pakiet_inwestor_v7.sql", "0016_etap5_pakiet_inwestor_v7.sql"],
  ["20260929156000_etap5_zgody_v2.sql", "0017_etap5_zgody_v2.sql"],
  ["20260929157000_etap5_akceptacje_zgod_i_boty.sql", "0018_etap5_akceptacje_zgod_i_boty.sql"],
  ["20260930100000_polityka_v2_cookies.sql", "0020_polityka_v2_cookies.sql"],
  ["20260930101000_cookie_consent_log.sql", "0021_cookie_consent_log.sql"],
  ["20260930140000_abonament_inwestora.sql", "0023_abonament_inwestora.sql"],
  ["20260930190000_prowizja_od_pozyczkobiorcy.sql", "0024_prowizja_od_pozyczkobiorcy.sql"],
  ["20261006120000_social_autoodpowiedzi_raport.sql", "0026_social_autoodpowiedzi_raport.sql"],
];

describe("migracje 2026-09-29", () => {
  it.each(PAIRS)("%s ma identyczne lustro drizzle", (supa, drz) => {
    expect(readFileSync(join(DRIZZLE, drz), "utf8")).toBe(readFileSync(join(SUPA, supa), "utf8"));
  });

  it("znaczniki `when` w _journal.json rosną — drizzle pomija migrację starszą od ostatnio wgranej", () => {
    const journal = JSON.parse(readFileSync(join(DRIZZLE, "meta", "_journal.json"), "utf8"));
    const entries = journal.entries as { tag: string; when: number }[];
    const idx = entries.findIndex((e) => e.tag === "0022_accounting_vat_exemption_basis");
    for (let i = Math.max(idx, 1); i < entries.length; i++) {
      expect(entries[i].when, entries[i].tag).toBeGreaterThan(entries[i - 1].when);
    }
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
    const sql = readFileSync(join(SUPA, "20260929157000_etap5_akceptacje_zgod_i_boty.sql"), "utf8");
    expect(sql).toMatch(/alter table public\.consent_acceptances enable row level security/);
    expect(sql).toMatch(/revoke all on public\.consent_acceptances from public, anon/);
    expect(sql).not.toMatch(/grant [^;]*on public\.consent_acceptances to [^;]*anon/);
    expect(sql).not.toMatch(
      /grant [^;]*insert[^;]*on public\.consent_acceptances to authenticated/,
    );
  });

  it("cookie_consent_log: RLS włączone, brak dostępu anon, zapisy tylko serwisowo", () => {
    const sql = readFileSync(join(SUPA, "20260930101000_cookie_consent_log.sql"), "utf8");
    expect(sql).toMatch(/alter table public\.cookie_consent_log enable row level security/);
    expect(sql).toMatch(/revoke all on public\.cookie_consent_log from public, anon/);
    expect(sql).not.toMatch(/grant [^;]*on public\.cookie_consent_log to [^;]*anon/);
    expect(sql).not.toMatch(/grant [^;]*insert[^;]*on public\.cookie_consent_log to authenticated/);
  });

  it("0024: moduł ofert inwestora wymaga zaakceptowanego pakietu umów (RLS)", () => {
    const sql = readFileSync(join(SUPA, "20260930190000_prowizja_od_pozyczkobiorcy.sql"), "utf8");
    const fn = sql.slice(
      sql.indexOf("create or replace function public.investor_can_view_application"),
      sql.indexOf("comment on function public.investor_can_view_application"),
    );
    expect(fn).toMatch(/select public\.investor_legal_pack_complete\(_user_id\)\s+and \(/);
    expect(fn).toContain("security definer set search_path = public");
    const policy = sql.slice(sql.indexOf("create policy offers_investor_own"));
    expect(policy.match(/investor_legal_pack_complete\(auth\.uid\(\)\)/g)).toHaveLength(2);
    expect(policy).toContain("investor_can_view_application(auth.uid(), loan_application_id)");
    expect(sql).not.toMatch(/grant [^;]*anon/);
  });

  it("dopisanie bloku zasad do promptów jest idempotentne", () => {
    const sql = readFileSync(join(SUPA, "20260929157000_etap5_akceptacje_zgod_i_boty.sql"), "utf8");
    const appends = sql.match(/system_prompt = system_prompt \|\|/g) ?? [];
    const guards = sql.match(/position\('ZASADY OPŁAT I B2B' in system_prompt\) = 0/g) ?? [];
    expect(appends.length).toBe(2);
    expect(guards.length).toBe(appends.length);
  });
});

describe("migracja 20261006120000 — autoodpowiedzi i raport social", () => {
  const sql = readFileSync(join(SUPA, "20261006120000_social_autoodpowiedzi_raport.sql"), "utf8");

  it.each(["social_comment_replies", "social_stats_snapshots"])(
    "%s: RLS, brak anon, zapis tylko serwisowo, odczyt administrator/operator",
    (table) => {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all on public.${table} from public, anon`);
      expect(sql).toContain(`grant all on public.${table} to service_role`);
      expect(sql).not.toMatch(new RegExp(`grant [^;]*on public\\.${table} to [^;]*anon`));
      expect(sql).not.toMatch(
        new RegExp(`grant [^;]*(insert|update|delete)[^;]*on public\\.${table} to authenticated`),
      );
      const policy = sql.slice(sql.indexOf(`create policy "${table}_staff_read"`));
      expect(policy.slice(0, policy.indexOf(";"))).toMatch(
        /for select\s+to authenticated\s+using \(\s+public\.has_role\(auth\.uid\(\), 'administrator'::public\.app_role\)\s+or public\.has_role\(auth\.uid\(\), 'operator'::public\.app_role\)/,
      );
    },
  );

  it("unikalne (platform, comment_id) — blokada przed podwójną odpowiedzią", () => {
    expect(sql).toMatch(/unique \(platform, comment_id\)/);
  });

  it("joby pg_cron: tick co 15 min i raport w poniedziałki 06:00 UTC, z limitem czasu", () => {
    expect(sql).toMatch(/cron\.schedule\('social-comments-tick', '\*\/15 \* \* \* \*'/);
    expect(sql).toMatch(/cron\.schedule\('social-weekly-report', '0 6 \* \* 1'/);
    expect(sql).toContain("/api/public/hooks/social-comments-tick");
    expect(sql).toContain("/api/public/hooks/social-weekly-report");
    expect(sql.match(/timeout_milliseconds := 60000/g)).toHaveLength(2);
  });
});
