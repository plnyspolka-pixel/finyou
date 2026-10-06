/**
 * Migracje sprzątania spójności (2026-09-29) mają lustro w drizzle/migrations
 * (ta ścieżka idzie na produkcję) — bajt w bajt, wpis w _journal.json — oraz
 * nie nadają rolom anonimowym dostępu do nowych danych.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
  ["20261006140000_pr_modul_na_produkcje.sql", "0027_pr_modul_na_produkcje.sql"],
  ["20261006150000_zaangazowanie_dzienny_digest.sql", "0028_zaangazowanie_dzienny_digest.sql"],
  ["20261006160000_produkcja_brakujace_obiekty.sql", "0029_produkcja_brakujace_obiekty.sql"],
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

/** Tabela tylko dla kadry: RLS, brak anon, zapis wyłącznie service_role, odczyt administrator/operator. */
function expectStaffReadOnly(sql: string, table: string) {
  expect(sql).toContain(`alter table public.${table} enable row level security`);
  expect(sql).toContain(`revoke all on public.${table} from public, anon`);
  expect(sql).toContain(`grant all on public.${table} to service_role`);
  expect(sql).not.toMatch(new RegExp(`grant [^;]*on public\\.${table} to [^;]*anon`));
  expect(sql).not.toMatch(
    new RegExp(`grant [^;]*(insert|update|delete|all)[^;]*on public\\.${table} to authenticated`),
  );
  const policy = sql.slice(sql.indexOf(`create policy "${table}_staff_read"`));
  expect(policy.slice(0, policy.indexOf(";"))).toMatch(
    /for select\s+to authenticated\s+using \(\s+public\.has_role\(auth\.uid\(\), 'administrator'::public\.app_role\)\s+or public\.has_role\(auth\.uid\(\), 'operator'::public\.app_role\)/,
  );
}

describe("migracja 20261006140000 — moduł Digital PR na produkcji", () => {
  const sql = readFileSync(join(SUPA, "20261006140000_pr_modul_na_produkcje.sql"), "utf8");

  it("stara migracja 20260803160000 nie ma lustra drizzle — dlatego tabel nie było na produkcji", () => {
    const journal = JSON.parse(readFileSync(join(DRIZZLE, "meta", "_journal.json"), "utf8"));
    const tags: string[] = journal.entries.map((e: { tag: string }) => e.tag);
    expect(tags.some((t) => t.includes("pr_module"))).toBe(false);
    expect(tags).toContain("0027_pr_modul_na_produkcje");
  });

  it.each(["pr_opportunities", "pr_outreach_log"])("%s: idempotentnie, tylko kadra", (table) => {
    expect(sql).toContain(`create table if not exists public.${table}`);
    expectStaffReadOnly(sql, table);
  });

  it("schemat zgodny z kodem panelu i monitora (kolumny, statusy, unikalny dedupe_hash)", () => {
    for (const col of [
      "dedupe_hash text not null unique",
      "matched_phrases text[]",
      "draft_subject text",
      "draft_body text",
      "draft_generated_at timestamptz",
      "recipient_email text",
      "resend_id text",
    ]) {
      expect(sql).toContain(col);
    }
    expect(sql).toContain("check (status in ('new', 'drafted', 'approved', 'sent', 'rejected'))");
    expect(sql).toContain("drop trigger if exists trg_pr_opportunities_touch_updated_at");
  });

  it("job pr-monitor-tick co 6 h, z limitem czasu i strażnikiem pg_cron/pg_net", () => {
    expect(sql).toMatch(/cron\.schedule\('pr-monitor-tick', '0 \*\/6 \* \* \*'/);
    expect(sql).toContain("/api/public/hooks/pr-monitor-tick");
    expect(sql).toContain("timeout_milliseconds := 60000");
    expect(sql).toContain("extname = 'pg_cron'");
    expect(sql).not.toMatch(/^\s*create extension/im);
  });
});

describe("migracja 20261006150000 — digest zaangażowania", () => {
  const sql = readFileSync(join(SUPA, "20261006150000_zaangazowanie_dzienny_digest.sql"), "utf8");

  it.each(["engagement_opportunities", "engagement_feeds"])("%s: tylko kadra", (table) =>
    expectStaffReadOnly(sql, table),
  );

  it("unikalny dedupe_key i statusy new / sent / done / skipped", () => {
    expect(sql).toContain("constraint engagement_opportunities_dedupe_key_key unique (dedupe_key)");
    expect(sql).toContain("check (status in ('new', 'sent', 'done', 'skipped'))");
    expect(sql).toContain(
      "check (kind in ('youtube_comment', 'instagram_comment', 'forum_reply', 'pr_pitch', 'outreach_pitch', 'directory_listing'))",
    );
  });

  it("job codziennie 05:30 UTC z limitem czasu 300 s", () => {
    expect(sql).toMatch(/cron\.schedule\('engagement-digest-tick', '30 5 \* \* \*'/);
    expect(sql).toContain("/api/public/hooks/engagement-digest-tick");
    expect(sql).toContain("timeout_milliseconds := 300000");
  });
});

describe("migracja 20261006160000 — brakujące obiekty produkcji", () => {
  const sql = readFileSync(join(SUPA, "20261006160000_produkcja_brakujace_obiekty.sql"), "utf8");

  it.each([
    "rcn_transactions",
    "comms_suppressions",
    "seo_location_pages",
    "seo_location_report_entries",
    "video_pipeline",
  ])("%s: tworzona idempotentnie, z RLS i bez pełnych grantów dla anon", (table) => {
    expect(sql).toContain(`create table if not exists public.${table} (`);
    expect(sql).toContain(`alter table public.${table} enable row level security`);
    expect(sql).toContain(`revoke all on public.${table} from public, anon`);
    expect(sql).not.toMatch(
      new RegExp(`grant (all|insert|update|delete)[^;]*on public\\.${table} to [^;]*anon`),
    );
  });

  it("anon czyta tylko publiczne strony SEO (opublikowane) i ranking", () => {
    const anonGrants = [...sql.matchAll(/grant [^;]* to [^;]*anon[^;]*;/g)].map((m) => m[0]);
    expect(anonGrants).toEqual([
      "grant select on public.seo_location_pages to anon, authenticated;",
      "grant select on public.seo_location_report_entries to anon, authenticated;",
    ]);
    expect(sql).toContain("using (status = 'published')");
  });

  it("CHECK suppressed_emails zachowuje 'internal' z produkcji", () => {
    expect(sql).toMatch(/reason in \([^)]*'internal'[^)]*'bot_detected'[^)]*\)/s);
  });

  it("nie odtwarza obiektów celowo zastąpionych nowszymi migracjami", () => {
    expect(sql).not.toMatch(/function public\.investor_has_full_access/);
    expect(sql).not.toMatch(/function public\.investor_module_access_active/);
    expect(sql).not.toMatch(/create table[^;]*debt_collection/);
  });

  it("joby pg_cron dla istniejących endpointów, ze strażnikiem i limitem czasu", () => {
    for (const [job, schedule] of [
      ["seo-location-publish-tick", "0 6 * * 1"],
      ["video-pipeline-tick", "30 * * * *"],
      ["affiliate-events-tick", "*/15 * * * *"],
      ["kw-easymkw-poll", "*/2 * * * *"],
    ]) {
      expect(sql).toContain(`array['${job}', '${schedule}']`);
      expect(existsSync(join(process.cwd(), "src/routes/api/public/hooks", `${job}.ts`))).toBe(
        true,
      );
    }
    expect(sql).toContain("timeout_milliseconds := 60000");
    expect(sql).toContain("extname = 'pg_cron'");
    expect(sql).not.toMatch(/^\s*create extension/im);
  });
});
