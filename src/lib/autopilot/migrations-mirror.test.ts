// Migracje autopilota mają lustro w drizzle/migrations (ta ścieżka idzie na
// produkcję) – bajt w bajt, wpis w _journal.json z rosnącym `when` i snapshot.
// Nowe tabele nie dają dostępu rolom anonimowym.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SUPA = join(process.cwd(), "supabase", "migrations");
const DRIZZLE = join(process.cwd(), "drizzle", "migrations");

const PAIRS: Array<[string, string]> = [
  ["20261019180000_autopilot_fundament.sql", "0034_autopilot_fundament.sql"],
  ["20261019181000_autopilot_tick_cron.sql", "0035_autopilot_tick_cron.sql"],
  ["20261019182000_autopilot_sekwencje_email.sql", "0036_autopilot_sekwencje_email.sql"],
  ["20261021090000_studio_hook_wizualny.sql", "0038_studio_hook_wizualny.sql"],
  ["20261022090000_studio_hook_clips.sql", "0040_studio_hook_clips.sql"],
  ["20261022120000_studio_hook_clips_opis.sql", "0041_studio_hook_clips_opis.sql"],
];

describe("migracje autopilota", () => {
  it.each(PAIRS)("%s ma identyczne lustro drizzle", (supa, drz) => {
    expect(readFileSync(join(DRIZZLE, drz), "utf8")).toBe(readFileSync(join(SUPA, supa), "utf8"));
  });

  it("lustra mają wpis w _journal.json (rosnące `when`) i snapshot", () => {
    const journal = JSON.parse(readFileSync(join(DRIZZLE, "meta", "_journal.json"), "utf8"));
    const entries = journal.entries as { tag: string; when: number }[];
    const snaps = new Set(readdirSync(join(DRIZZLE, "meta")));
    for (const [, drz] of PAIRS) {
      const tag = drz.replace(/\.sql$/, "");
      const i = entries.findIndex((e) => e.tag === tag);
      expect(i, tag).toBeGreaterThan(0);
      expect(entries[i].when).toBeGreaterThan(entries[i - 1].when);
      expect(snaps.has(`${tag.slice(0, 4)}_snapshot.json`)).toBe(true);
    }
  });

  it("nowe tabele: RLS włączone, bez grantów dla anon", () => {
    for (const [supa] of PAIRS) {
      const sql = readFileSync(join(SUPA, supa), "utf8");
      expect(sql).not.toMatch(/grant [^;]* to [^;]*anon/i);
      for (const m of sql.matchAll(/create table if not exists public\.(\w+)/gi)) {
        expect(sql, m[1]).toMatch(
          new RegExp(`alter table public\\.${m[1]} enable row level security`, "i"),
        );
      }
    }
  });
});
