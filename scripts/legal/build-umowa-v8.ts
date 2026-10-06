/**
 * Buduje umowę ramową v8 (Abonament wyłącznie roczny).
 *
 *   npx tsx scripts/legal/build-umowa-v8.ts
 *
 * Wynik (deterministyczny — ponowne uruchomienie daje te same bajty):
 *   docs/legal/paczka-inwestor-v8/*.docx, *.txt, CONTENT.sha256, MANIFEST.sha256
 *   supabase/migrations/20261006191000_umowa_ramowa_v8.sql + lustro drizzle 0029.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildUmowaV8, migracjaUmowyV8Sql } from "../../src/lib/legal/umowa-v8";

const OUT = join(process.cwd(), "docs", "legal", "paczka-inwestor-v8");
const MIGRATION = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261006191000_umowa_ramowa_v8.sql",
);
const MIGRATION_DRIZZLE = join(process.cwd(), "drizzle", "migrations", "0029_umowa_ramowa_v8.sql");

async function main() {
  const d = await buildUmowaV8();
  mkdirSync(OUT, { recursive: true });
  const txt = d.docx_filename.replace(/\.docx$/, ".txt");
  writeFileSync(join(OUT, d.docx_filename), d.docx);
  writeFileSync(join(OUT, txt), d.content_text, "utf8");
  writeFileSync(join(OUT, "MANIFEST.sha256"), `${d.docx_sha256}  ${d.docx_filename}\n`, "utf8");
  writeFileSync(join(OUT, "CONTENT.sha256"), `${d.sha256}  ${txt}\n`, "utf8");
  const sql = migracjaUmowyV8Sql(d);
  writeFileSync(MIGRATION, sql, "utf8");
  writeFileSync(MIGRATION_DRIZZLE, sql, "utf8");
  console.log(`${d.code} ${d.version}  content ${d.sha256}  docx ${d.docx_sha256}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
