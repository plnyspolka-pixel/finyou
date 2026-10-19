/**
 * Buduje Regulamin klienta v4 i Politykę prywatności v3 („Serwis” zamiast „Platformy”).
 *
 *   npx tsx scripts/legal/build-zgody-v4.ts
 *
 * Wejście: docs/legal/klient/regulamin-klienta-v3.md, polityka-prywatnosci-v2.md
 * Wynik:   docs/legal/klient/regulamin-klienta-v4.md, polityka-prywatnosci-v3.md
 *          oraz migracja 20261019120000 (+ lustro drizzle 0034).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  migracjaZgodV4,
  transformPolitykaV3,
  transformRegulaminV4,
} from "../../src/lib/legal/zgody-v4";

const DIR = join(process.cwd(), "docs", "legal", "klient");
const MIGRATION = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261019120000_regulamin_v4_polityka_v3_serwis.sql",
);
const MIGRATION_DRIZZLE = join(
  process.cwd(),
  "drizzle",
  "migrations",
  "0034_regulamin_v4_polityka_v3_serwis.sql",
);

const regulamin = transformRegulaminV4(readFileSync(join(DIR, "regulamin-klienta-v3.md"), "utf8"));
const polityka = transformPolitykaV3(readFileSync(join(DIR, "polityka-prywatnosci-v2.md"), "utf8"));
writeFileSync(join(DIR, "regulamin-klienta-v4.md"), regulamin, "utf8");
writeFileSync(join(DIR, "polityka-prywatnosci-v3.md"), polityka, "utf8");
const sql = migracjaZgodV4(regulamin, polityka);
writeFileSync(MIGRATION, sql, "utf8");
writeFileSync(MIGRATION_DRIZZLE, sql, "utf8");
console.log("regulamin v4:", regulamin.length, "znaków; polityka v3:", polityka.length, "znaków");
