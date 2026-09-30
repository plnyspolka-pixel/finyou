/**
 * Buduje Regulamin klienta v3 (nazwa prowizji od pożyczkobiorcy).
 *
 *   npx tsx scripts/legal/build-zgody-v3.ts
 *
 * Wejście: docs/legal/klient/regulamin-klienta-v2.md (= treść v2 w bazie)
 * Wynik:   docs/legal/klient/regulamin-klienta-v3.md oraz sekcja
 *          „REGULAMIN KLIENTA v3” w migracji 20260930190000 (+ lustro drizzle 0024).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { wstawSekcje } from "../../src/lib/legal/build-v7";
import {
  ZGODY_V3_SEKCJA_KONIEC,
  ZGODY_V3_SEKCJA_START,
  migracjaRegulaminV3,
  transformRegulaminV3,
} from "../../src/lib/legal/zgody-v3";

const DIR = join(process.cwd(), "docs", "legal", "klient");
const MIGRATION = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260930190000_prowizja_od_pozyczkobiorcy.sql",
);
const MIGRATION_DRIZZLE = join(
  process.cwd(),
  "drizzle",
  "migrations",
  "0024_prowizja_od_pozyczkobiorcy.sql",
);

const regulamin = transformRegulaminV3(readFileSync(join(DIR, "regulamin-klienta-v2.md"), "utf8"));
writeFileSync(join(DIR, "regulamin-klienta-v3.md"), regulamin, "utf8");
const sql = wstawSekcje(
  readFileSync(MIGRATION, "utf8"),
  ZGODY_V3_SEKCJA_START,
  ZGODY_V3_SEKCJA_KONIEC,
  migracjaRegulaminV3(regulamin),
);
writeFileSync(MIGRATION, sql, "utf8");
writeFileSync(MIGRATION_DRIZZLE, sql, "utf8");
console.log("regulamin v3:", regulamin.length, "znaków");
